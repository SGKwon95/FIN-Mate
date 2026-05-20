import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { formatKRW, TX_TYPE_LABEL } from "@/lib/formatters"
import { Suspense } from "react"
import TransactionSearchForm from "./TransactionSearchForm"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "거래내역 조회" }

const CREDIT_TYPES = new Set(["DEPOSIT", "TRANSFER_IN", "INTEREST"])
const CHANNEL_LABEL: Record<string, string> = {
  TELLER: "영업점",
  APP:    "앱",
  AUTO:   "자동",
  ATM:    "ATM",
  WEB:    "인터넷",
}
const ACCOUNT_PURPOSE_LABEL: Record<string, string> = {
  GENERAL: "입출금",
  SALARY: "급여",
  SAVINGS: "적금",
}

type SearchParams = {
  accountId?: string
  from?: string
  to?: string
  type?: string
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const sp = await searchParams

  const accounts = await prisma.account.findMany({
    where: { partyId: session.user.partyId, accountStatus: "ACTIVE", isHidden: false },
    orderBy: { displayOrder: "asc" },
    select: { accountId: true, accountNumber: true, accountPurpose: true, balance: true },
  })

  if (accounts.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-kb-gray text-sm">
        계좌가 없습니다.
      </div>
    )
  }

  const selectedAccountId = sp.accountId ?? accounts[0].accountId
  const selectedAccount = accounts.find(a => a.accountId === selectedAccountId) ?? accounts[0]

  const today = new Date()
  const defaultFrom = new Date(today)
  defaultFrom.setMonth(defaultFrom.getMonth() - 1)

  const fromDate = sp.from ? new Date(`${sp.from}T00:00:00`) : defaultFrom
  const toDate   = sp.to   ? new Date(`${sp.to}T23:59:59`)  : today

  const type = sp.type ?? "ALL"
  const typeFilter =
    type === "ALL" ? undefined :
    type === "TRANSFER_OUT" ? { in: ["TRANSFER_OUT", "TRANSFER_IN"] } :
    type === "DEPOSIT"      ? { in: ["DEPOSIT", "INTEREST"] } :
    type

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: selectedAccount.accountId,
      transactedAt: { gte: fromDate, lte: toDate },
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
      channel:         true,
    },
  })

  const totalDeposit    = transactions.filter(tx =>  CREDIT_TYPES.has(tx.transactionType)).reduce((s, tx) => s + Number(tx.amount), 0)
  const totalWithdrawal = transactions.filter(tx => !CREDIT_TYPES.has(tx.transactionType)).reduce((s, tx) => s + Number(tx.amount), 0)
  const depositCount    = transactions.filter(tx =>  CREDIT_TYPES.has(tx.transactionType)).length
  const withdrawalCount = transactions.filter(tx => !CREDIT_TYPES.has(tx.transactionType)).length

  const serializedAccounts = accounts.map(a => ({
    accountId: a.accountId,
    accountNumber: a.accountNumber,
    accountPurpose: a.accountPurpose,
  }))

  // 날짜별 그룹핑
  type TxRow = {
    transactionId: string
    transactionType: string
    amount: string
    balanceAfter: string
    transactedAt: string
    counterpartName: string | null
    remark: string | null
    memo: string | null
    channel: string | null
    isCredit: boolean
  }

  const grouped: Record<string, TxRow[]> = {}
  for (const tx of transactions) {
    const day = tx.transactedAt.toISOString().slice(0, 10)
    if (!grouped[day]) grouped[day] = []
    grouped[day].push({
      transactionId:   tx.transactionId,
      transactionType: tx.transactionType,
      amount:          tx.amount.toFixed(0),
      balanceAfter:    tx.balanceAfter.toFixed(0),
      transactedAt:    tx.transactedAt.toISOString(),
      counterpartName: tx.counterpartName,
      remark:          tx.remark,
      memo:            tx.memo,
      channel:         tx.channel,
      isCredit:        CREDIT_TYPES.has(tx.transactionType),
    })
  }

  const fromLabel = fromDate.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
  const toLabel   = toDate.toLocaleDateString("ko-KR",   { year: "numeric", month: "2-digit", day: "2-digit" })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">거래내역 조회</h1>

      {/* 검색 폼 */}
      <Suspense>
        <TransactionSearchForm accounts={serializedAccounts} />
      </Suspense>

      {/* 계좌 요약 */}
      <div className="bg-white rounded-2xl shadow-card p-4 mb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-kb-gray mb-0.5">
              {ACCOUNT_PURPOSE_LABEL[selectedAccount.accountPurpose ?? ""] ?? "계좌"}
            </p>
            <p className="font-mono text-sm text-kb-navy font-semibold">
              {selectedAccount.accountNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-kb-gray mb-0.5">잔액</p>
            <p className="text-lg font-bold text-kb-navy tabular-nums">
              {formatKRW(selectedAccount.balance.toFixed(0))}
            </p>
          </div>
        </div>
      </div>

      {/* 입출금 합계 */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p className="text-[11px] text-blue-600 font-medium">총 입금 ({depositCount}건)</p>
          <p className="text-sm font-bold text-blue-700 tabular-nums mt-0.5">
            +{formatKRW(totalDeposit)}
          </p>
        </div>
        <div className="flex-1 bg-red-50 rounded-xl p-3 border border-red-100">
          <p className="text-[11px] text-red-500 font-medium">총 출금 ({withdrawalCount}건)</p>
          <p className="text-sm font-bold text-red-600 tabular-nums mt-0.5">
            -{formatKRW(totalWithdrawal)}
          </p>
        </div>
      </div>

      {/* 조회 기간 */}
      <p className="text-[11px] text-kb-gray text-right mb-2">
        조회기간 : {fromLabel} ~ {toLabel}
      </p>

      {/* 거래 테이블 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {transactions.length === 0 ? (
          <div className="py-16 text-center text-kb-gray text-sm">
            해당 기간에 거래 내역이 없습니다.
          </div>
        ) : (
          <>
            {/* 모바일: 카드형 */}
            <div className="lg:hidden">
              {Object.entries(grouped).map(([day, rows]) => (
                <section key={day}>
                  <div className="px-4 py-2 bg-kb-gray-light border-b border-kb-gray-border">
                    <p className="text-xs font-medium text-kb-gray">
                      {new Date(day).toLocaleDateString("ko-KR", {
                        year: "numeric", month: "long", day: "numeric", weekday: "short",
                      })}
                    </p>
                  </div>
                  <ul className="divide-y divide-kb-gray-border">
                    {rows.map(tx => {
                      const label = tx.counterpartName || tx.remark || TX_TYPE_LABEL[tx.transactionType] || tx.transactionType
                      const time = new Date(tx.transactedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit", minute: "2-digit", hour12: false,
                      })
                      return (
                        <li key={tx.transactionId} className="px-4 py-3.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-kb-navy truncate">{label}</p>
                            <p className="text-[11px] text-kb-gray mt-0.5">
                              {TX_TYPE_LABEL[tx.transactionType] ?? tx.transactionType} · {time}
                              {tx.memo && <span className="ml-1 text-kb-gray/70">· {tx.memo}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold tabular-nums ${tx.isCredit ? "text-blue-600" : "text-red-500"}`}>
                              {tx.isCredit ? "+" : "-"}{formatKRW(tx.amount)}
                            </p>
                            <p className="text-[11px] text-kb-gray mt-0.5 tabular-nums">
                              잔액 {formatKRW(tx.balanceAfter)}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {/* 데스크톱: 테이블형 */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-kb-gray-light border-b border-kb-gray-border text-kb-gray text-xs">
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">거래일시</th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">적요</th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">보내분/받는분</th>
                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">출금액(원)</th>
                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">입금액(원)</th>
                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">잔액(원)</th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">송금메모</th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">거래점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kb-gray-border">
                  {transactions.map(tx => {
                    const dt = new Date(tx.transactedAt)
                    const dateStr = dt.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
                    const timeStr = dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
                    const isCredit = CREDIT_TYPES.has(tx.transactionType)
                    return (
                      <tr key={tx.transactionId} className="hover:bg-kb-gray-light transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-kb-gray text-xs">
                          <span className="block">{dateStr}</span>
                          <span className="block text-kb-gray/60">{timeStr}</span>
                        </td>
                        <td className="px-4 py-3 text-kb-navy text-xs">
                          {tx.remark || TX_TYPE_LABEL[tx.transactionType] || tx.transactionType}
                        </td>
                        <td className="px-4 py-3 text-kb-navy text-xs">{tx.counterpartName ?? "-"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {!isCredit ? (
                            <span className="text-red-500 font-semibold">{formatKRW(tx.amount.toFixed(0))}</span>
                          ) : (
                            <span className="text-kb-gray/40">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {isCredit ? (
                            <span className="text-blue-600 font-semibold">{formatKRW(tx.amount.toFixed(0))}</span>
                          ) : (
                            <span className="text-kb-gray/40">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-kb-navy text-xs font-medium">
                          {formatKRW(tx.balanceAfter.toFixed(0))}
                        </td>
                        <td className="px-4 py-3 text-kb-gray text-xs">{tx.memo ?? "-"}</td>
                        <td className="px-4 py-3 text-kb-gray text-xs">{tx.channel ? (CHANNEL_LABEL[tx.channel] ?? tx.channel) : "-"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
