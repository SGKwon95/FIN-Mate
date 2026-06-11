# 타행 이체 Kafka 아키텍처

> 현재 코드 기준 (`rag_improvement` 브랜치). 자행 이체(동기 DB 트랜잭션)는 이 문서 범위 밖.

---

## 등장인물 (역할별)

### 브로커
Kafka 서버. 토픽을 관리하고 메시지를 파티션에 저장한다.
- 토픽 9개, 파티션 3개, replication factor 3
- 프로듀서가 보낸 메시지를 파티션 리더에 기록하고 ACK 반환
- 컨슈머 그룹의 offset 커밋을 추적해 재처리/중복 방지 기준으로 사용
- 브로커 장애 시 팔로워가 리더로 승격 (replica 3개이므로 2대까지 허용)

### 프로듀서

| 프로듀서 | 파일 | 발행하는 토픽 |
|---------|------|-------------|
| FIN-Mate 앱 | `lib/transfer-execute.ts` | `TRANSFER_REQUESTS`, `BOK_WIRE_REQUESTS` |
| 공동망 Gateway | `workers/interbank-gateway.ts` | `ROUTED_REQUESTS`, `INBOUND_REQUESTS`, `GATEWAY_B_ACK` |
| B은행 시뮬레이터 | `interbank-simulator/src/index.ts` | `B_RECEIVED_ACK`, `B_RESULTS` |
| 인바운드 컨슈머 | `workers/inbound-consumer.ts` | `INBOUND_RESULTS` |
| BOK-Wire 게이트웨이 | `workers/bok-wire-gateway.ts` | `BOK_WIRE_RESULTS` (감사용) |

### 컨슈머 그룹

| 컨슈머 그룹 ID | 프로세스 | 구독 토픽 |
|--------------|---------|---------|
| `interbank-gateway-group` | 공동망 Gateway | `TRANSFER_REQUESTS`, `B_RECEIVED_ACK`, `B_RESULTS`, `INBOUND_RESULTS` |
| `interbank-simulator-group` | B은행 시뮬레이터 | `ROUTED_REQUESTS`, `GATEWAY_B_ACK` |
| `fin-mate-inbound-group` | 인바운드 컨슈머 | `INBOUND_REQUESTS` |
| `fin-mate-bokwire-group` | BOK-Wire 게이트웨이 | `BOK_WIRE_REQUESTS` |

> 배치 정산 워커(`workers/settlement-batch.ts`)는 Kafka를 사용하지 않는다. DB를 직접 폴링한다.

---

## 토픽 전체 목록

| 토픽 상수 | 토픽 이름 | 프로듀서 → 컨슈머 |
|---------|---------|----------------|
| `TRANSFER_REQUESTS` | `interbank-transfer-requests` | 앱 → 공동망 Gateway |
| `ROUTED_REQUESTS` | `interbank-routed-requests` | 공동망 Gateway → B은행 시뮬레이터 |
| `B_RECEIVED_ACK` | `interbank-b-received-ack` | B은행 → 공동망 Gateway |
| `B_RESULTS` | `interbank-b-results` | B은행 → 공동망 Gateway |
| `GATEWAY_B_ACK` | `interbank-gateway-b-ack` | 공동망 Gateway → B은행 |
| `INBOUND_REQUESTS` | `interbank-inbound-requests` | 공동망 Gateway 또는 `/api/transfers/inbound` → 인바운드 컨슈머 |
| `INBOUND_RESULTS` | `interbank-inbound-results` | 인바운드 컨슈머 → 공동망 Gateway |
| `BOK_WIRE_REQUESTS` | `bokwire-requests` | 앱 → BOK-Wire 게이트웨이 |
| `BOK_WIRE_RESULTS` | `bokwire-results` | BOK-Wire 게이트웨이 → (감사 추적용, 현재 소비자 없음) |

---

## 이체 흐름

### Flow 1 — KFTC 공동망 타행 이체 (10억 이하)

```
[FIN-Mate 앱]
  │ DB: transactionStatus=PENDING, instructionStatus=PENDING
  │ Kafka 발행 (5s 타임아웃 보호)
  ▼
[TRANSFER_REQUESTS]
  ▼
[공동망 Gateway — interbank-gateway-group]
  │ toBankCode=004 이면 → INBOUND_REQUESTS (Flow 2)
  │ 그 외 타행이면 아래로
  ▼
[ROUTED_REQUESTS]
  ▼
[B은행 시뮬레이터 — interbank-simulator-group]
  │ Step 4: B_RECEIVED_ACK 발행 (수신 확인)
  │ SQLite 입금 처리 (1~3s, 95% 성공 / 5% 실패)
  ▼
[B_RECEIVED_ACK] ──▶ 공동망 Gateway (로그만)

[B_RESULTS]
  ▼
[공동망 Gateway]
  │ Step 7: GATEWAY_B_ACK 발행 (결과 수신 확인)
  │ DB: transactionStatus=SETTLEMENT_PENDING
  │ DB: kftcReceipt 생성 (transactionId @unique → 재처리 중복 방지)
  ▼
[GATEWAY_B_ACK] ──▶ B은행 시뮬레이터 (로그만)

(하루 1회 — npm run worker:settlement-batch)
[배치 정산 워커]
  │ DB: SETTLEMENT_PENDING 건 전체 조회
  │ kftcReceipt.rspCode='000' → COMPLETED + 이체완료 알림
  │ 그 외 → FAILED + 잔액 복구 + 이체실패 알림
  │ DB: instructionStatus=COMPLETED/FAILED
  ▼
[PostgreSQL]
```

