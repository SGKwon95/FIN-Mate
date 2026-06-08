import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatKRW } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '소비분석' }

const SPEND_TYPES = ['TRANSFER_OUT', 'WITHDRAWAL', 'FEE'] as const
const INCOME_TYPES = ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'] as const

const SPEND_LABEL: Record<string, string> = {
  TRANSFER_OUT: '이체 출금',
  WITHDRAWAL: '출금',
  FEE: '수수료',
}
const SPEND_COLOR_BAR: Record<string, string> = {
  TRANSFER_OUT: 'bg-kb-navy',
  WITHDRAWAL: 'bg-blue-400',
  FEE: 'bg-amber-400',
}
const SPEND_COLOR_DOT: Record<string, string> = {
  TRANSFER_OUT: 'bg-kb-navy',
  WITHDRAWAL: 'bg-blue-400',
  FEE: 'bg-amber-400',
}

function monthLabel(ym: string) {
  return `${parseInt(ym.slice(4))}월`
}

export default async function AnalysisPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect('/login')
  const partyId = session.user.partyId

  // 최근 6개월 (현재 달 포함)
  const now = new Date()
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`,
    )
  }

  const txns = await prisma.transaction.findMany({
    where: {
      account: { partyId },
      transactionDate: { gte: `${months[0]}01`, lte: `${months[5]}31` },
      transactionStatus: 'COMPLETED',
    },
    select: { transactionType: true, amount: true, transactionDate: true },
  })

  // 월별 집계
  type MonthBucket = { income: number; spend: number; byType: Record<string, number> }
  const buckets: Record<string, MonthBucket> = Object.fromEntries(
    months.map((m) => [m, { income: 0, spend: 0, byType: {} }]),
  )

  for (const tx of txns) {
    const ym = tx.transactionDate.slice(0, 6)
    if (!buckets[ym]) continue
    const amt = Number(tx.amount)
    if ((INCOME_TYPES as readonly string[]).includes(tx.transactionType)) {
      buckets[ym].income += amt
    } else if ((SPEND_TYPES as readonly string[]).includes(tx.transactionType)) {
      buckets[ym].spend += amt
      buckets[ym].byType[tx.transactionType] =
        (buckets[ym].byType[tx.transactionType] ?? 0) + amt
    }
  }

  const thisKey = months[5]
  const prevKey = months[4]
  const thisMonth = buckets[thisKey]
  const prevMonth = buckets[prevKey]

  // 6개월 지출 유형별 합계
  const totalByType: Record<string, number> = {}
  for (const b of Object.values(buckets)) {
    for (const [type, amt] of Object.entries(b.byType)) {
      totalByType[type] = (totalByType[type] ?? 0) + amt
    }
  }
  const totalSpend6m = Object.values(totalByType).reduce((s, a) => s + a, 0)

  // 월별 최대 지출 (바 차트 스케일)
  const maxSpend = Math.max(...months.map((m) => buckets[m].spend), 1)

  const spendDiff = thisMonth.spend - prevMonth.spend
  const spendDiffPct =
    prevMonth.spend > 0 ? (spendDiff / prevMonth.spend) * 100 : null

  const hasAnyData = txns.length > 0

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <h1 className="text-lg font-bold text-kb-navy">소비분석</h1>

      {/* ── 이번 달 요약 ────────────────────────────── */}
      <div className="bg-kb-navy rounded-2xl p-5 text-white">
        <p className="text-white/50 text-xs">{monthLabel(thisKey)} 지출</p>
        <p className="text-3xl font-bold mt-1 tracking-tight">
          {formatKRW(thisMonth.spend)}
        </p>

        {spendDiffPct !== null && (
          <p
            className={cn(
              'text-xs mt-1 font-medium',
              spendDiff > 0 ? 'text-red-300' : spendDiff < 0 ? 'text-green-300' : 'text-white/50',
            )}
          >
            전월 대비&nbsp;
            {spendDiff > 0 ? '+' : ''}
            {spendDiffPct.toFixed(0)}%&nbsp;
            <span className="font-normal text-white/50">
              ({spendDiff >= 0 ? '+' : ''}
              {formatKRW(Math.abs(spendDiff))})
            </span>
          </p>
        )}

        <div className="flex gap-6 mt-4 pt-4 border-t border-white/15">
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">수입</p>
            <p className="text-sm font-semibold text-green-300">
              {formatKRW(thisMonth.income)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">지출</p>
            <p className="text-sm font-semibold text-kb-yellow">
              {formatKRW(thisMonth.spend)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">순 증감</p>
            <p
              className={cn(
                'text-sm font-semibold',
                thisMonth.income - thisMonth.spend >= 0
                  ? 'text-green-300'
                  : 'text-red-300',
              )}
            >
              {thisMonth.income - thisMonth.spend >= 0 ? '+' : ''}
              {formatKRW(thisMonth.income - thisMonth.spend)}
            </p>
          </div>
        </div>
      </div>

      {/* ── 최근 6개월 지출 추이 ─────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-card">
        <p className="text-sm font-bold text-kb-navy mb-4">최근 6개월 지출</p>

        {!hasAnyData ? (
          <p className="text-xs text-kb-gray text-center py-6">거래 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2.5">
            {months.map((m) => {
              const spend = buckets[m].spend
              const pct = (spend / maxSpend) * 100
              const isThis = m === thisKey
              return (
                <div key={m} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-6 text-right text-xs shrink-0',
                      isThis ? 'font-bold text-kb-navy' : 'text-kb-gray',
                    )}
                  >
                    {monthLabel(m)}
                  </span>
                  <div className="flex-1 h-6 bg-kb-gray-light rounded-lg overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-lg transition-all',
                        isThis ? 'bg-kb-navy' : 'bg-kb-navy/40',
                      )}
                      style={{ width: `${Math.max(pct, spend > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'w-24 text-right text-xs shrink-0',
                      isThis ? 'font-bold text-kb-navy' : 'text-kb-gray',
                    )}
                  >
                    {spend > 0 ? formatKRW(spend) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 지출 유형별 분석 ─────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-sm font-bold text-kb-navy">6개월 지출 유형</p>
          {totalSpend6m > 0 && (
            <p className="text-xs text-kb-gray">합계 {formatKRW(totalSpend6m)}</p>
          )}
        </div>

        {totalSpend6m === 0 ? (
          <p className="text-xs text-kb-gray text-center py-6">지출 내역이 없습니다.</p>
        ) : (
          <>
            {/* 스택 바 */}
            <div className="flex h-2.5 rounded-full overflow-hidden mb-5">
              {SPEND_TYPES.filter((t) => totalByType[t] > 0).map((t) => (
                <div
                  key={t}
                  className={SPEND_COLOR_BAR[t]}
                  style={{ width: `${(totalByType[t] / totalSpend6m) * 100}%` }}
                />
              ))}
            </div>

            {/* 유형별 행 */}
            <div className="space-y-3.5">
              {SPEND_TYPES.filter((t) => totalByType[t] > 0).map((t) => {
                const pct = (totalByType[t] / totalSpend6m) * 100
                return (
                  <div key={t}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn('w-2 h-2 rounded-full shrink-0', SPEND_COLOR_DOT[t])}
                        />
                        <span className="text-xs text-kb-gray">{SPEND_LABEL[t]}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold text-kb-navy">
                          {formatKRW(totalByType[t])}
                        </span>
                        <span className="text-[10px] text-kb-gray">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-kb-gray-light rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', SPEND_COLOR_BAR[t])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
