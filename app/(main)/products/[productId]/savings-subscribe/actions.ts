"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { createNotification } from "@/lib/notifications"
import { toKSTDateCode } from "@/lib/formatters"

export type SavingsSubscribeResult =
  | { ok: true; contractId: string; accountNumber: string }
  | { ok: false; message: string }

export async function subscribeSavings(input: {
  productId: string
  fromAccountId: string
  monthlyAmount: number
  periodMonths: number
  idempotencyKey: string
}): Promise<SavingsSubscribeResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const { productId, fromAccountId, monthlyAmount, periodMonths, idempotencyKey } = input

  if (!Number.isInteger(monthlyAmount) || monthlyAmount <= 0) {
    return { ok: false, message: "유효하지 않은 금액입니다." }
  }

  const product = await prisma.product.findUnique({
    where: { productId },
    select: {
      productId: true,
      productName: true,
      productStatus: true,
      depositDetail: {
        select: { transactionType: true, minAmount: true, maxAmount: true, minPeriodMonths: true, maxPeriodMonths: true },
      },
      productRates: {
        where: { rateType: "BASE" },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { rate: true },
      },
    },
  })

  if (!product || product.productStatus !== "ACTIVE" || product.depositDetail?.transactionType !== "SAVINGS") {
    return { ok: false, message: "가입 불가한 상품입니다." }
  }

  const detail = product.depositDetail!
  if (detail.minAmount && monthlyAmount < Number(detail.minAmount)) {
    return { ok: false, message: `최소 월 납입금액은 ${Number(detail.minAmount).toLocaleString("ko-KR")}원입니다.` }
  }
  if (detail.maxAmount && monthlyAmount > Number(detail.maxAmount)) {
    return { ok: false, message: `최대 월 납입금액은 ${Number(detail.maxAmount).toLocaleString("ko-KR")}원입니다.` }
  }
  if (detail.minPeriodMonths && periodMonths < detail.minPeriodMonths) {
    return { ok: false, message: `최소 가입기간은 ${detail.minPeriodMonths}개월입니다.` }
  }
  if (detail.maxPeriodMonths && periodMonths > detail.maxPeriodMonths) {
    return { ok: false, message: `최대 가입기간은 ${detail.maxPeriodMonths}개월입니다.` }
  }

  const appliedRate = product.productRates[0]?.rate ?? 0

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
  if (Number(fromAccount.balance) < monthlyAmount) {
    return { ok: false, message: "잔액이 부족합니다. (1회차 납입금 기준)" }
  }

  const now = new Date()
  const today = toKSTDateCode(now)
  const maturity = new Date(now)
  maturity.setMonth(maturity.getMonth() + periodMonths)
  const maturityDate = toKSTDateCode(maturity)
  const newAccountNumber = `00941${Date.now().toString().slice(-7)}`

  const result = await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        partyId: session.user!.partyId!,
        productId,
        contractDate: today,
        executionDate: today,
        maturityDate,
        contractPeriodMonths: periodMonths,
        contractAmount: monthlyAmount,
        appliedRate: Number(appliedRate),
        contractStatus: "ACTIVE",
      },
    })

    const newAccount = await tx.account.create({
      data: {
        partyId: session.user!.partyId!,
        contractId: contract.contractId,
        accountNumber: newAccountNumber,
        accountPasswordHash: "$2a$10$placeholder",
        accountType: "DEPOSIT",
        accountStatus: "ACTIVE",
        accountPurpose: "SAVINGS",
        balance: monthlyAmount,
        openedDate: today,
        displayOrder: 10,
      },
    })

    // 출금 계좌 잔액 차감 (1회차)
    const balanceBefore = Number(fromAccount.balance)
    const balanceAfter = balanceBefore - monthlyAmount
    await tx.account.update({
      where: { accountId: fromAccountId },
      data: { balance: balanceAfter, lastTransactionAt: now },
    })

    const txDate = today
    const txNo = `SV${Date.now()}`

    await tx.transaction.create({
      data: {
        accountId: fromAccountId,
        transactionType: "TRANSFER_OUT",
        amount: monthlyAmount,
        balanceBefore,
        balanceAfter,
        transactionStatus: "COMPLETED",
        channel: "APP",
        counterpartAccountNumber: newAccountNumber,
        counterpartName: product.productName,
        transactionNo: txNo,
        transactionKey: idempotencyKey,
        remark: "적금 1회차 납입",
        transactionDate: txDate,
        transactedAt: now,
      },
    })

    await tx.transaction.create({
      data: {
        accountId: newAccount.accountId,
        transactionType: "DEPOSIT",
        amount: monthlyAmount,
        balanceBefore: 0,
        balanceAfter: monthlyAmount,
        transactionStatus: "COMPLETED",
        channel: "APP",
        counterpartAccountNumber: fromAccount.accountNumber,
        counterpartName: session.user!.name ?? "본인",
        transactionNo: `${txNo}-IN`,
        remark: "적금 1회차 납입",
        transactionDate: txDate,
        transactedAt: now,
      },
    })

    // 1회차 납입 기록 (PAID)
    await tx.savingsPayment.create({
      data: {
        accountId: newAccount.accountId,
        installmentNo: 1,
        scheduledDate: now,
        scheduledAmount: monthlyAmount,
        paidDate: today,
        paidAmount: monthlyAmount,
        savingsPaymentStatus: "PAID",
      },
    })

    // 2~N회차 납입 예정 생성 (SCHEDULED)
    for (let i = 2; i <= periodMonths; i++) {
      const scheduled = new Date(now)
      scheduled.setMonth(scheduled.getMonth() + (i - 1))
      await tx.savingsPayment.create({
        data: {
          accountId: newAccount.accountId,
          installmentNo: i,
          scheduledDate: scheduled,
          scheduledAmount: monthlyAmount,
          savingsPaymentStatus: "SCHEDULED",
        },
      })
    }

    return { contractId: contract.contractId, accountNumber: newAccountNumber }
  })

  await createNotification({
    partyId: session.user.partyId,
    type: "TRANSFER_OUT",
    title: "적금 가입 완료",
    body: `${product.productName} 월 ${monthlyAmount.toLocaleString("ko-KR")}원 × ${periodMonths}개월 가입 완료`,
    linkedEntityId: result.contractId,
  })

  return { ok: true, ...result }
}
