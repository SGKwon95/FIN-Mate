/**
 * BOK-Wire 게이트웨이 워커 (한은금융망 — 10억 초과 타행이체)
 *
 * 전자금융공동망(KFTC) 9-step 흐름과 달리 RTGS(실시간 건별 즉시결제) 방식으로
 * ACK 왕복 없이 단 2-step으로 처리한다.
 *
 * Step 1  FIN-Mate  → [BOK_WIRE_REQUESTS]  → 이 워커
 * Step 2  이 워커   → [BOK_WIRE_RESULTS]   → settlement-consumer (기록용)
 *
 * 이 워커에서 DB 직접 정산까지 수행 (RTGS 특성: 중간 정산 대기 없음)
 *
 * 실행: npx tsx workers/bok-wire-gateway.ts
 */
import './otel-init'
import { kafka, TOPICS } from '@/lib/kafka'
import { prisma } from '@/lib/prisma'
import { createWorkerLogger } from '@/lib/logger'
import { runWithKafkaSpan } from '@/lib/kafka-otel'
import { findOtherBankAccount } from '@/lib/interbank-db'

const log = createWorkerLogger('bok-wire-gateway')

const consumer = kafka.consumer({
  groupId:           'fin-mate-bokwire-group',
  heartbeatInterval: 3000,
  sessionTimeout:    10000,
})
const producer = kafka.producer()

async function settle(msg: {
  transactionId:     string
  instructionId:     string
  transactionNo:     string
  toBankCode:        string
  toAccountNumber:   string
  toAccountName:     string
  amount:            number
  memo:              string | null
}, isCompleted: boolean, failureCode?: string) {
  const txn = await prisma.transaction.findUnique({
    where:  { transactionId: msg.transactionId },
    select: {
      accountId:     true,
      amount:        true,
      instructionId: true,
      account:       { select: { partyId: true, balance: true } },
    },
  })
  if (!txn) return

  const amountNum = Number(txn.amount)
  const partyId   = txn.account.partyId
  const now       = new Date()

  if (isCompleted) {
    await prisma.transaction.update({
      where: { transactionId: msg.transactionId },
      data:  { transactionStatus: 'COMPLETED' },
    })
    await prisma.notification.create({
      data: {
        partyId,
        notificationType:  'TRANSFER_OUT',
        notificationTitle: '한은금융망 이체 완료',
        notificationBody:  `${msg.toAccountName}님께 ${amountNum.toLocaleString('ko-KR')}원 이체가 즉시 완료되었습니다.`,
        linkedEntityId:    msg.transactionId,
      },
    })
  } else {
    const restoredBalance = Number(txn.account.balance) + amountNum
    await prisma.$transaction([
      prisma.transaction.update({
        where: { transactionId: msg.transactionId },
        data:  { transactionStatus: 'FAILED', rejectedReason: failureCode ?? 'SYSTEM_ERROR' },
      }),
      prisma.account.update({
        where: { accountId: txn.accountId },
        data:  { balance: restoredBalance },
      }),
      prisma.notification.create({
        data: {
          partyId,
          notificationType:  'RISK_ALERT',
          notificationTitle: '한은금융망 이체 실패',
          notificationBody:  `${amountNum.toLocaleString('ko-KR')}원 이체가 실패하여 잔액이 복구되었습니다. (${failureCode ?? 'SYSTEM_ERROR'})`,
          linkedEntityId:    msg.transactionId,
        },
      }),
    ])
  }

  if (txn.instructionId) {
    await prisma.$transaction([
      prisma.kftcReceipt.create({
        data: {
          direction:     'OUTBOUND',
          instructionId: txn.instructionId,
          rspCode:       isCompleted ? '000' : (failureCode ?? 'ERR'),
          rspMessage:    isCompleted ? '정상' : '실패',
          bankTranId:    msg.transactionNo,
          receivedAt:    now,
        },
      }),
      prisma.transferInstruction.update({
        where: { instructionId: txn.instructionId },
        data: {
          instructionStatus:   isCompleted ? 'COMPLETED' : 'FAILED',
          networkResponseCode: isCompleted ? '000' : (failureCode ?? null),
          successCount:        isCompleted ? 1 : 0,
          failedCount:         isCompleted ? 0 : 1,
        },
      }),
    ])
  }
}

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: [TOPICS.BOK_WIRE_REQUESTS, TOPICS.BOK_WIRE_RESULTS].map((topic) => ({
      topic,
      numPartitions:     3,
      replicationFactor: 3,
    })),
  })
  await admin.disconnect()

  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topics: [TOPICS.BOK_WIRE_REQUESTS], fromBeginning: false })

  log.info({ event: 'worker_started', topic: TOPICS.BOK_WIRE_REQUESTS }, '한은금융망 게이트웨이 대기 중')

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return
      return runWithKafkaSpan(TOPICS.BOK_WIRE_REQUESTS, message.headers, async () => {
        const msg = JSON.parse(message.value!.toString()) as {
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

        log.info({
          event:          'bokwire_request_received',
          transactionNo:  msg.transactionNo,
          amount:         msg.amount,
          toBankCode:     msg.toBankCode,
        }, '한은금융망 이체 요청 수신')

        // 수취 계좌 존재 확인 (B은행 시뮬레이터 SQLite)
        const toAccount = findOtherBankAccount(msg.toAccountNumber)
        const isCompleted = !!toAccount
        const failureCode = isCompleted ? undefined : 'NO_ACCOUNT'

        // RTGS: 즉시 DB 정산 (ACK 왕복 없음)
        await settle(msg, isCompleted, failureCode)

        const resultStatus = isCompleted ? 'COMPLETED' : 'FAILED'
        log.info({
          event:         'bokwire_settled',
          transactionNo: msg.transactionNo,
          status:        resultStatus,
        }, `한은금융망 즉시 정산 ${resultStatus}`)

        // BOK_WIRE_RESULTS 발행 (감사 추적용)
        await producer.send({
          topic:    TOPICS.BOK_WIRE_RESULTS,
          messages: [{
            key:   msg.transactionId,
            value: JSON.stringify({
              transactionId: msg.transactionId,
              transactionNo: msg.transactionNo,
              status:        resultStatus,
              failureCode:   failureCode ?? null,
              settledAt:     new Date().toISOString(),
              clearingNetwork: 'BOK_WIRE',
            }),
          }],
        })
      })
    },
  })
}

main().catch((err) => {
  log.error({ event: 'worker_fatal', err: String(err) }, '워커 비정상 종료')
  process.exit(1)
})
