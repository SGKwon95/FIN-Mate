# RAG 동작 흐름 설명

> `docs/architecture-flows.md` 2. RAG 흐름의 텍스트 버전.  
> 대상 파일: `app/api/chat/route.ts`, `lib/rag.ts`, `lib/rag-cache.ts`, `lib/query-rewrite.ts`

---

## 1. 문서 업로드 · 인덱싱

직원이 업무 문서를 업로드하면 검색 가능한 벡터로 변환해 DB에 저장하는 과정.

### 단계별 흐름

**Step 1 — 파일 수신 및 권한 검증**  
직원이 `.txt / .md / .html / .pdf` 파일을 업로드하면 `POST /api/employee/documents`가 수신한다.  
`isEmployee === true` 인지 먼저 확인하고, 아니면 거부한다.

**Step 2 — 텍스트 추출 (파일 형식별 처리)**

| 형식 | 처리 방법 |
|------|----------|
| HTML | `htmlToPlainText()` — 태그 제거, 개행 정규화 |
| PDF | `pdf_extract.py` 스크립트 실행 |
| TXT · MD | 원문 그대로 사용 |

**Step 3 — 청킹 (`chunkDocument()` — `lib/rag.ts`)**

문서를 검색에 적합한 크기의 조각(청크)으로 나눈다.

- **1차 분할**: `제N조` 패턴으로 조 단위 분리
  - `제N조` 구조가 없는 일반 문서(업무 가이드 등)는 빈 줄(문단) 기준으로 분리
- **2차 분할**: 조가 800자를 초과하면 `①②③` 항 단위로 추가 분리
  - 이때 각 서브청크 앞에 조 제목을 다시 붙여 의미적 문맥을 유지한다
  - 예) `제5조(중도해지)\n③ 중도해지 시 이율은...`

**Step 4 — 임베딩**

청크 텍스트를 LM Studio 임베딩 모델(`nomic-embed-text-v1.5`)에 배치(8개씩) 전송해 768차원 벡터로 변환한다.

**Step 5 — 저장 (`saveChunks()` — `lib/rag.ts`)**

1. 같은 `doc_name`의 기존 청크를 먼저 모두 삭제한다 (재업로드 시 중복 방지)
2. 관련 RAG 캐시도 함께 무효화한다 (낡은 답변 제거)
3. `document_chunks` 테이블에 `pgvector INSERT`

저장 후 `document` 테이블에 메타데이터(`uploadStatus: COMPLETED`)를 기록하고 완료 응답을 반환한다.

### 저장 구조

```
document_chunks 테이블
├── doc_name      — 검색 범위 필터 키 (storedName과 동일)
├── article_num   — 제N조
├── section_num   — ①②③ 항
├── content       — 청크 원문
├── embedding     — vector(768), pgvector로 유사도 검색
└── quality_score — 1.0 초기값, 피드백으로 0.1~2.0 범위 조정
```

---

## 2. 채팅 질문 처리

사용자가 질문을 입력하면 답변이 스트리밍되기까지의 전체 흐름. 크게 **캐시 조회 → 벡터 검색 → LLM 생성** 3단계로 나뉜다.

### 전체 흐름 요약

```
사용자 질문
  │
  ▼
① 세션 인증 & 문서 범위 결정
  │
  ▼
② 수동 컨텍스트 있으면? → 바로 ⑧번으로
  │ 없으면
  ▼
③ 캐시 1단계: Exact Match (SHA-256)
  │ 캐시 HIT → 즉시 응답 (LLM 호출 없음)
  │ Miss
  ▼
④ 쿼리 재작성 (짧은 단어·구문만)
  │
  ▼
⑤ 임베딩: 질문 → 768-dim 벡터
  │
  ▼
⑥ 캐시 2단계: Semantic Match (코사인 유사도 ≥ 0.95)
  │ 캐시 HIT → 즉시 응답 (LLM 호출 없음)
  │ Miss
  ▼
⑦ pgvector 벡터 검색 (Top-5, 유사도 ≥ 0.3)
  │
  ▼
⑧ 컨텍스트 확정 & 시스템 프롬프트 선택
  │
  ▼
⑨ ChatFeedback 레코드 생성
  │
  ▼
⑩ LLM 스트리밍 응답 (LM Studio, temperature 0.05)
  │
  └─ 완료 후 (비동기) → 캐시 저장 · RAG 평가 · LangSmith 트레이스
```

---

### 단계별 상세 설명

**① 세션 인증 & 문서 범위 결정**

