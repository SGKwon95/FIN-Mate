import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"

function formatLoanAmount(n: number): string {
  const eok    = Math.floor(n / 100_000_000)
  const chunman = Math.floor((n % 100_000_000) / 10_000_000)
  const baekman = Math.floor((n % 10_000_000)  / 1_000_000)
  let result = ""
  if (eok > 0)     result += `${eok}억`
  if (chunman > 0) result += ` ${chunman}천만`
  if (baekman > 0 && eok === 0) result += ` ${baekman}백만`
  return result.trim() + "원"
}

export const metadata: Metadata = { title: "대출" }

const TABS = [
  { label: "주택담보대출", value: "mortgage" },
  { label: "전세자금대출", value: "rent" },
  { label: "신용대출",     value: "credit" },
] as const
type TabValue = typeof TABS[number]["value"]

type SearchParams = { type?: string }

export default async function LoanProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const tab = (TABS.some(t => t.value === sp.type) ? sp.type : "mortgage") as TabValue

  const collateralTypeFilter =
    tab === "mortgage" ? { collateralType: "REAL_ESTATE" } :
    tab === "rent"     ? { collateralType: "JEONSE_RIGHT" } :
    /* credit */         { collateralRequired: false }

  const products = await prisma.product.findMany({
    where: {
      productStatus: "ACTIVE",
      productTypeCode: "LOAN",
      loanDetail: collateralTypeFilter,
    },
    orderBy: { launchDate: "asc" },
    select: {
      productId: true,
      productName: true,
      loanDetail: {
        select: {
          collateralRequired: true,
          collateralType: true,
          maxLtvRatio: true,
          maxLoanAmount: true,
        },
      },
      productRates: {
        where: { rateType: "BASE" },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { rate: true },
      },
    },
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">대출 상품</h1>

      {/* 탭 */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map(t => (
          <Link
            key={t.value}
            href={`/products/loan?type=${t.value}`}
            className={cn(
              "flex-1 py-2 text-xs font-semibold rounded-xl border text-center transition-colors",
              tab === t.value
                ? "bg-kb-navy text-white border-kb-navy"
                : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy hover:text-kb-navy"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* 상품 목록 */}
      <p className="text-xs text-kb-gray text-right mb-2">{products.length}개 상품</p>
      <div className="space-y-3">
        {products.map(p => {
          const d = p.loanDetail
          const rate = p.productRates[0]?.rate
          const rateStr = rate && Number(rate) > 0 ? `연 ${(Number(rate) * 100).toFixed(2)}%` : null

          return (
            <div key={p.productId} className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-kb-navy leading-snug">{p.productName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    {rateStr && <span className="text-kb-yellow font-bold text-base">{rateStr}</span>}
                    {d?.maxLtvRatio != null && (
                      <span className="text-xs text-kb-gray">
                        LTV {(Number(d.maxLtvRatio) * 100).toFixed(0)}%
                      </span>
                    )}
                    {d?.maxLoanAmount != null && (
                      <span className="text-xs text-orange-500 font-semibold">
                        최대 {formatLoanAmount(Number(d.maxLoanAmount))}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/products/${p.productId}`}
                  className="flex items-center gap-1 px-3 py-2 bg-kb-navy text-white text-xs font-semibold rounded-xl shrink-0"
                >
                  자세히 <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
