# Kafka 타행 이체 (공동망) 실행 가이드

## 아키텍처

```
[사용자]
  │ 타행 이체 요청
  ▼
[A 은행 — FIN-Mate 앱]
  │  Step 1  interbank-transfer-requests
  ▼
[공동망 Gateway]
  │  Step 2  interbank-gateway-ack          →  A 은행 (수신 확인)
  │  Step 3  interbank-routed-requests      →  B 은행
  ▼
[B 은행 — interbank-simulator]
  │  Step 4  interbank-b-received-ack       →  공동망 (수신 확인)
  │  Step 5  입금 처리 (SQLite)
  │  Step 6  interbank-b-results            →  공동망 (처리 결과)
  ▼
[공동망 Gateway]
  │  Step 7  interbank-gateway-b-ack        →  B 은행 (결과 수신 확인)
  │  Step 8  interbank-transfer-settlements →  A 은행
  ▼
[A 은행 — Settlement Consumer]
  │  Step 9  interbank-a-settled-ack        →  공동망 (정산 수신 확인)
  │  Step 10 DB 업데이트 + 알림 생성
  ▼
[PostgreSQL]
```

- **자행 (bankCode: 004)** → 동기 처리, 즉시 COMPLETED
- **타행 (그 외 bankCode)** → Kafka 비동기 10단계 처리, PENDING → COMPLETED/FAILED

### Kafka 토픽 전체 목록

| 토픽                             | 방향       | 단계   |
| -------------------------------- | ---------- | ------ |
| `interbank-transfer-requests`    | A → 공동망 | Step 1 |
| `interbank-gateway-ack`          | 공동망 → A | Step 2 |
| `interbank-routed-requests`      | 공동망 → B | Step 3 |
| `interbank-b-received-ack`       | B → 공동망 | Step 4 |
| `interbank-b-results`            | B → 공동망 | Step 6 |
| `interbank-gateway-b-ack`        | 공동망 → B | Step 7 |
| `interbank-transfer-settlements` | 공동망 → A | Step 8 |
| `interbank-a-settled-ack`        | A → 공동망 | Step 9 |

---

## 사전 조건

- Kafka 브로커가 별도 서버(Docker)에서 실행 중: `192.168.219.110:9092`
- `.env`에 `KAFKA_BROKER` 설정 완료
- `.env`에 `DATABASE_URL` 설정 완료

### Kafka 브로커 설정

`.env`에 아래 항목이 설정되어 있어야 합니다:

```
KAFKA_BROKER=192.168.219.110:9092
```

### 연결 테스트

```bash
node -e "
const { Kafka, logLevel } = require('./node_modules/kafkajs');
const kafka = new Kafka({ clientId: 'test', brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'], logLevel: logLevel.ERROR });
const admin = kafka.admin();
admin.connect().then(() => admin.listTopics()).then(t => { console.log('✅ 연결 성공, 토픽 수:', t.length); return admin.disconnect(); }).catch(e => console.error('❌', e.message));
" 2>/dev/null
```

---

## 실행 순서

터미널을 3개 열고 각각 실행합니다. (Kafka 브로커는 외부 서버에서 이미 실행 중)

### 터미널 1 — 공동망 Gateway

```bash
npm run kafka:gateway
```

- `interbank-transfer-requests`, `interbank-b-received-ack`, `interbank-b-results` 구독
- A 은행 요청을 B 은행으로 라우팅하고 중간 ACK 처리
- B 은행 결과를 받아 A 은행에 최종 정산 전달

### 터미널 2 — B 은행 시뮬레이터

```bash
npm run kafka:simulator
```

- `interbank-routed-requests`, `interbank-gateway-b-ack` 구독
- 이체 요청 수신 → 수신 ACK → 1~3초 처리 → 95% 성공 / 5% 실패
- HTTP API 서버 `http://localhost:4000` 에서 수신 이력 조회 가능

### 터미널 3 — A 은행 Settlement Consumer

```bash
npm run kafka:settlement
```

- `interbank-gateway-ack`, `interbank-transfer-settlements` 구독
- 공동망 수신 확인 ACK 로그
- 최종 정산 결과 수신 → DB 업데이트 + 알림 생성 → 정산 수신 ACK 발신

### 터미널 3 — FIN-Mate 앱

```bash
npm run dev
```

---

## 이체 흐름 (10단계)