### Flow 2 — 자행 수신 (toBankCode = 004)

```
[TRANSFER_REQUESTS]
  ▼
[공동망 Gateway]
  │ toBankCode가 자행 코드(004)이면 인바운드로 라우팅
  ▼
[INBOUND_REQUESTS]
  ▼
[인바운드 컨슈머 — fin-mate-inbound-group]
  │ DB: 수신 계좌 입금 처리 (즉시)
  │ DB: transactionStatus=COMPLETED
  ▼
[INBOUND_RESULTS] ──▶ 공동망 Gateway (완료 로그만)
```

### Flow 4 — 외부 타행 → FIN-Mate 수신 (`POST /api/transfers/inbound`)

타행(B은행 등) 시스템이 공동망을 통해 FIN-Mate 계좌로 직접 입금하는 경우.

```
[타행 시스템 / 공동망 게이트웨이]
  │ POST /api/transfers/inbound
  │ Header: X-Gateway-Token (GATEWAY_SECRET 환경변수와 대조)
  │ Body: { transactionNo, fromBankCode, fromAccountNumber, fromPartyName,
  │         toBankCode, toAccountNumber, toAccountName, amount, memo }
  ▼
[app/api/transfers/inbound/route.ts]
  │ 인증 검증 (GATEWAY_SECRET 미설정 시 통과)
  │ transactionId 생성 (crypto.randomUUID)
  ▼
[INBOUND_REQUESTS 토픽 발행]
  │ → 202 { transactionId, status: "QUEUED" } 즉시 응답
  ▼
[인바운드 컨슈머 — fin-mate-inbound-group]
  │ 수신 계좌 조회 (ACTIVE & 미잠금 확인)
  │ DB: account.balance += amount
  │ DB: transaction 생성 (TRANSFER_IN, transactionStatus=COMPLETED)
  │ DB: kftcReceipt 생성 (direction='INBOUND', rspCode='000', transactionId @unique)
  │ DB: notification 생성 (TRANSFER_IN)
  ▼
[INBOUND_RESULTS 토픽 발행] ──▶ 공동망 Gateway (완료 로그만)
```

**kftc_receipt 기록 시점**: 인바운드 컨슈머의 `prisma.$transaction` 내부에서 입금 처리와 원자적으로 생성됨. `transactionId @unique` 제약으로 재처리 시 중복 삽입 차단.

**실패 케이스** (계좌 없음 / 비활성 / 잠금): kftcReceipt 미생성, INBOUND_RESULTS에 `status: "FAILED"` 발행.

**호출 예시:**
```bash
curl -X POST http://localhost:3000/api/transfers/inbound \
  -H "Content-Type: application/json" \
  -H "X-Gateway-Token: $GATEWAY_SECRET" \
  -d '{
    "transactionNo":     "TX1748001234567",
    "fromBankCode":      "302",
    "fromAccountNumber": "3020000000001",
    "fromPartyName":     "김신한",
    "toBankCode":        "004",
    "toAccountNumber":   "004-123456-78901",
    "toAccountName":     "홍길동",
    "amount":            100000,
    "memo":              "용돈"
  }'
# → 202 { "transactionId": "uuid", "status": "QUEUED" }
```

---

### Flow 3 — 한은금융망 BOK-Wire (10억 초과)

RTGS(실시간 건별 총액결제) 방식 — ACK 왕복 없이 2-step으로 즉시 처리.

```
[FIN-Mate 앱]
  │ DB: transactionStatus=PENDING
  ▼
[BOK_WIRE_REQUESTS]
  ▼
[BOK-Wire 게이트웨이 — fin-mate-bokwire-group]
  │ 타행 계좌 유효성 확인 (SQLite)
  │ DB: transactionStatus=COMPLETED/FAILED (즉시 정산)
  │ DB: kftcReceipt, instructionStatus 업데이트
  │ DB: 알림 생성
  ▼
[BOK_WIRE_RESULTS] (감사 추적 기록용 발행, 소비자 없음)
```

---

## 메시지 형식

