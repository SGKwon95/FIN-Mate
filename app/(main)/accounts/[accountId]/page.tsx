import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect, notFound } from "next/navigation"
import { formatKRW, formatAccountNumber } from "@/lib/formatters"
import { ArrowLeft, Lock } from "lucide-react"
import Link from "next/link"
import TransactionFilter from "@/components/accounts/TransactionFilter"
import TransactionList from "@/components/accounts/TransactionList"
import { Suspense } from "react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "계좌 상세" }

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT:   "입출금",
  LOAN:      "대출",
  OVERDRAFT: "마이너스통장",
}

type PageProps = {
  params: Promise<{ accountId: string }>
  searchParams: Promise<{ period?: string; type?: string }>
}

export default async function AccountDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const { accountId } = await params
  const { period = "30", type = "ALL" } = await searchParams

  const account = await prisma.account.findUnique({
    where: { accountId },
    select: {
      accountId:     true,
      accountNumber: true,
      accountType:   true,
      accountPurpose: true,
      balance:       true,
      partyId:       true,
      isLocked:      true,
      openedDate:    true,
    },
  })

  if (!account || account.partyId !== session.user.partyId) notFound()

  // 기간 계산
  const periodDays = Number(period) || 30
  const since = new Date()
  since.setDate(since.getDate() - periodDays)

  // 거래 유형 필터
  const typeFilter =
    type === "ALL"
      ? undefined
      : type === "TRANSFER_OUT"
      ? { in: ["TRANSFER_OUT", "TRANSFER_IN"] }
      : { equals: type }

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      transactedAt: { gte: since },
      ...(typeFilter ? { transactionType: typeFilter } : {}),
    },
    orderBy: { transactedAt: "desc" },
    select: {
      transactionId:   true,
      transactionType: true,
      amount:          true,
      balanceAfter:    true,
      transactedAt:    true,
      counterpartName: true,
      remark:          true,
      memo:            true,
    },
  })

  const serializedTxs = transactions.map((tx) => ({
    ...tx,
    amount:       tx.amount.toFixed(0),
    balanceAfter: tx.balanceAfter.toFixed(0),
    transactedAt: tx.transactedAt.toISOString(),
  }))

  const typeLabel = ACCOUNT_TYPE_LABEL[account.accountType] ?? account.accountType

  return (
    <div className="max-w-2xl lg:max-w-none">
      {/* 상단 계좌 정보 */}
      <div className="bg-kb-navy px-4 pt-4 pb-6">
        {/* 뒤로가기 */}
        <Link
          href="/accounts"
          className="flex items-center gap-1 text-white/60 hover:text-white text-sm mb-4 w-fit transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          내 계좌
        </Link>

        {/* 계좌 유형 뱃지 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs bg-kb-yellow text-kb-navy font-bold px-2 py-0.5 rounded-md">
            {typeLabel}
          </span>
          {account.isLocked && (
            <span className="flex items-center gap-0.5 text-xs text-kb-red/80">
              <Lock className="w-3 h-3" />
              잠금
            </span>
          )}
        </div>

        {/* 계좌번호 */}
        <p className="text-white/60 font-mono text-sm tracking-wide mb-3">
          {formatAccountNumber(account.accountNumber)}
        </p>

        {/* 잔액 */}
        <p className="text-white text-[2rem] font-bold tabular-nums">
          {formatKRW(account.balance.toFixed(0))}
        </p>

        {/* 개설일 */}
        <p className="text-white/40 text-xs mt-1">개설일 {account.openedDate}</p>
      </div>

      {/* 필터 (Suspense로 감싸서 hydration 분리) */}
      <Suspense fallback={<div className="h-20 bg-white border-b border-kb-gray-border" />}>
        <TransactionFilter />
      </Suspense>

      {/* 거래 내역 */}
      <div className="pb-24 lg:pb-6">
        <TransactionList transactions={serializedTxs} />
      </div>
    </div>
  )
}
