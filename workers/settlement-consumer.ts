/**
 * 공동망 결제 결과 Consumer
 * interbank-transfer-settlements 토픽을 구독하여 이체 상태를 업데이트한다.
 * 실행: npx tsx workers/settlement-consumer.ts
 */
import { kafka, TOPICS } from '@/lib/kafka'
import { prisma } from '@/lib/prisma'

const consumer = kafka.consumer({ groupId: 'fin-mate-settlement-group' })

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

  await consumer.connect()
  await consumer.subscribe({ topic: TOPICS.TRANSFER_SETTLEMENTS, fromBeginning: false })

  console.log('[Settlement Consumer] 공동망 결제 결과 수신 대기 중...')

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      const msg = JSON.parse(message.value.toString()) as {
        transactionId: string
        transactionNo: string
        status:        'COMPLETED' | 'FAILED'
        failureCode:   string | null
        settledAt:     string
      }

      console.log(`[Settlement] ${msg.transactionNo} → ${msg.status}`)

      // 해당 이체 거래 조회
      const txn = await prisma.transaction.findUnique({
        where:  { transactionId: msg.transactionId },
        select: {
          transactionId: true,
          accountId:     true,
          amount:        true,
          balanceBefore: true,
          account:       { select: { partyId: true, balance: true } },
        },
      })

      if (!txn) {
        console.warn(`[Settlement] 거래 없음: ${msg.transactionId}`)
        return
      }

      const amountNum = Number(txn.amount)
      const partyId   = txn.account.partyId

      if (msg.status === 'COMPLETED') {
        await prisma.transaction.update({
          where: { transactionId: msg.transactionId },
          data:  { transactionStatus: 'COMPLETED' },
        })

        await prisma.notification.create({
          data: {
            partyId,
            notificationType:  'TRANSFER_OUT',
            notificationTitle: '이체 완료',
            notificationBody:  `타행 이체 ${amountNum.toLocaleString('ko-KR')}원이 완료되었습니다.`,
            linkedEntityId:    msg.transactionId,
          },
        })

        console.log(`[Settlement] 완료 처리: ${msg.transactionNo}`)
      } else {
        // 실패 시 잔액 복구
        const restoredBalance = Number(txn.account.balance) + amountNum

        await prisma.$transaction([
          prisma.transaction.update({
            where: { transactionId: msg.transactionId },
            data:  {
              transactionStatus: 'FAILED',
              rejectedReason:    msg.failureCode ?? 'SYSTEM_ERROR',
            },
          }),
          prisma.account.update({
            where: { accountId: txn.accountId },
            data:  { balance: restoredBalance },
          }),
          prisma.notification.create({
            data: {
              partyId,
              notificationType:  'RISK_ALERT',
              notificationTitle: '이체 실패',
              notificationBody:  `타행 이체 ${amountNum.toLocaleString('ko-KR')}원이 실패하여 잔액이 복구되었습니다. (${msg.failureCode ?? 'SYSTEM_ERROR'})`,
              linkedEntityId:    msg.transactionId,
            },
          }),
        ])

        console.log(`[Settlement] 실패 처리 + 잔액 복구: ${msg.transactionNo}`)
      }
    },
  })
}

main().catch((err) => {
  console.error('[Settlement Consumer] 오류:', err)
  process.exit(1)
})
