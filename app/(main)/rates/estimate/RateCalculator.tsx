"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

type ProductType = "deposit" | "savings" | "loan"

const PRODUCTS: { type: ProductType; label: string; rate: number }[] = [
  { type: "deposit", label: "정기예금", rate: 0.035 },
  { type: "savings", label: "적금",     rate: 0.040 },
  { type: "loan",    label: "대출",     rate: 0.055 },
]

const PERIODS = [3, 6, 12, 24, 36]
const TAX_RATE = 0.154

function fmt(n: number) {
  return Math.round(n).toLocaleString("ko-KR") + "원"
}

function calcDeposit(principal: number, rate: number, months: number) {
  const interest    = principal * rate * (months / 12)
  const tax         = interest * TAX_RATE
  const netInterest = interest - tax
  return { interest, tax, netInterest, total: principal + netInterest }
}

function calcSavings(monthly: number, rate: number, months: number) {
  const totalPrincipal = monthly * months
  const interest       = monthly * (rate / 12) * (months * (months + 1) / 2)
  const tax            = interest * TAX_RATE
  const netInterest    = interest - tax
  return { totalPrincipal, interest, tax, netInterest, total: totalPrincipal + netInterest }
}

function calcLoan(principal: number, rate: number, months: number) {
  const mr      = rate / 12
  const monthly = principal * mr * Math.pow(1 + mr, months) / (Math.pow(1 + mr, months) - 1)
  const total   = monthly * months
  return { monthly, total, totalInterest: total - principal }
}

const inputCls =
  "w-full border border-kb-gray-border rounded-xl px-3 py-2.5 text-sm text-kb-navy focus:outline-none focus:ring-2 focus:ring-kb-navy/30 bg-white"

