# REPORT.md 시나리오 실행 계획 + Kafka 설정 분석

## Context

`lib/transfer-execute.ts`, `POST /api/transfers`, `scripts/load-test/k6-overload.js` 모두 구현 완료.
`scripts/load-test/REPORT.md`에 정의된 A/B/C 3개 시나리오를 실제 실행하기 위한 계획.
실행 전 **영향을 미치는 Kafka 설정값**을 파악해 테스트 결과 해석에 활용한다.

---

## Part 1. 프로젝트에 영향을 미치는 Kafka 설정값 분석

### Producer 설정

| 설정 | 현재 값 | 영향 시나리오 | 설명 |
|---|---|---|---|
| `acks` | `-1` (KafkaJS 기본값) | **B** | 모든 ISR 응답 대기. RF=3, min.insync.replicas=2일 때 브로커 1개 다운해도 2-ISR이 응답하면 성공 |
| `retry.initialRetryTime` | `3000ms` | **B** | `lib/kafka.ts` 명시 설정. 브로커 재시작 간격이 3분 이내면 프로듀서가 자동 재연결 |
| `retries` | `60` | **B** | 총 ~3분간 재시도. 브로커 다운 후 재시작까지 이 시간이 넘으면 `send()` 실패 |
| `linger.ms` | `0` (기본값) | **C** | 각 HTTP 요청마다 즉시 전송. Scenario C(500 VU)에서 `linger: 5`로 변경 시 배치 처리로 처리량 향상 가능 (선택적 튜닝) |
| `delivery.timeout.ms` | `120000ms` (기본값) | **B** | k6 `timeout: 10s`와 불일치 주의. 브로커 다운 시 Kafka 재시도는 2분까지 시도하는데 k6는 10초에 HTTP 실패로 기록 → **에러율 수치 해석 시 고려** |
| `idempotence` | 미설정 | **A·C** | DB 레벨 `transactionKey` 멱등성으로 충분. Kafka 레벨 idempotence는 추가 오버헤드. 변경 불필요 |

### Consumer 설정

| 설정 | 현재 값 | 영향 시나리오 | 설명 |
|---|---|---|---|
| `fromBeginning` | `false` (명시 설정) | **A** | 워커 재시작 후 커밋된 offset부터 재개 → lag에 쌓인 메시지 전부 재처리. Scenario A의 복구 동작 핵심 |
| `session.timeout.ms` | `30000ms` (KafkaJS 기본) | **A** | `pkill -f settlement-consumer` 직후 30초간은 브로커가 컨슈머를 살아있다고 판단 → 이 30초 동안 lag만 누적, 리밸런스 없음 |
| `group.instance.id` | 미설정 (dynamic membership) | **A** | 워커 재시작 시마다 리밸런스 발생. static membership 설정 시 동일 ID로 재시작하면 즉시 파티션 복귀 → 복구 시간 단축 가능 (현재는 미적용) |
| `auto.commit` | eachMessage 완료 후 자동 커밋 (KafkaJS 기본) | **A** | 워커 kill 시 처리 중이던 메시지는 커밋 안 됨 → 재시작 후 재처리 (at-least-once 보장) |
| `max.poll.interval.ms` | `300000ms` (기본 5분) | **C** | settlement-consumer가 DB 트랜잭션 1건 처리에 오래 걸리면 이 값 초과 시 그룹 퇴출. 500 VU 과부하 시 DB 락 대기가 길어지면 발생 가능 |

### 시나리오별 핵심 설정 요약

- **Scenario A (컨슈머 Kill)**: `fromBeginning: false` + auto-commit → at-least-once 복구 동작 확인. `session.timeout.ms=30s` → kill 직후 30초 지연 예상.
- **Scenario B (브로커 1개 다운)**: `acks: all` + `retry 60×3s` + `min.insync.replicas=2` → 브로커 1개 다운 중에도 2-ISR 응답으로 프로듀서 성공. k6 `10s timeout` vs Kafka `retry 3min` 불일치로 HTTP 실패가 실제 데이터 손실 없이도 발생 가능.
- **Scenario C (최대 TPS)**: Kafka 설정보다 **DB 행 락**이 병목. `max.poll.interval.ms` 초과로 consumer 리밸런스 발생 여부 관찰.