1. 이체 화면에서 **bankCode ≠ 004** 은행 선택, 계좌 조회 후 이체
2. 앱이 DB에 `transactionStatus: PENDING` 기록 후 Kafka 발행
3. 이체 완료 화면에 **"이체 처리 중"** 표시 (노란 안내 박스)
4. 공동망 → B 은행 라우팅 → B 은행 입금 처리
5. 공동망 → A 은행 최종 정산 결과 전달
6. Settlement Consumer가 DB 업데이트 + 알림 생성
7. 거래내역 페이지에서 최종 상태(COMPLETED/FAILED) 확인

---

## 로그 예시

**공동망 Gateway:**

```
[공동망 Gateway] 수신 대기 중...
[공동망] ▶ 이체 요청 수신: TX1748001234567 | 004→302 | 100,000원
[공동망] ✔ A 수신 ACK 발신 + B 은행 라우팅 완료: TX1748001234567
[공동망] ✔ B 은행 수신 확인: TX1748001234567 (receivedAt: 2026-05-21T...)
[공동망] ▶ B 은행 처리 결과: TX1748001234567 → COMPLETED
[공동망] ✔ B ACK 발신 + A 정산 결과 전달 완료: TX1748001234567
```

**B 은행 시뮬레이터:**

```
[B 은행] 공동망 수신 대기 중...
[B 은행] ▶ 이체 수신: TX1748001234567 | 004:1234567890 → 3020000000001 | 100,000원
[B 은행] ✔ 수신 ACK 발신: TX1748001234567
[B 은행] ✔ 입금 완료: 김신한 +100,000원
[B 은행] ✔ 처리 결과 발신: TX1748001234567 → COMPLETED
[B 은행] ✔ 공동망 결과 수신 확인: TX1748001234567 (acknowledgedAt: 2026-05-21T...)
```

**A 은행 Settlement Consumer:**

```
[A 은행] 공동망 메세지 수신 대기 중...
[A 은행] ✔ 공동망 수신 확인: TX1748001234567 (receivedAt: 2026-05-21T...)
[A 은행] ▶ 정산 결과 수신: TX1748001234567 → COMPLETED
[A 은행] ✔ 완료 처리: TX1748001234567
[A 은행] ✔ 정산 수신 ACK 발신: TX1748001234567
```

---

## B 은행 HTTP API

`npm run kafka:simulator` 실행 시 `http://localhost:4000` 에서 수신 이력을 조회할 수 있습니다.

| 엔드포인트                     | 설명                                     |
| ------------------------------ | ---------------------------------------- |
| `GET /transactions`            | 수신 이력 목록 (쿼리: `limit`, `status`) |
| `GET /accounts`                | 타행 계좌 목록                           |
| `GET /accounts/:accountNumber` | 특정 계좌 조회                           |

```bash
# 최근 이체 수신 이력
curl http://localhost:4000/transactions?limit=10

# 실패 건만 조회
curl http://localhost:4000/transactions?status=FAILED

# 계좌 잔액 확인
curl http://localhost:4000/accounts/3020000000001
```

### 타행 테스트 계좌

| 계좌번호        | 예금주 | 은행           |
| --------------- | ------ | -------------- |
| `3020000000001` | 김신한 | 신한은행 (302) |
| `3020000000002` | 이신한 | 신한은행 (302) |
| `0200000000001` | 박우리 | 우리은행 (020) |
| `0200000000002` | 최우리 | 우리은행 (020) |
| `0880000000001` | 정하나 | 하나은행 (088) |
| `0880000000002` | 강하나 | 하나은행 (088) |

타행 계좌가 없는 경우 시드 스크립트 실행:

```bash
npm run kafka:seed
```

---

## 관련 파일

| 파일                               | 역할                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| `lib/kafka.ts`                     | KafkaJS 싱글톤, 토픽 상수 (8개)                            |
| `app/(main)/transfer/actions.ts`   | 이체 Server Action, 계좌 실명조회, 타행 분기 및 Kafka 발행 |
| `lib/interbank-db.ts`              | 타행 계좌 실명조회용 SQLite read-only 헬퍼                 |
| `workers/interbank-gateway.ts`     | 공동망 Gateway — 라우팅 및 ACK 처리                        |
| `interbank-simulator/src/index.ts` | B 은행 시뮬레이터 — 입금 처리 및 HTTP API                  |
| `interbank-simulator/src/db.ts`    | SQLite 접근 (계좌/거래 CRUD)                               |
| `workers/settlement-consumer.ts`   | A 은행 정산 소비자 — DB 업데이트 및 알림                   |
| `data/other-bank.db`               | 타행 계좌·거래 데이터 (SQLite)                             |

## 시드 삽입

```bash
  cd /FIN-Mate && npx tsx interbank-simulator/seed.ts
```

## 실행 방법

```bash
   npm run kafka:gateway
   npm run kafka:simulator
   npm run kafka:settlement
```
