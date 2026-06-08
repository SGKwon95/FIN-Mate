'use client'

import { useState } from 'react'
import { CheckCircle, FileText, ExternalLink, Shield, AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatKRWShort } from '@/lib/formatters'

// ── 타입 ────────────────────────────────────────────────────

export interface ProductRate {
  rateType: string
  rateStructure: string
  rate: number
  effectiveFrom: string
}

export interface ProductRateTier {
  tierType: string
  minValue: number | null
  maxValue: number | null
  rate: number
}

export interface ProductRateBenefit {
  benefitName: string
  benefitRate: number
  conditionDescription: string | null
}

export interface ProductFee {
  feeType: string
  channel: string
  feeAmount: number | null
  feeRate: number | null
  waiverCondition: string | null
}

export interface ProductTermsItem {
  termsId: string
  termsType: string
  version: string
  effectiveDate: string
  contentUrl: string | null
}

export interface DepositDetailData {
  transactionType: string
  interestType: string
  rateType: string
  minAmount: number | null
  maxAmount: number | null
  minPeriodMonths: number | null
  maxPeriodMonths: number | null
  earlyWithdrawalPenaltyRate: number | null
  prepaymentAllowed: boolean
  deferralAllowed: boolean
}

export interface LoanDetailData {
  loanType: string
  baseRateType: string
  interestType: string
  maxLtvRatio: number | null
  maxDtiRatio: number | null
  collateralRequired: boolean
  collateralType: string | null
  lienAvailable: boolean
  minLoanAmount: number | null
  maxLoanAmount: number | null
  maxLoanPeriodMonths: number | null
  repaymentMethod: string
  earlyRepaymentAllowed: boolean
  earlyRepaymentFeeRate: number | null
  overdueInterestRate: number | null
}

export interface ProductDetailTabsProps {
  description: string | null
  isDepositInsured: boolean
  depositInsuranceLimit: number | null
  depositDetail: DepositDetailData | null
  loanDetail: LoanDetailData | null
  productRates: ProductRate[]
  productRateTiers: ProductRateTier[]
  productRateBenefits: ProductRateBenefit[]
  productFees: ProductFee[]
  productTerms: ProductTermsItem[]
  termsUrls: string[]
  isDeposit: boolean
  isLoan: boolean
  isSavings: boolean
  isTimeDeposit: boolean
}

// ── 레이블 맵 ────────────────────────────────────────────────

const FEE_TYPE_LABEL: Record<string, string> = {
  TRANSFER: '이체수수료',
  AUTO_TRANSFER: '자동이체수수료',
  WITHDRAWAL: '출금수수료',
  DEPOSIT: '입금수수료',
  EARLY_REPAYMENT: '중도상환수수료',
  OTHER: '기타',
}
const CHANNEL_LABEL: Record<string, string> = {
  ALL: '전 채널',
  APP: '앱',
  ATM: 'ATM',
  TELLER: '창구',
  INTERNET: '인터넷뱅킹',
  BRANCH: '영업점',
  PHONE: '전화',
}
const TERMS_TYPE_LABEL: Record<string, string> = {
  BASIC: '기본약관',
  TYPE_SPECIFIC: '상품별약관',
  PRODUCT_GUIDE: '상품설명서',
}
const LOAN_TYPE_LABEL: Record<string, string> = {
  MORTGAGE: '담보대출',
  JEONSE: '전세자금대출',
  CREDIT: '신용대출',
  OVERDRAFT: '마이너스통장',
}
const BASE_RATE_TYPE_LABEL: Record<string, string> = {
  COFIX: 'COFIX 연동',
  CD: 'CD금리 연동',
  PRIME: '프라임레이트',
  FIXED: '고정 기준금리',
}
const INTEREST_TYPE_LABEL: Record<string, string> = {
  FIXED: '고정금리',
  VARIABLE: '변동금리',
}
const RATE_TYPE_LABEL: Record<string, string> = {
  FIXED: '고정',
  VARIABLE: '변동',
}
const REPAYMENT_LABEL: Record<string, string> = {
  EQUAL_INSTALLMENT: '원리금균등상환',
  EQUAL_PRINCIPAL: '원금균등상환',
  BULLET: '만기일시상환',
}
const COLLATERAL_LABEL: Record<string, string> = {
  REAL_ESTATE: '부동산',
  JEONSE_RIGHT: '전세권',
}

