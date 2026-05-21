import { Kafka, logLevel } from 'kafkajs'
import { findAccount, creditAccount, recordTransaction } from './db.js'
import { startHttpServer } from './server.js'

const TOPICS = {
  TRANSFER_REQUESTS:    'interbank-transfer-requests',
  TRANSFER_SETTLEMENTS: 'interbank-transfer-settlements',
} as const

const kafka = new Kafka({
  clientId: 'interbank-simulator',
  brokers:  [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  logLevel: logLevel.WARN,
})

const consumer = kafka.consumer({ groupId: 'interbank-simulator-group' })
const producer = kafka.producer()

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: [
      { topic: TOPICS.TRANSFER_REQUESTS,    numPartitions: 1, replicationFactor: 1 },
      { topic: TOPICS.TRANSFER_SETTLEMENTS, numPartitions: 1, replicationFactor: 1 },
    ],
  })
  await admin.disconnect()

  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: TOPICS.TRANSFER_REQUESTS, fromBeginning: false })

  startHttpServer()
  console.log('[타행 시뮬레이터] 공동망 수신 대기 중...')

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      const req = JSON.parse(message.value.toString()) as {
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
        `[타행] 이체 수신: ${req.transactionNo}`,
        `| ${req.fromBankCode}:${req.fromAccountNumber} → ${req.toBankCode}:${req.toAccountNumber}`,
        `| ${req.amount.toLocaleString('ko-KR')}원`,
      )

      // 1~3초 처리 지연
      const delay = 1000 + Math.random() * 2000
      await new Promise((r) => setTimeout(r, delay))

      const now = new Date().toISOString()
      const account = findAccount(req.toAccountNumber)

      let status: 'COMPLETED' | 'FAILED'
      let failureCode: string | null = null

      if (!account) {
        // 수신 계좌 없음
        status      = 'FAILED'
        failureCode = 'ACCOUNT_NOT_FOUND'
        console.log(`[타행] 계좌 없음: ${req.toAccountNumber}`)
      } else if (Math.random() < 0.05) {
        // 5% 시스템 랜덤 실패
        status      = 'FAILED'
        failureCode = 'SYSTEM_ERROR'
        console.log(`[타행] 시스템 오류 (랜덤): ${req.transactionNo}`)
      } else {
        // 정상 입금 처리
        creditAccount(req.toAccountNumber, req.amount)
        status = 'COMPLETED'
        console.log(`[타행] 입금 완료: ${account.account_holder} +${req.amount.toLocaleString('ko-KR')}원 (잔액: ${(account.balance + req.amount).toLocaleString('ko-KR')}원)`)
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

      await producer.send({
        topic:    TOPICS.TRANSFER_SETTLEMENTS,
        messages: [{ key: req.transactionId, value: JSON.stringify({
          transactionId: req.transactionId,
          transactionNo: req.transactionNo,
          status,
          failureCode,
          settledAt: now,
        })}],
      })

      console.log(`[타행] 결제 결과 전송: ${req.transactionNo} → ${status}`)
    },
  })
}

main().catch((err) => {
  console.error('[타행 시뮬레이터] 오류:', err)
  process.exit(1)
})