### `TRANSFER_REQUESTS` / `ROUTED_REQUESTS` / `BOK_WIRE_REQUESTS`

```json
{
  "transactionId":     "uuid",
  "instructionId":     "uuid",
  "transactionNo":     "TX1748001234567",
  "fromBankCode":      "004",
  "fromAccountNumber": "004-123456-78901",
  "fromPartyName":     "홍길동",
  "toBankCode":        "302",
  "toAccountNumber":   "3020000000001",
  "toAccountName":     "김신한",
  "amount":            100000,
  "memo":              null,
  "requestedAt":       "2026-06-09T00:00:00.000Z",
  "clearingNetwork":   "KFTC"
}
```

> `BOK_WIRE_REQUESTS`는 `clearingNetwork: "BOK_WIRE"`.

### `B_RECEIVED_ACK`

```json
{
  "transactionNo": "TX1748001234567",
  "receivedAt":    "2026-06-09T00:00:01.000Z"
}
```

### `B_RESULTS` / `INBOUND_RESULTS`

```json
{
  "transactionId": "uuid",
  "transactionNo": "TX1748001234567",
  "status":        "COMPLETED",
  "failureCode":   null,
  "settledAt":     "2026-06-09T00:00:03.000Z"
}
```

> 실패 시 `status: "FAILED"`, `failureCode: "ACNT_NOT_FOUND"` 등.

### `GATEWAY_B_ACK`

```json
{
  "transactionId":  "uuid",
  "transactionNo":  "TX1748001234567",
  "status":         "RESULT_RECEIVED",
  "acknowledgedAt": "2026-06-09T00:00:03.100Z"
}
```

### `BOK_WIRE_RESULTS`

```json
{
  "transactionId":   "uuid",
  "transactionNo":   "TX1748001234567",
  "status":          "COMPLETED",
  "failureCode":     null,
  "settledAt":       "2026-06-09T00:00:01.000Z",
  "clearingNetwork": "BOK_WIRE"
}
```

---

## 중복·누락 방지

| 레이어 | 메커니즘 | 효과 |
|--------|---------|------|
| Kafka offset | KafkaJS `autoCommit: true` (기본값) | 처리 완료 후 주기적 커밋 → at-least-once 보장 |
| kftcReceipt | `transactionId @unique` DB 제약 | Gateway 재처리 시 중복 receipt 삽입 차단 |
| transaction.update | 동일 status로 update | 멱등 (status 재기록은 무해) |
| 배치 정산 워커 | `WHERE transactionStatus='SETTLEMENT_PENDING'` 필터 | 이미 확정된 건은 조회 안 됨 → 자연 멱등 |
| 앱 Kafka 발행 | `transactionKey @unique` + 5s send 타임아웃 | 타임아웃 시 DB는 PENDING 유지, 데이터 손실 없음 |

---

## 거래 상태 전이

```
PENDING
  │
  ├─ (KFTC 타행) Gateway B_RESULTS 수신 ──▶ SETTLEMENT_PENDING
  │                                               │
  │                    배치 정산 워커 ────────────┤
  │                                         ┌─────┴─────┐
  │                                      COMPLETED   FAILED
  │
  ├─ (자행 수신) 인바운드 컨슈머 즉시 처리 ──▶ COMPLETED
  │
  └─ (BOK-Wire) BOK-Wire 게이트웨이 즉시 처리 ─┬▶ COMPLETED
                                               └▶ FAILED
```

---

## 실행 방법

```bash
# 상시 실행 워커 4개 (gateway + simulator + inbound + bokwire)
npm run kafka:all

# 배치 정산 (하루 1회 — pm2 cron 또는 직접 실행)
npm run worker:settlement-batch
```

pm2 등록 예시:

```bash
pm2 start "npm run worker:settlement-batch" \
  --name settlement-batch \
  --cron-restart "0 0 * * *" \
  --no-autorestart
pm2 save
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `lib/kafka.ts` | KafkaJS 싱글턴, 토픽 상수 9개, `getProducer()` |
| `lib/transfer-execute.ts` | 이체 실행 로직 — DB PENDING 기록 후 Kafka 발행 |
| `workers/interbank-gateway.ts` | 공동망 Gateway — 라우팅, ACK, SETTLEMENT_PENDING 기록 |
| `interbank-simulator/src/index.ts` | B은행 시뮬레이터 — 입금 처리 + HTTP API |
| `workers/inbound-consumer.ts` | FIN-Mate 자행 수신 처리 |
| `workers/bok-wire-gateway.ts` | 한은금융망 즉시 정산 (RTGS) |
| `workers/settlement-batch.ts` | KFTC 타행 이체 배치 정산 (1일 1회) |
| `lib/interbank-db.ts` | 타행 계좌 실명조회용 SQLite read-only |
| `data/other-bank.db` | B은행 계좌·거래 데이터 (SQLite) |
