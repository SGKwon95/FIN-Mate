"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { createNotification } from "@/lib/notifications"
import { getProducer, TOPICS } from "@/lib/kafka"

const OWN_BANK_CODE = "004"

export type TransferResult =
  | { ok: true; transactionId: string; status: "COMPLETED" | "PENDING" }
  | { ok: false; message: string }

export type VerifyAccountResult =
  | { ok: true;  holderName: string }
  | { ok: false; message: string }

export async function verifyAccount(input: {
  accountNumber: string
  bankCode: string
}): Promise<VerifyAccountResult> {
  const normalized = input.accountNumber.replace(/-/g, "")
  if (!/^\d{10,16}$/.test(normalized))
    return { ok: false, message: "계좌번호 형식이 올바르지 않습니다." }

  if (input.bankCode === OWN_BANK_CODE) {
    const account = await prisma.account.findUnique({
      where:  { accountNumber: normalized },
      select: { accountStatus: true, party: { select: { partyName: true } } },
    })
    if (!account || account.accountStatus !== "ACTIVE")
      return { ok: false, message: "존재하지 않는 계좌입니다." }
    return { ok: true, holderName: account.party.partyName }
  }

  const { findOtherBankAccount } = await import("@/lib/interbank-db")
  const acc = findOtherBankAccount(normalized)
  if (!acc) return { ok: false, message: "존재하지 않는 계좌입니다." }
  return { ok: true, holderName: acc.account_holder }
}

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

  // 멱등성 체크
  const existing = await prisma.transaction.findUnique({
    where: { transactionKey: idempotencyKey },
    select: { transactionId: true, transactionStatus: true },
  })
  if (existing) {
    const status = existing.transactionStatus === "PENDING" ? "PENDING" : "COMPLETED"
    return { ok: true, transactionId: existing.transactionId, status }
  }

  // 출금 계좌 확인 (본인 소유 + 활성 상태)
  const fromAccount = await prisma.account.findUnique({
    where: { accountId: fromAccountId },
    select: {
      accountId: true,
      partyId: true,
      balance: true,
      accountStatus: true,
      isLocked: true,
      accountNumber: true,
    },
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

  const isExternal = bankCode !== OWN_BANK_CODE

  const now = new Date()
  const txDate = now.toISOString().slice(0, 10).replace(/-/g, "")
  const txNo = `TX${Date.now()}`

  // ── 타행 이체 (Kafka 공동망) ────────────────────────────────
  if (isExternal) {
    const { findOtherBankAccount } = await import("@/lib/interbank-db")
    if (!findOtherBankAccount(toAccountNumber))
      return { ok: false, message: "수신 계좌가 존재하지 않습니다." }

    const result = await prisma.$transaction(async (tx) => {
      const balanceBefore = Number(fromAccount.balance)
      const balanceAfter = balanceBefore - amount

      await tx.account.update({
        where: { accountId: fromAccountId },
        data: { balance: balanceAfter, lastTransactionAt: now },
      })

      const instruction = await tx.transferInstruction.create({
        data: {
          instructionType:   "OUTWARD",
          transferScope:     "INTERBANK",
          clearingNetwork:   "KFTC",
          networkSeqNo:      txNo,
          instructionStatus: "PENDING",
          totalCount:        1,
          totalAmount:       amount,
          submittedBy:       session.user.partyId,
          executedAt:        now,
        },
      })

      const outTx = await tx.transaction.create({
        data: {
          accountId:                fromAccountId,
          transactionType:          "TRANSFER_OUT",
          amount:                   amount,
          balanceBefore:            balanceBefore,
          balanceAfter:             balanceAfter,
          transactionStatus:        "PENDING",
          channel:                  "MOBILE",
          counterpartAccountNumber: toAccountNumber,
          counterpartBankCode:      bankCode ?? null,
          counterpartName:          toName,
          transactionNo:            txNo,
          transactionKey:           idempotencyKey,
          instructionId:            instruction.instructionId,
          remark:                   toName,
          memo:                     memo ?? null,
          transactionDate:          txDate,
          transactedAt:             now,
        },
      })

      return { transactionId: outTx.transactionId, instructionId: instruction.instructionId, balanceAfter }
    })

    // 공동망으로 이체 요청 발행
    try {
      const producer = await getProducer()
      await producer.send({
        topic: TOPICS.TRANSFER_REQUESTS,
        messages: [{
          key: result.transactionId,
          value: JSON.stringify({
            transactionId:    result.transactionId,
            instructionId:    result.instructionId,
            transactionNo:    txNo,
            fromBankCode:     OWN_BANK_CODE,
            fromAccountNumber: fromAccount.accountNumber,
            fromPartyName:    session.user.name ?? "",
            toBankCode:       bankCode,
            toAccountNumber:  toAccountNumber,
            toAccountName:    toName,
            amount,
            memo:             memo ?? null,
            requestedAt:      now.toISOString(),
          }),
        }],
      })
    } catch (e) {
      // Kafka 발행 실패 — DB 트랜잭션은 이미 완료되어 PENDING 상태로 남음
      console.error("[Kafka] 이체 요청 발행 실패 (transactionId=%s):", result.transactionId, e)
    }

    return { ok: true, transactionId: result.transactionId, status: "PENDING" }
  }

  // ── 자행 이체 (동기 처리) ────────────────────────────────────
  const toAccount = await prisma.account.findUnique({
    where: { accountNumber: toAccountNumber },
    select: { accountId: true, partyId: true, accountStatus: true, balance: true },
  })

  const result = await prisma.$transaction(async (tx) => {
    const balanceBefore = Number(fromAccount.balance)
    const balanceAfter = balanceBefore - amount

    await tx.account.update({
      where: { accountId: fromAccountId },
      data: { balance: balanceAfter, lastTransactionAt: now },
    })

    const outTx = await tx.transaction.create({
      data: {
        accountId:                fromAccountId,
        transactionType:          "TRANSFER_OUT",
        amount:                   amount,
        balanceBefore:            balanceBefore,
        balanceAfter:             balanceAfter,
        transactionStatus:        "COMPLETED",
        channel:                  "MOBILE",
        counterpartAccountNumber: toAccountNumber,
        counterpartBankCode:      bankCode ?? null,
        counterpartName:          toName,
        counterpartyAccountId:    toAccount?.accountId ?? null,
        transactionNo:            txNo,
        transactionKey:           idempotencyKey,
        remark:                   toName,
        memo:                     memo ?? null,
        transactionDate:          txDate,
        transactedAt:             now,
      },
    })

    if (toAccount && toAccount.accountStatus === "ACTIVE") {
      const toBalanceBefore = Number(toAccount.balance)
      const toBalanceAfter = toBalanceBefore + amount

      await tx.account.update({
        where: { accountId: toAccount.accountId },
        data: { balance: toBalanceAfter, lastTransactionAt: now },
      })

      await tx.transaction.create({
        data: {
          accountId:                toAccount.accountId,
          transactionType:          "TRANSFER_IN",
          amount:                   amount,
          balanceBefore:            toBalanceBefore,
          balanceAfter:             toBalanceAfter,
          transactionStatus:        "COMPLETED",
          channel:                  "MOBILE",
          counterpartAccountNumber: fromAccount.accountNumber,
          counterpartName:          session.user.name ?? "이체",
          counterpartyAccountId:    fromAccountId,
          transactionNo:            `${txNo}-IN`,
          remark:                   memo ?? session.user.name ?? "이체",
          memo:                     memo ?? null,
          transactionDate:          txDate,
          transactedAt:             now,
        },
      })
    }

    return { transactionId: outTx.transactionId, balanceAfter }
  })

  const amountStr = amount.toLocaleString("ko-KR")

  await createNotification({
    partyId: session.user.partyId,
    type: "TRANSFER_OUT",
    title: "이체 완료",
    body: `${toName}님께 ${amountStr}원을 이체했습니다.`,
    linkedEntityId: result.transactionId,
  })

  if (result.balanceAfter < 100_000) {
    await createNotification({
      partyId: session.user.partyId,
      type: "LOW_BALANCE",
      title: "잔액 부족 안내",
      body: `이체 후 잔액이 ${result.balanceAfter.toLocaleString("ko-KR")}원입니다.`,
    })
  }

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

  return { ok: true, transactionId: result.transactionId, status: "COMPLETED" }
}
