import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight, Shield, CheckCircle } from "lucide-react"
import { formatKRW } from "@/lib/formatters"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>
}): Promise<Metadata> {
  const { productId } = await params
  const product = await prisma.product.findUnique({
    where: { productId },
    select: { productName: true },
  })
  return { title: product?.productName ?? "상품 상세" }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params

  const product = await prisma.product.findUnique({
    where: { productId },
    select: {
      productId: true,
      productName: true,
      productTypeCode: true,
      productStatus: true,
      isDepositInsured: true,
      depositInsuranceLimit: true,
      description: true,
      depositDetail: {
        select: {
          transactionType: true,
          interestType: true,
          minAmount: true,
          maxAmount: true,
          minPeriodMonths: true,
          maxPeriodMonths: true,
        },
      },
      loanDetail: {
        select: {
          collateralRequired: true,
          collateralType: true,
          maxLtvRatio: true,
          maxLoanAmount: true,
          maxLoanPeriodMonths: true,
          repaymentMethod: true,
          earlyRepaymentAllowed: true,
          earlyRepaymentFeeRate: true,
          overdueInterestRate: true,
        },
      },
      productRates: {
        where: { rateType: "BASE" },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { rate: true },
      },
      productRateBenefits: {
        select: { benefitName: true, benefitRate: true },
        take: 10,
      },
    },
  })

  if (!product || product.productStatus !== "ACTIVE") notFound()

  const isDeposit = product.productTypeCode === "DEPOSIT"
  const isLoan = product.productTypeCode === "LOAN"
  const baseRate = Number(product.productRates[0]?.rate ?? 0)
  const rateStr = baseRate > 0 ? `연 ${(baseRate * 100).toFixed(2)}%` : null

  const transactionType = product.depositDetail?.transactionType
  const isSavings = transactionType === "SAVINGS"
  const isTimeDeposit = transactionType === "TIME_DEPOSIT"

  const subscribeHref = isTimeDeposit
    ? `/products/${productId}/subscribe`
    : isSavings
    ? `/products/${productId}/savings-subscribe`
    : null

  const depositDetail = product.depositDetail
  const loanDetail = product.loanDetail

  const COLLATERAL_LABEL: Record<string, string> = {
    REAL_ESTATE: "부동산",
    JEONSE_RIGHT: "전세권",
  }
  const REPAYMENT_LABEL: Record<string, string> = {
    EQUAL_INSTALLMENT: "원리금균등상환",
    EQUAL_PRINCIPAL: "원금균등상환",
    BULLET: "만기일시상환",
  }
  const INTEREST_LABEL: Record<string, string> = {
    SIMPLE: "단리",
    COMPOUND: "복리",
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* 헤더 배너 */}
      <div className={`rounded-2xl p-5 mb-5 text-white ${isLoan ? "bg-gradient-to-br from-blue-700 to-blue-500" : "bg-kb-navy"}`}>
        <p className="text-white/60 text-xs mb-1">
          {isTimeDeposit ? "정기예금" : isSavings ? "적금" : isLoan ? "대출" : product.productTypeCode}
        </p>
        <p className="font-bold text-lg leading-snug">{product.productName}</p>

        {rateStr && (
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-kb-yellow font-bold text-2xl">{rateStr}</span>
            <span className="text-white/60 text-xs">(세전{isSavings ? ", 단리" : ""})</span>
          </div>
        )}

        {isLoan && loanDetail?.maxLtvRatio && (
          <div className="mt-3">
            <span className="text-white/80 text-sm">LTV 최대 </span>
            <span className="text-white font-bold text-xl">{(Number(loanDetail.maxLtvRatio) * 100).toFixed(0)}%</span>
          </div>
        )}

        {product.isDepositInsured && (
          <div className="flex items-center gap-1 mt-3">
            <Shield className="w-3 h-3 text-green-400" />
            <span className="text-green-400 text-[10px]">
              예금자보호 {Number(product.depositInsuranceLimit).toLocaleString("ko-KR")}원
            </span>
          </div>
        )}
      </div>

      {/* 상세 정보 */}
      <div className="bg-white rounded-2xl shadow-card divide-y divide-kb-gray-border mb-4">
        {/* 예금·적금 정보 */}
        {depositDetail && (
          <>
            {depositDetail.minPeriodMonths != null && depositDetail.maxPeriodMonths != null && (
              <Row label="가입 기간">
                {depositDetail.minPeriodMonths === depositDetail.maxPeriodMonths
                  ? `${depositDetail.minPeriodMonths}개월`
                  : `${depositDetail.minPeriodMonths}~${depositDetail.maxPeriodMonths}개월`}
              </Row>
            )}
            {depositDetail.minAmount != null && (
              <Row label={isSavings ? "최소 월 납입금" : "최소 가입금액"}>
                {formatKRW(Number(depositDetail.minAmount))}
              </Row>
            )}
            {depositDetail.maxAmount != null && (
              <Row label={isSavings ? "최대 월 납입금" : "최대 가입금액"}>
                {formatKRW(Number(depositDetail.maxAmount))}
              </Row>
            )}
            {depositDetail.interestType && (
              <Row label="이자 방식">{INTEREST_LABEL[depositDetail.interestType] ?? depositDetail.interestType}</Row>
            )}
          </>
        )}

        {/* 대출 정보 */}
        {loanDetail && (
          <>
            {loanDetail.maxLoanAmount != null && (
              <Row label="최대 대출한도">{formatKRW(Number(loanDetail.maxLoanAmount))}</Row>
            )}
            {loanDetail.maxLoanPeriodMonths != null && (
              <Row label="최대 대출기간">{loanDetail.maxLoanPeriodMonths}개월</Row>
            )}
            {loanDetail.collateralType && (
              <Row label="담보 유형">
                {COLLATERAL_LABEL[loanDetail.collateralType] ?? loanDetail.collateralType}
              </Row>
            )}
            {loanDetail.repaymentMethod && (
              <Row label="상환 방식">
                {REPAYMENT_LABEL[loanDetail.repaymentMethod] ?? loanDetail.repaymentMethod}
              </Row>
            )}
            {loanDetail.earlyRepaymentFeeRate != null && Number(loanDetail.earlyRepaymentFeeRate) > 0 && (
              <Row label="중도상환수수료">
                {(Number(loanDetail.earlyRepaymentFeeRate) * 100).toFixed(2)}%
              </Row>
            )}
            {loanDetail.overdueInterestRate != null && Number(loanDetail.overdueInterestRate) > 0 && (
              <Row label="최고 연체이자율">
                연 {(Number(loanDetail.overdueInterestRate) * 100).toFixed(1)}%
              </Row>
            )}
          </>
        )}
      </div>

      {/* 우대금리 혜택 */}
      {product.productRateBenefits.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
          <p className="text-xs font-semibold text-kb-gray mb-3">우대 혜택</p>
          <ul className="space-y-2">
            {product.productRateBenefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                <span className="text-xs text-kb-navy leading-relaxed">{b.benefitName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 상품 설명 */}
      {product.description && (
        <div className="bg-white rounded-2xl shadow-card p-4 mb-6">
          <p className="text-xs font-semibold text-kb-gray mb-2">상품 안내</p>
          <p className="text-xs text-kb-navy leading-relaxed whitespace-pre-line">{product.description}</p>
        </div>
      )}

      {/* CTA */}
      {subscribeHref ? (
        <Link
          href={subscribeHref}
          className="flex items-center justify-center gap-2 w-full py-4 bg-kb-navy text-white font-bold rounded-2xl text-base active:scale-[0.98] transition-transform"
        >
          가입하기 <ChevronRight className="w-5 h-5" />
        </Link>
      ) : isLoan ? (
        <Link
          href={`/products/${productId}/loan-apply`}
          className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 text-white font-bold rounded-2xl text-base active:scale-[0.98] transition-transform"
        >
          대출 신청하기 <ChevronRight className="w-5 h-5" />
        </Link>
      ) : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-kb-gray">{label}</span>
      <span className="text-sm font-semibold text-kb-navy">{children}</span>
    </div>
  )
}
