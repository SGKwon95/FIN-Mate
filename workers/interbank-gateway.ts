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
import { kafka, TOPICS } from '@/lib/kafka'

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
  numPartitions:     1,
  replicationFactor: 1,
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

  console.log('[공동망 Gateway] 수신 대기 중...')
  console.log('  구독:', TOPICS.TRANSFER_REQUESTS, '|', TOPICS.B_RECEIVED_ACK, '|', TOPICS.B_RESULTS, '|', TOPICS.INBOUND_RESULTS)

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return
      const body = JSON.parse(message.value.toString())
      const now  = new Date().toISOString()

      // ── Step 1 수신: A → Gateway ─────────────────────────────
      if (topic === TOPICS.TRANSFER_REQUESTS) {
        const req = body as TransferRequest
        console.log(`[공동망] ▶ 이체 요청 수신: ${req.transactionNo} | ${req.fromBankCode}→${req.toBankCode} | ${req.amount.toLocaleString('ko-KR')}원`)

        // Step 2: A 에게 수신 확인 ACK
        await producer.send({
          topic:    TOPICS.GATEWAY_ACK,
          messages: [{ key: req.transactionId, value: JSON.stringify({
            transactionId: req.transactionId,
            transactionNo: req.transactionNo,
            status:        'RECEIVED',
            receivedAt:    now,
          }) }],
        })

        // Step 3: 수신 은행으로 라우팅 (FIN-Mate 자행 수신 vs 타행 시뮬레이터)
        if (req.toBankCode === '004') {
          await producer.send({
            topic:    TOPICS.INBOUND_REQUESTS,
            messages: [{ key: req.transactionId, value: message.value }],
          })
          console.log(`[공동망] ✔ A 수신 ACK 발신 + FIN-Mate 인바운드 라우팅 완료: ${req.transactionNo}`)
        } else {
          await producer.send({
            topic:    TOPICS.ROUTED_REQUESTS,
            messages: [{ key: req.transactionId, value: message.value }],
          })
          console.log(`[공동망] ✔ A 수신 ACK 발신 + B 은행 라우팅 완료: ${req.transactionNo}`)
        }
      }

      // ── Step 4 수신: B → Gateway (수신 확인) ─────────────────
      else if (topic === TOPICS.B_RECEIVED_ACK) {
        console.log(`[공동망] ✔ B 은행 수신 확인: ${body.transactionNo} (receivedAt: ${body.receivedAt})`)
      }

      // ── FIN-Mate 인바운드 결과 수신: FIN-Mate → Gateway ─────
      else if (topic === TOPICS.INBOUND_RESULTS) {
        const res = body as BResult
        // FIN-Mate가 수신 은행(B)이므로 TRANSFER_SETTLEMENTS(A용)로 보내지 않음
        console.log(`[공동망] ✔ FIN-Mate 인바운드 처리 완료: ${res.transactionNo} → ${res.status}`)
      }

      // ── Step 6 수신: B → Gateway (처리 결과) ─────────────────
      else if (topic === TOPICS.B_RESULTS) {
        const res = body as BResult
        console.log(`[공동망] ▶ B 은행 처리 결과: ${res.transactionNo} → ${res.status}`)

        // Step 7: B 에게 결과 수신 ACK
        await producer.send({
          topic:    TOPICS.GATEWAY_B_ACK,
          messages: [{ key: res.transactionId, value: JSON.stringify({
            transactionId:  res.transactionId,
            transactionNo:  res.transactionNo,
            status:         'RESULT_RECEIVED',
            acknowledgedAt: now,
          }) }],
        })

        // Step 8: A 에게 최종 정산 결과 전달
        await producer.send({
          topic:    TOPICS.TRANSFER_SETTLEMENTS,
          messages: [{ key: res.transactionId, value: message.value }],
        })

        console.log(`[공동망] ✔ B ACK 발신 + A 정산 결과 전달 완료: ${res.transactionNo}`)
      }
    },
  })
}

main().catch((err) => {
  console.error('[공동망 Gateway] 오류:', err)
  process.exit(1)
})
