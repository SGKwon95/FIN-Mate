# FIN-Mate — SG Star Banking 모바일 뱅킹 클론

Next.js 16 App Router 기반의 SG Star Banking 스타일 풀스택 금융 서비스 웹앱입니다.  
Kafka 타행이체, ML 대출심사, RAG 채팅, LGTM 관측성 스택까지 포함한 포트폴리오 프로젝트입니다.

## ERD

![ERD](docs/erd.png)

> 전체 테이블 목록: `party`, `individual`, `corporate`, `party_auth`, `branch`, `employee`, `product`, `deposit_detail`, `loan_detail`, `product_terms`, `product_rate`, `product_rate_tier`, `product_rate_benefit`, `product_fee`, `contract`, `contract_terms_agreement`, `contract_rate_benefit`, `account`, `transaction`, `transfer_instruction`, `kftc_receipt`, `savings_payment`, `scheduled_transfer`, `scheduled_transfer_execution`, `loan_application`, `loan_approval_step`, `loan_collateral`, `loan_delinquency`, `document`, `notification`, `common_code_group`, `common_code`

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 언어 | TypeScript 5, Python 3 |
| 스타일 | Tailwind CSS v4 |
| ORM | Prisma 7 + PostgreSQL (`pg` 어댑터) |
| 인증 | NextAuth v5 (JWT, Credentials) |
| 메시징 | Apache Kafka (KafkaJS) |
| ML | scikit-learn + FastAPI (uvicorn) |
| AI 채팅 | LM Studio (OpenAI 호환) + AI SDK v4 |
| 관측성 | Prometheus · Loki · Tempo · Grafana · Arize Phoenix |
| 평가 | LangSmith |
| 아이콘 | Lucide React |
| 폰트 | Noto Sans KR |

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **로그인 / 회원가입** | Credentials 기반 인증, bcrypt 해시, JWT 세션 |
| **대시보드** | 총 자산 현황, 계좌 요약, 빠른 이체, 금융상품 배너 |
| **계좌 목록 / 상세** | 잔액 조회, 기간·유형별 거래내역 필터링 |
| **이체** | 자행·타행 wizard, 멱등성 보장 |
| **타행 이체 (Kafka)** | Kafka 10-step 비동기 흐름, 분산 트레이싱 |
| **자동이체** | 월 지정일 자동이체 등록·조회·실행 워커 |
| **금융상품** | 정기예금·적금·대출 상품 목록 및 상세 |
| **정기예금 가입** | 기간·금액 선택 wizard, 계약 생성 |
| **적금 가입** | 월 납입금액 wizard, 납입 회차 스케줄 생성 |
| **대출 신청** | 대출 상품 신청 wizard + ML 하이브리드 심사 |
| **ML 대출심사** | scikit-learn 모델 FastAPI 서버, Phoenix OTel 트레이싱 |
| **AI 채팅** | RAG 멀티 LLM 채팅, 문서 업로드, 스트리밍 응답 |
| **알림** | 거래·이체·대출 결과 알림 |
| **관측성** | 구조화 로그(pino) → Loki, 메트릭 → Prometheus, 트레이스 → Tempo + Phoenix |

---

## 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                                    │
│  (auth)/ login·register   (main)/ dashboard·accounts·transfer   │
│                            products·chat·auto-transfer·rates     │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────────────┐
│  Next.js API Routes (Node.js)                                    │
│  /api/auth  /api/transfers  /api/chat  /api/metrics              │
│  /api/loan-applications  /api/notifications  /api/register       │
└──────┬──────────────┬──────────────────┬────────────────────────┘
       │ Prisma/pg    │ Kafka produce    │ HTTP
       ▼              ▼                  ▼
  PostgreSQL    Kafka Broker        ML FastAPI Server
  (FIN-Mate DB) (TRANSFER_REQUESTS  (loan_inference_server.py
                 GATEWAY_ACK         scikit-learn model
                 ROUTED_REQUESTS     port 8001)
                 B_RESULTS
                 TRANSFER_SETTLEMENTS
                 INBOUND_REQUESTS
                 INBOUND_RESULTS)

  Kafka Workers (Node.js, 별도 프로세스)
  ├── interbank-gateway.ts   — 공동망 라우터
  ├── settlement-consumer.ts — A은행 정산 처리
  ├── inbound-consumer.ts    — 타행→FIN-Mate 입금
  └── scheduled-transfer-worker.ts — 자동이체 실행

  Observability Stack (Docker Compose)
  ├── Grafana  :3001  — 대시보드
  ├── Prometheus :9090 — 메트릭 수집 (/api/metrics 스크랩)
  ├── Loki     :3100  — 로그 집계 (promtail → stdout 파일 tail)
  ├── Tempo    :4318  — 분산 트레이싱 (OTLP HTTP)
  └── Arize Phoenix :6006 — LLM / ML 트레이스
