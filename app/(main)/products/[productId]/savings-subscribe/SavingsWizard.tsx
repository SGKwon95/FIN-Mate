"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, ChevronRight, AlertCircle, PiggyBank } from "lucide-react"
import { formatKRW, maskAccountNumber } from "@/lib/formatters"
import { subscribeSavings } from "./actions"

type Account = {
  accountId: string
  accountNumber: string
  accountPurpose: string | null
  balance: string
}

type Product = {
  productId: string
  productName: string
  rate: number
  minAmount: number
  maxAmount: number
  minPeriodMonths: number
  maxPeriodMonths: number
}

type Step = "form" | "confirm" | "done"

const ACCOUNT_LABEL: Record<string, string> = {
  GENERAL: "입출금",
  SALARY:  "급여",
  SAVINGS: "적금",
}

const PERIOD_OPTIONS = [6, 12, 24, 36]

export default function SavingsWizard({
  product,
  accounts,
}: {
  product: Product
  accounts: Account[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>("form")

  const [fromId, setFromId] = useState(accounts[0]?.accountId ?? "")
  const [amountStr, setAmountStr] = useState("")
  const [periodMonths, setPeriodMonths] = useState(
    PERIOD_OPTIONS.find(p => p >= product.minPeriodMonths && p <= product.maxPeriodMonths) ?? product.minPeriodMonths
  )
  const [errorMsg, setErrorMsg] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [doneAccountNumber, setDoneAccountNumber] = useState("")

  const fromAccount = accounts.find(a => a.accountId === fromId)
  const monthly = Number(amountStr.replace(/,/g, ""))
  const totalPrincipal = monthly * periodMonths
  // 정액 적금 단리 이자: 월 × 기간 × 금리 × (기간+1) / (2×12)
  const expectedInterest = Math.floor(monthly * periodMonths * product.rate * (periodMonths + 1) / (2 * 12))
  const expectedTotal = totalPrincipal + expectedInterest

  function validate(): string {
    if (!fromId) return "출금 계좌를 선택해주세요."
    if (!monthly || monthly < product.minAmount) return `최소 월 납입금액은 ${formatKRW(product.minAmount)}입니다.`
    if (product.maxAmount && monthly > product.maxAmount) return `최대 월 납입금액은 ${formatKRW(product.maxAmount)}입니다.`
    if (monthly > Number(fromAccount?.balance ?? 0)) return "1회차 납입금이 잔액을 초과합니다."
    return ""
  }

  function goConfirm() {
    const err = validate()
    if (err) { setErrorMsg(err); return }
    setErrorMsg("")
    setIdempotencyKey(crypto.randomUUID())
    setStep("confirm")
  }

  function doSubscribe() {
    startTransition(async () => {
      const res = await subscribeSavings({
        productId: product.productId,
        fromAccountId: fromId,
        monthlyAmount: monthly,
        periodMonths,
        idempotencyKey,
      })
      if (res.ok) {
        setDoneAccountNumber(res.accountNumber)
        setStep("done")
      } else {
        setErrorMsg(res.message)
        setStep("form")
      }
    })
  }

  function handleAmountChange(val: string) {
    const digits = val.replace(/\D/g, "")
    setAmountStr(digits ? Number(digits).toLocaleString("ko-KR") : "")
  }

  // ── 완료 ──────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-xl font-bold text-kb-navy mb-1">가입 완료</h2>
        <p className="text-kb-gray text-sm mb-1">{product.productName}</p>
        <p className="text-kb-navy font-bold text-lg mb-1">월 {formatKRW(monthly)}</p>
        <p className="text-xs text-kb-gray mb-1">{periodMonths}개월 · 연 {(product.rate * 100).toFixed(2)}%</p>
        <p className="text-xs text-kb-gray/60 mb-8 font-mono">{doneAccountNumber}</p>
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push("/accounts")}
            className="flex-1 py-3 rounded-xl border border-kb-gray-border text-kb-navy font-semibold text-sm"
          >
            내 계좌
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex-1 py-3 rounded-xl bg-kb-navy text-white font-semibold text-sm"
          >
            홈으로
          </button>
        </div>
      </div>
    )
  }

  // ── 확인 ──────────────────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-kb-gray text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> 수정
        </button>
        <h2 className="text-lg font-bold text-kb-navy mb-6">가입 확인</h2>

        <div className="bg-white rounded-2xl shadow-card divide-y divide-kb-gray-border">
          <Row label="상품명"><span className="text-sm font-semibold text-kb-navy">{product.productName}</span></Row>
          <Row label="출금 계좌">
            <span className="text-right">
              <span className="block text-sm font-semibold text-kb-navy">
                {ACCOUNT_LABEL[fromAccount?.accountPurpose ?? ""] ?? "계좌"}
              </span>
              <span className="block text-xs text-kb-gray font-mono">
                {maskAccountNumber(fromAccount!.accountNumber)}
              </span>
            </span>
          </Row>
          <Row label="월 납입금"><span className="text-kb-navy font-bold">{formatKRW(monthly)}</span></Row>
          <Row label="납입기간"><span className="text-sm text-kb-navy font-semibold">{periodMonths}개월</span></Row>
          <Row label="총 납입원금"><span className="text-sm text-kb-navy font-semibold">{formatKRW(totalPrincipal)}</span></Row>
          <Row label="적용금리"><span className="text-kb-yellow font-bold">연 {(product.rate * 100).toFixed(2)}%</span></Row>
          <Row label="만기 예상 이자">
            <span className="text-right">
              <span className="block text-sm font-semibold text-green-600">+{formatKRW(expectedInterest)}</span>
              <span className="block text-xs text-kb-gray">만기수령 {formatKRW(expectedTotal)}</span>
            </span>
          </Row>
        </div>

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
          </div>
        )}

        <button
          onClick={doSubscribe}
          disabled={isPending}
          className="mt-6 w-full py-4 bg-kb-navy text-white font-bold rounded-2xl text-base disabled:opacity-60 active:scale-[0.98] transition-transform"
        >
          {isPending ? "처리 중…" : "가입하기"}
        </button>
      </div>
    )
  }

  // ── 폼 ────────────────────────────────────────────────
  const filteredPeriods = PERIOD_OPTIONS.filter(
    p => p >= product.minPeriodMonths && p <= product.maxPeriodMonths
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* 상품 헤더 */}
      <div className="bg-kb-navy rounded-2xl p-4 mb-5 text-white">
        <p className="text-white/60 text-xs mb-1">적금</p>
        <p className="font-bold text-base">{product.productName}</p>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-kb-yellow font-bold text-2xl">연 {(product.rate * 100).toFixed(2)}%</span>
          <span className="text-white/60 text-xs">(세전, 단리)</span>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <PiggyBank className="w-3 h-3 text-green-400" />
          <span className="text-green-400 text-[10px]">예금자보호 5천만원</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* 출금 계좌 */}
        <div className="bg-white rounded-2xl shadow-card p-4">
          <p className="text-xs text-kb-gray font-medium mb-2">출금 계좌</p>
          <select
            value={fromId}
            onChange={e => setFromId(e.target.value)}
            className="w-full bg-transparent text-kb-navy font-semibold text-sm outline-none"
          >
            {accounts.map(a => (
              <option key={a.accountId} value={a.accountId}>
                {ACCOUNT_LABEL[a.accountPurpose ?? ""] ?? "계좌"} — {maskAccountNumber(a.accountNumber)} ({formatKRW(a.balance)})
              </option>
            ))}
          </select>
          {fromAccount && (
            <p className="text-xs text-kb-gray mt-1">
              잔액 <span className="font-semibold text-kb-navy">{formatKRW(fromAccount.balance)}</span>
            </p>
          )}
        </div>

        {/* 월 납입금액 */}
        <div className="bg-white rounded-2xl shadow-card p-4">
          <p className="text-xs text-kb-gray font-medium mb-2">월 납입금액</p>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amountStr}
              onChange={e => handleAmountChange(e.target.value)}
              className="flex-1 text-2xl font-bold text-kb-navy placeholder:text-kb-gray/30 outline-none tabular-nums"
            />
            <span className="text-kb-gray font-medium">원</span>
          </div>
          <p className="text-xs text-kb-gray/60 mt-1">최소 {formatKRW(product.minAmount)} / 월</p>
        </div>

        {/* 납입 기간 */}
        {filteredPeriods.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-4">
            <p className="text-xs text-kb-gray font-medium mb-3">납입 기간</p>
            <div className="flex gap-2">
              {filteredPeriods.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodMonths(p)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    periodMonths === p
                      ? "bg-kb-navy text-white border-kb-navy"
                      : "bg-white text-kb-navy border-kb-gray-border"
                  }`}
                >
                  {p}개월
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 만기 예상 */}
        {monthly >= product.minAmount && (
          <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
            <p className="text-xs text-green-700 font-medium mb-1">만기 예상 수령액</p>
            <p className="text-green-800 font-bold text-lg">{formatKRW(expectedTotal)}</p>
            <p className="text-xs text-green-600 mt-0.5">
              원금 {formatKRW(totalPrincipal)} + 이자 +{formatKRW(expectedInterest)} (세전)
            </p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-4 flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
        </div>
      )}

      <button
        onClick={goConfirm}
        className="mt-6 w-full py-4 bg-kb-navy text-white font-bold rounded-2xl text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        다음 <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-kb-gray">{label}</span>
      {children}
    </div>
  )
}