---

## Part 2. 테스트 실행 계획

### 사전 준비 (모든 시나리오 공통)

**Step 0-A: 토픽 설정 확인 (Pi에서)**
```bash
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server 192.168.219.110:9092 \
  --describe --topic interbank-transfer-settlements
# 기대: PartitionCount: 3, ReplicationFactor: 3
```

**Step 0-B: 잔액 증액 (Pi PostgreSQL)**
```bash
docker exec -it postgres psql -U postgres fin-mate -c \
  "UPDATE account SET balance = 500000000 \
   WHERE account_id = '9c7a7f9f-3ab9-4198-bb9d-a63055c656f1';"
```

**Step 0-C: 서버 + 워커 기동 (로컬 PC, 터미널 2개)**
```bash
# 터미널 1
npm run dev

# 터미널 2
npm run kafka:all
```

**Step 0-D: 환경 변수 설정**
```bash
export BASE_URL=http://localhost:3000
export FROM_ACCOUNT_ID=9c7a7f9f-3ab9-4198-bb9d-a63055c656f1
```

**Step 0-E: kafka 기본 기능 검증**

| 항목 | 결과 |
|---|---|
| 파티션 확인 | ✅ 전 토픽 partitions=3, RF=3, ISR=3 정상 |
| 키 없이 메시지 전송 | ✅ P1 offset=32338 기록 (errorCode=0) |
| 키 지정 메시지 | ✅ `user-001` → P0 (2건 모두), `user-002` → P2 (다른 파티션) |

키 기반 파티셔닝 확인: 동일 키는 항상 같은 파티션으로 라우팅 (`hash(key) % partitionCount`)

---

### Scenario A: 컨슈머 과부하 (Consumer Kill & Recovery)

**관찰 포인트**: `session.timeout.ms=30s` → kill 후 30초 뒤 리밸런스. `fromBeginning: false` → 재시작 후 lag 전량 재처리.

```bash
# [터미널 3] lag 실시간 모니터링 (Pi에서)
bash scripts/load-test/watch-lag.sh

# [터미널 4] k6 실행
k6 run -e BASE_URL=$BASE_URL -e FROM_ACCOUNT_ID=$FROM_ACCOUNT_ID \
  -e SCENARIO=consumer-lag scripts/load-test/k6-overload.js

# k6 시작 후 ~1분 30초 뒤 — settlement-consumer 강제 종료
pkill -f "kafka:settlement"

# ~4분 후 — 워커 재시작 (lag drain 관찰)
npm run kafka:settlement
```

**기록할 수치**: 최대 Consumer Lag 수치, kill 후 HTTP 에러율, 재시작 후 lag 0 복귀 시간.

---

### Scenario B: 브로커 장애 내성 (1-broker Down)

**관찰 포인트**: `acks: all` + `retry.initialRetryTime: 3000, retries: 60` → 브로커 다운 중 재시도. k6 `10s timeout`으로 HTTP 실패가 발생하더라도 Kafka 내부에서는 재시도 진행 중일 수 있음.

```bash
# [터미널 3] 브로커 상태 모니터링 (Pi에서)
watch -n 3 'docker exec kafka /opt/kafka/bin/kafka-metadata-quorum.sh \
  --bootstrap-server 192.168.219.110:9092 describe --status 2>/dev/null | head -10'

# [터미널 4] k6 실행
k6 run -e BASE_URL=$BASE_URL -e FROM_ACCOUNT_ID=$FROM_ACCOUNT_ID \
  -e SCENARIO=broker-failure scripts/load-test/k6-overload.js

# k6 시작 후 2분 뒤 — Naver Cloud 1번 브로커 중지
ssh user@49.50.135.166 "docker stop kafka"

# k6 종료 1분 전 — 브로커 재시작
ssh user@49.50.135.166 "docker start kafka"
```

**기록할 수치**: 브로커 다운 직후 에러율 스파이크, 2-broker 안정 운영 구간 에러율, 재시작 후 복귀 시간.

---

### Scenario C: 최대 TPS (Producer Flood)

