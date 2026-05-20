import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { ChevronRight, Shield } from "lucide-react"
import { formatKRW } from "@/lib/formatters"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "정기예금" }

export default async function DepositProductsPage() {
  const products = await prisma.product.findMany({
    where: {
      productStatus: "ACTIVE",
      productTypeCode: "DEPOSIT",
      depositDetail: { transactionType: "TIME_DEPOSIT" },
    },
    orderBy: { launchDate: "asc" },
    select: {
      productId: true,
      productName: true,
      isDepositInsured: true,
      depositInsuranceLimit: true,
      depositDetail: {
        select: { minPeriodMonths: true, maxPeriodMonths: true, minAmount: true },
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
      <h1 className="text-lg font-bold text-kb-navy mb-4">정기예금 ({products.length})</h1>
      <div className="space-y-3">
        {products.map(p => {
          const rate = p.productRates[0]?.rate
          const rateStr = rate && Number(rate) > 0 ? `연 ${(Number(rate) * 100).toFixed(2)}%` : "-"
          const min = p.depositDetail?.minPeriodMonths
          const max = p.depositDetail?.maxPeriodMonths
          const periodLabel = min && max ? (min === max ? `${min}개월` : `${min}~${max}개월`) : "-"

          return (
            <div key={p.productId} className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-kb-navy truncate">{p.productName}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-kb-yellow font-bold text-lg">{rateStr}</span>
                    <span className="text-xs text-kb-gray">{periodLabel}</span>
                  </div>
                  {p.depositDetail?.minAmount != null && (
                    <p className="text-[11px] text-kb-gray mt-1">
                      최소 {formatKRW(Number(p.depositDetail.minAmount))}부터
                    </p>
                  )}
                  {p.isDepositInsured && (
                    <div className="flex items-center gap-1 mt-1">
                      <Shield className="w-3 h-3 text-green-500" />
                      <span className="text-[10px] text-green-600">
                        예금자보호 {Number(p.depositInsuranceLimit).toLocaleString("ko-KR")}원
                      </span>
                    </div>
                  )}
                </div>
                <Link
                  href={`/products/${p.productId}`}
                  className="flex items-center gap-1 px-4 py-2 bg-kb-navy text-white text-sm font-semibold rounded-xl shrink-0"
                >
                  가입 <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
