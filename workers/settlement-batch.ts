/**
 * 배치 정산 워커 — 하루 1회 실행 후 종료
 * SETTLEMENT_PENDING 상태 타행 이체 건을 일괄 확정(COMPLETED/FAILED)한다.
 * 실행: npm run worker:settlement-batch
 */
import './otel-init'
import { prisma } from '@/lib/prisma'
import { createWorkerLogger } from '@/lib/logger'

const log = createWorkerLogger('settlement-batch')

async function main() {
  log.info({ event: 'batch_start' }, '배치 정산 시작')

  const pending = await prisma.transaction.findMany({
    where: { transactionStatus: 'SETTLEMENT_PENDING' },
    select: {
      transactionId: true,
      accountId:     true,
      amount:        true,
      transactionNo: true,
      instructionId: true,
      account: { select: { partyId: true, balance: true } },
    },
  })

  log.info({ event: 'pending_found', count: pending.length }, `정산 대기 ${pending.length}건`)

  let completed = 0
  let failed    = 0

  for (const txn of pending) {
    const receipt = txn.instructionId
      ? await prisma.kftcReceipt.findFirst({
          where:   { instructionId: txn.instructionId, direction: 'OUTBOUND' },
          orderBy: { receivedAt: 'desc' },
        })
      : null

    const isCompleted = receipt?.rspCode === '000'
    const amountNum   = Number(txn.amount)
    const partyId     = txn.account.partyId

    if (isCompleted) {
      await prisma.$transaction([
        prisma.transaction.update({
          where: { transactionId: txn.transactionId },
          data:  { transactionStatus: 'COMPLETED' },
        }),
        prisma.notification.create({
          data: {
            partyId,
            notificationType:  'TRANSFER_OUT',
            notificationTitle: '이체 완료',
            notificationBody:  `타행 이체 ${amountNum.toLocaleString('ko-KR')}원이 완료되었습니다.`,
            linkedEntityId:    txn.transactionId,
          },
        }),
      ])

      if (txn.instructionId) {
        await prisma.transferInstruction.update({
          where: { instructionId: txn.instructionId },
          data:  { instructionStatus: 'COMPLETED', networkResponseCode: '000', successCount: 1, failedCount: 0 },
        })
      }

      completed++
      log.info({ event: 'settled_completed', transactionNo: txn.transactionNo }, '완료 처리')
    } else {
      const failureCode     = receipt?.bankRspCode ?? 'SYSTEM_ERROR'
      const restoredBalance = Number(txn.account.balance) + amountNum

      await prisma.$transaction([
        prisma.transaction.update({
          where: { transactionId: txn.transactionId },
          data:  { transactionStatus: 'FAILED', rejectedReason: failureCode },
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
            notificationBody:  `타행 이체 ${amountNum.toLocaleString('ko-KR')}원이 실패하여 잔액이 복구되었습니다. (${failureCode})`,
            linkedEntityId:    txn.transactionId,
          },
        }),
      ])

      if (txn.instructionId) {
        await prisma.transferInstruction.update({
          where: { instructionId: txn.instructionId },
          data:  {
            instructionStatus:   'FAILED',
            networkResponseCode: failureCode,
            successCount: 0,
            failedCount:  1,
          },
        })
      }

      failed++
      log.info({ event: 'settled_failed', transactionNo: txn.transactionNo, failureCode }, '실패 처리 + 잔액 복구')
    }
  }

  log.info({ event: 'batch_complete', completed, failed, total: pending.length }, '배치 정산 완료')
}

main()
  .catch((err) => { log.fatal({ err }, '배치 정산 오류'); process.exit(1) })
  .finally(() => prisma.$disconnect())
