import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import AutoTransferList from "./AutoTransferList"

export const metadata: Metadata = { title: "자동이체 조회" }

export default async function AutoTransferPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const schedules = await prisma.scheduledTransfer.findMany({
    where:   { partyId: session.user.partyId, status: { not: "CANCELLED" } },
    include: {
      fromAccount: { select: { accountNumber: true, accountPurpose: true } },
      executions:  { orderBy: { executedAt: "desc" }, take: 3 },
    },
    orderBy: { createdAt: "desc" },
  })

  const bankCodes = await prisma.commonCode.findMany({
    where: { groupId: "BANK_CODE" },
    select: { code: true, codeName: true },
  })
  const bankMap = Object.fromEntries(bankCodes.map((b) => [b.code, b.codeName]))

  const serialized = schedules.map((s) => ({
    scheduledTransferId: s.scheduledTransferId,
    fromAccountNumber:   s.fromAccount.accountNumber,
    toBankCode:          s.toBankCode,
    toBankName:          bankMap[s.toBankCode] ?? s.toBankCode,
    toAccountNumber:     s.toAccountNumber,
    toAccountName:       s.toAccountName,
    amount:              s.amount.toFixed(0),
    memo:                s.memo,
    transferDay:         s.transferDay,
    nextExecutionDate:   s.nextExecutionDate,
    lastExecutedDate:    s.lastExecutedDate,
    startDate:           s.startDate,
    endDate:             s.endDate,
    status:              s.status,
    executions: s.executions.map((e) => ({
      executionId:   e.executionId,
      executionDate: e.executionDate,
      status:        e.status,
      failureReason: e.failureReason,
    })),
  }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">자동이체</h1>
      <AutoTransferList schedules={serialized} />
    </div>
  )
}
