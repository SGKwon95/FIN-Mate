import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import AutoTransferForm from "./AutoTransferForm"

export const metadata: Metadata = { title: "자동이체 등록" }

export default async function AutoTransferNewPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const accounts = await prisma.account.findMany({
    where: {
      partyId:       session.user.partyId,
      accountStatus: "ACTIVE",
      isHidden:      false,
      isLocked:      false,
    },
    orderBy: { displayOrder: "asc" },
    select: {
      accountId:      true,
      accountNumber:  true,
      accountPurpose: true,
      balance:        true,
    },
  })

  const bankCodes = await prisma.commonCode.findMany({
    where:   { groupId: "BANK_CODE" },
    orderBy: { sortOrder: "asc" },
    select:  { code: true, codeName: true },
  })

  if (accounts.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-kb-gray text-sm">
        이체 가능한 계좌가 없습니다.
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 lg:pb-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">자동이체 등록</h1>
      <AutoTransferForm
        accounts={accounts.map((a) => ({ ...a, balance: a.balance.toFixed(0) }))}
        banks={bankCodes.map((b) => ({ code: b.code, name: b.codeName }))}
      />
    </div>
  )
}
