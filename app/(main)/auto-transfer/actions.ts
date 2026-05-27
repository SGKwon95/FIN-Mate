"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { toKSTDateCode } from "@/lib/formatters"
import { verifyAccount } from "@/app/(main)/transfer/actions"

export type RegisterResult =
  | { ok: true;  scheduledTransferId: string }
  | { ok: false; message: string }

export type CancelResult =
  | { ok: true }
  | { ok: false; message: string }

function calcNextExecutionDate(day: number, fromDate: Date): string {
  const kst = new Date(fromDate.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }))
  const year      = kst.getFullYear()
  const month     = kst.getMonth()   // 0-indexed
  const todayDay  = kst.getDate()

  // 이번달 이체일이 아직 안 지났으면 이번달, 지났으면 다음달
  const targetMonth = todayDay <= day ? month : month + 1
  const candidate   = new Date(year, targetMonth, day)
  // 해당 월에 day가 없으면 (예: 31일인데 6월) 말일로 조정
  if (candidate.getMonth() !== (targetMonth % 12)) {
    candidate.setDate(0)
  }
  return toKSTDateCode(candidate)
}

export async function registerScheduledTransfer(input: {
  fromAccountId:  string
  bankCode:       string
  toAccountNumber: string
  toAccountName:  string
  amount:         number
  transferDay:    number
  endDate?:       string   // YYYYMMDD, optional
  memo?:          string
}): Promise<RegisterResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const { fromAccountId, bankCode, toAccountNumber, toAccountName, amount, transferDay, endDate, memo } = input

  if (!Number.isInteger(amount) || amount <= 0)
    return { ok: false, message: "유효하지 않은 금액입니다." }
  if (!Number.isInteger(transferDay) || transferDay < 1 || transferDay > 28)
    return { ok: false, message: "이체일은 1~28 사이여야 합니다." }

  // 출금 계좌 소유권 확인
  const fromAccount = await prisma.account.findUnique({
    where:  { accountId: fromAccountId },
    select: { partyId: true, accountStatus: true, isLocked: true },
  })
  if (!fromAccount || fromAccount.partyId !== session.user.partyId)
    return { ok: false, message: "출금 계좌를 찾을 수 없습니다." }
  if (fromAccount.accountStatus !== "ACTIVE" || fromAccount.isLocked)
    return { ok: false, message: "출금이 불가한 계좌입니다." }

  // 수신 계좌 존재 확인
  const verified = await verifyAccount({ accountNumber: toAccountNumber, bankCode })
  if (!verified.ok) return { ok: false, message: verified.message }

  const now              = new Date()
  const startDate        = toKSTDateCode(now)
  const nextExecutionDate = calcNextExecutionDate(transferDay, now)

  const scheduled = await prisma.scheduledTransfer.create({
    data: {
      partyId:          session.user.partyId,
      fromAccountId,
      toBankCode:       bankCode,
      toAccountNumber:  toAccountNumber.replace(/-/g, ""),
      toAccountName,
      amount,
      memo:             memo ?? null,
      transferDay,
      startDate,
      endDate:          endDate ?? null,
      nextExecutionDate,
    },
  })

  return { ok: true, scheduledTransferId: scheduled.scheduledTransferId }
}

export async function cancelScheduledTransfer(
  scheduledTransferId: string,
): Promise<CancelResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const record = await prisma.scheduledTransfer.findUnique({
    where:  { scheduledTransferId },
    select: { partyId: true, status: true },
  })
  if (!record || record.partyId !== session.user.partyId)
    return { ok: false, message: "자동이체를 찾을 수 없습니다." }
  if (record.status !== "ACTIVE")
    return { ok: false, message: "이미 해지된 자동이체입니다." }

  await prisma.scheduledTransfer.update({
    where: { scheduledTransferId },
    data:  { status: "CANCELLED" },
  })

  return { ok: true }
}
