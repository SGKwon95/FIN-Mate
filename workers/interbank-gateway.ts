/**
 * 공동망 Gateway
 * 흐름:
 *   Step 1  A  → [TRANSFER_REQUESTS]   → Gateway (여기서 수신)
 *   Step 2  Gateway → [GATEWAY_ACK]    → A  (수신 확인)
 *   Step 3  Gateway → [ROUTED_REQUESTS]→ B  (라우팅)
 *   Step 4  B  → [B_RECEIVED_ACK]      → Gateway (B 수신 확인, 로그)
 *   Step 6  B  → [B_RESULTS]           → Gateway (처리 결과)
 *   Step 7  Gateway → [GATEWAY_B_ACK]  → B  (결과 수신 확인)
 *   Step 8  Gateway → [TRANSFER_SETTLEMENTS] → A (최종 정산)
 * 실행: npx tsx workers/interbank-gateway.ts
 */
import './otel-init'
import { kafka, TOPICS } from '@/lib/kafka'
import { createWorkerLogger } from '@/lib/logger'
import { runWithKafkaSpan, injectTraceContext } from '@/lib/kafka-otel'

const log = createWorkerLogger('interbank-gateway')

type TransferRequest = {
  transactionId:     string
  instructionId:     string
  transactionNo:     string
  fromBankCode:      string
  fromAccountNumber: string
  fromPartyName:     string
  toBankCode:        string
  toAccountNumber:   string
  toAccountName:     string
  amount:            number
  memo:              string | null
  requestedAt:       string
}

type BResult = {
  transactionId: string
  transactionNo: string
  status:        'COMPLETED' | 'FAILED'
  failureCode:   string | null
  settledAt:     string
}

const ALL_TOPICS = Object.values(TOPICS).map((topic) => ({
  topic,
  numPartitions:     3,
  replicationFactor: 3,
}))

const consumer = kafka.consumer({ groupId: 'interbank-gateway-group' })
const producer  = kafka.producer()

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({ waitForLeaders: true, topics: ALL_TOPICS })
  await admin.disconnect()

  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({
    topics:        [TOPICS.TRANSFER_REQUESTS, TOPICS.B_RECEIVED_ACK, TOPICS.B_RESULTS, TOPICS.INBOUND_RESULTS],
    fromBeginning: false,
  })

  log.info({
    event: 'worker_started',
    topics: [TOPICS.TRANSFER_REQUESTS, TOPICS.B_RECEIVED_ACK, TOPICS.B_RESULTS, TOPICS.INBOUND_RESULTS],
  }, '공동망 Gateway 수신 대기 중')

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return
      return runWithKafkaSpan(topic, message.headers, async () => {
        const body = JSON.parse(message.value!.toString())
        const now  = new Date().toISOString()

        // ── Step 1 수신: A → Gateway ─────────────────────────────
        if (topic === TOPICS.TRANSFER_REQUESTS) {
          const req = body as TransferRequest
          log.info({
            event: 'transfer_request_received',
            transactionNo: req.transactionNo,
            fromBankCode: req.fromBankCode,
            toBankCode: req.toBankCode,
            amount: req.amount,
          }, '이체 요청 수신')

          // Step 2: A 에게 수신 확인 ACK
          await producer.send({
            topic:    TOPICS.GATEWAY_ACK,
            messages: [{ key: req.transactionId, value: JSON.stringify({
              transactionId: req.transactionId,
              transactionNo: req.transactionNo,
              status:        'RECEIVED',
              receivedAt:    now,
            }), headers: injectTraceContext() }],
          })

          // Step 3: 수신 은행으로 라우팅 (FIN-Mate 자행 수신 vs 타행 시뮬레이터)
          if (req.toBankCode === '004') {
            await producer.send({
              topic:    TOPICS.INBOUND_REQUESTS,
              messages: [{ key: req.transactionId, value: message.value, headers: injectTraceContext() }],
            })
            log.info({ event: 'inbound_routed', transactionNo: req.transactionNo }, 'A 수신 ACK 발신 + FIN-Mate 인바운드 라우팅 완료')
          } else {
            await producer.send({
              topic:    TOPICS.ROUTED_REQUESTS,
              messages: [{ key: req.transactionId, value: message.value, headers: injectTraceContext() }],
            })
            log.info({ event: 'interbank_routed', transactionNo: req.transactionNo }, 'A 수신 ACK 발신 + B 은행 라우팅 완료')
          }
        }

        // ── Step 4 수신: B → Gateway (수신 확인) ─────────────────
        else if (topic === TOPICS.B_RECEIVED_ACK) {
          log.info({ event: 'b_bank_ack_received', transactionNo: body.transactionNo, receivedAt: body.receivedAt }, 'B 은행 수신 확인')
        }

        // ── FIN-Mate 인바운드 결과 수신: FIN-Mate → Gateway ─────
        else if (topic === TOPICS.INBOUND_RESULTS) {
          const res = body as BResult
          // FIN-Mate가 수신 은행(B)이므로 TRANSFER_SETTLEMENTS(A용)로 보내지 않음
          log.info({ event: 'inbound_completed', transactionNo: res.transactionNo, status: res.status }, 'FIN-Mate 인바운드 처리 완료')
        }

        // ── Step 6 수신: B → Gateway (처리 결과) ─────────────────
        else if (topic === TOPICS.B_RESULTS) {
          const res = body as BResult
          log.info({ event: 'b_result_received', transactionNo: res.transactionNo, status: res.status }, 'B 은행 처리 결과 수신')

          // Step 7: B 에게 결과 수신 ACK
          await producer.send({
            topic:    TOPICS.GATEWAY_B_ACK,
            messages: [{ key: res.transactionId, value: JSON.stringify({
              transactionId:  res.transactionId,
              transactionNo:  res.transactionNo,
              status:         'RESULT_RECEIVED',
              acknowledgedAt: now,
            }), headers: injectTraceContext() }],
          })

          // Step 8: A 에게 최종 정산 결과 전달
          await producer.send({
            topic:    TOPICS.TRANSFER_SETTLEMENTS,
            messages: [{ key: res.transactionId, value: message.value, headers: injectTraceContext() }],
          })

          log.info({ event: 'settlement_forwarded', transactionNo: res.transactionNo }, 'B ACK 발신 + A 정산 결과 전달 완료')
        }
      })
    },
  })
}

main().catch((err) => {
  log.fatal({ err }, '공동망 Gateway 치명적 오류')
  process.exit(1)
})
