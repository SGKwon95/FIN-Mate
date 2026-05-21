# Kafka 타행 이체 (공동망) 실행 가이드

## 아키텍처

```
[사용자]
  │ 타행 이체 요청
  ▼
[FIN-Mate 앱]  ──Kafka──▶  [타행 시뮬레이터]
  │                              │ 1~3초 처리 후 결과 전송
  │           ◀──Kafka──────────┘
  │
[Settlement Consumer]  ──DB 업데이트──▶  [PostgreSQL]
```

- **자행 (bankCode: 004)** → 동기 처리, 즉시 COMPLETED
- **타행 (그 외 bankCode)** → Kafka 비동기 처리, PENDING → COMPLETED/FAILED

### Kafka 토픽

| 토픽 | 방향 |
|------|------|
| `interbank-transfer-requests` | FIN-Mate → 타행 시뮬레이터 |
| `interbank-transfer-settlements` | 타행 시뮬레이터 → Settlement Consumer |

---

## 사전 조건

- WSL에 Kafka 설치 및 Zookeeper/Broker 실행 (기본 포트 `localhost:9092`)
- `.env.local`에 `DATABASE_URL` 설정 완료

### WSL에서 Kafka 시작

```bash
# Zookeeper 먼저 시작
$KAFKA_HOME/bin/zookeeper-server-start.sh $KAFKA_HOME/config/zookeeper.properties &

# Kafka Broker 시작
$KAFKA_HOME/bin/kafka-server-start.sh $KAFKA_HOME/config/server.properties &
```

브로커가 `localhost:9092`가 아닌 경우 `.env.local`에 추가:

```
KAFKA_BROKER=<호스트>:<포트>
```

---

## 실행 순서

터미널을 3개 열고 각각 실행합니다.

### 터미널 1 — 타행 시뮬레이터

```bash
npm run kafka:simulator
```

- `interbank-transfer-requests` 구독
- 이체 요청 수신 시 1~3초 대기 후 95% 성공 / 5% 실패로 결과 발행

### 터미널 2 — Settlement Consumer

```bash
npm run kafka:settlement
```

- `interbank-transfer-settlements` 구독
- 성공: 거래 상태 `PENDING → COMPLETED`, 알림 생성
- 실패: 거래 상태 `PENDING → FAILED`, 출금액 잔액 복구, 실패 알림 생성

### 터미널 3 — FIN-Mate 앱

```bash
npm run dev
```

---

## 이체 흐름

1. 이체 화면에서 **bankCode ≠ 004** 은행 선택 후 이체
2. 앱이 DB에 `transactionStatus: PENDING` 거래 기록 후 Kafka에 발행
3. 이체 완료 화면에 **"이체 처리 중"** 표시 (노란 안내 박스)
4. 타행 시뮬레이터가 처리 후 결과를 Kafka에 발행
5. Settlement Consumer가 결과 수신 → DB 업데이트 + 알림 생성
6. 거래내역 페이지에서 최종 상태(COMPLETED/FAILED) 확인

---

## 로그 예시

**타행 시뮬레이터:**
```
[타행 시뮬레이터] 공동망 수신 대기 중...
[타행] 이체 수신: TXN-20240521-001 | 004:12345678 → 020:98765432 | 100,000원
[타행] 결제 결과 전송: TXN-20240521-001 → COMPLETED
```

**Settlement Consumer:**
```
[Settlement Consumer] 공동망 결제 결과 수신 대기 중...
[Settlement] TXN-20240521-001 → COMPLETED
[Settlement] 완료 처리: TXN-20240521-001
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `lib/kafka.ts` | KafkaJS 싱글톤, 토픽 상수 |
| `app/(main)/transfer/actions.ts` | 이체 Server Action, 타행 분기 및 Kafka 발행 |
| `interbank-simulator/src/index.ts` | 타행 공동망 처리 시뮬레이터 |
| `workers/settlement-consumer.ts` | 결제 결과 소비 및 DB 업데이트 |
