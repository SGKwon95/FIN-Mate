import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight, Shield } from "lucide-react"
import ChatPopup from "@/components/chat/ChatPopup"
import ProductDetailTabs from "@/components/products/ProductDetailTabs"
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
          rateType: true,
          minAmount: true,
          maxAmount: true,
          minPeriodMonths: true,
          maxPeriodMonths: true,
          earlyWithdrawalPenaltyRate: true,
          prepaymentAllowed: true,
          deferralAllowed: true,
        },
      },
      loanDetail: {
        select: {
          loanType: true,
          baseRateType: true,
          interestType: true,
          maxLtvRatio: true,
          maxDtiRatio: true,
          collateralRequired: true,
          collateralType: true,
          lienAvailable: true,
          minLoanAmount: true,
          maxLoanAmount: true,
          maxLoanPeriodMonths: true,
          repaymentMethod: true,
          earlyRepaymentAllowed: true,
          earlyRepaymentFeeRate: true,
          overdueInterestRate: true,
        },
      },
      productRates: {
        orderBy: [{ rateType: "asc" }, { effectiveFrom: "desc" }],
        select: { rateType: true, rateStructure: true, rate: true, effectiveFrom: true },
      },
      productRateTiers: {
        orderBy: { minValue: "asc" },
        select: { tierType: true, minValue: true, maxValue: true, rate: true },
      },
      productRateBenefits: {
        select: { benefitName: true, benefitRate: true, conditionDescription: true },
      },
      productFees: {
        orderBy: { feeType: "asc" },
        select: { feeType: true, channel: true, feeAmount: true, feeRate: true, waiverCondition: true },
      },
      productTerms: {
        orderBy: { effectiveDate: "desc" },
        select: { termsId: true, termsType: true, version: true, effectiveDate: true, contentUrl: true },
      },
    },
  })

  if (!product || product.productStatus !== "ACTIVE") notFound()

  const isDeposit = product.productTypeCode === "DEPOSIT"
  const isLoan = product.productTypeCode === "LOAN"
  const transactionType = product.depositDetail?.transactionType
  const isSavings = transactionType === "SAVINGS"
  const isTimeDeposit = transactionType === "TIME_DEPOSIT"

  // 헤더용 기준금리
  const baseRate = product.productRates.find((r) => r.rateType === "BASE")
  const rateStr = baseRate ? `연 ${(Number(baseRate.rate) * 100).toFixed(2)}%` : null

  const subscribeHref = isTimeDeposit
    ? `/products/${productId}/subscribe`
    : isSavings
    ? `/products/${productId}/savings-subscribe`
    : null

  const minioBase = `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}`
  const termsUrls = isTimeDeposit
    ? [`${minioBase}/terms/time-deposit.html`]
    : isSavings
    ? [`${minioBase}/terms/savings.html`]
    : []

  // Decimal → number 직렬화
  const depositDetail = product.depositDetail
    ? {
        transactionType: product.depositDetail.transactionType,
        interestType: product.depositDetail.interestType,
        rateType: product.depositDetail.rateType,
        minAmount: product.depositDetail.minAmount != null ? Number(product.depositDetail.minAmount) : null,
        maxAmount: product.depositDetail.maxAmount != null ? Number(product.depositDetail.maxAmount) : null,
        minPeriodMonths: product.depositDetail.minPeriodMonths,
        maxPeriodMonths: product.depositDetail.maxPeriodMonths,
        earlyWithdrawalPenaltyRate:
          product.depositDetail.earlyWithdrawalPenaltyRate != null
            ? Number(product.depositDetail.earlyWithdrawalPenaltyRate)
            : null,
        prepaymentAllowed: product.depositDetail.prepaymentAllowed,
        deferralAllowed: product.depositDetail.deferralAllowed,
      }
    : null

  const loanDetail = product.loanDetail
    ? {
        loanType: product.loanDetail.loanType,
        baseRateType: product.loanDetail.baseRateType,
        interestType: product.loanDetail.interestType,
        maxLtvRatio: product.loanDetail.maxLtvRatio != null ? Number(product.loanDetail.maxLtvRatio) : null,
        maxDtiRatio: product.loanDetail.maxDtiRatio != null ? Number(product.loanDetail.maxDtiRatio) : null,
        collateralRequired: product.loanDetail.collateralRequired,
        collateralType: product.loanDetail.collateralType,
        lienAvailable: product.loanDetail.lienAvailable,
        minLoanAmount: product.loanDetail.minLoanAmount != null ? Number(product.loanDetail.minLoanAmount) : null,
        maxLoanAmount: product.loanDetail.maxLoanAmount != null ? Number(product.loanDetail.maxLoanAmount) : null,
        maxLoanPeriodMonths: product.loanDetail.maxLoanPeriodMonths,
        repaymentMethod: product.loanDetail.repaymentMethod,
        earlyRepaymentAllowed: product.loanDetail.earlyRepaymentAllowed,
        earlyRepaymentFeeRate:
          product.loanDetail.earlyRepaymentFeeRate != null
            ? Number(product.loanDetail.earlyRepaymentFeeRate)
            : null,
        overdueInterestRate:
          product.loanDetail.overdueInterestRate != null
            ? Number(product.loanDetail.overdueInterestRate)
            : null,
      }
    : null

  const productRates = product.productRates.map((r) => ({
    rateType: r.rateType,
    rateStructure: r.rateStructure,
    rate: Number(r.rate),
    effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
  }))

  const productRateTiers = product.productRateTiers.map((t) => ({
    tierType: t.tierType,
    minValue: t.minValue != null ? Number(t.minValue) : null,
    maxValue: t.maxValue != null ? Number(t.maxValue) : null,
    rate: Number(t.rate),
  }))

  const productRateBenefits = product.productRateBenefits.map((b) => ({
    benefitName: b.benefitName,
    benefitRate: Number(b.benefitRate),
    conditionDescription: b.conditionDescription,
  }))

  const productFees = product.productFees.map((f) => ({
    feeType: f.feeType,
    channel: f.channel,
    feeAmount: f.feeAmount != null ? Number(f.feeAmount) : null,
    feeRate: f.feeRate != null ? Number(f.feeRate) : null,
    waiverCondition: f.waiverCondition,
  }))

  const productTerms = product.productTerms.map((t) => ({
    termsId: t.termsId,
    termsType: t.termsType,
    version: t.version,
    effectiveDate: t.effectiveDate,
    contentUrl: t.contentUrl,
  }))

  // 챗봇 컨텍스트
  const productTypeLabel = isTimeDeposit ? "정기예금" : isSavings ? "적금" : isLoan ? "대출" : product.productTypeCode
  const productLines: string[] = [
    `[현재 조회 중인 상품]`,
    `상품명: ${product.productName}`,
    `종류: ${productTypeLabel}`,
  ]
  if (rateStr) productLines.push(`기준금리: ${rateStr} (세전)`)
  if (depositDetail?.minPeriodMonths != null && depositDetail.maxPeriodMonths != null) {
    productLines.push(
      depositDetail.minPeriodMonths === depositDetail.maxPeriodMonths
        ? `가입기간: ${depositDetail.minPeriodMonths}개월`
        : `가입기간: ${depositDetail.minPeriodMonths}~${depositDetail.maxPeriodMonths}개월`
    )
  }
  if (depositDetail?.minAmount != null)
    productLines.push(`${isSavings ? "최소 월 납입금" : "최소 예치금액"}: ${depositDetail.minAmount.toLocaleString("ko-KR")}원`)
  if (loanDetail?.maxLoanAmount != null)
    productLines.push(`최대 대출한도: ${loanDetail.maxLoanAmount.toLocaleString("ko-KR")}원`)
  if (product.isDepositInsured)
    productLines.push(`예금자보호: 최고 ${Number(product.depositInsuranceLimit).toLocaleString("ko-KR")}원`)
  if (productRateBenefits.length > 0)
    productLines.push(`우대혜택: ${productRateBenefits.map((b) => b.benefitName).join(", ")}`)

  const productContext = productLines.join("\n")

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-6">
      {/* 헤더 배너 */}
      <div className={`rounded-2xl p-5 mb-5 text-white ${isLoan ? "bg-gradient-to-br from-blue-700 to-blue-500" : "bg-kb-navy"}`}>
        <p className="text-white/60 text-xs mb-1">{productTypeLabel}</p>
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
            <span className="text-white font-bold text-xl">
              {(loanDetail.maxLtvRatio * 100).toFixed(0)}%
            </span>
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

      {/* 탭 섹션 */}
      <div className="mb-6">
        <ProductDetailTabs
          description={product.description}
          isDepositInsured={product.isDepositInsured}
          depositInsuranceLimit={
            product.depositInsuranceLimit != null ? Number(product.depositInsuranceLimit) : null
          }
          depositDetail={depositDetail}
          loanDetail={loanDetail}
          productRates={productRates}
          productRateTiers={productRateTiers}
          productRateBenefits={productRateBenefits}
          productFees={productFees}
          productTerms={productTerms}
          termsUrls={termsUrls}
          isDeposit={isDeposit}
          isLoan={isLoan}
          isSavings={isSavings}
          isTimeDeposit={isTimeDeposit}
        />
      </div>

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

      <ChatPopup contextUrls={termsUrls} productContext={productContext} />
    </div>
  )
}
