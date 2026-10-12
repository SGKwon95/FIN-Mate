# FIN-Mate — 풀스택 모바일 뱅킹 포트폴리오

> Next.js 16 · Kafka · PyTorch/ONNX · RAG · LGTM 관측성 스택을 결합한 금융 서비스 풀스택 프로젝트

---

## 프로젝트 한 줄 소개

실제 시중은행의 핵심 기능(계좌 조회, 이체, 대출 심사, AI 상담)을 직접 구현하고, 타행 이체는 Kafka 기반 비동기 흐름으로, 대출 심사는 머신러닝 모델을 ONNX로 변환해 Node.js에서 직접 추론하는 구조로 만든 포트폴리오 프로젝트입니다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 언어 | TypeScript 5, Python 3 |
| 스타일 | Tailwind CSS v4 |
| ORM | Prisma 7 + PostgreSQL (pg 어댑터) |
| 인증 | NextAuth v5 (JWT, Credentials) |
| 메시징 | Apache Kafka (KafkaJS) |
| ML | PyTorch MLP → ONNX → onnxruntime-node |
| AI 채팅 | LM Studio (OpenAI 호환 API) + Vercel AI SDK v4 |
| 관측성 | Prometheus · Loki · Tempo · Grafana · Arize Phoenix |
| 배포 | PM2 + Docker Compose |

---

## 전체 아키텍처

```
브라우저 (Next.js App Router)
    │ HTTP
    ▼
Next.js API Routes (Node.js)
    ├── Prisma/pg ──────────► PostgreSQL
    ├── Kafka produce ──────► Kafka Broker (Raspberry Pi)
    │                              │
    │                    ┌─────────┴──────────┐
    │               Kafka Workers            B은행 시뮬레이터
    │               (interbank-gateway       (SQLite, 타행 역할)
    │                settlement-consumer
    │                inbound-consumer
    │                bok-wire-gateway)
    │
    └── ONNX Runtime ──────► loan_model.onnx (인프로세스 추론)

관측성 스택 (Docker Compose)
    Prometheus ← /api/metrics 스크랩 (15초마다)
    Loki ← Promtail이 로그 파일 tail → push
    Tempo ← OTel OTLP HTTP (스팬 push)
    Phoenix ← OTel OTLP gRPC (LLM/ML 스팬 push)
    Grafana → 세 소스 통합 대시보드
```

---

## 핵심 기능 상세

---

### 2. 타행 이체 — Kafka 기반 비동기 9단계 흐름

실제 금융결제원 공동망 구조를 참고해 Kafka로 비동기 메시징 흐름을 직접 구현했습니다.

```
FIN-Mate 앱 → [TRANSFER_REQUESTS] → 공동망 Gateway
                                         │
                          [ROUTED_REQUESTS] → B은행 시뮬레이터
                                         │
                              [B_RESULTS] ← B은행 시뮬레이터
                                         │
                    [TRANSFER_SETTLEMENTS] → FIN-Mate 정산 처리
```

**설계 판단**:
- **자행 이체**는 같은 DB 내 처리라 Kafka 없이 DB 트랜잭션으로 즉시 처리합니다. 비동기를 끌어들이는 시점을 명확하게 구분했습니다.
- **10억 초과 이체(한은금융망)**는 별도 `BOK_WIRE_REQUESTS` 토픽으로 분리해 RTGS(즉시 정산) 흐름을 구현했습니다.
- Kafka 메시지에 **W3C `traceparent` 헤더**를 직접 심어서 비동기 흐름을 넘나드는 분산 트레이싱을 구현했습니다. 메시지 큐를 끼면 보통 트레이스가 끊기는데, 이를 수동으로 이어줬습니다.
- **B은행 시뮬레이터**는 SQLite DB(`data/other-bank.db`)를 사용하는 별도 워커로 구현해, 실제 타행이 Kafka 메시지를 받고 처리하는 흐름을 흉내 냅니다.

---

### 3. ML 대출심사 — 모델 비교부터 ONNX 배포까지

단순히 모델을 가져다 쓴 게 아니라 **데이터 선택 → 학습 → 비교 → 배포 전략 결정**까지 전 과정을 직접 구현했습니다.

#### 3-1. 데이터 & 문제 정의

- Kaggle LendingClub 데이터셋 (실제 대출 기록, 수십만 행)
- 타겟: 대출 부도 여부 이진 분류 (`Charged Off` / `Default` → 1, `Fully Paid` → 0)
- 피처 16개: 대출금액, 금리, 연소득, DTI, FICO 점수, 고용기간, 주택소유 형태 등

#### 3-2. 4개 모델 성능 비교 (model_compare_results.json)

| 모델 | AUC-ROC | KS 통계량 | F1 (부도) | 학습 시간 |
|---|---|---|---|---|
| Logistic Regression | 0.7053 | 0.2984 | 0.4246 | 3.4초 |
| LightGBM | 0.7012 | 0.2903 | 0.4198 | 3.2초 |
| XGBoost | **0.7184** | **0.3177** | **0.4358** | 32.4초 |
| **PyTorch MLP** | 0.7143 | 0.3091 | 0.4300 | 274.1초 |

XGBoost가 정확도 1위였지만, **최종 배포 모델은 PyTorch MLP를 선택**했습니다.

