"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { createNotification } from "@/lib/notifications"
import { toKSTDateCode } from "@/lib/formatters"

export type SubscribeResult =
  | { ok: true; contractId: string; accountNumber: string }
  | { ok: false; message: string }

export async function subscribeTimeDeposit(input: {
  productId: string
  fromAccountId: string
  amount: number
  periodMonths: number
  idempotencyKey: string
}): Promise<SubscribeResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const { productId, fromAccountId, amount, periodMonths, idempotencyKey } = input

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "유효하지 않은 금액입니다." }
  }

  // 상품 및 상세 조회
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

  if (!product || product.productStatus !== "ACTIVE" || product.depositDetail?.transactionType !== "TIME_DEPOSIT") {
    return { ok: false, message: "가입 불가한 상품입니다." }
  }

  const detail = product.depositDetail!
  if (detail.minAmount && amount < Number(detail.minAmount)) {
    return { ok: false, message: `최소 가입금액은 ${Number(detail.minAmount).toLocaleString("ko-KR")}원입니다.` }
  }
  if (detail.maxAmount && amount > Number(detail.maxAmount)) {
    return { ok: false, message: `최대 가입금액은 ${Number(detail.maxAmount).toLocaleString("ko-KR")}원입니다.` }
  }
  if (detail.minPeriodMonths && periodMonths < detail.minPeriodMonths) {
    return { ok: false, message: `최소 가입기간은 ${detail.minPeriodMonths}개월입니다.` }
  }
  if (detail.maxPeriodMonths && periodMonths > detail.maxPeriodMonths) {
    return { ok: false, message: `최대 가입기간은 ${detail.maxPeriodMonths}개월입니다.` }
  }

  const appliedRate = product.productRates[0]?.rate ?? 0

  // 출금 계좌 확인
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

  const now = new Date()
  const today = toKSTDateCode(now)

  // 만기일 계산
  const maturity = new Date(now)
  maturity.setMonth(maturity.getMonth() + periodMonths)
  const maturityDate = toKSTDateCode(maturity)

  // 신규 계좌번호 생성
  const newAccountNumber = `00931${Date.now().toString().slice(-7)}`

  const result = await prisma.$transaction(async (tx) => {
    // 계약 생성
    const contract = await tx.contract.create({
      data: {
        partyId: session.user!.partyId!,
        productId,
        contractDate: today,
        executionDate: today,
        maturityDate,
        contractPeriodMonths: periodMonths,
        contractAmount: amount,
        appliedRate: Number(appliedRate),
        contractStatus: "ACTIVE",
      },
    })

    // 정기예금 계좌 생성
    const accountPwHash = fromAccount.accountNumber // 실제론 별도 입력받아야 하지만 임시로 출금계좌번호 사용
    const newAccount = await tx.account.create({
      data: {
        partyId: session.user!.partyId!,
        contractId: contract.contractId,
        accountNumber: newAccountNumber,
        accountPasswordHash: "$2a$10$placeholder",
        accountType: "DEPOSIT",
        accountStatus: "ACTIVE",
        accountPurpose: "TIME_DEPOSIT",
        balance: amount,
        openedDate: today,
        displayOrder: 10,
      },
    })

    // 출금 계좌 잔액 차감
    const balanceBefore = Number(fromAccount.balance)
    const balanceAfter = balanceBefore - amount
    await tx.account.update({
      where: { accountId: fromAccountId },
      data: { balance: balanceAfter, lastTransactionAt: now },
    })

    const txDate = today
    const txNo = `TD${Date.now()}`

    // 출금 트랜잭션
    await tx.transaction.create({
      data: {
        accountId: fromAccountId,
        transactionType: "TRANSFER_OUT",
        amount,
        balanceBefore,
        balanceAfter,
        transactionStatus: "COMPLETED",
        channel: "APP",
        counterpartAccountNumber: newAccountNumber,
        counterpartName: product.productName,
        transactionNo: txNo,
        transactionKey: idempotencyKey,
        remark: "정기예금 가입",
        transactionDate: txDate,
        transactedAt: now,
      },
    })

    // 정기예금 입금 트랜잭션
    await tx.transaction.create({
      data: {
        accountId: newAccount.accountId,
        transactionType: "DEPOSIT",
        amount,
        balanceBefore: 0,
        balanceAfter: amount,
        transactionStatus: "COMPLETED",
        channel: "APP",
        counterpartAccountNumber: fromAccount.accountNumber,
        counterpartName: session.user!.name ?? "본인",
        transactionNo: `${txNo}-IN`,
        remark: "정기예금 가입",
        transactionDate: txDate,
        transactedAt: now,
      },
    })

    return { contractId: contract.contractId, accountNumber: newAccountNumber }
  })

  await createNotification({
    partyId: session.user.partyId,
    type: "TRANSFER_OUT",
    title: "정기예금 가입 완료",
    body: `${product.productName} ${amount.toLocaleString("ko-KR")}원 가입 완료 (만기: ${maturityDate})`,
    linkedEntityId: result.contractId,
  })

  return { ok: true, ...result }
}
