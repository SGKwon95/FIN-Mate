"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, AlertCircle, Search } from "lucide-react"
import { formatKRW } from "@/lib/formatters"
import { verifyAccount } from "@/app/(main)/transfer/actions"
import { registerScheduledTransfer } from "../actions"
import { cn } from "@/lib/utils"

type Account = {
  accountId:      string
  accountNumber:  string
  accountPurpose: string | null
  balance:        string
}

type Bank = {
  code: string
  name: string
}

const ACCOUNT_LABEL: Record<string, string> = {
  GENERAL:      "입출금",
  SALARY:       "급여",
  SAVINGS:      "적금",
  TIME_DEPOSIT: "정기예금",
}

const inputCls =
  "w-full border border-kb-gray-border rounded-xl px-3 py-2.5 text-sm text-kb-navy focus:outline-none focus:ring-2 focus:ring-kb-navy/30 bg-white"

export default function AutoTransferForm({
  accounts,
  banks,
}: {
  accounts: Account[]
  banks:    Bank[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [step,       setStep]       = useState<"form" | "done">("form")
  const [fromId,     setFromId]     = useState(accounts[0]?.accountId ?? "")
  const [bankCode,   setBankCode]   = useState(banks[0]?.code ?? "")
  const [toNumber,   setToNumber]   = useState("")
  const [toName,     setToName]     = useState("")
  const [amountStr,  setAmountStr]  = useState("")
  const [day,        setDay]        = useState(1)
  const [endDate,    setEndDate]    = useState("")  // YYYY-MM
  const [memo,       setMemo]       = useState("")
  const [verifying,  setVerifying]  = useState(false)
  const [error,      setError]      = useState("")

  const fromAccount = accounts.find((a) => a.accountId === fromId)
  const amount      = parseInt(amountStr.replace(/,/g, ""), 10) || 0

  function handleAmountChange(v: string) {
    const digits = v.replace(/[^0-9]/g, "")
    setAmountStr(digits ? Number(digits).toLocaleString("ko-KR") : "")
  }

  function handleToNumberChange(v: string) {
    setToNumber(v)
    setToName("")
  }

  async function handleVerify() {
    const normalized = toNumber.replace(/-/g, "")
    if (!/^\d{10,16}$/.test(normalized)) {
      setError("계좌번호 형식이 올바르지 않습니다.")
      return
    }
    setVerifying(true)
    setError("")
    const result = await verifyAccount({ accountNumber: normalized, bankCode })
    setVerifying(false)
    if (result.ok) {
      setToName(result.holderName)
    } else {
      setError(result.message)
    }
  }

  function handleSubmit() {
    setError("")
    if (!toName)  { setError("수신 계좌를 조회해주세요."); return }
    if (amount <= 0) { setError("금액을 입력해주세요."); return }

    // endDate: YYYY-MM → YYYYMM28 식으로 해당 월 말일 근사치 (단순하게 월말 28일 고정)
    // 더 정확하게는 해당 월의 마지막 날을 계산하지만 UI 입력 목적상 충분
    const endDateStr = endDate
      ? endDate.replace("-", "") + "28"
      : undefined

    startTransition(async () => {
      const result = await registerScheduledTransfer({
        fromAccountId:   fromId,
        bankCode,
        toAccountNumber: toNumber.replace(/-/g, ""),
        toAccountName:   toName,
        amount,
        transferDay:     day,
        endDate:         endDateStr,
        memo:            memo || undefined,
      })
      if (result.ok) {
        setStep("done")
      } else {
        setError(result.message)
      }
    })
  }

  if (step === "done") {
    return (
      <div className="bg-white rounded-2xl shadow-card px-6 py-12 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-bold text-kb-navy mb-1">자동이체 등록 완료</p>
        <p className="text-sm text-kb-gray mb-6">
          매월 {day}일에 {toName}님께 {formatKRW(String(amount))} 이체됩니다.
        </p>
        <button
          onClick={() => router.push("/auto-transfer")}
          className="w-full py-3 bg-kb-navy text-white rounded-xl font-semibold text-sm"
        >
          자동이체 목록 보기
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 출금 계좌 */}
      <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <p className="text-xs font-semibold text-kb-gray">출금 계좌</p>
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className={inputCls}
        >
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {ACCOUNT_LABEL[a.accountPurpose ?? ""] ?? "계좌"} · {a.accountNumber}
              {" "}({formatKRW(a.balance)})
            </option>
          ))}
        </select>
        {fromAccount && (
          <p className="text-xs text-kb-gray text-right tabular-nums">
            잔액 {formatKRW(fromAccount.balance)}
          </p>
        )}
      </div>

      {/* 수신 계좌 */}
      <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <p className="text-xs font-semibold text-kb-gray">받는 계좌</p>
        <select value={bankCode} onChange={(e) => { setBankCode(e.target.value); setToName("") }} className={inputCls}>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="계좌번호"
            value={toNumber}
            onChange={(e) => handleToNumberChange(e.target.value)}
            className={cn(inputCls, "flex-1")}
          />
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-kb-navy text-white rounded-xl text-sm font-medium shrink-0 disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            조회
          </button>
        </div>
        {toName && (
          <p className="text-sm font-semibold text-blue-600">{toName}</p>
        )}
      </div>

      {/* 이체 금액 */}
      <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <p className="text-xs font-semibold text-kb-gray">이체 금액</p>
        <div className="relative">
          <input
            type="text"
            placeholder="0"
            value={amountStr}
            onChange={(e) => handleAmountChange(e.target.value)}
            className={cn(inputCls, "pr-8 tabular-nums")}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-kb-gray text-sm">원</span>
        </div>
        <div className="flex gap-2">
          {[10000, 50000, 100000].map((v) => (
            <button
              key={v}
              onClick={() => setAmountStr((Number(amountStr.replace(/,/g, "") || 0) + v).toLocaleString("ko-KR"))}
              className="flex-1 py-1.5 text-xs bg-kb-gray-light text-kb-navy rounded-lg border border-kb-gray-border hover:bg-kb-yellow/20"
            >
              +{(v / 10000)}만
            </button>
          ))}
        </div>
      </div>

      {/* 이체일 설정 */}
      <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <p className="text-xs font-semibold text-kb-gray">이체 설정</p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-kb-gray shrink-0">이체일</span>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-kb-gray">매월</span>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className={cn(inputCls, "w-24")}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}일</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-kb-gray shrink-0">종료월</span>
          <input
            type="month"
            value={endDate}
            min={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7)}
            onChange={(e) => setEndDate(e.target.value)}
            className={cn(inputCls, "flex-1")}
            placeholder="미선택 시 무기한"
          />
          {endDate && (
            <button onClick={() => setEndDate("")} className="text-xs text-kb-gray shrink-0">초기화</button>
          )}
        </div>
        <div>
          <input
            type="text"
            placeholder="메모 (선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={50}
            className={inputCls}
          />
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-xl border border-red-100 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 등록 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full py-4 bg-kb-navy text-white rounded-2xl font-bold text-base hover:bg-kb-navy/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "등록 중..." : "자동이체 등록"}
      </button>
    </div>
  )
}
