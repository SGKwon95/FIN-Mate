"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, ChevronLeft, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatKRWShort } from "@/lib/formatters"
import { submitLoanApplication } from "./actions"

// ── 타입 ────────────────────────────────────────────────────────────────────────

type ProductInfo = {
  productId: string
  productName: string
  baseRate: number
  maxLoanAmount: number | null
  maxLoanPeriodMonths: number | null
}

type MlResult = {
  mlDecision: string
  mlScore: number
  mlDefaultProb: string
  applicationId: string
  applicationStatus: string
}

const PURPOSES = [
  "주택구입", "생활자금", "사업자금", "의료비",
  "교육비", "차량구입", "채무상환", "기타",
]

const HOME_OWNERSHIP_OPTIONS = [
  { value: "OWN", label: "자가" },
  { value: "MORTGAGE", label: "담보" },
  { value: "RENT", label: "전월세" },
  { value: "OTHER", label: "기타" },
]

// ── 컴포넌트 ────────────────────────────────────────────────────────────────────

export default function LoanApplyWizard({ product }: { product: ProductInfo }) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mlResult, setMlResult] = useState<MlResult | null>(null)

  // step 1 - 신청 정보
  const [amount, setAmount] = useState("")
  const [period, setPeriod] = useState("")
  const [purpose, setPurpose] = useState(PURPOSES[0])

  // step 2 - 추가 정보
  const [creditScore, setCreditScore] = useState("")
  const [homeOwnership, setHomeOwnership] = useState("RENT")
  const [dti, setDti] = useState("")
  const [inq, setInq] = useState("0")
  const [pubRec, setPubRec] = useState("0")

  // ── 유효성 ────────────────────────────────────────────────────────────────────

  const amountNum = parseInt(amount.replace(/,/g, ""), 10) || 0
  const periodNum = parseInt(period, 10) || 0
  const creditScoreNum = parseInt(creditScore, 10) || 0
  const dtiNum = parseFloat(dti) || 0

  const step1Valid =
    amountNum >= 100_0000 &&
    (product.maxLoanAmount == null || amountNum <= product.maxLoanAmount) &&
    periodNum >= 1 &&
    (product.maxLoanPeriodMonths == null || periodNum <= product.maxLoanPeriodMonths)

  const step2Valid =
    creditScoreNum >= 300 && creditScoreNum <= 1000 &&
    dtiNum >= 0 && dtiNum <= 100

  // ── 핸들러 ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const { applicationId } = await submitLoanApplication({
        productId: product.productId,
        requestedAmount: amountNum,
        requestedPeriodMonths: periodNum,
        loanPurpose: purpose,
        mlCreditScore: creditScoreNum,
        mlHomeOwnership: homeOwnership,
        mlDti: dtiNum,
        mlInqLast6Mths: parseInt(inq, 10) || 0,
        mlPubRec: parseInt(pubRec, 10) || 0,
      })

      // ML 심사 요청
      const res = await fetch(`/api/loan-applications/${applicationId}/screen`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "심사 중 오류가 발생했습니다")
      }
      const result = await res.json()
      setMlResult({
        mlDecision: result.mlDecision,
        mlScore: result.mlScore,
        mlDefaultProb: (Number(result.mlDefaultProb) * 100).toFixed(1),
        applicationId,
        applicationStatus: result.applicationStatus,
      })
      setStep(3)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* 진행 바 */}
      {step < 3 && (
        <div className="flex items-center gap-2 mb-6">
          {([1, 2] as const).map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                step >= s ? "bg-kb-navy text-white" : "bg-kb-gray-border text-kb-gray"
              )}>
                {s}
              </div>
              {s < 2 && <div className={cn("h-0.5 flex-1", step > s ? "bg-kb-navy" : "bg-kb-gray-border")} />}
            </div>
          ))}
          <span className="text-xs text-kb-gray ml-1">
            {step === 1 ? "신청 정보" : "추가 정보"}
          </span>
        </div>
      )}

      {/* ── STEP 1: 신청 정보 ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-base font-bold text-kb-navy">신청 정보</h2>

          <Field label="대출 금액">
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
                placeholder="10,000,000"
                className="w-full border border-kb-gray-border rounded-xl px-4 py-3 text-sm text-kb-navy pr-10 focus:outline-none focus:border-kb-navy"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-kb-gray">원</span>
            </div>
            {product.maxLoanAmount && (
              <p className="text-[11px] text-kb-gray mt-1">
                최대 {formatKRWShort(product.maxLoanAmount)}
              </p>
            )}
          </Field>

          <Field label="대출 기간 (개월)">
            <input
              type="number"
              min={1}
              max={product.maxLoanPeriodMonths ?? 360}
              value={period}
              onChange={e => setPeriod(e.target.value)}
              placeholder="36"
              className="w-full border border-kb-gray-border rounded-xl px-4 py-3 text-sm text-kb-navy focus:outline-none focus:border-kb-navy"
            />
            {product.maxLoanPeriodMonths && (
              <p className="text-[11px] text-kb-gray mt-1">최대 {product.maxLoanPeriodMonths}개월</p>
            )}
          </Field>

          <Field label="대출 목적">
            <div className="grid grid-cols-4 gap-2">
              {PURPOSES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPurpose(p)}
                  className={cn(
                    "py-2 text-xs rounded-xl border font-medium transition-colors",
                    purpose === p
                      ? "bg-kb-navy text-white border-kb-navy"
                      : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy hover:text-kb-navy"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <button
            type="button"
            disabled={!step1Valid}
            onClick={() => setStep(2)}
            className="flex items-center justify-center gap-2 w-full py-4 bg-kb-navy text-white font-bold rounded-2xl text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            다음 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── STEP 2: 추가 정보 ─────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-base font-bold text-kb-navy">추가 심사 정보</h2>
          <p className="text-xs text-kb-gray -mt-3">
            심사 정확도를 위해 아래 정보를 입력해 주세요.
          </p>

          <Field label="신용점수" hint="300~1000">
            <input
              type="number"
              min={300}
              max={1000}
              value={creditScore}
              onChange={e => setCreditScore(e.target.value)}
              placeholder="700"
              className="w-full border border-kb-gray-border rounded-xl px-4 py-3 text-sm text-kb-navy focus:outline-none focus:border-kb-navy"
            />
          </Field>

          <Field label="주거형태">
            <div className="grid grid-cols-4 gap-2">
              {HOME_OWNERSHIP_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setHomeOwnership(o.value)}
                  className={cn(
                    "py-2 text-xs rounded-xl border font-medium transition-colors",
                    homeOwnership === o.value
                      ? "bg-kb-navy text-white border-kb-navy"
                      : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy hover:text-kb-navy"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="DTI (부채비율 %)" hint="연소득 대비 연간 원리금 상환액 비율">
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={dti}
                onChange={e => setDti(e.target.value)}
                placeholder="20.0"
                className="w-full border border-kb-gray-border rounded-xl px-4 py-3 text-sm text-kb-navy pr-8 focus:outline-none focus:border-kb-navy"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-kb-gray">%</span>
            </div>
          </Field>

          <Field label="최근 6개월 신용조회 수">
            <input
              type="number"
              min={0}
              max={20}
              value={inq}
              onChange={e => setInq(e.target.value)}
              className="w-full border border-kb-gray-border rounded-xl px-4 py-3 text-sm text-kb-navy focus:outline-none focus:border-kb-navy"
            />
          </Field>

          <Field label="공공기록 건수" hint="파산·압류 등">
            <input
              type="number"
              min={0}
              max={10}
              value={pubRec}
              onChange={e => setPubRec(e.target.value)}
              className="w-full border border-kb-gray-border rounded-xl px-4 py-3 text-sm text-kb-navy focus:outline-none focus:border-kb-navy"
            />
          </Field>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center justify-center gap-1 px-4 py-4 border border-kb-gray-border rounded-2xl text-sm text-kb-gray"
            >
              <ChevronLeft className="w-4 h-4" /> 이전
            </button>
            <button
              type="button"
              disabled={!step2Valid || loading}
              onClick={handleSubmit}
              className="flex flex-1 items-center justify-center gap-2 py-4 bg-kb-navy text-white font-bold rounded-2xl text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 심사 중...</>
              ) : (
                <>심사 신청<ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: 심사 결과 ─────────────────────────────────────────────────── */}
      {step === 3 && mlResult && (
        <div className="space-y-5">
          <h2 className="text-base font-bold text-kb-navy">심사 결과</h2>

          {/* 결과 카드 */}
          {mlResult.applicationStatus === "PENDING_REVIEW" ? (
            <div className="rounded-2xl p-6 text-center bg-gradient-to-br from-orange-400 to-amber-500">
              <div className="flex justify-center mb-3">
                <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-2xl font-extrabold text-white mb-1">검토 중</p>
              <p className="text-white/80 text-sm">담당자 확인 후 결과를 안내드립니다</p>
            </div>
          ) : (
            <div className={cn(
              "rounded-2xl p-6 text-center",
              mlResult.applicationStatus === "APPROVED"
                ? "bg-gradient-to-br from-green-500 to-emerald-600"
                : "bg-gradient-to-br from-red-500 to-rose-600"
            )}>
              <div className="flex justify-center mb-3">
                {mlResult.applicationStatus === "APPROVED"
                  ? <CheckCircle2 className="w-12 h-12 text-white" />
                  : <XCircle className="w-12 h-12 text-white" />}
              </div>
              <p className="text-3xl font-extrabold text-white mb-1">
                {mlResult.applicationStatus === "APPROVED" ? "승인" : "거절"}
              </p>
              <p className="text-white/70 text-sm">{product.productName}</p>
            </div>
          )}

          {/* 점수 상세 */}
          <div className="bg-white rounded-2xl shadow-card divide-y divide-kb-gray-border">
            <ScoreRow label="신용점수 (ML)" value={`${mlResult.mlScore}점`} />
            <ScoreRow label="부도 확률" value={`${mlResult.mlDefaultProb}%`} />
            <ScoreRow label="신청 상품" value={product.productName} />
            <ScoreRow label="신청 금액" value={`${amountNum.toLocaleString()}원`} />
            <ScoreRow label="기간" value={`${periodNum}개월`} />
          </div>

          {mlResult.applicationStatus === "PENDING_REVIEW" && (
            <div className="bg-orange-50 rounded-2xl p-4">
              <p className="text-xs text-orange-700 leading-relaxed">
                ML 분석 점수({mlResult.mlScore}점)가 자동 처리 기준에 해당하지 않아 담당자가 추가 검토합니다.
                영업일 기준 1~2일 내 결과를 안내드립니다.
              </p>
            </div>
          )}

          {mlResult.applicationStatus === "REJECTED" && (
            <div className="bg-amber-50 rounded-2xl p-4">
              <p className="text-xs text-amber-700 leading-relaxed">
                현재 정보 기준으로 대출 심사 요건을 충족하지 못했습니다.
                신용점수 개선, 부채 감소 후 재신청하시거나 영업점에 문의하세요.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push("/products/loan")}
            className="flex items-center justify-center w-full py-4 border border-kb-navy text-kb-navy font-bold rounded-2xl text-sm active:scale-[0.98] transition-transform"
          >
            대출 상품 목록으로
          </button>
        </div>
      )}
    </div>
  )
}

function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-kb-gray mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-kb-gray mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-kb-gray">{label}</span>
      <span className="text-sm font-semibold text-kb-navy">{value}</span>
    </div>
  )
}
