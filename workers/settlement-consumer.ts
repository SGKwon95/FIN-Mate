/**
 * A 은행 Settlement Consumer
 * 흐름:
 *   Step 2  Gateway → [GATEWAY_ACK]          → A (수신 확인, 로그)
 *   Step 8  Gateway → [TRANSFER_SETTLEMENTS] → A (최종 정산 결과, DB 업데이트)
 *   Step 9  A → [A_SETTLED_ACK]              → Gateway (정산 수신 확인)
 * 실행: npx tsx workers/settlement-consumer.ts
 */
import { kafka, TOPICS } from '@/lib/kafka'
import { prisma } from '@/lib/prisma'

const consumer = kafka.consumer({ groupId: 'fin-mate-settlement-group' })
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
    topics:        [TOPICS.GATEWAY_ACK, TOPICS.TRANSFER_SETTLEMENTS],
    fromBeginning: false,
  })

  console.log('[A 은행] 공동망 메세지 수신 대기 중...')
  console.log('  구독:', TOPICS.GATEWAY_ACK, '|', TOPICS.TRANSFER_SETTLEMENTS)

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return
      const body = JSON.parse(message.value.toString())

      // ── Step 2 수신: Gateway → A 수신 확인 ACK ───────────────
      if (topic === TOPICS.GATEWAY_ACK) {
        console.log(`[A 은행] ✔ 공동망 수신 확인: ${body.transactionNo} (receivedAt: ${body.receivedAt})`)
        return
      }

      // ── Step 8 수신: Gateway → A 최종 정산 결과 ──────────────
      const msg = body as {
        transactionId: string
        transactionNo: string
        status:        'COMPLETED' | 'FAILED'
        failureCode:   string | null
        settledAt:     string
      }

      console.log(`[A 은행] ▶ 정산 결과 수신: ${msg.transactionNo} → ${msg.status}`)

      const txn = await prisma.transaction.findUnique({
        where:  { transactionId: msg.transactionId },
        select: {
          transactionId: true,
          accountId:     true,
          amount:        true,
          account:       { select: { partyId: true, balance: true } },
        },
      })

      if (!txn) {
        console.warn(`[A 은행] 거래 없음: ${msg.transactionId}`)
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

        console.log(`[A 은행] ✔ 완료 처리: ${msg.transactionNo}`)
      } else {
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

        console.log(`[A 은행] ✔ 실패 처리 + 잔액 복구: ${msg.transactionNo}`)
      }

      // Step 9: 공동망에 정산 수신 확인 ACK
      await producer.send({
        topic:    TOPICS.A_SETTLED_ACK,
        messages: [{ key: msg.transactionId, value: JSON.stringify({
          transactionId: msg.transactionId,
          transactionNo: msg.transactionNo,
          status:        'SETTLED',
          settledAt:     new Date().toISOString(),
        }) }],
      })
      console.log(`[A 은행] ✔ 정산 수신 ACK 발신: ${msg.transactionNo}`)
    },
  })
}

main().catch((err) => {
  console.error('[A 은행 Settlement Consumer] 오류:', err)
  process.exit(1)
})
