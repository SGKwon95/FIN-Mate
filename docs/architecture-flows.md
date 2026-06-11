# FIN-Mate 아키텍처 흐름도

## 목차
1. [이체 트랜잭션 흐름](#1-이체-트랜잭션-흐름)
   - 1-1. 자행이체 (즉시 처리)
   - 1-2. 타행이체 (Kafka 비동기)
   - 1-3. 타행 → FIN-Mate 입금 (Inbound)
2. [RAG 흐름](#2-rag-흐름)
   - 2-1. 문서 업로드 · 인덱싱
   - 2-2. 채팅 질문 처리
   - 2-3. 피드백 반영
3. [대출 심사 흐름](#3-대출-심사-흐름)
   - 3-1. 고객 신청 → ML 심사
   - 3-2. 직원 최종 결정 (PENDING_REVIEW)

---

## 1. 이체 트랜잭션 흐름

### 1-1. 자행이체 (동기 · DB 직접 처리)

```mermaid
sequenceDiagram
    actor 고객
    participant UI as Transfer Page<br/>(Client)
    participant Action as executeTransfer()<br/>actions.ts
    participant DB as PostgreSQL

    고객->>UI: 이체 정보 입력 (자행 계좌번호)
    UI->>Action: executeTransfer({ bankCode: '004', ... })

    Action->>DB: 출금 계좌 조회 및 잔액 검증
    DB-->>Action: 계좌 정보

    Action->>DB: prisma.$transaction() 시작
    Note over Action,DB: ① 출금 계좌 잔액 차감<br/>② 출금 Transaction 생성 (COMPLETED)<br/>③ 입금 계좌 잔액 증가<br/>④ 입금 Transaction 생성 (COMPLETED)
    DB-->>Action: 커밋 완료

    Action->>DB: Notification 생성 (출금자 / 입금자)
    Action-->>UI: 성공 응답
    UI-->>고객: 이체 완료
```

**관련 파일**
| 파일 | 역할 |
|------|------|
| `app/(main)/transfer/actions.ts` | Server Action — 전체 이체 로직 |
| `lib/notifications.ts` | 알림 생성 유틸 |
| `prisma/schema.prisma` | `Transaction`, `Account`, `Notification` 모델 |

---

### 1-2. 타행이체 (Kafka 비동기 9-Step)

```mermaid
sequenceDiagram
    actor 고객
    participant UI as Transfer Page
    participant Action as executeTransfer()<br/>actions.ts
    participant DB as PostgreSQL
    participant KA as Kafka<br/>TRANSFER_REQUESTS
    participant GW as interbank-gateway.ts
    participant KB as Kafka<br/>ROUTED_REQUESTS
    participant SIM as interbank-simulator<br/>(B은행)
    participant KR as Kafka<br/>B_RESULTS
    participant KS as Kafka<br/>TRANSFER_SETTLEMENTS
    participant SC as settlement-consumer.ts

    고객->>UI: 이체 정보 입력 (타행 계좌번호)
    UI->>Action: executeTransfer({ bankCode: '003', ... })

    rect rgb(230, 240, 255)
        Note over Action,DB: [Step 1] 선차감 & 요청 발행
        Action->>DB: prisma.$transaction()<br/>① 출금 잔액 차감<br/>② TransferInstruction 생성 (PENDING)<br/>③ Transaction 생성 (PENDING)
        DB-->>Action: 커밋
        Action->>KA: produce(TRANSFER_REQUESTS)
        Action-->>UI: 접수 완료 (비동기 처리 중)
    end

    rect rgb(240, 255, 230)
        Note over GW,KB: [Step 2~3] Gateway 라우팅
        GW->>KA: consume(TRANSFER_REQUESTS)
        GW->>DB: produce(GATEWAY_ACK) → settlement-consumer 로그
        GW->>KB: produce(ROUTED_REQUESTS)
    end

    rect rgb(255, 245, 225)
        Note over SIM,KR: [Step 4~6] B은행 처리
        SIM->>KB: consume(ROUTED_REQUESTS)
        SIM->>GW: produce(B_RECEIVED_ACK)
        Note over SIM: B은행 DB에 입금 처리
        SIM->>KR: produce(B_RESULTS)<br/>{ status: COMPLETED|FAILED }
    end

    rect rgb(255, 230, 230)
        Note over GW,KS: [Step 7~8] Gateway 정산 발행
        GW->>KR: consume(B_RESULTS)
        GW->>SIM: produce(GATEWAY_B_ACK)
        GW->>KS: produce(TRANSFER_SETTLEMENTS)
    end

    rect rgb(245, 230, 255)
        Note over SC,DB: [Step 9] 정산 완료
        SC->>KS: consume(TRANSFER_SETTLEMENTS)
        alt 성공
            SC->>DB: Transaction → COMPLETED<br/>KftcReceipt 생성 (rspCode: '000')<br/>TransferInstruction → COMPLETED<br/>Notification 생성
        else 실패
            SC->>DB: Transaction → FAILED<br/>잔액 복구<br/>KftcReceipt 생성 (실패 코드)<br/>TransferInstruction → FAILED<br/>Notification 생성
        end
        SC->>GW: produce(A_SETTLED_ACK)
    end

    DB-->>고객: 푸시 알림 (이체 완료/실패)
```

**Kafka 토픽 목록**
| 토픽 | 발행자 | 소비자 | 내용 |
|------|--------|--------|------|
| `interbank-transfer-requests` | FIN-Mate | Gateway | 이체 요청 |
| `interbank-gateway-ack` | Gateway | FIN-Mate | 수신 ACK |
| `interbank-routed-requests` | Gateway | B은행 시뮬레이터 | 타행 라우팅 |
| `interbank-b-received-ack` | B은행 | Gateway | B 수신 ACK |
| `interbank-b-results` | B은행 | Gateway | 처리 결과 |
| `interbank-gateway-b-ack` | Gateway | B은행 | 결과 수신 ACK |
| `interbank-transfer-settlements` | Gateway | FIN-Mate | 최종 정산 |
| `interbank-a-settled-ack` | FIN-Mate | Gateway | 정산 완료 ACK |

**관련 파일**
| 파일 | 역할 |
|------|------|
| `app/(main)/transfer/actions.ts` | Step 1 — 선차감 + 첫 메시지 발행 |
| `lib/kafka.ts` | KafkaJS 싱글턴, 토픽 상수 정의 |
| `workers/interbank-gateway.ts` | Step 2·3·7·8 — 공동망 라우터 |
| `workers/settlement-consumer.ts` | Step 9 — A은행 정산 처리 |
| `interbank-simulator/` | Step 4·5·6 — B은행 시뮬레이터 (SQLite) |

---

### 1-3. 타행 → FIN-Mate 입금 (Inbound)

```mermaid
sequenceDiagram
    participant GW as interbank-gateway.ts
    participant KI as Kafka<br/>INBOUND_REQUESTS
    participant IC as inbound-consumer.ts
    participant DB as PostgreSQL
    participant KIR as Kafka<br/>INBOUND_RESULTS

    Note over GW: toBankCode === '004' 감지
    GW->>KI: produce(INBOUND_REQUESTS)

    IC->>KI: consume(INBOUND_REQUESTS)
    IC->>DB: 수신 계좌 조회 (계좌번호 정규화)
    IC->>DB: 활성 상태 검증

    IC->>DB: prisma.$transaction()<br/>① 입금 Transaction 생성 (COMPLETED, channel: INTERBANK)<br/>② 수신 계좌 잔액 증가<br/>③ Notification 생성<br/>④ KftcReceipt 생성 (INBOUND, rspCode: '000')

    IC->>KIR: produce(INBOUND_RESULTS)<br/>{ status: COMPLETED }
```

---

## 2. RAG 흐름

### 2-1. 문서 업로드 · 인덱싱

```mermaid
flowchart TD
    A[직원: 파일 선택\n.txt / .md / .html / .pdf] --> B

    subgraph API ["app/api/employee/documents — POST"]
        B[권한 검증\nisEmployee === true] --> C
        C{파일 형식?}
        C -->|HTML| D1[htmlToPlainText\nlib/rag.ts]
        C -->|PDF| D2[pdf_extract.py\n스크립트 실행]
        C -->|TXT·MD| D3[원문 그대로]
        D1 & D2 & D3 --> E

        E["chunkDocument()\nlib/rag.ts"] --> F
        subgraph CHUNK ["계층 구조 청킹"]
            F["1차 분할: 제N조 기준\n정규식 분리"] --> G
            G{"청크 > 800자?"}
            G -->|Yes| H["2차 분할: ①②③ 항 단위\n서브청크 앞에 조 제목 prefix"]
            G -->|No| I[청크 유지]
        end

        H & I --> J["embed()\nbatch=8\nnomic-embed-text-v1.5\n→ 768-dim 벡터"]
        J --> K

        subgraph SAVE ["saveChunks() — lib/rag.ts"]
            K[기존 동일 docName 청크 삭제\n캐시 무효화] --> L
            L["pgvector INSERT\ndocument_chunks\n(content, embedding, qualityScore=1.0)"]
        end

        L --> M[Document 메타데이터 저장\nentityType: EMPLOYEE_UPLOAD\nuploadStatus: COMPLETED]
    end

    M --> N[업로드 완료 응답]

    style CHUNK fill:#fff9e6,stroke:#f0c040
    style SAVE fill:#e6f4ff,stroke:#4090c0
```

**DB 스키마 (관련 테이블)**

```
document_chunks
├── id              UUID PK
├── doc_name        VARCHAR  ← storedName과 매칭되는 검색 키
├── article_num     VARCHAR  ← 제N조
├── section_num     VARCHAR  ← ①②③ 항
├── content         TEXT
├── embedding       vector(768)  ← pgvector
└── quality_score   FLOAT    ← 피드백으로 조정 (0.1 ~ 2.0, 기본 1.0)

rag_cache
├── cache_id        UUID PK
├── cache_key       VARCHAR  ← SHA256(정규화질문 + doc_scope)
├── question        TEXT
├── doc_scope       VARCHAR
├── answer          TEXT
├── chunk_ids       UUID[]
├── embedding       vector(768)
└── hit_count       INT
```

---

### 2-2. 채팅 질문 처리

```mermaid
flowchart TD
    A["사용자 질문 입력\nChatInterface.tsx\n(useChat 훅 → POST /api/chat)"] --> B

    subgraph ROUTE ["app/api/chat/route.ts"]
        B["① 세션 인증 (auth())\n역할 확인: isEmployee\n문서 범위 결정: docCategory / docNames"] --> C

        C{수동 컨텍스트\nretrievedContext?}
        C -->|Yes| MANUAL["수동 컨텍스트 사용\n(직원 화면 파일 업로드 HTML)"]
        C -->|No| D

        D["② 캐시 키 생성\nnormalizeQuestion → SHA-256\nbuildDocScope(docCategory, docNames)"]
        D --> E

        E{캐시 1단계\nExact Match\nlib/rag-cache.ts}
        E -->|"lookupExact(cacheKey)\nrag_cache 테이블 SHA-256 일치"| HIT1["즉시 스트림 응답\nhitCount + 1\nX-Cache: HIT"]
        E -->|Miss| F

        F["③ 쿼리 재작성 (lib/query-rewrite.ts)\n30자 이하 단어·구문만 대상\nLLM 호출 → 검색 최적화 문장\n한자·일본어 감지 시 원문 폴백"]
        F --> G

        G["④ embedOne(검색 쿼리)\n→ 768-dim 벡터\n(LM Studio 임베딩 모델)"]
        G --> H

        H{캐시 2단계\nSemantic Match\nlib/rag-cache.ts}
        H -->|"lookupSemantic(queryVec)\npgvector 코사인 유사도 ≥ 0.95"| HIT2["즉시 스트림 응답\nhitCount + 1\nX-Cache: HIT"]
        H -->|Miss| I

        I{"⑤ 문서 범위 필터\n(비직원 전용)"}
        I -->|"emp-* 청크 제외\n고객용 문서 없으면 skipRag"| J
        I -->|직원| J

        J["⑥ retrieveChunks() — lib/rag.ts\npgvector 코사인 유사도 검색\n유사도 ≥ 0.3, Top-5\n정렬: distance / quality_score\n0건 시 임계값 0.15로 재시도"]
        J --> K

        MANUAL & K --> L

        L["⑦ 컨텍스트 우선순위 결정\n1순위: 직원 상품목록 DB 조회\n2순위: 수동 컨텍스트\n3순위: RAG 청크 (chunksToContext)\n4순위: 없음"]
        L --> M

        M{"⑧ 시스템 프롬프트 선택\n(역할 × 컨텍스트 종류)"}
        M -->|"직원 + 상품목록 요청"| P1["직원 상품목록 프롬프트\nDB 테이블 그대로 출력"]
        M -->|"직원 + RAG 컨텍스트"| P2["직원 업무문서 프롬프트\n출처 명시·수치 정확성 강조"]
        M -->|"고객 + RAG 컨텍스트"| P3["고객 약관 프롬프트\n조항 인용 필수\n금융소비자보호법 준수"]
        M -->|"컨텍스트 없음"| P4["일반 금융 AI 어시스턴트\n추측 금지·빈 응답 금지"]

        P1 & P2 & P3 & P4 --> N

        N["⑨ ChatFeedback 레코드 생성\nchunkIds 저장 (피드백용)\nfeedback: null 초기값"]
        N --> O

        O["⑩ streamText() — LM Studio\nOpenAI 호환 API\ntemperature: 0.05\nOTel 스팬: kind=LLM, model, input"]
        O --> RESP

        RESP["스트리밍 응답 반환\nX-Feedback-Id, X-Cache: MISS"]
    end

    RESP --> A

    subgraph ASYNC ["스트리밍 완료 후 — Fire-and-Forget"]
        FA["saveCache()\nrag_cache 저장\ncacheKey + queryEmbedding\n(RAG 컨텍스트 사용 시에만)"]
        FB["evaluateRag()\nLLM으로 3가지 평가\n→ Phoenix span annotation\ncontextRelevance · faithfulness · answerRelevance"]
        FC["LangSmith traceable()\n질문·모델·컨텍스트 크기·청크 수"]
        FD["OTel span\noutput.value · status=OK"]
    end

    O -.->|완료 후| FA & FB & FC & FD

    style ROUTE fill:#f0f8ff,stroke:#4080ff
    style ASYNC fill:#fff8e8,stroke:#f0a000
```

**컨텍스트 우선순위**

```
① 직원 상품목록 DB 조회 결과  — isEmployee && /상품목록/ 패턴 매칭
② 수동 컨텍스트              — ChatInterface 파일 업로드 HTML (MinIO)
③ RAG 벡터 검색 결과         — document_chunks pgvector Top-5
④ 없음                       — 일반 금융 대화
```

**캐시 2단계 구조**

```
질문 정규화 → SHA-256 해시 → [Exact Match] → 즉시 응답
                  ↓ Miss
embedOne(쿼리 재작성된 질문) → [Semantic Match, 유사도 ≥ 0.95] → 즉시 응답
                  ↓ Miss
pgvector 검색 → LLM 생성 → 응답 후 캐시 저장
```

**쿼리 재작성 조건** (`lib/query-rewrite.ts`)

```
입력이 30자 이하 AND 한국어 조사 없음  →  LLM 호출로 서술형 질문 변환
입력이 30자 초과 OR 조사 포함          →  원문 그대로 사용 (LLM 호출 생략)
재작성 결과에 한자·일본어 포함         →  원문 폴백
```

**벡터 검색 랭킹 기준** (`lib/rag.ts`)

```sql
ORDER BY (embedding <=> queryVec) / NULLIF(quality_score, 0)
-- 피드백 👍 → quality_score +0.1 → 거리값 감소 → 순위 ↑
-- 피드백 👎 → quality_score -0.1 → 거리값 증가 → 순위 ↓
```

**고객/직원 문서 분리 정책**

```
고객 채팅 → emp-* 접두 청크 제외 (직원 업로드 문서 오염 방지)
직원 채팅 → docCategory 지정 시 해당 카테고리 문서만 검색
           → 미지정 시 전체 employee 업로드 문서 범위
```

---

### 2-3. 피드백 반영

```mermaid
sequenceDiagram
    actor 사용자
    participant UI as ChatInterface.tsx
    participant API as /api/chat/feedback
    participant DB as PostgreSQL<br/>ChatFeedback
    participant CHUNKS as PostgreSQL<br/>document_chunks

    사용자->>UI: 👍 또는 👎 클릭
    UI->>API: POST { feedbackId, feedback: 'up'|'down' }

    API->>DB: ChatFeedback 조회 (기존 피드백 없음 확인)
    API->>DB: feedback 필드 업데이트

    API->>CHUNKS: adjustChunkQuality(chunkIds, delta)
    Note over CHUNKS: UPDATE document_chunks<br/>SET quality_score =<br/>  GREATEST(0.1, LEAST(2.0, quality_score + delta))<br/>WHERE id = ANY(chunkIds)<br/><br/>👍 delta = +0.1<br/>👎 delta = -0.1

    CHUNKS-->>API: 업데이트 완료
    API-->>UI: 200 OK

    Note over CHUNKS: quality_score는<br/>다음 벡터 검색 시 랭킹에 반영<br/>ORDER BY 유사도 / quality_score
```

**피드백이 검색 품질에 미치는 영향**

```
좋은 답변 (👍 누적) → quality_score ↑ → 동일 유사도에서 높은 순위
나쁜 답변 (👎 누적) → quality_score ↓ → 동일 유사도에서 낮은 순위

검색 정렬 기준: embedding <=> queryVec / NULLIF(quality_score, 0)
  → quality_score가 클수록 거리값이 작아져 상위 랭크
```

---

## 3. 대출 심사 흐름

### 3-1. 고객 신청 → ML 심사

```mermaid
sequenceDiagram
    actor 고객
    participant UI as LoanApplyWizard.tsx
    participant API_APPLY as POST /api/loan-applications
    participant API_SCREEN as POST /api/loan-applications/[id]/screen
    participant DB as PostgreSQL
    participant ML as ML Inference Server<br/>FastAPI :8001
    participant PHOENIX as Arize Phoenix<br/>:6006

    고객->>UI: 대출 상품 선택 → 신청 정보 입력
    UI->>API_APPLY: { productId, requestedAmount, ... }
    API_APPLY->>DB: LoanApplication 생성<br/>applicationStatus: SUBMITTED
    API_APPLY-->>UI: { applicationId }

    UI->>API_SCREEN: POST (applicationId)
    API_SCREEN->>DB: 신청 정보 조회<br/>고객 계좌·거래내역 집계

    API_SCREEN->>ML: POST /predict<br/>{ annual_inc, dti, fico_range_low, ... }
    ML->>PHOENIX: OTel 스팬 전송 (BatchSpanProcessor)
    ML-->>API_SCREEN: { score, decision, default_prob }

    Note over API_SCREEN: 3-tier 분기
    alt score ≥ 800 (자동 승인)
        API_SCREEN->>DB: applicationStatus: APPROVED<br/>decidedAt: now()
    else score < 300 (자동 거절)
        API_SCREEN->>DB: applicationStatus: REJECTED<br/>decidedAt: now()
    else 300 ≤ score < 800 (직원 검토)
        API_SCREEN->>DB: applicationStatus: PENDING_REVIEW<br/>decidedAt: null
    end

    API_SCREEN-->>UI: { applicationStatus, mlScore, mlDecision, ... }

    alt APPROVED
        UI-->>고객: 초록 카드 "승인"
    else REJECTED
        UI-->>고객: 빨간 카드 "거절"
    else PENDING_REVIEW
        UI-->>고객: 주황 카드 "검토 중"<br/>"1~2 영업일 내 결과 안내"
    end
```

---

### 3-2. 직원 최종 결정 (PENDING_REVIEW)

```mermaid
sequenceDiagram
    actor 직원
    participant UI as LoanReviewClient.tsx
    participant PAGE as /loan-review
    participant API_DECIDE as POST /api/loan-applications/[id]/decide
    participant DB as PostgreSQL

    직원->>PAGE: /loan-review 접근
    PAGE->>DB: LoanApplication 목록 조회<br/>status IN [SUBMITTED, PENDING_REVIEW, APPROVED, REJECTED]
    DB-->>PAGE: 신청 목록
    PAGE-->>직원: 3개 섹션 렌더링<br/>ML 심사 대기 / 직원 검토 필요 / 심사 완료

    Note over 직원,UI: SUBMITTED 항목
    직원->>UI: "ML 심사 실행" 클릭
    UI->>API_DECIDE: POST /screen (applicationId)
    Note over UI: runScreening() 호출<br/>→ 3-1 흐름과 동일

    Note over 직원,UI: PENDING_REVIEW 항목
    직원->>UI: 카드 펼침 → ML 점수 확인
    직원->>UI: "승인" 또는 "거절" 클릭
    UI->>API_DECIDE: POST { decision: APPROVED|REJECTED }

    API_DECIDE->>DB: isEmployee 검증 (403 차단)
    API_DECIDE->>DB: applicationStatus === PENDING_REVIEW 확인 (409 차단)
    API_DECIDE->>DB: applicationStatus: decision<br/>decidedAt: now()
    API_DECIDE-->>UI: { applicationStatus, decidedAt }

    UI-->>직원: 카드 상태 즉시 업데이트<br/>→ "심사 완료" 섹션으로 이동
```

**관련 파일**
| 파일 | 역할 |
|------|------|
| `app/(main)/products/[productId]/loan-apply/LoanApplyWizard.tsx` | 고객 신청 wizard + 결과 화면 |
| `app/api/loan-applications/route.ts` | 신청 생성 |
| `app/api/loan-applications/[id]/screen/route.ts` | ML 심사 + 3-tier 분기 |
| `app/api/loan-applications/[id]/decide/route.ts` | 직원 최종 결정 |
| `app/(main)/loan-review/LoanReviewClient.tsx` | 직원 심사 화면 |
| `loan_inference_server.py` | FastAPI ML 추론 서버 (PyTorch + Phoenix OTel) |

---

## 전체 시스템 구성

```mermaid
graph TB
    subgraph CLIENT ["클라이언트 (Next.js App Router)"]
        UI_TRANSFER[이체 화면]
        UI_CHAT[채팅 화면]
        UI_LOAN[대출 심사]
    end

    subgraph NEXTJS ["Next.js API / Server Actions"]
        ACT_TRANSFER[transfer/actions.ts]
        API_CHAT[/api/chat]
        API_LOAN[/api/loan-applications]
        API_DOC[/api/employee/documents]
    end

    subgraph WORKERS ["Kafka Workers (Node.js)"]
        GW[interbank-gateway]
        SC[settlement-consumer]
        IC[inbound-consumer]
        SIM[interbank-simulator\nB은행]
    end

    subgraph INFRA ["인프라"]
        KAFKA[(Kafka Broker)]
        PG[(PostgreSQL\n+ pgvector)]
        LM[LM Studio\nOllama 호환 API]
        PHOENIX[Arize Phoenix\n트레이싱·평가]
        ML[ML Inference Server\nFastAPI :8001]
    end

    UI_TRANSFER --> ACT_TRANSFER
    UI_CHAT --> API_CHAT
    UI_LOAN --> API_LOAN
    UI_CHAT --> API_DOC

    ACT_TRANSFER -->|자행| PG
    ACT_TRANSFER -->|타행| KAFKA
    API_CHAT --> LM
    API_CHAT --> PG
    API_DOC --> LM
    API_DOC --> PG
    API_LOAN --> ML

    KAFKA --> GW --> KAFKA
    KAFKA --> SC --> PG
    KAFKA --> IC --> PG
    KAFKA --> SIM --> KAFKA

    API_CHAT --> PHOENIX
    ML --> PHOENIX
```