```

### Kafka 타행이체 흐름

```
FIN-Mate(A)
  → [TRANSFER_REQUESTS] → interbank-gateway
    → [ROUTED_REQUESTS] → B은행 시뮬레이터
    ← [B_RESULTS]       ← B은행 시뮬레이터
  → [TRANSFER_SETTLEMENTS] → settlement-consumer(A)
  ← [INBOUND_REQUESTS]     ← interbank-gateway (B측 입금)
  → [INBOUND_RESULTS]      → interbank-gateway (완료)
```

W3C `traceparent` 헤더로 Kafka 메시지 전파 → Tempo에서 전체 10-step을 단일 traceId로 확인 가능.

---

## 프로젝트 구조

```
app/
├── (auth)/                   # 로그인·회원가입 (다크 네이비 레이아웃)
├── (main)/
│   ├── dashboard/            # 홈 대시보드
│   ├── accounts/             # 계좌 목록 및 [accountId] 상세
│   ├── transfer/             # 이체 wizard
│   ├── auto-transfer/        # 자동이체 목록·등록
│   ├── transactions/         # 전체 거래내역 검색
│   ├── products/             # 상품 목록·정기예금·적금·대출
│   │   └── [productId]/      # 상품 상세·가입·대출신청
│   ├── rates/                # 금리 비교·계산기
│   └── chat/                 # AI RAG 채팅
└── api/
    ├── auth/[...nextauth]/   # NextAuth 핸들러
    ├── chat/                 # AI 스트리밍 채팅
    ├── transfers/            # 이체 내역 조회
    ├── loan-applications/    # 대출 신청·ML 심사
    ├── notifications/        # 알림 조회·읽음 처리
    ├── register/             # 회원가입
    └── metrics/              # Prometheus 메트릭 엔드포인트

workers/
├── interbank-gateway.ts
├── settlement-consumer.ts
├── inbound-consumer.ts
├── scheduled-transfer-worker.ts
└── otel-init.ts              # 워커용 OpenTelemetry 초기화

interbank-simulator/          # B은행 시뮬레이터 (SQLite)
observability/                # Docker Compose LGTM 스택
├── docker-compose.yml
├── grafana/provisioning/
├── prometheus/
├── loki/
├── tempo/
└── promtail/

lib/
├── prisma.ts                 # pg 어댑터 기반 Prisma 싱글턴
├── kafka.ts                  # KafkaJS 싱글턴 + TOPICS 상수
├── kafka-otel.ts             # Kafka W3C traceparent 주입·추출
├── logger.ts                 # pino 구조화 로거
├── metrics.ts                # prom-client 메트릭 정의
├── formatters.ts             # KRW 포맷·계좌번호 마스킹 등
└── notifications.ts          # 알림 생성 유틸

loan_model.py                 # ML 모델 학습 스크립트
loan_inference_server.py      # FastAPI ML 추론 서버
```

---

## 시작하기

### 사전 요구사항

- Node.js 20+
- Python 3.10+ (ML 서버)
- PostgreSQL 15+
- Apache Kafka (브로커 주소 필요)
- Docker + Docker Compose (관측성 스택)
- LM Studio (AI 채팅, 선택)

### 환경 변수 설정 (`.env`)

```env
# 필수
DATABASE_URL=postgresql://user:password@localhost:5432/finmate
AUTH_SECRET=<32자 이상 랜덤 문자열>

# Kafka
KAFKA_BROKER=localhost:9092

# LM Studio (AI 채팅)
OLLAMA_BASE_URL=http://localhost:1234

# 관측성
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
PHOENIX_ENDPOINT=http://localhost:6006
LOG_LEVEL=info

