import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "적용금리 조회" }

const ACCOUNT_PURPOSE_LABEL: Record<string, string> = {
  TIME_DEPOSIT: "정기예금",
  SAVINGS:      "적금",
  LOAN:         "대출",
}

function formatRate(rate: { toFixed: (n: number) => string } | string | number) {
  return `${(Number(rate) * 100).toFixed(2)}%`
}

function formatDate(yyyymmdd: string) {
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`
}

function formatAmount(amount: { toFixed: (n: number) => string } | string | number | null) {
  if (!amount) return "-"
  return Number(amount).toLocaleString("ko-KR") + "원"
}

export default async function RatesPage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const rawAccounts = await prisma.account.findMany({
    where: {
      partyId:       session.user.partyId,
      contractId:    { not: null },
      accountStatus: "ACTIVE",
      isHidden:      false,
    },
    orderBy: { displayOrder: "asc" },
    include: {
      contract: {
        include: {
          product: {
            include: {
              productRates: {
                where:   { rateType: "BASE" },
                orderBy: { effectiveFrom: "desc" },
                take: 1,
              },
            },
          },
          rateBenefits: {
            include: { rateBenefit: true },
          },
        },
      },
    },
  })

  const accounts = rawAccounts.filter((a) => a.contract !== null)

  if (accounts.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-kb-gray text-sm">
        적용금리 조회 가능한 상품(정기예금·적금·대출)이 없습니다.
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">적용금리 조회</h1>

      <div className="space-y-4">
        {accounts.map((acct) => {
          const contract = acct.contract!
          const product  = contract.product
          const baseRate = product.productRates[0]
          const totalBenefitRate = contract.rateBenefits.reduce(
            (sum: number, b: { appliedRate: { toFixed: (n: number) => string } }) =>
              sum + Number(b.appliedRate),
            0,
          )

          return (
            <div key={acct.accountId} className="bg-white rounded-2xl shadow-card overflow-hidden">
              {/* 헤더 */}
              <div className="px-5 py-4 border-b border-kb-gray-border bg-kb-gray-light flex items-center justify-between">
                <div>
                  <p className="text-xs text-kb-gray mb-0.5">
                    {ACCOUNT_PURPOSE_LABEL[acct.accountPurpose ?? ""] ?? product.productTypeCode}
                  </p>
                  <p className="font-semibold text-kb-navy text-sm">{product.productName}</p>
                </div>
                <p className="font-mono text-xs text-kb-gray">{acct.accountNumber}</p>
              </div>

              {/* 금리 */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-kb-gray">최종 적용금리</span>
                  <span className="text-2xl font-bold text-kb-navy tabular-nums">
                    {formatRate(contract.appliedRate)}
                  </span>
                </div>

                <div className="space-y-0 text-sm divide-y divide-kb-gray-border">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-kb-gray">기본금리</span>
                    <span className="font-semibold text-kb-navy tabular-nums">
                      {baseRate ? formatRate(baseRate.rate) : "-"}
                    </span>
                  </div>

                  {contract.rateBenefits.length > 0 ? (
                    contract.rateBenefits.map((b, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5">
                        <span className="text-kb-gray">{b.rateBenefit.benefitName}</span>
                        <span className="font-semibold text-blue-600 tabular-nums">
                          +{formatRate(b.appliedRate)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-kb-gray">우대금리</span>
                      <span className="text-kb-gray/50 text-sm">해당 없음</span>
                    </div>
                  )}

                  {totalBenefitRate > 0 && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-kb-gray">우대금리 합계</span>
                      <span className="font-semibold text-blue-600 tabular-nums">
                        +{formatRate(totalBenefitRate)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 계약 정보 */}
              <div className="px-5 py-4 bg-kb-gray-light border-t border-kb-gray-border">
                <p className="text-xs font-semibold text-kb-gray mb-2">계약 정보</p>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <span className="text-kb-gray">계약금액</span>
                  <span className="text-kb-navy font-medium text-right">{formatAmount(contract.contractAmount)}</span>

                  <span className="text-kb-gray">계약기간</span>
                  <span className="text-kb-navy font-medium text-right">
                    {contract.contractPeriodMonths ? `${contract.contractPeriodMonths}개월` : "-"}
                  </span>

                  <span className="text-kb-gray">계약일</span>
                  <span className="text-kb-navy font-medium text-right">
                    {contract.contractDate ? formatDate(contract.contractDate) : "-"}
                  </span>

                  {contract.maturityDate && (
                    <>
                      <span className="text-kb-gray">만기일</span>
                      <span className="text-kb-navy font-medium text-right">
                        {formatDate(contract.maturityDate)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
