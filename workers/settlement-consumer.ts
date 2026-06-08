/**
 * A 은행 Settlement Consumer
 * 흐름:
 *   Step 2  Gateway → [GATEWAY_ACK]          → A (수신 확인, 로그)
 *   Step 8  Gateway → [TRANSFER_SETTLEMENTS] → A (최종 정산 결과, DB 업데이트)
 *   Step 9  A → [A_SETTLED_ACK]              → Gateway (정산 수신 확인)
 * 실행: npx tsx workers/settlement-consumer.ts
 */
import './otel-init'
import { kafka, TOPICS } from '@/lib/kafka'
import { prisma } from '@/lib/prisma'
import { createWorkerLogger } from '@/lib/logger'
import { runWithKafkaSpan } from '@/lib/kafka-otel'

const log = createWorkerLogger('settlement-consumer')

const consumer = kafka.consumer({
  groupId: 'fin-mate-settlement-group',
  heartbeatInterval: 3000,
  sessionTimeout: 10000,
})
const producer  = kafka.producer()

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: Object.values(TOPICS).map((topic) => ({
      topic,
      numPartitions:     3,
      replicationFactor: 3,
    })),
  })
  await admin.disconnect()

  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({
    topics:        [TOPICS.GATEWAY_ACK, TOPICS.TRANSFER_SETTLEMENTS],
    fromBeginning: false,
  })

  log.info({
    event: 'worker_started',
    topics: [TOPICS.GATEWAY_ACK, TOPICS.TRANSFER_SETTLEMENTS],
  }, 'A 은행 공동망 메시지 수신 대기 중')

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return
      return runWithKafkaSpan(topic, message.headers, async () => {
      const body = JSON.parse(message.value!.toString())

      // ── Step 2 수신: Gateway → A 수신 확인 ACK ───────────────
      if (topic === TOPICS.GATEWAY_ACK) {
        log.info({ event: 'gateway_ack_received', transactionNo: body.transactionNo, receivedAt: body.receivedAt }, '공동망 수신 확인')
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

      log.info({ event: 'settlement_received', transactionNo: msg.transactionNo, status: msg.status }, '정산 결과 수신')

      const txn = await prisma.transaction.findUnique({
        where:  { transactionId: msg.transactionId },
        select: {
          transactionId: true,
          accountId:     true,
          amount:        true,
          instructionId: true,
          account:       { select: { partyId: true, balance: true } },
        },
      })

      if (!txn) {
        log.warn({ event: 'transaction_not_found', transactionId: msg.transactionId }, '거래 없음')
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

        log.info({ event: 'settlement_completed', transactionNo: msg.transactionNo }, '완료 처리')
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

        log.info({ event: 'settlement_failed_with_restore', transactionNo: msg.transactionNo }, '실패 처리 + 잔액 복구')
      }

      // KftcReceipt 기록 + TransferInstruction 상태 업데이트
      if (txn.instructionId) {
        const isCompleted = msg.status === 'COMPLETED'
        await prisma.$transaction([
          prisma.kftcReceipt.create({
            data: {
              direction:      'OUTBOUND',
              instructionId:  txn.instructionId,
              rspCode:        isCompleted ? '000' : (msg.failureCode ?? 'ERR'),
              rspMessage:     isCompleted ? '정상' : '실패',
              bankRspCode:    msg.failureCode ?? null,
              bankTranId:     msg.transactionNo,
              receivedAt:     new Date(msg.settledAt),
            },
          }),
          prisma.transferInstruction.update({
            where: { instructionId: txn.instructionId },
            data: {
              instructionStatus:   isCompleted ? 'COMPLETED' : 'FAILED',
              networkResponseCode: isCompleted ? '000' : (msg.failureCode ?? null),
              successCount:        isCompleted ? 1 : 0,
              failedCount:         isCompleted ? 0 : 1,
            },
          }),
        ])
        log.info({ event: 'kftc_receipt_recorded', transactionNo: msg.transactionNo }, 'KftcReceipt + TransferInstruction 기록')
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
      log.info({ event: 'settled_ack_sent', transactionNo: msg.transactionNo }, '정산 수신 ACK 발신')
      }) // end runWithKafkaSpan
    },
  })
}

main().catch((err) => {
  log.fatal({ err }, 'Settlement Consumer 치명적 오류')
  process.exit(1)
})