# LangSmith (선택)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__your_key
LANGCHAIN_PROJECT=fin-mate-rag
```

### 설치 및 실행

```bash
# 의존성 설치
npm install

# Python ML 의존성
pip install -r requirements.txt

# DB 마이그레이션 및 시드
npx prisma migrate dev
npm run db:seed

# 금융상품 CSV 임포트 (최초 1회)
npx tsx --env-file=.env prisma/importProducts.ts

# 개발 서버
npm run dev
```

`http://localhost:3000` — 테스트 계정: `testuser` / `Test1234!`

### Kafka 워커 실행

```bash
npm run kafka:all          # 4개 워커 동시 실행
# 또는 개별 실행:
npm run kafka:gateway
npm run kafka:simulator
npm run kafka:settlement
npm run kafka:inbound
npm run worker:scheduled   # 자동이체 워커 (단발)
```

### ML 서버 실행

```bash
npm run loan:train         # 모델 학습 (최초 1회)
npm run loan:ml            # FastAPI 추론 서버 (port 8001)
```

### 관측성 스택 실행

```bash
cd observability && docker compose up -d
```

| 서비스 | URL |
|--------|-----|
| Grafana | http://localhost:3001 (admin/admin) |
| Prometheus | http://localhost:9090 |
| Loki | http://localhost:3100 |
| Tempo | http://localhost:3200 |
| Arize Phoenix | http://localhost:6006 |

---

## 개발 명령어

```bash
npm run dev                              # 개발 서버 (localhost:3000)
npm run build                            # 프로덕션 빌드
npm run lint                             # ESLint
npx tsc --noEmit                         # 타입 체크
npx prisma migrate dev --name <name>     # 마이그레이션 생성 및 적용
npx prisma generate                      # Prisma 클라이언트 재생성
npm run db:seed                          # 시드 데이터 삽입
npm run langsmith:eval                   # LangSmith RAG 오프라인 평가
```

---

## API 명세

모든 API는 NextAuth JWT 세션 인증 필요. 미인증 시 `401 Unauthorized`.

### 인증

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/auth/callback/credentials` | 로그인 |
| `GET`  | `/api/auth/session` | 현재 세션 조회 |
| `POST` | `/api/register` | 회원가입 |

### 이체 내역 `GET /api/transfers`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `accountId` | UUID | 특정 계좌 필터 (생략 시 전체) |
| `from` | YYYY-MM-DD | 조회 시작일 |
| `to` | YYYY-MM-DD | 조회 종료일 |
| `page` | number | 페이지 번호 (기본 1) |
| `limit` | number | 페이지당 건수 (기본 20, 최대 100) |

### AI 채팅 `POST /api/chat`

스트리밍 텍스트 응답 (AI SDK RSC). Body: `{ messages, model?, context? }`

### 대출 신청 `POST /api/loan-applications`

Body: `{ productId, requestedAmount, requestedPeriodMonths, loanPurpose, ... }`

### ML 심사 `POST /api/loan-applications/[id]/screen`

대출 신청 ID에 ML 심사 수행. `loan_inference_server.py`(port 8001) 호출 후 결과 저장.

### 알림 `GET /api/notifications`

미읽음 알림 목록. `PUT /api/notifications` — 전체 읽음 처리.

### 메트릭 `GET /api/metrics`

Prometheus 텍스트 포맷. 주요 메트릭:

| 메트릭 | 설명 |
|--------|------|
| `fin_mate_http_request_duration_seconds` | HTTP 요청 지연 (route·method·status 레이블) |
| `fin_mate_llm_response_duration_seconds` | LLM 응답 시간 |
| `fin_mate_kafka_messages_total` | Kafka 메시지 처리 수 |
| `fin_mate_ml_inference_duration_seconds` | ML 추론 지연 |
| `fin_mate_rag_context_bytes` | RAG 컨텍스트 크기 |

---

## 브랜드 컬러

| 이름 | 값 |
|------|----|
| `kb-yellow` | `#FFCC00` |
| `kb-navy` | `#1A2B4A` |

---

## 일정표 및 RAW 데이터

[스프레드시트 링크](https://docs.google.com/spreadsheets/d/1tIi7CB2FVE8Y2MPfnZwHhe5HgwiIH48ggV7e40yNLUU/edit?usp=sharing)