`auth()`로 JWT 세션을 읽어 `isEmployee` 여부를 판단한다.  
직원인 경우 `docCategory`(은행업무 / 상품 / 전체)에 따라 검색할 문서 목록을 DB에서 미리 조회해 범위를 좁힌다.

**② 수동 컨텍스트 확인**

`retrievedContext` 파라미터가 있으면 (직원이 MinIO에서 파일을 직접 열어 전달한 HTML 텍스트) 벡터 검색을 건너뛰고 해당 텍스트를 그대로 컨텍스트로 사용한다.

**③ 캐시 1단계 — Exact Match**

- 질문을 소문자 + 공백 정규화하고, 문서 범위 정보와 합쳐 **SHA-256 해시**를 생성한다.
- `rag_cache` 테이블에서 해당 해시와 정확히 일치하는 레코드를 조회한다.
- **HIT**: 저장된 답변을 스트림으로 즉시 반환. LLM 호출 없음. `hitCount + 1`.
- **Miss**: 다음 단계로 진행.

**④ 쿼리 재작성 (`lib/query-rewrite.ts`)**

단어나 짧은 구문 입력을 벡터 검색에 유리한 서술형 질문으로 변환한다.

- **재작성 대상**: 30자 이하이고 한국어 조사(이/가/을/를 등)가 없는 입력  
  예) `"중도해지"` → `"정기예금 중도해지 시 이율 적용 기준에 대해 설명하시오"`
- **재작성 생략**: 30자 초과이거나 조사가 포함된 경우 (이미 서술형)
- **원문 폴백**: 재작성 결과에 한자·일본어가 포함되면 원문을 사용

> 재작성된 쿼리는 **벡터 검색에만** 사용된다. 캐시 키와 화면에 표시되는 질문은 원문 그대로 유지된다.

**⑤ 임베딩**

재작성된 검색 쿼리(또는 원문)를 LM Studio 임베딩 모델에 전송해 768차원 벡터로 변환한다.

**⑥ 캐시 2단계 — Semantic Match**

임베딩 벡터를 `rag_cache` 테이블의 저장된 쿼리 벡터들과 **pgvector 코사인 유사도**로 비교한다.

- 유사도 **≥ 0.95** 인 캐시가 있으면 HIT → 즉시 응답
- 임계값을 0.95로 높게 설정한 이유: 금융 약관 QA는 미묘한 표현 차이가 다른 답변을 요구하므로 false positive 비용이 크다.

**⑦ pgvector 벡터 검색 (`retrieveChunks()` — `lib/rag.ts`)**

캐시가 없으면 실제 문서 청크를 검색한다.

- `document_chunks` 테이블에서 코사인 유사도 **≥ 0.3** 인 청크를 **Top-5** 반환
- 정렬 기준: `벡터 거리 / quality_score` — 좋은 피드백을 받은 청크가 같은 유사도에서 상위에 오른다
- 0건이면 임계값을 **0.15**로 낮춰 재시도 (직원 지정 문서 범위에서만)
- 고객 채팅은 `emp-*` 접두 청크를 제외한다 (직원 업로드 문서가 고객 답변을 오염하는 문제 방지)

**⑧ 컨텍스트 확정 & 시스템 프롬프트 선택**

**컨텍스트 우선순위:**

| 순위 | 소스 | 조건 |
|------|------|------|
| 1 | 직원 상품목록 DB 직접 조회 | `isEmployee && 질문에 "상품목록" 포함` |
| 2 | 수동 컨텍스트 | `retrievedContext` 파라미터 있음 |
| 3 | RAG 벡터 검색 결과 | `document_chunks` Top-5 청크 |
| 4 | 없음 | 일반 대화 모드 |

**시스템 프롬프트 4종:**

| 경우 | 프롬프트 특징 |
|------|-------------|
| 직원 + 상품목록 | DB 테이블을 마크다운으로 그대로 출력 |
| 직원 + 업무문서 | 출처(조항) 명시 필수, 수치 정확성 강조, 고객센터 안내 금지 |
| 고객 + 약관문서 | 약관 조항 인용 필수, 금융소비자보호법 준수, 수치 추측 금지 |
| 컨텍스트 없음 | 일반 금융 상식 기반, 추측 금지, 빈 응답 절대 금지 |

모든 프롬프트에 **언어 규칙** 공통 적용: 한국어 전용, 한자 사용 금지.

**⑨ ChatFeedback 레코드 생성**

스트리밍 시작 전에 `chat_feedback` 테이블에 레코드를 미리 만든다.  
`chunkIds`(검색된 청크 ID 목록)를 저장하고 `feedback: null`로 초기화.  
응답 헤더 `X-Feedback-Id`로 ID를 프론트엔드에 전달 → 사용자가 좋아요/싫어요를 누르면 이 ID로 업데이트된다.