// ── 섹션 정의 ────────────────────────────────────────────────

const SECTIONS = ['상품안내', '금리정보', '수수료정보', '기타사항', '약관/설명서'] as const
type Section = (typeof SECTIONS)[number]

// ── 공통 Row 컴포넌트 ─────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 gap-4">
      <span className="text-xs text-kb-gray shrink-0">{label}</span>
      <span className="text-sm font-semibold text-kb-navy text-right">{children}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-kb-gray uppercase tracking-wide pt-3 pb-1">
      {children}
    </p>
  )
}

// ── 탭 패널들 ────────────────────────────────────────────────

function TabProductInfo({
  description,
  isDepositInsured,
  depositInsuranceLimit,
  depositDetail,
  loanDetail,
  productRateBenefits,
  isSavings,
}: Pick<
  ProductDetailTabsProps,
  | 'description'
  | 'isDepositInsured'
  | 'depositInsuranceLimit'
  | 'depositDetail'
  | 'loanDetail'
  | 'productRateBenefits'
  | 'isSavings'
>) {
  const hasBasicInfo = depositDetail || loanDetail
  return (
    <div>
      {/* 상품 설명 */}
      {description && (
        <p className="text-sm text-kb-navy leading-relaxed whitespace-pre-line">{description}</p>
      )}

      {/* 기본 정보 */}
      {hasBasicInfo && (
        <div className={cn('mt-3 divide-y divide-kb-gray-border', description && 'border-t border-kb-gray-border')}>
          {depositDetail && (
            <>
              {depositDetail.minPeriodMonths != null &&
                depositDetail.maxPeriodMonths != null && (
                  <Row label="가입 기간">
                    {depositDetail.minPeriodMonths === depositDetail.maxPeriodMonths
                      ? `${depositDetail.minPeriodMonths}개월`
                      : `${depositDetail.minPeriodMonths}~${depositDetail.maxPeriodMonths}개월`}
                  </Row>
                )}
              {depositDetail.minAmount != null && (
                <Row label={isSavings ? '최소 월 납입금' : '최소 가입금액'}>
                  {depositDetail.minAmount.toLocaleString('ko-KR')}원
                </Row>
              )}
              {depositDetail.maxAmount != null && (
                <Row label={isSavings ? '최대 월 납입금' : '최대 가입금액'}>
                  {depositDetail.maxAmount.toLocaleString('ko-KR')}원
                </Row>
              )}
              <Row label="이자 방식">
                {depositDetail.interestType === 'SIMPLE' ? '단리' : '복리'}
              </Row>
              <Row label="금리 유형">
                {RATE_TYPE_LABEL[depositDetail.rateType] ?? depositDetail.rateType}
              </Row>
            </>
          )}
          {loanDetail && (
            <>
              {loanDetail.minLoanAmount != null && (
                <Row label="최소 대출금액">
                  {formatKRWShort(loanDetail.minLoanAmount)}
                </Row>
              )}
              {loanDetail.maxLoanAmount != null && (
                <Row label="최대 대출한도">
                  {formatKRWShort(loanDetail.maxLoanAmount)}
                </Row>
              )}
              {loanDetail.maxLoanPeriodMonths != null && (
                <Row label="최대 대출기간">{loanDetail.maxLoanPeriodMonths}개월</Row>
              )}
              {loanDetail.collateralType && (
                <Row label="담보 유형">
                  {COLLATERAL_LABEL[loanDetail.collateralType] ?? loanDetail.collateralType}
                </Row>
              )}
              <Row label="상환 방식">
                {REPAYMENT_LABEL[loanDetail.repaymentMethod] ?? loanDetail.repaymentMethod}
              </Row>
            </>
          )}
        </div>
      )}

      {/* 예금자보호 */}
      {isDepositInsured && (
        <div className="mt-3 bg-green-50 rounded-xl p-3 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-green-700">예금자보호 대상 상품</p>
            <p className="text-xs text-green-600 mt-0.5 leading-relaxed">
              예금보험공사가 보호하며 한도는{' '}
              <strong>{depositInsuranceLimit?.toLocaleString('ko-KR')}원</strong>입니다.
            </p>
          </div>
        </div>
      )}

      {/* 우대 혜택 */}
      {productRateBenefits.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-kb-gray mb-2">우대 혜택</p>
          <ul className="space-y-2">
            {productRateBenefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-kb-navy font-medium">{b.benefitName}</p>
                  {b.conditionDescription && (
                    <p className="text-[11px] text-kb-gray mt-0.5 leading-relaxed">
                      {b.conditionDescription}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TabRateInfo({
  productRates,
  productRateTiers,
  productRateBenefits,
  isLoan,
}: Pick<ProductDetailTabsProps, 'productRates' | 'productRateTiers' | 'productRateBenefits' | 'isLoan'>) {
  const baseRates = productRates.filter((r) => r.rateType === 'BASE')
  const spreadRates = productRates.filter((r) => r.rateType === 'SPREAD')

  const totalBase = baseRates.reduce((s, r) => s + r.rate, 0)
  const totalSpread = spreadRates.reduce((s, r) => s + r.rate, 0)
  const totalBenefit = productRateBenefits.reduce((s, b) => s + b.benefitRate, 0)

  if (productRates.length === 0 && productRateTiers.length === 0) {
    return (
      <p className="text-xs text-kb-gray flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 opacity-40" />
        현재 적용 중인 금리 정보가 없습니다.
      </p>
    )
  }

  return (
    <div>
      {/* 기준금리 */}
      {baseRates.length > 0 && (
        <div className="divide-y divide-kb-gray-border">
          {baseRates.map((r, i) => (
            <Row key={i} label={`기준금리 · ${r.rateStructure === 'FIXED' ? '고정' : '변동'}`}>
              <span className="font-bold">연 {(r.rate * 100).toFixed(2)}%</span>
            </Row>
          ))}
        </div>
      )}

      {/* 가산금리 (대출) */}
      {isLoan && spreadRates.length > 0 && (
        <>
          <SectionTitle>가산금리</SectionTitle>
          <div className="divide-y divide-kb-gray-border border-t border-kb-gray-border">
            {spreadRates.map((r, i) => (
              <Row key={i} label="가산">
                연 {(r.rate * 100).toFixed(2)}%
              </Row>
            ))}
          </div>
        </>
      )}

      {/* 적용금리 요약 (대출) */}
      {isLoan && baseRates.length > 0 && (
        <div className="mt-3 bg-kb-navy rounded-xl p-3 text-white">
          <p className="text-xs text-white/60 mb-1">최종 적용금리 (기준 + 가산)</p>
          <p className="text-xl font-bold text-kb-yellow">
            연 {((totalBase + totalSpread) * 100).toFixed(2)}%
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">* 우대금리 적용 전</p>
        </div>
      )}

      {/* 구간별 금리 */}
      {productRateTiers.length > 0 && (
        <>
          <SectionTitle>구간별 금리</SectionTitle>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-xs">
              <thead className="bg-kb-gray-light">
                <tr>
                  <th className="px-4 py-2 text-left text-kb-gray font-medium">구분</th>
                  <th className="px-4 py-2 text-left text-kb-gray font-medium">구간</th>
                  <th className="px-4 py-2 text-right text-kb-gray font-medium">금리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kb-gray-border">
                {productRateTiers.map((t, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-kb-gray">
                      {t.tierType === 'AMOUNT' ? '금액' : '기간'}
                    </td>
                    <td className="px-4 py-2.5 text-kb-navy">
                      {t.minValue != null && t.maxValue != null
                        ? t.tierType === 'AMOUNT'
                          ? `${t.minValue.toLocaleString('ko-KR')}~${t.maxValue.toLocaleString('ko-KR')}원`
                          : `${t.minValue}~${t.maxValue}개월`
                        : t.minValue != null
                        ? t.tierType === 'AMOUNT'
                          ? `${t.minValue.toLocaleString('ko-KR')}원 이상`
                          : `${t.minValue}개월 이상`
                        : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-kb-navy">
                      연 {(t.rate * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 우대금리 */}
      {productRateBenefits.length > 0 && (
        <>
          <SectionTitle>우대금리 혜택</SectionTitle>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-xs">
              <thead className="bg-kb-gray-light">
                <tr>
                  <th className="px-4 py-2 text-left text-kb-gray font-medium">혜택명</th>
                  <th className="px-4 py-2 text-right text-kb-gray font-medium">우대금리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kb-gray-border">
                {productRateBenefits.map((b, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-kb-navy">{b.benefitName}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600">
                      +{(b.benefitRate * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalBenefit > 0 && (
            <div className="flex justify-between items-center pt-2.5 mt-1 border-t border-kb-gray-border">
              <span className="text-xs text-kb-gray">최대 우대금리 합계</span>
              <span className="text-sm font-bold text-green-600">+{(totalBenefit * 100).toFixed(2)}%</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabFeeInfo({ productFees }: Pick<ProductDetailTabsProps, 'productFees'>) {
  if (productFees.length === 0) {
    return (
      <p className="text-xs text-kb-gray flex items-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5 opacity-40" />
        현재 적용 중인 수수료가 없습니다.
      </p>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-xs">
          <thead className="bg-kb-gray-light">
            <tr>
              <th className="px-4 py-2 text-left text-kb-gray font-medium">구분</th>
              <th className="px-4 py-2 text-left text-kb-gray font-medium">채널</th>
              <th className="px-4 py-2 text-right text-kb-gray font-medium">수수료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kb-gray-border">
            {productFees.map((f, i) => (
              <tr key={i}>
                <td className="px-4 py-2.5 text-kb-navy">
                  {FEE_TYPE_LABEL[f.feeType] ?? f.feeType}
                </td>
                <td className="px-4 py-2.5 text-kb-gray">
                  {CHANNEL_LABEL[f.channel] ?? f.channel}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-kb-navy">
                  {f.feeAmount != null
                    ? `${f.feeAmount.toLocaleString('ko-KR')}원`
                    : f.feeRate != null
                    ? `${(f.feeRate * 100).toFixed(2)}%`
                    : '무료'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {productFees.some((f) => f.waiverCondition) && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold text-kb-gray">수수료 면제 조건</p>
          {productFees
            .filter((f) => f.waiverCondition)
            .map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                <p className="text-xs text-kb-navy leading-relaxed">{f.waiverCondition}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function TabOtherInfo({
  depositDetail,
  loanDetail,
  isSavings,
}: Pick<ProductDetailTabsProps, 'depositDetail' | 'loanDetail' | 'isSavings'>) {
  const hasContent = depositDetail || loanDetail

  if (!hasContent) {
    return (
      <p className="text-xs text-kb-gray flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 opacity-40" />
        기타 사항이 없습니다.
      </p>
    )
  }

  return (
    <div>
      {depositDetail && (
        <>
          <SectionTitle>해지 및 중도인출</SectionTitle>
          <div className="divide-y divide-kb-gray-border border-t border-kb-gray-border">
            {depositDetail.earlyWithdrawalPenaltyRate != null && (
              <Row label="중도해지 이율">
                연 {(depositDetail.earlyWithdrawalPenaltyRate * 100).toFixed(2)}%
              </Row>
            )}
            {isSavings && (
              <>
                <Row label="선납 가능 여부">
                  {depositDetail.prepaymentAllowed ? (
                    <span className="text-green-600">가능</span>
                  ) : (
                    <span className="text-kb-gray">불가</span>
                  )}
                </Row>
                <Row label="납입 이연 가능 여부">
                  {depositDetail.deferralAllowed ? (
                    <span className="text-green-600">가능</span>
                  ) : (
                    <span className="text-kb-gray">불가</span>
                  )}
                </Row>
              </>
            )}
          </div>
          <div className="mt-3 bg-amber-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-0.5">중도해지 안내</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              만기 전 해지 시 중도해지 이율이 적용되어 약정 이자보다 낮은 이자를 받을 수 있습니다.
            </p>
          </div>
        </>
      )}

      {loanDetail && (
        <>
          <SectionTitle>대출 조건</SectionTitle>
          <div className="divide-y divide-kb-gray-border border-t border-kb-gray-border">
            <Row label="대출 종류">
              {LOAN_TYPE_LABEL[loanDetail.loanType] ?? loanDetail.loanType}
            </Row>
            <Row label="기준금리 유형">
              {BASE_RATE_TYPE_LABEL[loanDetail.baseRateType] ?? loanDetail.baseRateType}
            </Row>
            <Row label="금리 유형">
              {INTEREST_TYPE_LABEL[loanDetail.interestType] ?? loanDetail.interestType}
            </Row>
            {loanDetail.maxLtvRatio != null && (
              <Row label="최대 LTV">{(loanDetail.maxLtvRatio * 100).toFixed(0)}%</Row>
            )}
            {loanDetail.maxDtiRatio != null && (
              <Row label="최대 DTI">{(loanDetail.maxDtiRatio * 100).toFixed(0)}%</Row>
            )}
            <Row label="근저당 설정">
              {loanDetail.lienAvailable ? (
                <span className="text-green-600">가능</span>
              ) : (
                <span className="text-kb-gray">해당없음</span>
              )}
            </Row>
            <Row label="중도상환 허용">
              {loanDetail.earlyRepaymentAllowed ? (
                <span className="text-green-600">가능</span>
              ) : (
                <span className="text-kb-gray">불가</span>
              )}
            </Row>
          </div>

          {(loanDetail.earlyRepaymentFeeRate != null ||
            loanDetail.overdueInterestRate != null) && (
            <>
              <SectionTitle>연체 및 중도상환</SectionTitle>
              <div className="divide-y divide-kb-gray-border border-t border-kb-gray-border">
                {loanDetail.earlyRepaymentFeeRate != null &&
                  Number(loanDetail.earlyRepaymentFeeRate) > 0 && (
                    <Row label="중도상환수수료">
                      {(loanDetail.earlyRepaymentFeeRate * 100).toFixed(2)}%
                    </Row>
                  )}
                {loanDetail.overdueInterestRate != null &&
                  Number(loanDetail.overdueInterestRate) > 0 && (
                    <Row label="최고 연체이자율">
                      연 {(loanDetail.overdueInterestRate * 100).toFixed(1)}%
                    </Row>
                  )}
              </div>
            </>
          )}

          <div className="mt-3 bg-amber-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-0.5">대출 유의사항</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              대출은 개인의 신용도·소득에 따라 한도 및 금리가 달라질 수 있으며, 과도한 대출은 신용점수 하락의 원인이 될 수 있습니다.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function TabTerms({
  productTerms,
  termsUrls,
}: Pick<ProductDetailTabsProps, 'productTerms' | 'termsUrls'>) {
  const hasContent = productTerms.length > 0 || termsUrls.length > 0

  if (!hasContent) {
    return (
      <p className="text-xs text-kb-gray flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5 opacity-40" />
        등록된 약관 및 설명서가 없습니다.
      </p>
    )
  }

  return (
    <div>
      {productTerms.length > 0 && (
        <>
          <SectionTitle>약관 목록</SectionTitle>
          <ul className="divide-y divide-kb-gray-border border-t border-kb-gray-border">
            {productTerms.map((t) => (
              <li key={t.termsId} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-kb-navy truncate">
                    {TERMS_TYPE_LABEL[t.termsType] ?? t.termsType}
                  </p>
                  <p className="text-[11px] text-kb-gray mt-0.5">
                    ver.{t.version} · 시행일{' '}
                    {t.effectiveDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}
                  </p>
                </div>
                {t.contentUrl ? (
                  <a
                    href={t.contentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-lg border border-kb-gray-border text-xs text-kb-navy hover:bg-kb-gray-light transition-colors"
                  >
                    보기 <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] text-kb-gray shrink-0">URL 미등록</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {termsUrls.length > 0 && (
        <>
          <SectionTitle>상품 약관 원문</SectionTitle>
          <ul className="divide-y divide-kb-gray-border border-t border-kb-gray-border">
            {termsUrls.map((url, i) => {
              const filename = url.split('/').pop() ?? url
              const label = filename.replace('.html', '').replace(/-/g, ' ')
              return (
                <li key={i} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-kb-navy shrink-0" />
                    <p className="text-sm text-kb-navy truncate">{label}</p>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-lg border border-kb-gray-border text-xs text-kb-navy hover:bg-kb-gray-light transition-colors"
                  >
                    보기 <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <p className="text-[11px] text-kb-gray mt-3 leading-relaxed">
        약관은 금융소비자보호법에 따라 가입 전 반드시 확인하시기 바랍니다.
      </p>
    </div>
  )
}

// ── 아코디언 컨테이너 ────────────────────────────────────────

export default function ProductDetailTabs(props: ProductDetailTabsProps) {
  const [openSection, setOpenSection] = useState<Section | null>('상품안내')

  function toggle(section: Section) {
    setOpenSection((prev) => (prev === section ? null : section))
  }

  function renderContent(section: Section) {
    switch (section) {
      case '상품안내':
        return (
          <TabProductInfo
            description={props.description}
            isDepositInsured={props.isDepositInsured}
            depositInsuranceLimit={props.depositInsuranceLimit}
            depositDetail={props.depositDetail}
            loanDetail={props.loanDetail}
            productRateBenefits={props.productRateBenefits}
            isSavings={props.isSavings}
          />
        )
      case '금리정보':
        return (
          <TabRateInfo
            productRates={props.productRates}
            productRateTiers={props.productRateTiers}
            productRateBenefits={props.productRateBenefits}
            isLoan={props.isLoan}
          />
        )
      case '수수료정보':
        return <TabFeeInfo productFees={props.productFees} />
      case '기타사항':
        return (
          <TabOtherInfo
            depositDetail={props.depositDetail}
            loanDetail={props.loanDetail}
            isSavings={props.isSavings}
          />
        )
      case '약관/설명서':
        return <TabTerms productTerms={props.productTerms} termsUrls={props.termsUrls} />
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-kb-gray-border bg-white shadow-card">
      {SECTIONS.map((section, i) => {
        const isOpen = openSection === section
        const isLast = i === SECTIONS.length - 1
        return (
          <div key={section} className={cn(!isLast && 'border-b border-kb-gray-border')}>
            <button
              onClick={() => toggle(section)}
              className="w-full flex items-center justify-between px-4 py-4 text-left"
            >
              <span className={cn('text-sm font-semibold', isOpen ? 'text-kb-navy' : 'text-kb-gray')}>
                {section}
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 shrink-0 transition-transform duration-200',
                  isOpen ? 'rotate-180 text-kb-navy' : 'text-kb-gray',
                )}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-kb-gray-border/60">
                {renderContent(section)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
