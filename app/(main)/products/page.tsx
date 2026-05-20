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
      periodType: true,
      contractPeriodMonths: true,
      isDepositInsured: true,
      depositInsuranceLimit: true,
      depositDetail: {
        select: { transactionType: true, minAmount: true, maxAmount: true, minPeriodMonths: true, maxPeriodMonths: true },
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
      <h2 className="text-lg font-bold text-kb-navy mb-4">예금 상품</h2>
      <div className="space-y-3">
        {products.map((p) => {
          const rate = p.productRates[0]?.rate
          const rateStr = rate ? `연 ${(Number(rate) * 100).toFixed(2)}%` : "-"
          const isTimeDeposit = p.depositDetail?.transactionType === "TIME_DEPOSIT"
          const periodLabel = isTimeDeposit
            ? `${p.depositDetail?.minPeriodMonths}~${p.depositDetail?.maxPeriodMonths}개월`
            : `${p.contractPeriodMonths}개월`

          return (
            <div key={p.productId} className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-kb-gray font-medium mb-1">
                    {isTimeDeposit ? "정기예금" : "적금"}
                  </p>
                  <p className="text-base font-bold text-kb-navy">{p.productName}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-kb-yellow font-bold text-lg">{rateStr}</span>
                    <span className="text-xs text-kb-gray">{periodLabel}</span>
                  </div>
                  {p.isDepositInsured && (
                    <div className="flex items-center gap-1 mt-2">
                      <Shield className="w-3 h-3 text-green-500" />
                      <span className="text-[10px] text-green-600">예금자보호 {Number(p.depositInsuranceLimit).toLocaleString("ko-KR")}원</span>
                    </div>
                  )}
                </div>
                {isTimeDeposit && (
                  <Link
                    href={`/products/${p.productId}/subscribe`}
                    className="flex items-center gap-1 px-4 py-2 bg-kb-navy text-white text-sm font-semibold rounded-xl shrink-0 ml-3"
                  >
                    가입 <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