**⑩ LLM 스트리밍 응답**

`streamText()`로 LM Studio OpenAI 호환 API를 호출한다.

- `temperature: 0.05` — 금융 정보의 할루시네이션 억제를 위해 낮게 설정
- OpenTelemetry 스팬에 `kind=LLM`, 모델명, 입력 질문을 기록 → Tempo에서 추적 가능
- 응답 헤더: `X-Feedback-Id`, `X-Cache: MISS`

---

### 스트리밍 완료 후 (비동기 Fire-and-Forget)

응답이 사용자에게 전달된 뒤 아래 3가지가 병렬로 실행된다. 실패해도 응답에는 영향을 주지 않는다.

**캐시 저장 (`saveCache()`)**

RAG 컨텍스트를 사용한 경우에만 저장한다.  
`cacheKey`, 정규화된 질문, 문서 범위, 완성된 답변, 청크 ID 목록, 쿼리 벡터를 `rag_cache` 테이블에 INSERT.  
다음에 같거나 의미적으로 비슷한 질문이 오면 LLM 호출 없이 즉시 응답할 수 있다.

**RAG 품질 평가 (`evaluateRag()` → Arize Phoenix)**

LLM이 3가지 지표를 0~1 점수로 평가한 뒤 Phoenix에 스팬 어노테이션으로 전송한다.

| 지표 | 의미 |
|------|------|
| `context_relevance` | 검색된 청크가 질문과 얼마나 관련 있는가 |
| `faithfulness` | 답변이 컨텍스트에 근거하는가 (hallucination 여부) |
| `answer_relevance` | 답변이 질문에 적절히 대응하는가 |

**LangSmith 트레이스**

질문·모델 ID·컨텍스트 크기·청크 수를 LangSmith에 기록한다. 오프라인 RAG 평가 및 실험 추적에 사용된다.

---

## 3. 피드백 반영

사용자가 답변에 좋아요/싫어요를 누르면 해당 답변을 생성하는 데 쓰인 청크들의 품질 점수가 조정된다.

### 흐름

1. 사용자가 채팅 UI에서 👍 또는 👎 클릭
2. `POST /api/chat/feedback`에 `{ feedbackId, feedback: 'up' | 'down' }` 전송
3. `chat_feedback` 테이블에서 해당 레코드를 조회해 중복 피드백 여부 확인
4. `feedback` 필드 업데이트
5. `adjustChunkQuality(chunkIds, delta)` 호출

```sql
UPDATE document_chunks
SET quality_score = GREATEST(0.1, LEAST(2.0, quality_score + delta))
WHERE id = ANY(chunkIds)

-- 👍: delta = +0.1
-- 👎: delta = -0.1
-- 범위: 0.1 (최소) ~ 2.0 (최대)
```

### 피드백이 검색에 미치는 효과

벡터 검색 정렬 기준이 `거리 / quality_score`이기 때문에:

- 👍가 누적된 청크 → `quality_score` 증가 → 거리값이 상대적으로 작아짐 → 같은 유사도라면 상위 랭크
- 👎가 누적된 청크 → `quality_score` 감소 → 거리값이 상대적으로 커짐 → 하위 랭크

즉, 사용자 피드백이 쌓일수록 자주 좋은 평가를 받은 청크가 우선 검색되는 **자기 개선형 랭킹**이 된다.

---

## 4. LLM API 사용 구조

RAG 파이프라인에서 LLM은 세 곳에서 호출된다. 모두 동일한 LM Studio OpenAI 호환 API를 사용하지만 역할과 설정이 다르다.

### 연결 방식

```typescript
// @ai-sdk/openai의 createOpenAI로 LM Studio에 연결
// LM Studio는 OpenAI API 형식을 그대로 지원 (baseURL만 바꾸면 됨)
const lmstudio = createOpenAI({
  baseURL: `${process.env.OLLAMA_BASE_URL}/v1`,  // 예: http://192.168.219.1:1234/v1
  apiKey: 'lm-studio',                            // LM Studio는 키 검증 안 함 — 임의값
})
```

**패키지 버전 제약**: `ai@4` + `@ai-sdk/react@0` + `@ai-sdk/openai@0` 조합만 사용.  
v5/v6는 `ollama-ai-provider`와 `LanguageModelV1 vs V2` 타입 불일치로 사용 불가.

---

### 호출 1 — 메인 답변 생성 (`app/api/chat/route.ts`)

