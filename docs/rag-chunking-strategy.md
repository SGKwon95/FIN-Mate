# RAG 청킹 전략 및 Hybrid Search 파이프라인

## 개요

FIN-Mate의 RAG 파이프라인은 금융 약관 문서(HTML/PDF/TXT)를 기반으로  
고객·직원의 질의에 정확한 조항 근거를 포함한 답변을 생성한다.

```
사용자 질문
  → [쿼리 재작성] lib/query-rewrite.ts
  → [임베딩]      lib/embeddings.ts  (LM Studio nomic-embed-text-v1.5)
  → [캐시 조회]   lib/rag-cache.ts   (Exact hash → Semantic 0.95)
  → [Hybrid 검색] lib/rag.ts         (Vector + BM25 → RRF)
  → [컨텍스트]    app/api/chat/route.ts → LLM 스트리밍
```

---

## 1. 청킹 전략 — 계층 구조 분할

> 구현: `lib/rag.ts :: chunkDocument()`

### 설계 배경

금융 약관의 구조는 `제N조(제목) → ①②③ 항` 계층으로 이루어진다.  
단순 고정 길이 분할(512토큰 등)은 한 조항을 중간에 자르거나,  
여러 조항을 하나의 청크에 묶어 검색 정밀도를 떨어뜨린다.

### 분할 규칙

| 단계 | 기준 | 정규식 |
|------|------|--------|
| 1차 분할 | 제N조 경계 | `/(?=제\s*\d+\s*조\s*[\(\（])/g` |
| 2차 분할 | 조가 800자 초과 시 항(①②③) 경계 | `/(?=[①②③④⑤⑥⑦⑧⑨⑩]\|\n\d+\.\s)/g` |

### 문맥 유지 기법

항으로 분할된 청크는 반드시 조 제목을 prefix로 반복한다.

```
청크 예시:
"제5조(중도해지)\n③ 만기 전 해지 시 약정금리의 50%를 적용한다..."
```

- 이유: 임베딩 모델이 "중도해지" 문맥 없이 "③"만 보면 의미를 파악하기 어렵다
- 효과: `제5조 ③` → `제5조` 수준의 의미 유사도를 가지게 되어 조 단위 쿼리에도 히트

### 청크 크기

| 항목 | 값 |
|------|----|
| 최대 청크 크기 | 800자 |
| 평균 청크 수 (약관 1건) | 30~60개 |
| 임베딩 차원 | 768 (nomic-embed-text-v1.5) |

---

## 2. 임베딩

> 구현: `lib/embeddings.ts`

| 항목 | 내용 |
|------|------|
| 모델 | `nomic-embed-text-v1.5` (768차원) |
| 엔드포인트 | LM Studio `/v1/embeddings` (OpenAI 호환) |
| 배치 크기 | 8개 청크 병렬 처리 |
| 저장 | PostgreSQL `document_chunks.embedding vector(768)` (pgvector) |

---

## 3. Hybrid Search — BM25 + Vector + RRF

> 구현: `lib/rag.ts :: retrieveChunksHybrid()`

### 도입 배경

순수 벡터 검색의 한계:

| 쿼리 유형 | 벡터 검색 | BM25 |
|-----------|-----------|------|
| "중도해지 패널티 비율이 몇 %야?" | △ (의미 유사 문장 검색) | ✅ "중도해지", "비율" 키워드 직접 매칭 |
| "최소 가입금액 얼마야?" | △ | ✅ "최소", "가입금액" 키워드 매칭 |
| "적금 해지하면 어떻게 돼?" | ✅ 의미 파악 우수 | △ |

두 방식을 결합하면 키워드 강조 쿼리와 의미 기반 쿼리 모두 안정적으로 처리 가능.

### 알고리즘: Reciprocal Rank Fusion (RRF)

```
RRF_score(d) = 1/(k + rank_vector) + 1/(k + rank_bm25)   [k = 60]
```

- k=60은 Cormack et al. 2009 논문의 기본값; 상위 랭크에 민감도를 줌
- 두 결과 목록에 모두 등장하는 문서는 자연스럽게 상위 랭크를 얻음
- 어느 한쪽에만 있어도 점수를 기여받아 폴백 역할

### BM25 구현 방식

PostgreSQL `'simple'` dictionary — 언어 비의존 공백 분리 토크나이저  
(한국어 형태소 분석 없이도 금융 용어 단위 매칭이 충분히 동작)

```sql
WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', :query)
ORDER BY ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', :query)) DESC
```

### 실패 처리

BM25 쿼리 실패(빈 쿼리, 특수문자 전용 등)는 try-catch로 포착 →  
벡터 검색 결과만 반환하여 서비스 중단 없음.

---

## 4. 품질 피드백 루프 (Re-ranking 보완)

> 구현: `lib/rag.ts :: adjustChunkQuality()`, `ChatFeedback` 모델

```
사용자 👍 → 해당 청크 quality_score += 0.1  (최대 2.0)
사용자 👎 → 해당 청크 quality_score -= 0.1  (최소 0.1)
```

벡터 정렬 시 `quality_score`로 나누어 빈번히 좋은 평가를 받은 청크를 상위로 이동:

```sql
ORDER BY (embedding <=> query_vec) / NULLIF(quality_score, 0)
```

초기값 1.0 → 피드백 누적 시 동일 유사도 내에서 검증된 청크 우선.

---

## 5. 2단계 캐싱

> 구현: `lib/rag-cache.ts`

| 단계 | 방식 | 임계값 |
|------|------|--------|
| 1단계 Exact | 정규화 질문 SHA-256 hash 일치 | 완전 일치 |
| 2단계 Semantic | 쿼리 임베딩 코사인 유사도 | ≥ 0.95 |

임베딩 API 호출(~100ms) 및 pgvector 검색(~30ms)을 모두 생략,  
LLM 생성 없이 캐시된 답변 스트리밍 반환.

---

## 6. 전략 선택 비교 (의사결정 근거)

| 항목 | 고려한 대안 | 선택한 방식 | 이유 |
|------|------------|------------|------|
| 청킹 | 고정 512토큰 | 조항 계층 구조 | 약관 구조와 1:1 대응 |
| 벡터 DB | Chroma, Qdrant | PostgreSQL pgvector | 기존 인프라 재사용, 별도 서버 불필요 |
| 임베딩 | OpenAI text-embedding | LM Studio 로컬 모델 | 데이터 외부 전송 없음 (금융 민감 정보) |
| 검색 | 순수 벡터 | BM25 + Vector RRF | 키워드 쿼리 정확도 보완 |
| Re-ranking | Cross-encoder | 피드백 품질 점수 | 로컬 환경에서 추론 오버헤드 없음 |