export default function RateCalculator() {
  const [productType, setProductType] = useState<ProductType>("deposit")
  const [amountStr,   setAmountStr]   = useState("")
  const [months,      setMonths]      = useState(12)

  const product = PRODUCTS.find((p) => p.type === productType)!
  const amount  = parseInt(amountStr.replace(/,/g, ""), 10) || 0

  function handleAmountChange(v: string) {
    const digits = v.replace(/[^0-9]/g, "")
    setAmountStr(digits ? Number(digits).toLocaleString("ko-KR") : "")
  }

  function handleProductChange(type: ProductType) {
    setProductType(type)
    setAmountStr("")
  }

  const quickAmounts =
    productType === "savings"
      ? [100_000, 300_000, 500_000]
      : [1_000_000, 5_000_000, 10_000_000]

  type Row = { label: string; value: string; color?: "accent" | "red" }

  let rows: Row[]             = []
  let highlightLabel          = ""
  let highlightValue          = ""
  let highlightSub: string | undefined

  if (amount > 0) {
    if (productType === "deposit") {
      const { interest, tax, netInterest, total } = calcDeposit(amount, product.rate, months)
      rows = [
        { label: "예치원금",          value: fmt(amount) },
        { label: "세전이자",          value: fmt(interest) },
        { label: "이자소득세 (15.4%)", value: `-${fmt(tax)}`,        color: "red" },
        { label: "세후이자",          value: fmt(netInterest),       color: "accent" },
      ]
      highlightLabel = "만기수령액"
      highlightValue = fmt(total)
    } else if (productType === "savings") {
      const { totalPrincipal, interest, tax, netInterest, total } = calcSavings(amount, product.rate, months)
      rows = [
        { label: "총 납입금",          value: fmt(totalPrincipal) },
        { label: "세전이자",           value: fmt(interest) },
        { label: "이자소득세 (15.4%)", value: `-${fmt(tax)}`,        color: "red" },
        { label: "세후이자",           value: fmt(netInterest),      color: "accent" },
      ]
      highlightLabel = "만기수령액"
      highlightValue = fmt(total)
    } else {
      const { monthly, total, totalInterest } = calcLoan(amount, product.rate, months)
      rows = [
        { label: "대출원금",  value: fmt(amount) },
        { label: "월 상환액", value: fmt(monthly),      color: "accent" },
        { label: "총 이자",   value: fmt(totalInterest), color: "red" },
        { label: "총 상환액", value: fmt(total) },
      ]
      highlightLabel = "월 납부액"
      highlightValue = fmt(monthly)
      highlightSub   = `총 ${months}회 · 합계 ${fmt(total)}`
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-kb-yellow/10 border border-kb-yellow/40 rounded-xl px-4 py-3 text-xs text-kb-navy/70">
        예상 금리 계산 결과는 참고용이며 실제 적용 금리 및 이자와 다를 수 있습니다.
      </div>

      {/* 입력 카드 */}
      <div className="bg-white rounded-2xl shadow-card p-4 space-y-4">

        {/* 상품 탭 */}
        <div className="flex gap-2">
          {PRODUCTS.map((p) => (
            <button
              key={p.type}
              onClick={() => handleProductChange(p.type)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-medium transition-all",
                productType === p.type
                  ? "bg-kb-navy text-white font-semibold"
                  : "bg-kb-gray-light text-kb-gray hover:bg-kb-yellow/20",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 기준금리 뱃지 */}
        <div className="flex items-center justify-between px-3 py-2 bg-kb-gray-light rounded-xl">
          <span className="text-xs text-kb-gray">기준금리 (연)</span>
          <span className="text-sm font-bold text-kb-navy tabular-nums">
            {(product.rate * 100).toFixed(2)}%
          </span>
        </div>

        {/* 금액 입력 */}
        <div>
          <p className="text-xs font-semibold text-kb-gray mb-2">
            {productType === "savings" ? "월 납입금액" : productType === "loan" ? "대출금액" : "예치금액"}
          </p>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amountStr}
              onChange={(e) => handleAmountChange(e.target.value)}
              className={cn(inputCls, "pr-8 tabular-nums")}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-kb-gray text-sm">원</span>
          </div>
          <div className="flex gap-2 mt-2">
            {quickAmounts.map((v) => (
              <button
                key={v}
                onClick={() =>
                  setAmountStr(
                    (Number(amountStr.replace(/,/g, "") || 0) + v).toLocaleString("ko-KR"),
                  )
                }
                className="flex-1 py-1.5 text-xs bg-kb-gray-light text-kb-navy rounded-lg border border-kb-gray-border hover:bg-kb-yellow/20"
              >
                +{v >= 10_000_000 ? `${v / 10_000_000}천만` : `${v / 10_000}만`}
              </button>
            ))}
          </div>
        </div>

        {/* 기간 선택 */}
        <div>
          <p className="text-xs font-semibold text-kb-gray mb-2">기간</p>
          <div className="flex gap-2">
            {PERIODS.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-medium transition-all",
                  months === m
                    ? "bg-kb-yellow text-kb-navy font-semibold"
                    : "bg-kb-gray-light text-kb-gray hover:bg-kb-yellow/20",
                )}
              >
                {m}개월
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 결과 카드 */}
      {amount > 0 ? (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="divide-y divide-kb-gray-border">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-kb-gray">{row.label}</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    row.color === "accent" ? "text-kb-navy" :
                    row.color === "red"    ? "text-red-500" : "text-kb-navy",
                  )}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-5 py-4 bg-kb-navy">
            <span className="text-sm font-medium text-white/80">{highlightLabel}</span>
            <div className="text-right">
              <p className="text-xl font-bold text-kb-yellow tabular-nums">{highlightValue}</p>
              {highlightSub && (
                <p className="text-xs text-white/60 mt-0.5">{highlightSub}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center py-10 text-kb-gray text-sm">
          금액을 입력하면 예상 결과를 확인할 수 있습니다.
        </p>
      )}
    </div>
  )
}