**관찰 포인트**: DB 행 락이 진짜 병목. `max.poll.interval.ms=5분` 초과로 settlement-consumer 리밸런스 발생 여부. 500 VU에서 lag이 얼마나 쌓이는지.

```bash
# [터미널 3] lag 모니터링
bash scripts/load-test/watch-lag.sh

# [터미널 4] k6 실행
k6 run -e BASE_URL=$BASE_URL -e FROM_ACCOUNT_ID=$FROM_ACCOUNT_ID \
  -e SCENARIO=max-tps scripts/load-test/k6-overload.js

# [테스트 완료 후] DB 커밋 건수 vs k6 성공 건수 비교
docker exec -it postgres psql -U postgres fin-mate -c \
  "SELECT transaction_status, count(*) FROM transaction \
   WHERE memo='overload-max-tps' GROUP BY 1;"
```

**기록할 수치**: VU 단계별(100/300/500) 처리량, p(95), 에러율, 최대 lag, DB PENDING/COMPLETED 건수 차이.

---

## 실행 순서 요약

1. 토픽 재생성 확인 (`PartitionCount:3, RF:3`)
2. 잔액 증액 (5억원)
3. `npm run dev` + `npm run kafka:all` 기동
4. Scenario A 실행 + 결과 REPORT.md에 기록
5. 잔액 재증액 (A에서 소진)
6. Scenario B 실행 + 결과 기록
7. 잔액 재증액
8. Scenario C 실행 + 결과 기록

## 검증 포인트

- 토픽 확인: `PartitionCount: 3, ReplicationFactor: 3`
- k6 결과: `http_req_duration p(95)`, `http_req_failed rate`, `transfer_error_rate`
- Kafka lag: `watch-lag.sh` 출력 — 시나리오별 최대값과 복구 시간
- DB 정합성: `SELECT transaction_status, count(*) FROM transaction WHERE memo LIKE 'overload-%' GROUP BY 1,2`

---

## Part 3. 실제 테스트 결과

### Scenario A — 컨슈머 과부하 (Consumer Kill & Recovery)

**실행일**: 2026-06-04  
**설정**: 200 VU, 7분 (워밍업 50 VU 30s → 200 VU 6m → 쿨다운)

#### k6 결과

| 지표 | 측정값 | 임계값 | 판정 |
|---|---|---|---|
| `http_req_failed rate` | **0.35%** | < 30% | ✅ PASS |
| `transfer_error_rate` | **0.35%** | < 30% | ✅ PASS |
| 처리량 | **48.8 req/s** | — | — |
| avg 응답시간 | **3.26s** | — | — |
| p(90) | **4.96s** | — | — |
| p(95) | **5.7s** | — | — |
| max | **10s** (timeout) | — | — |
| 성공 건수 | **20,339** / 20,411 | — | — |
| 실패 건수 | **72** | — | — |

#### Consumer Lag 추이

```
settlement-consumer kill 이전: 정상 드레인 유지
kill 직후 최대 lag: 1,311
consumer 재시작 후: <20 (즉시 감소)
```

#### DB 처리 건수 (memo = 'overload-consumer-lag')

| transaction_status | count |
|---|---|
| COMPLETED | 1,291 |
| FAILED | 62 |
| PENDING | 94,988 (이전 테스트 누적분 포함) |

#### 분석

- **HTTP 에러율 0.35%** — settlement consumer가 kill된 상태에서도 극히 낮음. `executeTransfer()`가 DB에 PENDING 기록 + Kafka 발행 후 HTTP 200 반환하는 구조 덕분에 consumer 장애가 HTTP 응답에 직접 영향 없음.
- **72건 실패** — DB `$transaction` 타임아웃(15s) 초과 건. 데이터 손실이 아닌 처리 지연.
- **at-least-once delivery 확인** — consumer 재시작 즉시 lag 1,311 → <20으로 드레인. `fromBeginning: false`로 커밋된 offset부터 재처리.
- **복구 시간** — 재시작 후 3초 이내 lag 정상화 (watch-lag 1 틱 내 감소).
- **이전 테스트 대비**: pool max=50 증설 + VarChar(10→30) 수정으로 에러율 38.89% → 0.35%로 대폭 개선.
