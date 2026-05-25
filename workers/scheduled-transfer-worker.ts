/**
 * 자동이체 워커
 * 흐름:
 *   1분마다 nextExecutionDate <= 오늘인 ACTIVE 자동이체를 조회
 *   자행: DB 트랜잭션으로 즉시 처리
 *   타행: Kafka TRANSFER_REQUESTS 토픽 발행
 *   실행 이력(ScheduledTransferExecution) 기록
 *   nextExecutionDate를 다음달로 갱신
 * 실행: npm run worker:scheduled
 */
import { kafka, TOPICS } from '@/lib/kafka'
import { prisma } from '@/lib/prisma'
import { toKSTDateCode } from '@/lib/formatters'

const OWN_BANK_CODE = '004'

const producer = kafka.producer()

function calcNextMonthDate(day: number, baseDate: Date): string {
  const kst   = new Date(baseDate.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }))
  const year  = kst.getFullYear()
  const month = kst.getMonth()  // 0-indexed, already the current month

  // 다음달 같은 날
  const next = new Date(year, month + 1, day)
  // 해당 달에 day가 없으면 말일로 조정
  if (next.getDate() !== day) next.setDate(0)
  return toKSTDateCode(next)
}

async function processSchedules() {
  const now      = new Date()
  const todayStr = toKSTDateCode(now)

  const due = await prisma.scheduledTransfer.findMany({
    where: {
      status:            'ACTIVE',
      nextExecutionDate: { lte: todayStr },
    },
    include: {
      fromAccount: true,
      party:       true,
    },
  })

  if (due.length === 0) return

  console.log(`[자동이체 워커] ${todayStr} — 처리 대상: ${due.length}건`)

  for (const schedule of due) {
    const {
      scheduledTransferId, fromAccountId, toBankCode, toAccountNumber, toAccountName,
      amount, memo, transferDay, endDate, fromAccount, party,
    } = schedule

    const amountNum = Number(amount)
    const txNo      = `AUTO${Date.now()}`
    const txDate    = toKSTDateCode(now)

    let executionStatus = 'SUCCESS'
    let failureReason: string | null = null
    let createdTxId: string | null = null

    try {
      // 계좌 상태 + 잔액 최신 조회
      const acc = await prisma.account.findUnique({
        where:  { accountId: fromAccountId },
        select: { balance: true, accountStatus: true, isLocked: true, accountNumber: true },
      })

      if (!acc || acc.accountStatus !== 'ACTIVE' || acc.isLocked) {
        throw new Error('출금 계좌 이용 불가')
      }
      if (Number(acc.balance) < amountNum) {
        throw new Error('잔액 부족')
      }

      const isExternal = toBankCode !== OWN_BANK_CODE

      if (isExternal) {
        // ── 타행 이체: Kafka 발행 ────────────────────────────
        const txResult = await prisma.$transaction(async (tx) => {
          const balanceBefore = Number(acc.balance)
          const balanceAfter  = balanceBefore - amountNum

          await tx.account.update({
            where: { accountId: fromAccountId },
            data:  { balance: balanceAfter, lastTransactionAt: now },
          })

          const instruction = await tx.transferInstruction.create({
            data: {
              instructionType:   'OUTWARD',
              transferScope:     'INTERBANK',
              clearingNetwork:   'KFTC',
              networkSeqNo:      txNo,
              instructionStatus: 'PENDING',
              totalCount:        1,
              totalAmount:       amountNum,
              submittedBy:       party.partyId,
              scheduledAt:       now,
              executedAt:        now,
            },
          })

          const outTx = await tx.transaction.create({
            data: {
              accountId:                fromAccountId,
              transactionType:          'TRANSFER_OUT',
              amount:                   amountNum,
              balanceBefore,
              balanceAfter,
              transactionStatus:        'PENDING',
              channel:                  'AUTO',
              counterpartAccountNumber: toAccountNumber,
              counterpartBankCode:      toBankCode,
              counterpartName:          toAccountName,
              transactionNo:            txNo,
              instructionId:            instruction.instructionId,
              remark:                   toAccountName,
              memo:                     memo ?? null,
              transactionDate:          txDate,
              transactedAt:             now,
            },
          })

          return { transactionId: outTx.transactionId, instructionId: instruction.instructionId }
        })

        await producer.send({
          topic:    TOPICS.TRANSFER_REQUESTS,
          messages: [{ key: txResult.transactionId, value: JSON.stringify({
            transactionId:     txResult.transactionId,
            instructionId:     txResult.instructionId,
            transactionNo:     txNo,
            fromBankCode:      OWN_BANK_CODE,
            fromAccountNumber: acc.accountNumber,
            fromPartyName:     party.partyName,
            toBankCode,
            toAccountNumber,
            toAccountName,
            amount:            amountNum,
            memo:              memo ?? null,
            requestedAt:       now.toISOString(),
          }) }],
        })

        createdTxId = txResult.transactionId
        console.log(`[자동이체 워커] ✔ 타행 이체 발행: ${scheduledTransferId} → ${txNo}`)
      } else {
        // ── 자행 이체: 동기 처리 ────────────────────────────
        const toAccount = await prisma.account.findUnique({
          where:  { accountNumber: toAccountNumber },
          select: { accountId: true, partyId: true, accountStatus: true, balance: true },
        })

        const txResult = await prisma.$transaction(async (tx) => {
          const balanceBefore = Number(acc.balance)
          const balanceAfter  = balanceBefore - amountNum

          await tx.account.update({
            where: { accountId: fromAccountId },
            data:  { balance: balanceAfter, lastTransactionAt: now },
          })

          const outTx = await tx.transaction.create({
            data: {
              accountId:                fromAccountId,
              transactionType:          'TRANSFER_OUT',
              amount:                   amountNum,
              balanceBefore,
              balanceAfter,
              transactionStatus:        'COMPLETED',
              channel:                  'AUTO',
              counterpartAccountNumber: toAccountNumber,
              counterpartBankCode:      toBankCode,
              counterpartName:          toAccountName,
              counterpartyAccountId:    toAccount?.accountId ?? null,
              transactionNo:            txNo,
              remark:                   toAccountName,
              memo:                     memo ?? null,
              transactionDate:          txDate,
              transactedAt:             now,
            },
          })

          if (toAccount && toAccount.accountStatus === 'ACTIVE') {
            const toBalanceBefore = Number(toAccount.balance)
            const toBalanceAfter  = toBalanceBefore + amountNum
            await tx.account.update({
              where: { accountId: toAccount.accountId },
              data:  { balance: toBalanceAfter, lastTransactionAt: now },
            })
            await tx.transaction.create({
              data: {
                accountId:                toAccount.accountId,
                transactionType:          'TRANSFER_IN',
                amount:                   amountNum,
                balanceBefore:            toBalanceBefore,
                balanceAfter:             toBalanceAfter,
                transactionStatus:        'COMPLETED',
                channel:                  'AUTO',
                counterpartAccountNumber: acc.accountNumber,
                counterpartName:          party.partyName,
                counterpartyAccountId:    fromAccountId,
                transactionNo:            `${txNo}-IN`,
                remark:                   memo ?? party.partyName,
                memo:                     memo ?? null,
                transactionDate:          txDate,
                transactedAt:             now,
              },
            })
          }

          return { transactionId: outTx.transactionId }
        })

        createdTxId = txResult.transactionId
        console.log(`[자동이체 워커] ✔ 자행 이체 완료: ${scheduledTransferId}`)
      }
    } catch (err) {
      executionStatus = 'FAILED'
      failureReason   = err instanceof Error ? err.message : '알 수 없는 오류'
      console.error(`[자동이체 워커] ✗ 실패: ${scheduledTransferId} — ${failureReason}`)
    }

    // 실행 이력 기록 + nextExecutionDate 갱신
    const nextDate   = calcNextMonthDate(transferDay, now)
    const isExpired  = endDate && nextDate > endDate

    await prisma.$transaction([
      prisma.scheduledTransferExecution.create({
        data: {
          scheduledTransferId,
          transactionId:  createdTxId,
          executionDate:  todayStr,
          status:         executionStatus,
          failureReason,
          executedAt:     now,
        },
      }),
      prisma.scheduledTransfer.update({
        where: { scheduledTransferId },
        data: {
          lastExecutedDate:  todayStr,
          nextExecutionDate: isExpired ? null : nextDate,
          status:            isExpired ? 'COMPLETED' : 'ACTIVE',
        },
      }),
    ])
  }
}

async function main() {
  await producer.connect()
  try {
    await processSchedules()
  } finally {
    await producer.disconnect()
  }
}

main().catch((err) => {
  console.error('[자동이체 워커] 오류:', err)
  process.exit(1)
})
