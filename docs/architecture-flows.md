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
    A[사용자 질문 입력\nChatInterface.tsx] -->|POST /api/chat| B

    subgraph ROUTE ["app/api/chat/route.ts"]
        B[세션 인증\n문서 범위 결정\ndocCategory / docNames] --> C

        C{수동 컨텍스트\nretrievedContext?}
        C -->|Yes| MANUAL[수동 컨텍스트 사용\n직원 화면 파일 업로드]
        C -->|No| D

        D{캐시 1단계\nExact Match}
        D -->|"lookupExact()\nSHA256 키 일치"| HIT1["즉시 응답\n캐시 hitCount+1"]
        D -->|Miss| E

        E["embedOne(질문)\n→ 768-dim 벡터"]
        E --> F

        F{캐시 2단계\nSemantic Match}
        F -->|"lookupSemantic()\n코사인 유사도 ≥ 0.95"| HIT2["즉시 응답\n캐시 hitCount+1"]
        F -->|Miss| G

        G["retrieveChunks()\nlib/rag.ts\npgvector 코사인 유사도 검색\n유사도 ≥ 0.3, Top-5\n정렬: 유사도 / quality_score"]
        G --> H

        MANUAL & H --> I

        I["chunksToContext()\n청크 → 마크다운 형식\n[1] (제5조 ③항) 내용..."]
        I --> J

        J{시스템 프롬프트\n결정}
        J -->|상품목록 요청\n직원 전용| P1[DB 상품 목록\n마크다운 테이블]
        J -->|RAG 컨텍스트 있음| P2[문서 기반 답변\n조항 인용 필수\n수치 정확성 강조]
        J -->|컨텍스트 없음| P3[일반 금융 AI\n어시스턴트]

        P1 & P2 & P3 --> K

        K["streamText()\nLM Studio OpenAI 호환 API\ntemperature: 0.05\n스트리밍 응답"]
        K --> L[ChatFeedback 레코드 생성\nfeedback: null 초기값\nchunkIds 저장]
        L --> M

        M{RAG 컨텍스트 사용?}
        M -->|Yes| N["saveCache()\nRAG 캐시 저장\nFire-and-Forget"]
        M -->|Yes| O["evaluateRag()\nPhoenix로 평가 전송\ncontextRelevance·faithfulness\nFire-and-Forget"]
        M -->|No| DONE
        N & O --> DONE
    end

    DONE[스트리밍 응답 반환] --> A

    style ROUTE fill:#f0f8ff,stroke:#4080ff
```

**컨텍스트 우선순위**
```
① 직원 상품 목록 DB 조회 결과
② 수동 컨텍스트 (ChatInterface 파일 업로드)
③ RAG 벡터 검색 결과 (document_chunks)
④ 없음 (일반 대화)
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