```typescript
const result = streamText({
  model: lmstudio(modelId || 'local-model'),  // UI 드롭다운에서 선택한 모델 ID
  system: systemPrompt,                        // 컨텍스트 종류에 따라 4종 중 하나 선택
  messages: cleanedMessages,                   // 대화 히스토리 전체
  temperature: 0.05,                           // 낮게 설정 — 금융 수치 할루시네이션 억제
  experimental_telemetry: { isEnabled: true }, // Phoenix OTel 추적
})
```

- `modelId`는 프론트엔드 모델 선택 드롭다운(`ChatInterface.tsx`)에서 전달
- `streamText()`는 응답을 청크 단위로 스트리밍 — 첫 토큰까지 대기 없이 즉시 화면에 표시
- 스트리밍이 끝난 뒤 `result.text`(Promise)로 완성된 전체 텍스트를 비동기 획득

---

### 호출 2 — 쿼리 재작성 (`lib/query-rewrite.ts`)

짧은 단어 입력을 벡터 검색에 유리한 서술형 질문으로 변환한다.

```typescript
// 재작성 조건: 30자 이하 AND 한국어 조사 없음
const { text } = await generateText({
  model: lmstudio(modelId),
  system: '한국어 전용 금융 검색 도우미. 한자·일본어 절대 금지.',
  prompt: `입력: ${question}\n재작성:`,
  temperature: 0.2,   // 메인 답변(0.05)보다 약간 높음 — 표현 다양성 허용
  maxTokens: 120,     // 한 문장이면 충분 — 토큰 낭비 방지
})
```

| 항목 | 값 | 이유 |
|------|---|------|
| temperature | 0.2 | 같은 단어도 문맥마다 다른 질문으로 확장 가능해야 함 |
| maxTokens | 120 | 한 문장(30~60자) 생성이 목적 |
| 결과 검증 | 한자·일본어 포함 시 원문 반환 | LLM이 오염된 언어 사용 시 검색 품질 저하 방지 |

재작성된 쿼리는 **벡터 검색 전용** — 캐시 키, 화면 표시, LLM 입력 메시지는 원문 그대로.

---

### 호출 3 — RAG 품질 평가 (`lib/rag-eval.ts`)

스트리밍 완료 후 동일 LLM을 심사위원(LLM-as-a-Judge)으로 사용해 답변 품질을 평가한다.

```typescript
const { text } = await generateText({
  model: judge(modelId),
  prompt: buildJudgePrompt(question, context, answer),
  temperature: 0,     // 평가는 결정론적이어야 함 — 같은 입력에 같은 점수
})
// 출력 예: {"context_relevance":4,"faithfulness":5,"answer_relevance":4,"reasoning":"..."}
```

LLM이 1~5점으로 평가한 값을 5로 나눠 0~1 범위로 정규화:

| 지표 | 의미 | 활용 |
|------|------|------|
| `context_relevance` | 검색 청크가 질문과 관련 있는가 | 검색 품질 모니터링 |
| `faithfulness` | 답변이 컨텍스트에만 근거하는가 | 할루시네이션 감지 |
| `answer_relevance` | 답변이 질문 의도에 맞는가 | 응답 품질 모니터링 |

결과는 Phoenix(`http://localhost:6006`)에 OTel span annotation으로 전송.  
`temperature: 0`으로 설정해 동일 입력에 항상 동일한 점수가 나오도록 보장한다.

---

### 세 호출의 설정 비교

| 호출 위치 | 함수 | temperature | maxTokens | 스트리밍 |
|----------|------|:-----------:|:---------:|:-------:|
| 메인 답변 | `streamText()` | 0.05 | 제한 없음 | ✅ |
| 쿼리 재작성 | `generateText()` | 0.2 | 120 | ❌ |
| RAG 평가 | `generateText()` | 0 | 제한 없음 | ❌ |

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `app/api/chat/route.ts` | 채팅 메인 핸들러 — 전체 RAG 파이프라인 조율 |
| `lib/rag.ts` | 청킹, 벡터 저장, 벡터 검색, 청크→컨텍스트 변환 |
| `lib/rag-cache.ts` | 캐시 키 생성, Exact/Semantic 조회, 캐시 저장 |
| `lib/query-rewrite.ts` | 짧은 쿼리를 서술형으로 재작성 |
| `lib/embeddings.ts` | 단일/배치 임베딩 호출 |
| `lib/rag-eval.ts` | RAG 품질 3지표 평가 |
| `components/chat/ChatInterface.tsx` | 채팅 UI — `useChat` 훅, 피드백 버튼 |
| `app/api/chat/feedback/route.ts` | 피드백 수신 → quality_score 조정 |
