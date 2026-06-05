import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { getProducer, TOPICS } from "@/lib/kafka"
import { toKSTDateCode } from "@/lib/formatters"
import { injectTraceContext } from "@/lib/kafka-otel"

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
  callerPartyId: string
  callerName: string
}): Promise<TransferResult> {
  const { fromAccountId, toAccountNumber, toName, bankCode, amount, memo, idempotencyKey, callerPartyId, callerName } = input

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
      accountId:      true,
      partyId:        true,
      balance:        true,
      accountStatus:  true,
      isLocked:       true,
      accountNumber:  true,
      accountPurpose: true,
    },
  })

  if (!fromAccount || fromAccount.partyId !== callerPartyId) {
    return { ok: false, message: "출금 계좌를 찾을 수 없습니다." }
  }
  if (fromAccount.accountStatus !== "ACTIVE" || fromAccount.isLocked) {
    return { ok: false, message: "출금이 불가한 계좌입니다." }
  }
  if (["SAVINGS", "TIME_DEPOSIT"].includes(fromAccount.accountPurpose ?? "")) {
    return { ok: false, message: "적금·정기예금 계좌는 출금할 수 없습니다." }
  }
  if (Number(fromAccount.balance) < amount) {
    return { ok: false, message: "잔액이 부족합니다." }
  }

  const isExternal = bankCode !== OWN_BANK_CODE

  const now = new Date()
  const txDate = toKSTDateCode(now)
  const txNo = `TX${Date.now()}`

  // ── 타행 이체 (Kafka 공동망) ────────────────────────────────
  if (isExternal) {
    const { findOtherBankAccount } = await import("@/lib/interbank-db")
    if (!findOtherBankAccount(toAccountNumber))
      return { ok: false, message: "수신 계좌가 존재하지 않습니다." }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.account.updateMany({
        where: { accountId: fromAccountId, balance: { gte: amount } },
        data: { balance: { decrement: amount }, lastTransactionAt: now },
      })
      if (updated.count === 0) return null

      const after = await tx.account.findUnique({
        where: { accountId: fromAccountId },
        select: { balance: true },
      })
      const balanceAfter = Number(after!.balance)
      const balanceBefore = balanceAfter + amount

      const instruction = await tx.transferInstruction.create({
        data: {
          instructionType:   "OUTWARD",
          transferScope:     "INTERBANK",
          clearingNetwork:   "KFTC",
          networkSeqNo:      txNo,
          instructionStatus: "PENDING",
          totalCount:        1,
          totalAmount:       amount,
          submittedBy:       callerPartyId,
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
    }, { timeout: 15000 })

    if (!result) return { ok: false, message: "잔액이 부족합니다." }

    // 공동망으로 이체 요청 발행
    // 브로커 장애·리더 선출 중 producer.send()가 무한 행잉하는 것을 막기 위해 5s 타임아웃.
    // DB 트랜잭션은 이미 완료(PENDING)이므로 타임아웃 시에도 데이터 손실 없음.
    try {
      const producer = await getProducer()
      const sendTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Kafka send timeout (5s)")), 5000)
      )
      await Promise.race([
        producer.send({
          topic: TOPICS.TRANSFER_REQUESTS,
          messages: [{
            key: result.transactionId,
            value: JSON.stringify({
              transactionId:    result.transactionId,
              instructionId:    result.instructionId,
              transactionNo:    txNo,
              fromBankCode:     OWN_BANK_CODE,
              fromAccountNumber: fromAccount.accountNumber,
              fromPartyName:    callerName,
              toBankCode:       bankCode,
              toAccountNumber:  toAccountNumber,
              toAccountName:    toName,
              amount,
              memo:             memo ?? null,
              requestedAt:      now.toISOString(),
            }),
            headers: injectTraceContext(),
          }],
        }),
        sendTimeout,
      ])
    } catch (e) {
      // Kafka 발행 실패(또는 타임아웃) — DB는 PENDING 상태로 남아 추후 재처리 가능
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
    const updated = await tx.account.updateMany({
      where: { accountId: fromAccountId, balance: { gte: amount } },
      data: { balance: { decrement: amount }, lastTransactionAt: now },
    })
    if (updated.count === 0) return null

    const after = await tx.account.findUnique({
      where: { accountId: fromAccountId },
      select: { balance: true },
    })
    const balanceAfter = Number(after!.balance)
    const balanceBefore = balanceAfter + amount

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
      await tx.account.update({
        where: { accountId: toAccount.accountId },
        data: { balance: { increment: amount }, lastTransactionAt: now },
      })

      const toAfter = await tx.account.findUnique({
        where: { accountId: toAccount.accountId },
        select: { balance: true },
      })
      const toBalanceAfter = Number(toAfter!.balance)
      const toBalanceBefore = toBalanceAfter - amount

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
          counterpartName:          callerName || "이체",
          counterpartyAccountId:    fromAccountId,
          transactionNo:            `${txNo}-IN`,
          remark:                   memo ?? (callerName || "이체"),
          memo:                     memo ?? null,
          transactionDate:          txDate,
          transactedAt:             now,
        },
      })
    }

    return { transactionId: outTx.transactionId, balanceAfter }
  }, { timeout: 15000 })

  if (!result) return { ok: false, message: "잔액이 부족합니다." }

  const amountStr = amount.toLocaleString("ko-KR")

  await createNotification({
    partyId: callerPartyId,
    type: "TRANSFER_OUT",
    title: "이체 완료",
    body: `${toName}님께 ${amountStr}원을 이체했습니다.`,
    linkedEntityId: result.transactionId,
  })

  if (result.balanceAfter < 100_000) {
    await createNotification({
      partyId: callerPartyId,
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
        body: `${callerName || "상대방"}님으로부터 ${amountStr}원이 입금되었습니다.`,
        linkedEntityId: result.transactionId,
      })
    }
  }

  return { ok: true, transactionId: result.transactionId, status: "COMPLETED" }
}
