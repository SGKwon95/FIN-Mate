"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { createNotification } from "@/lib/notifications"

export type TransferResult =
  | { ok: true; transactionId: string }
  | { ok: false; message: string }

export async function executeTransfer(input: {
  fromAccountId: string
  toAccountNumber: string
  toName: string
  bankCode?: string
  amount: number
  memo?: string
  idempotencyKey: string
}): Promise<TransferResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const { fromAccountId, toAccountNumber, toName, bankCode, amount, memo, idempotencyKey } = input

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "유효하지 않은 금액입니다." }
  }

  // 멱등성 체크 — 동일 키로 이미 처리된 거래는 기존 결과 반환
  const existing = await prisma.transaction.findUnique({
    where: { transactionKey: idempotencyKey },
    select: { transactionId: true },
  })
  if (existing) {
    return { ok: true, transactionId: existing.transactionId }
  }

  // 출금 계좌 확인 (본인 소유 + 활성 상태)
  const fromAccount = await prisma.account.findUnique({
    where: { accountId: fromAccountId },
    select: { accountId: true, partyId: true, balance: true, accountStatus: true, isLocked: true, accountNumber: true },
  })

  if (!fromAccount || fromAccount.partyId !== session.user.partyId) {
    return { ok: false, message: "출금 계좌를 찾을 수 없습니다." }
  }
  if (fromAccount.accountStatus !== "ACTIVE" || fromAccount.isLocked) {
    return { ok: false, message: "출금이 불가한 계좌입니다." }
  }
  if (Number(fromAccount.balance) < amount) {
    return { ok: false, message: "잔액이 부족합니다." }
  }

  // 받는 계좌가 내부 계좌인지 확인
  const toAccount = await prisma.account.findUnique({
    where: { accountNumber: toAccountNumber },
    select: { accountId: true, partyId: true, accountStatus: true, balance: true },
  })

  const now = new Date()
  const txDate = now.toISOString().slice(0, 10).replace(/-/g, "")
  const txNo = `TX${Date.now()}`
  const txKey = idempotencyKey

  // DB 트랜잭션으로 원자적 처리
  const result = await prisma.$transaction(async (tx) => {
    const balanceBefore = Number(fromAccount.balance)
    const balanceAfter = balanceBefore - amount

    // 출금 계좌 잔액 차감
    await tx.account.update({
      where: { accountId: fromAccountId },
      data: { balance: balanceAfter, lastTransactionAt: now },
    })

    // 출금 트랜잭션 기록
    const outTx = await tx.transaction.create({
      data: {
        accountId:              fromAccountId,
        transactionType:        "TRANSFER_OUT",
        amount:                 amount,
        balanceBefore:          balanceBefore,
        balanceAfter:           balanceAfter,
        transactionStatus:      "COMPLETED",
        channel:                "MOBILE",
        counterpartAccountNumber: toAccountNumber,
        counterpartBankCode:    bankCode ?? null,
        counterpartName:        toName,
        counterpartyAccountId:  toAccount?.accountId ?? null,
        transactionNo:          txNo,
        transactionKey:         txKey,
        remark:                 toName,
        memo:                   memo ?? null,
        transactionDate:        txDate,
        transactedAt:           now,
      },
    })

    // 내부 계좌인 경우 입금 처리
    if (toAccount && toAccount.accountStatus === "ACTIVE") {
      const toBalanceBefore = Number(toAccount.balance)
      const toBalanceAfter = toBalanceBefore + amount

      await tx.account.update({
        where: { accountId: toAccount.accountId },
        data: { balance: toBalanceAfter, lastTransactionAt: now },
      })

      await tx.transaction.create({
        data: {
          accountId:              toAccount.accountId,
          transactionType:        "TRANSFER_IN",
          amount:                 amount,
          balanceBefore:          toBalanceBefore,
          balanceAfter:           toBalanceAfter,
          transactionStatus:      "COMPLETED",
          channel:                "MOBILE",
          counterpartAccountNumber: fromAccount.accountNumber,
          counterpartName:        session.user.name ?? "이체",
          counterpartyAccountId:  fromAccountId,
          transactionNo:          `${txNo}-IN`,
          remark:                 memo ?? session.user.name ?? "이체",
          memo:                   memo ?? null,
          transactionDate:        txDate,
          transactedAt:           now,
        },
      })
    }

    return { transactionId: outTx.transactionId, balanceAfter }
  })

  const amountStr = amount.toLocaleString("ko-KR")

  // 출금 알림 (송신자)
  await createNotification({
    partyId: session.user.partyId,
    type: "TRANSFER_OUT",
    title: "이체 완료",
    body: `${toName}님께 ${amountStr}원을 이체했습니다.`,
    linkedEntityId: result.transactionId,
  })

  // 잔액 부족 알림 (이체 후 잔액 < 100,000원)
  if (result.balanceAfter < 100_000) {
    await createNotification({
      partyId: session.user.partyId,
      type: "LOW_BALANCE",
      title: "잔액 부족 안내",
      body: `이체 후 잔액이 ${result.balanceAfter.toLocaleString("ko-KR")}원입니다.`,
    })
  }

  // 입금 알림 (수신자 — 내부 계좌인 경우)
  if (toAccount?.accountStatus === "ACTIVE") {
    const toParty = await prisma.account.findUnique({
      where: { accountId: toAccount.accountId },
      select: { partyId: true },
    })
    if (toParty) {
      await createNotification({
        partyId: toParty.partyId,
        type: "TRANSFER_IN",
        title: "입금 완료",
        body: `${session.user.name ?? "상대방"}님으로부터 ${amountStr}원이 입금되었습니다.`,
        linkedEntityId: result.transactionId,
      })
    }
  }

  return { ok: true, transactionId: result.transactionId }
}
