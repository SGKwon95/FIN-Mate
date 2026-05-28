"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { createNotification } from "@/lib/notifications"
import { toKSTDateCode } from "@/lib/formatters"

export type CancelSavingsResult =
  | { ok: true }
  | { ok: false; message: string }

export async function cancelSavings(input: {
  accountId: string
  toAccountId: string
  idempotencyKey: string
}): Promise<CancelSavingsResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const { accountId, toAccountId, idempotencyKey } = input

  // 멱등성 체크
  const existing = await prisma.transaction.findFirst({
    where: { transactionKey: `cancel-${idempotencyKey}` },
    select: { transactionId: true },
  })
  if (existing) return { ok: true }

  // 해약 계좌 검증
  const savingsAccount = await prisma.account.findUnique({
    where: { accountId },
    select: {
      accountId:      true,
      partyId:        true,
      accountStatus:  true,
      accountPurpose: true,
      accountNumber:  true,
      balance:        true,
      contractId:     true,
    },
  })

  if (!savingsAccount || savingsAccount.partyId !== session.user.partyId) {
    return { ok: false, message: "계좌를 찾을 수 없습니다." }
  }
  if (savingsAccount.accountStatus !== "ACTIVE") {
    return { ok: false, message: "이미 해약된 계좌입니다." }
  }
  if (!["SAVINGS", "TIME_DEPOSIT"].includes(savingsAccount.accountPurpose ?? "")) {
    return { ok: false, message: "해약 가능한 계좌가 아닙니다." }
  }

  // 환급 계좌 검증
  const toAccount = await prisma.account.findUnique({
    where: { accountId: toAccountId },
    select: {
      accountId:      true,
      partyId:        true,
      accountStatus:  true,
      accountPurpose: true,
      accountNumber:  true,
      balance:        true,
    },
  })

  if (!toAccount || toAccount.partyId !== session.user.partyId) {
    return { ok: false, message: "환급 계좌를 찾을 수 없습니다." }
  }
  if (toAccount.accountStatus !== "ACTIVE") {
    return { ok: false, message: "환급 계좌가 비활성 상태입니다." }
  }
  if (["SAVINGS", "TIME_DEPOSIT"].includes(toAccount.accountPurpose ?? "")) {
    return { ok: false, message: "환급 계좌로 적금·정기예금 계좌는 사용할 수 없습니다." }
  }

  const now = new Date()
  const today = toKSTDateCode(now)
  const amount = Number(savingsAccount.balance)
  const txNo = `CANCEL${Date.now()}`

  await prisma.$transaction(async (tx) => {
    // 적금 계좌 해지
    await tx.account.update({
      where: { accountId },
      data: {
        accountStatus:     "CLOSED",
        balance:           0,
        closedDate:        today,
        lastTransactionAt: now,
      },
    })

    // 계약 종료
    if (savingsAccount.contractId) {
      await tx.contract.update({
        where: { contractId: savingsAccount.contractId },
        data: { contractStatus: "TERMINATED", endDate: today },
      })
    }

    // 잔액이 있을 때만 거래 기록 생성
    if (amount > 0) {
      await tx.transaction.create({
        data: {
          accountId,
          transactionType:          "WITHDRAWAL",
          amount,
          balanceBefore:            amount,
          balanceAfter:             0,
          transactionStatus:        "COMPLETED",
          channel:                  "APP",
          counterpartAccountNumber: toAccount.accountNumber,
          counterpartName:          "해약 환급",
          transactionNo:            txNo,
          transactionKey:           `cancel-${idempotencyKey}`,
          remark:                   "적금 해약 환급",
          transactionDate:          today,
          transactedAt:             now,
        },
      })

      const toBalanceBefore = Number(toAccount.balance)
      const toBalanceAfter  = toBalanceBefore + amount

      await tx.account.update({
        where: { accountId: toAccountId },
        data: { balance: toBalanceAfter, lastTransactionAt: now },
      })

      await tx.transaction.create({
        data: {
          accountId:                toAccountId,
          transactionType:          "DEPOSIT",
          amount,
          balanceBefore:            toBalanceBefore,
          balanceAfter:             toBalanceAfter,
          transactionStatus:        "COMPLETED",
          channel:                  "APP",
          counterpartAccountNumber: savingsAccount.accountNumber,
          counterpartName:          "적금 해약 환급",
          transactionNo:            `${txNo}-IN`,
          remark:                   "적금 해약 환급",
          transactionDate:          today,
          transactedAt:             now,
        },
      })
    }
  })

  await createNotification({
    partyId: session.user.partyId,
    type:    "TRANSFER_IN",
    title:   "적금 해약 완료",
    body:    `해약 환급금 ${amount.toLocaleString("ko-KR")}원이 입금되었습니다.`,
    linkedEntityId: accountId,
  })

  return { ok: true }
}
