import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatKRW } from '@/lib/formatters'
import { embed } from '@/lib/embeddings'
import {
  computeUserProfile,
  buildUserProfileText,
  buildProductText,
  cosineSimilarity,
  fallbackScore,
  extractReasons,
  type ScoredProduct,
} from '@/lib/recommend'
import Link from 'next/link'
import { ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '맞춤 추천' }

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  TIME_DEPOSIT: { label: '정기예금', color: 'bg-blue-50 text-blue-700' },
  SAVINGS:      { label: '적금',     color: 'bg-green-50 text-green-700' },
  LOAN:         { label: '대출',     color: 'bg-orange-50 text-orange-700' },
}

const RANK_BADGE = [
  'bg-kb-yellow text-kb-navy',
  'bg-kb-navy/80 text-white',
  'bg-gray-200 text-gray-600',
  'bg-gray-100 text-gray-500',
]

export default async function RecommendPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect('/login')

  const partyId  = session.user.partyId
  const userName = session.user.name ?? '고객'

  // 최근 3개월 시작일 (YYYYMMDD)
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const startDate = `${threeMonthsAgo.getFullYear()}${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}01`

  // 계좌
  const rawAccounts = await prisma.account.findMany({
    where: { partyId, accountStatus: 'ACTIVE' },
    select: { accountId: true, accountType: true, accountPurpose: true, balance: true },
  })

  // 거래 + 상품 병렬 fetch
  const [rawTxns, rawProducts] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        accountId:         { in: rawAccounts.map(a => a.accountId) },
        transactionStatus: 'COMPLETED',
        transactionDate:   { gte: startDate },
      },
      select: { transactionType: true, amount: true },
    }),
    prisma.product.findMany({
      where: { productStatus: 'ACTIVE' },
      select: {
        productId: true, productName: true, productTypeCode: true,
        isDepositInsured: true, depositInsuranceLimit: true, description: true,
        depositDetail: {
          select: { transactionType: true, minAmount: true, minPeriodMonths: true, maxPeriodMonths: true },
        },
        loanDetail: {
          select: { loanType: true, minLoanAmount: true, maxLoanAmount: true },
        },
        productRates: {
          where: { rateType: 'BASE' },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { rate: true },
        },
      },
    }),
  ])

  // Decimal → number 변환
  const accounts = rawAccounts.map(a => ({
    accountId:      a.accountId,
    accountType:    a.accountType,
    accountPurpose: a.accountPurpose,
    balance:        Number(a.balance),
  }))
  const txns = rawTxns.map(t => ({
    transactionType: t.transactionType,
    amount:          Number(t.amount),
  }))
  const products = rawProducts.map(p => ({
    productId:             p.productId,
    productName:           p.productName,
    productTypeCode:       p.productTypeCode,
    isDepositInsured:      p.isDepositInsured,
    depositInsuranceLimit: p.depositInsuranceLimit != null ? Number(p.depositInsuranceLimit) : null,
    description:           p.description,
    depositDetail:         p.depositDetail ? {
      transactionType: p.depositDetail.transactionType,
      minAmount:       p.depositDetail.minAmount != null ? Number(p.depositDetail.minAmount) : null,
      minPeriodMonths: p.depositDetail.minPeriodMonths,
      maxPeriodMonths: p.depositDetail.maxPeriodMonths,
    } : null,
    loanDetail: p.loanDetail ? {
      loanType:      p.loanDetail.loanType,
      minLoanAmount: p.loanDetail.minLoanAmount != null ? Number(p.loanDetail.minLoanAmount) : null,
      maxLoanAmount: p.loanDetail.maxLoanAmount != null ? Number(p.loanDetail.maxLoanAmount) : null,
    } : null,
    productRates: p.productRates.map(r => ({ rate: Number(r.rate) })),
  }))

  const profile = computeUserProfile(
    accounts.map(a => ({ accountType: a.accountType, accountPurpose: a.accountPurpose, balance: a.balance })),
    txns,
  )

  // ── 임베딩 기반 점수 (실패 시 규칙 기반 폴백) ─────────────────
  let recommendations: ScoredProduct[]
  let usedAI = true

  try {
    const userText    = buildUserProfileText(profile)
    const productTexts = products.map(buildProductText)

    // 단일 배치 API 호출 (N+1 방지)
    const allVecs   = await embed([userText, ...productTexts])
    const userVec   = allVecs[0]
    const productVecs = allVecs.slice(1)

    recommendations = products
      .map((p, i) => ({
        product: p,
        score:   cosineSimilarity(userVec, productVecs[i]),
        reasons: extractReasons(profile, p),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  } catch {
    usedAI = false
    recommendations = products
      .map(p => ({
        product: p,
        score:   fallbackScore(profile, p),
        reasons: extractReasons(profile, p),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }

  const totalBalance  = accounts.reduce((sum, a) => sum + a.balance, 0)
  const productCount  = accounts.filter(a => a.accountPurpose || a.accountType === 'LOAN').length

  return (
    <div className="max-w-2xl lg:max-w-none">
      {/* ── 상단 배너 ─────────────────────────────── */}
      <div className="bg-kb-navy px-5 pt-6 pb-7">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-kb-yellow" />
          <p className="text-white/60 text-sm">
            AI 맞춤 추천
            {!usedAI && (
              <span className="ml-2 text-white/40 text-xs">(AI 서버 미가동 · 규칙 기반)</span>
            )}
          </p>
        </div>
        <p className="text-white text-xl font-bold">{userName} 님을 위한 추천 상품</p>
        <p className="text-white/50 text-xs mt-1.5">
          총 잔액 {formatKRW(totalBalance)} · 보유 상품 {productCount}개
        </p>
      </div>

      {/* ── 추천 카드 리스트 ──────────────────────── */}
      <div className="px-4 py-4 space-y-3 pb-24 lg:pb-6">
        {recommendations.length === 0 && (
          <p className="text-center py-16 text-kb-gray text-sm">추천 가능한 상품이 없습니다.</p>
        )}

        {recommendations.map(({ product, score, reasons }, idx) => {
          const depositTxType = product.depositDetail?.transactionType
          const badgeKey = depositTxType ?? (product.loanDetail ? 'LOAN' : '')
          const badge = TYPE_BADGE[badgeKey]
          const rate  = product.productRates[0]?.rate
          const rateStr = rate ? `연 ${(rate * 100).toFixed(2)}%` : null

          // 유사도 바 너비
          const barPct = usedAI
            ? Math.round(Math.min(score, 1) * 100)
            : Math.min(score, 100)

          const subscribeHref =
            depositTxType === 'TIME_DEPOSIT' ? `/products/${product.productId}/subscribe`
            : depositTxType === 'SAVINGS'    ? `/products/${product.productId}/savings-subscribe`
            : product.loanDetail             ? `/products/${product.productId}/loan-apply`
            : `/products/${product.productId}`

          return (
            <div key={product.productId} className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="p-4">
                {/* 순위 + 상품명 + 배지 */}
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                    RANK_BADGE[idx],
                  )}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-kb-navy text-base leading-tight">
                        {product.productName}
                      </p>
                      {badge && (
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', badge.color)}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {rateStr && (
                      <p className="text-kb-yellow font-bold text-lg mt-0.5 tabular-nums">
                        {rateStr}
                      </p>
                    )}
                  </div>
                </div>

                {/* 추천 적합도 바 */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-kb-gray">추천 적합도</span>
                    <span className="text-[10px] font-semibold text-kb-navy">
                      {usedAI ? `${barPct}%` : `${barPct}점`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-kb-gray-light rounded-full overflow-hidden">
                    <div
                      className="h-full bg-kb-yellow rounded-full"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>

                {/* 추천 이유 태그 */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {reasons.map(r => (
                    <span
                      key={r}
                      className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-kb-yellow/20 text-kb-navy"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex border-t border-kb-gray-border">
                <Link
                  href={`/products/${product.productId}`}
                  className="flex-1 flex items-center justify-center gap-1 py-3 text-sm text-kb-gray hover:text-kb-navy hover:bg-kb-gray-light transition-colors"
                >
                  자세히 보기 <ChevronRight className="w-3.5 h-3.5" />
                </Link>
                <div className="w-px bg-kb-gray-border" />
                <Link
                  href={subscribeHref}
                  className="flex-1 flex items-center justify-center py-3 text-sm font-semibold text-kb-navy hover:bg-kb-yellow/10 transition-colors"
                >
                  가입하기
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