> **왜 성능 1등이 아닌 MLP를 골랐나?**
>
> 배포 목표가 "별도 Python 서버 없이 Next.js 프로세스 안에서 추론"이었습니다. PyTorch는 `torch.onnx.export`로 전처리(StandardScaler) + 신경망 + sigmoid를 **단일 ONNX 그래프**로 깔끔하게 통합할 수 있는 반면, XGBoost/LightGBM의 ONNX 변환은 별도 변환기가 필요하고 안정성이 낮습니다. AUC 차이(0.7184 vs 0.7143)보다 운영 단순화가 더 중요하다고 판단했습니다.

#### 3-3. 클래스 불균형 처리

부도율이 낮은 불균형 데이터라, `BCEWithLogitsLoss`에 `pos_weight`(정상:부도 비율)를 줘서 부도 케이스에 더 높은 페널티를 적용했습니다.

#### 3-4. 임계값 — 0.5 대신 KS 통계량 기반

KS(Kolmogorov-Smirnov) 통계량은 모델이 두 그룹(정상/부도)의 누적분포를 가장 크게 벌리는 지점으로, `max(TPR - FPR)`로 계산됩니다. 신용평가 업계 표준 지표로, 이 지점을 승인/거절 기준으로 씁니다.

```python
fpr, tpr, thresholds = roc_curve(y_test, y_prob)
ks_threshold = thresholds[np.argmax(tpr - fpr)]  # 최적 분리점
```

#### 3-7. 점수 기반 3단계 자동 판정

```
ML 점수 800+ → 자동 승인 (APPROVED)
ML 점수 300미만 → 자동 거절 (REJECTED)
그 외 → 직원 검토 필요 (PENDING_REVIEW) ← Human-in-the-loop
```

완전 자동화가 아니라 모호한 구간은 사람이 판단하는 구조로 설계했습니다.

---

### 4. RAG AI 채팅

- LM Studio(로컬 LLM 서버)가 OpenAI 호환 API를 제공하고, `@ai-sdk/openai`의 `createOpenAI`로 `baseURL`만 바꿔서 연결합니다
- `useChat` 훅으로 스트리밍 응답을 처리하고, 모델 선택 드롭다운으로 런타임에 모델을 전환할 수 있습니다
- `.txt` / `.md` 문서 업로드 시 FileReader로 읽어 `retrievedContext`로 매 요청에 포함합니다
- 상품 상세 페이지에서 챗봇을 열면 해당 상품 정보가 시스템 프롬프트에 자동으로 주입됩니다

**버전 제약**: `ai@4` + `@ai-sdk/react@0` 조합만 사용합니다. v5는 `ollama-ai-provider`와 타입 불일치(`LanguageModelV1 vs V2`)로 사용 불가해서, 버전을 고정하고 `ollama-ai-provider` 패키지를 제거했습니다.

---

### 5. 관측성 스택 — 3 Pillars + LLM 특화

메트릭·로그·트레이스 세 관측성 축을 각각 전문 도구로 분리하고 Grafana로 통합 조회하는 구조입니다.

| 도구 | 역할 |
|---|---|
| **Prometheus** | `/api/metrics` 엔드포인트를 15초마다 Pull 스크랩. HTTP 지연, Kafka 처리량, ML 추론 시간 등 수집 |
| **Loki** | 로그 저장소. 로그 본문은 인덱싱하지 않고 라벨만 인덱싱해서 가벼움 |
| **Promtail** | 로그 수집 에이전트. `/var/log/fin-mate/*.log` 파일 tail → JSON 파싱 → Loki Push |
| **Tempo** | 분산 트레이스 저장소. OTLP HTTP로 스팬을 받아 Kafka 넘나드는 전체 흐름 추적 |
| **Arize Phoenix** | LLM 전용 트레이스. RAG 입출력, 컨텍스트 크기 등 LLM 도메인 특화 UI 제공 |
| **Grafana** | Prometheus + Loki + Tempo 통합 대시보드. datasources.yaml로 미리 provisioning |

**특징**: `lib/logger.ts`의 pino 로거가 활성 스팬의 `traceId`를 자동으로 로그에 포함시킵니다. 로그에서 이상 징후를 발견하면 traceId로 Tempo에서 정확한 요청 흐름을 바로 추적할 수 있습니다.

---

### 6. 자동이체 워커

- DB의 `scheduled_transfer` 테이블에서 "오늘 실행해야 할" 자동이체 건을 조회하고 실행합니다
- 워커 자체는 PM2나 cron으로 1일 1회 단발 실행하는 구조입니다
- 자행 이체와 동일하게 DB 트랜잭션으로 처리합니다

---

## 주요 기술 결정 & 트레이드오프

### Prisma 7 — datasource에 url 필드 없음

Prisma 7은 breaking change로 datasource 블록의 `url` 필드를 제거했습니다. 대신 `pg` 어댑터를 직접 주입합니다.

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
new PrismaClient({ adapter })
```

`DATABASE_URL`은 `lib/prisma.ts`와 마이그레이션에서만 사용하고, datasource 블록에는 들어가지 않습니다.

### Tailwind v4 — tailwind.config.ts 없음

v4부터 설정 파일 대신 `app/globals.css`의 `@theme` 블록에서 커스텀 토큰을 정의합니다. `@utility`로 `scrollbar-none`을 직접 등록해 Firefox와 WebKit 모두 지원합니다.

### 배포 — PM2 + Docker Compose 조합

Next.js 앱(1개) + Kafka 워커(4개) 총 5개 Node.js 프로세스를 `ecosystem.config.js` 하나로 PM2가 관리합니다. 관측성 스택 6개 컨테이너는 Docker Compose로 별도 관리합니다.

---