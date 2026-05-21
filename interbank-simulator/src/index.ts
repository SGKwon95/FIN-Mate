import { Kafka, logLevel } from 'kafkajs'

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

      // 1~3초 처리 지연 (공동망 처리 시간 시뮬레이션)
      const delay = 1000 + Math.random() * 2000
      await new Promise((r) => setTimeout(r, delay))

      // 95% 성공 / 5% 실패
      const isSuccess = Math.random() >= 0.05

      const settlement = {
        transactionId: req.transactionId,
        transactionNo: req.transactionNo,
        status:        isSuccess ? 'COMPLETED' : 'FAILED',
        failureCode:   isSuccess ? null : 'SYSTEM_ERROR',
        settledAt:     new Date().toISOString(),
      }

      await producer.send({
        topic:    TOPICS.TRANSFER_SETTLEMENTS,
        messages: [{ key: req.transactionId, value: JSON.stringify(settlement) }],
      })

      console.log(`[타행] 결제 결과 전송: ${req.transactionNo} → ${settlement.status}`)
    },
  })
}

main().catch((err) => {
  console.error('[타행 시뮬레이터] 오류:', err)
  process.exit(1)
})
