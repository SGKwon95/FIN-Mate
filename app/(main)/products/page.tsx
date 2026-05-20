import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { ChevronRight, Shield } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "상품" }

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    where: { productStatus: "ACTIVE", productTypeCode: "DEPOSIT" },
    orderBy: { launchDate: "asc" },
    select: {
      productId: true,
      productName: true,
      isDepositInsured: true,
      depositInsuranceLimit: true,
      depositDetail: {
        select: { transactionType: true, minPeriodMonths: true, maxPeriodMonths: true },
      },
      productRates: {
        where: { rateType: "BASE" },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { rate: true },
      },
    },
  })

  const timeDeposits = products.filter(p => p.depositDetail?.transactionType === "TIME_DEPOSIT")
  const savings = products.filter(p => p.depositDetail?.transactionType === "SAVINGS")

  function ProductCard({ p, href }: { p: typeof products[number]; href: string }) {
    const rate = p.productRates[0]?.rate
    const rateStr = rate && Number(rate) > 0 ? `연 ${(Number(rate) * 100).toFixed(2)}%` : "-"
    const min = p.depositDetail?.minPeriodMonths
    const max = p.depositDetail?.maxPeriodMonths
    const periodLabel = min && max ? (min === max ? `${min}개월` : `${min}~${max}개월`) : "-"

    return (
      <div className="bg-white rounded-2xl shadow-card p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-kb-navy truncate">{p.productName}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-kb-yellow font-bold text-lg">{rateStr}</span>
              <span className="text-xs text-kb-gray">{periodLabel}</span>
            </div>
            {p.isDepositInsured && (
              <div className="flex items-center gap-1 mt-1.5">
                <Shield className="w-3 h-3 text-green-500" />
                <span className="text-[10px] text-green-600">예금자보호 {Number(p.depositInsuranceLimit).toLocaleString("ko-KR")}원</span>
              </div>
            )}
          </div>
          <Link
            href={href}
            className="flex items-center gap-1 px-4 py-2 bg-kb-navy text-white text-sm font-semibold rounded-xl shrink-0 ml-3"
          >
            가입 <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-lg font-bold text-kb-navy mb-4">예금 상품</h2>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-kb-gray mb-2">정기예금 ({timeDeposits.length})</h3>
        <div className="space-y-3">
          {timeDeposits.map(p => (
            <ProductCard key={p.productId} p={p} href={`/products/${p.productId}/subscribe`} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-kb-gray mb-2">적금 ({savings.length})</h3>
        <div className="space-y-3">
          {savings.map(p => (
            <ProductCard key={p.productId} p={p} href={`/products/${p.productId}/savings-subscribe`} />
          ))}
        </div>
      </section>
    </div>
  )
}
