import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { formatKRW } from "@/lib/formatters"
import { Wallet } from "lucide-react"
import AccountCard from "@/components/accounts/AccountCard"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "내 계좌" }

export default async function AccountsPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const accounts = await prisma.account.findMany({
    where: {
      partyId: session.user.partyId,
      accountStatus: "ACTIVE",
      isHidden: false,
    },
    orderBy: { displayOrder: "asc" },
    select: {
      accountId:         true,
      accountNumber:     true,
      accountType:       true,
      accountPurpose:    true,
      balance:           true,
      openedDate:        true,
      lastTransactionAt: true,
      contract: {
        select: {
          product: { select: { productName: true } },
        },
      },
    },
  })

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0)

  const serialized = accounts.map((a) => ({
    ...a,
    balance: a.balance.toFixed(0),
    lastTransactionAt: a.lastTransactionAt?.toISOString() ?? null,
    productName: a.contract?.product?.productName ?? null,
  }))

  return (
    <div className="max-w-2xl lg:max-w-none">
      {/* 총 자산 헤더 */}
      <div className="bg-kb-navy px-5 pt-6 pb-7">
        <p className="text-white/50 text-sm">전체 계좌 잔액</p>
        <p className="text-white text-[2rem] font-bold mt-1 tracking-tight tabular-nums">
          {formatKRW(totalBalance)}
        </p>
        <p className="text-white/40 text-xs mt-1">{serialized.length}개 계좌</p>
      </div>

      {/* 계좌 목록 */}
      <div className="px-4 py-4 space-y-3 pb-24 lg:pb-6">
        {serialized.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-kb-gray gap-3">
            <Wallet className="w-12 h-12 text-kb-gray-border" />
            <p className="text-sm">등록된 계좌가 없습니다.</p>
          </div>
        ) : (
          serialized.map((acc) => <AccountCard key={acc.accountId} {...acc} />)
        )}
      </div>
    </div>
  )
}
