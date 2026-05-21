/**
 * 타행(B 은행) 시뮬레이터
 * 흐름:
 *   Step 3  Gateway → [ROUTED_REQUESTS] → B (여기서 수신)
 *   Step 4  B → [B_RECEIVED_ACK]        → Gateway (수신 확인)
 *   Step 5  입금 처리 (SQLite)
 *   Step 6  B → [B_RESULTS]             → Gateway (처리 결과)
 *   Step 7  Gateway → [GATEWAY_B_ACK]   → B (결과 수신 확인, 로그)
 */
import { Kafka, logLevel } from 'kafkajs'
import { findAccount, creditAccount, recordTransaction } from './db.js'
import { startHttpServer } from './server.js'

const TOPICS = {
  ROUTED_REQUESTS: 'interbank-routed-requests',
  B_RECEIVED_ACK:  'interbank-b-received-ack',
  B_RESULTS:       'interbank-b-results',
  GATEWAY_B_ACK:   'interbank-gateway-b-ack',
} as const

const kafka = new Kafka({
  clientId: 'interbank-simulator',
  brokers:  [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  logLevel: logLevel.WARN,
})

const consumer = kafka.consumer({ groupId: 'interbank-simulator-group' })
const producer  = kafka.producer()

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: Object.values(TOPICS).map((topic) => ({
      topic,
      numPartitions:     1,
      replicationFactor: 1,
    })),
  })
  await admin.disconnect()

  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({
    topics:        [TOPICS.ROUTED_REQUESTS, TOPICS.GATEWAY_B_ACK],
    fromBeginning: false,
  })

  startHttpServer()
  console.log('[B 은행] 공동망 수신 대기 중...')

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return
      const body = JSON.parse(message.value.toString())

      // ── Step 3 수신: 공동망이 라우팅한 이체 요청 ─────────────
      if (topic === TOPICS.ROUTED_REQUESTS) {
        const req = body as {
          transactionId:     string
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

        console.log(
          `[B 은행] ▶ 이체 수신: ${req.transactionNo}`,
          `| ${req.fromBankCode}:${req.fromAccountNumber} → ${req.toAccountNumber}`,
          `| ${req.amount.toLocaleString('ko-KR')}원`,
        )

        const receivedAt = new Date().toISOString()

        // Step 4: 공동망에 수신 확인 ACK
        await producer.send({
          topic:    TOPICS.B_RECEIVED_ACK,
          messages: [{ key: req.transactionId, value: JSON.stringify({
            transactionId: req.transactionId,
            transactionNo: req.transactionNo,
            receivedAt,
          }) }],
        })
        console.log(`[B 은행] ✔ 수신 ACK 발신: ${req.transactionNo}`)

        // Step 5: 1~3초 처리 지연 후 입금 처리
        const delay = 1000 + Math.random() * 2000
        await new Promise((r) => setTimeout(r, delay))

        const now     = new Date().toISOString()
        const account = findAccount(req.toAccountNumber)

        let status:      'COMPLETED' | 'FAILED'
        let failureCode: string | null = null

        if (!account) {
          status      = 'FAILED'
          failureCode = 'ACCOUNT_NOT_FOUND'
          console.log(`[B 은행] ✗ 계좌 없음: ${req.toAccountNumber}`)
        } else if (Math.random() < 0.05) {
          status      = 'FAILED'
          failureCode = 'SYSTEM_ERROR'
          console.log(`[B 은행] ✗ 시스템 오류 (랜덤): ${req.transactionNo}`)
        } else {
          creditAccount(req.toAccountNumber, req.amount)
          status = 'COMPLETED'
          console.log(`[B 은행] ✔ 입금 완료: ${account.account_holder} +${req.amount.toLocaleString('ko-KR')}원`)
        }

        recordTransaction({
          transactionId:     req.transactionId,
          fromBankCode:      req.fromBankCode,
          fromAccountNumber: req.fromAccountNumber,
          toAccountNumber:   req.toAccountNumber,
          amount:            req.amount,
          memo:              req.memo,
          status,
          createdAt:         now,
        })

        // Step 6: 공동망에 처리 결과 발신
        await producer.send({
          topic:    TOPICS.B_RESULTS,
          messages: [{ key: req.transactionId, value: JSON.stringify({
            transactionId: req.transactionId,
            transactionNo: req.transactionNo,
            status,
            failureCode,
            settledAt:     now,
          }) }],
        })
        console.log(`[B 은행] ✔ 처리 결과 발신: ${req.transactionNo} → ${status}`)
      }

      // ── Step 7 수신: 공동망이 결과 수신 확인 ─────────────────
      else if (topic === TOPICS.GATEWAY_B_ACK) {
        console.log(`[B 은행] ✔ 공동망 결과 수신 확인: ${body.transactionNo} (acknowledgedAt: ${body.acknowledgedAt})`)
      }
    },
  })
}

main().catch((err) => {
  console.error('[B 은행 시뮬레이터] 오류:', err)
  process.exit(1)
})
