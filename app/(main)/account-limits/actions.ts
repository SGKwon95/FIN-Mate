"use server"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"

export type UpdateLimitsResult = { ok: true } | { ok: false; message: string }

export async function updateAccountLimits(input: {
  accountId: string
  transferLimitPerTransaction: number | null
  transferLimitPerDay: number | null
  isLocked: boolean
  accountStatus: string
}): Promise<UpdateLimitsResult> {
  const session = await auth()
  if (!session?.user?.isEmployee) redirect("/dashboard")

  const { accountId, transferLimitPerTransaction, transferLimitPerDay, isLocked, accountStatus } = input

  if (!["ACTIVE", "SUSPENDED"].includes(accountStatus)) {
    return { ok: false, message: "유효하지 않은 계좌 상태입니다." }
  }

  const account = await prisma.account.findUnique({
    where: { accountId },
    select: { accountId: true, accountStatus: true },
  })

  if (!account) return { ok: false, message: "계좌를 찾을 수 없습니다." }
  if (account.accountStatus === "CLOSED") {
    return { ok: false, message: "해지된 계좌는 수정할 수 없습니다." }
  }

  await prisma.account.update({
    where: { accountId },
    data: {
      transferLimitPerTransaction: transferLimitPerTransaction ?? null,
      transferLimitPerDay: transferLimitPerDay ?? null,
      isLocked,
      lockedAt: isLocked ? new Date() : null,
      accountStatus,
      updatedBy: session.user.partyId,
    },
  })

  return { ok: true }
}
