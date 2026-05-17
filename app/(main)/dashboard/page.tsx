import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { formatKRW } from "@/lib/formatters"
import { TrendingUp } from "lucide-react"
import AccountSummaryCard from "@/components/dashboard/AccountSummaryCard"
import QuickActions from "@/components/dashboard/QuickActions"
import ProductBanner from "@/components/dashboard/ProductBanner"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "홈" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const [accounts, products] = await Promise.all([
    prisma.account.findMany({
      where: {
        partyId: session.user.partyId,
        accountStatus: "ACTIVE",
        isHidden: false,
      },
      orderBy: { displayOrder: "asc" },
      select: {
        accountId:     true,
        accountNumber: true,
        accountType:   true,
        accountPurpose: true,
        balance:       true,
      },
    }),
    prisma.product.findMany({
      where: { productStatus: "ACTIVE" },
      take: 4,
      orderBy: { launchDate: "desc" },
      select: { productId: true, productName: true, productTypeCode: true },
    }),
  ])

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0)

  // Decimal → string 직렬화 (Server→Server 사이라도 명시적으로 변환)
  const serializedAccounts = accounts.map((a) => ({
    ...a,
    balance: a.balance.toFixed(0),
  }))

  return (
    <div className="max-w-2xl lg:max-w-none">
      {/* ── 총 자산 현황 ──────────────────────────── */}
      <div className="bg-kb-navy px-5 pt-6 pb-7">
        <p className="text-white/50 text-sm">총 보유자산</p>
        <p className="text-white text-[2rem] font-bold mt-1 tracking-tight tabular-nums">
          {formatKRW(totalBalance)}
        </p>
        <div className="flex items-center gap-1 mt-2">
          <TrendingUp className="w-3.5 h-3.5 text-kb-yellow" />
          <span className="text-kb-yellow text-xs font-medium">전월 대비 +2.1%</span>
        </div>
      </div>

      {/* ── 카드 영역 ────────────────────────────── */}
      <div className="px-4 py-4 space-y-3 pb-24 lg:pb-6">
        <AccountSummaryCard accounts={serializedAccounts} />
        <QuickActions />
        <ProductBanner products={products} />
      </div>
    </div>
  )
}
