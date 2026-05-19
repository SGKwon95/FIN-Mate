import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import TransferWizard from "./TransferWizard"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "이체" }

export default async function TransferPage() {
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
      accountType:    true,
      accountPurpose: true,
      balance:        true,
    },
  })

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-kb-gray">이체 가능한 계좌가 없습니다.</p>
      </div>
    )
  }

  const serialized = accounts.map((a) => ({
    ...a,
    balance: a.balance.toFixed(0),
  }))

  return <TransferWizard accounts={serialized} />
}
