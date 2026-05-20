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

  // 최근 이체한 수신자 (중복 제거, 최대 5명)
  const recentTxs = await prisma.transaction.findMany({
    where: {
      account: { partyId: session.user.partyId },
      transactionType: "TRANSFER_OUT",
      counterpartAccountNumber: { not: null },
    },
    orderBy: { transactedAt: "desc" },
    take: 30,
    select: { counterpartAccountNumber: true, counterpartName: true },
  })

  const seen = new Set<string>()
  const recentRecipients = recentTxs
    .filter((tx) => {
      if (!tx.counterpartAccountNumber || seen.has(tx.counterpartAccountNumber)) return false
      seen.add(tx.counterpartAccountNumber)
      return true
    })
    .slice(0, 5)
    .map((tx) => ({
      accountNumber: tx.counterpartAccountNumber!,
      name: tx.counterpartName ?? "",
    }))

  const bankCodes = await prisma.commonCode.findMany({
    where: { groupId: "BANK_CODE" },
    orderBy: { sortOrder: "asc" },
    select: { code: true, codeName: true },
  })

  const serialized = accounts.map((a) => ({
    ...a,
    balance: a.balance.toFixed(0),
  }))

  return (
    <TransferWizard
      accounts={serialized}
      recentRecipients={recentRecipients}
      banks={bankCodes.map((b) => ({ code: b.code, name: b.codeName }))}
    />
  )
}
