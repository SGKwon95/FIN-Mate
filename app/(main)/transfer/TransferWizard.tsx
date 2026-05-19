"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, ChevronRight, AlertCircle } from "lucide-react"
import { formatKRW, maskAccountNumber } from "@/lib/formatters"
import { executeTransfer } from "./actions"

type Account = {
  accountId: string
  accountNumber: string
  accountType: string
  accountPurpose: string | null
  balance: string
}

type Step = "form" | "confirm" | "done"

const ACCOUNT_LABEL: Record<string, string> = {
  GENERAL: "입출금",
  SALARY:  "급여",
  SAVING:  "적금",
}

function accountLabel(acc: Account) {
  return ACCOUNT_LABEL[acc.accountPurpose ?? ""] ?? acc.accountType
}

export default function TransferWizard({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [step, setStep] = useState<Step>("form")
  const [fromId, setFromId] = useState(accounts[0]?.accountId ?? "")
  const [toNumber, setToNumber] = useState("")
  const [toName, setToName] = useState("")
  const [amountStr, setAmountStr] = useState("")
  const [memo, setMemo] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [doneId, setDoneId] = useState("")

  const fromAccount = accounts.find((a) => a.accountId === fromId)
  const amount = Number(amountStr.replace(/,/g, ""))

  // ── 유효성 ─────────────────────────────────────────
  function validate(): string {
    if (!fromId) return "출금 계좌를 선택해주세요."
    if (!/^\d{10,16}$/.test(toNumber.replace(/-/g, "")))
      return "받는 계좌번호를 정확히 입력해주세요."
    if (!toName.trim()) return "받는 분 이름을 입력해주세요."
    if (!amount || amount < 1) return "이체 금액을 입력해주세요."
    if (amount > Number(fromAccount?.balance ?? 0)) return "잔액이 부족합니다."
    return ""
  }

  function goConfirm() {
    const err = validate()
    if (err) { setErrorMsg(err); return }
    setErrorMsg("")
    setStep("confirm")
  }

  function doTransfer() {
    startTransition(async () => {
      const res = await executeTransfer({
        fromAccountId: fromId,
        toAccountNumber: toNumber.replace(/-/g, ""),
        toName: toName.trim(),
        amount,
        memo: memo.trim() || undefined,
      })
      if (res.ok) {
        setDoneId(res.transactionId)
        setStep("done")
      } else {
        setErrorMsg(res.message)
        setStep("form")
      }
    })
  }

  // ── 금액 입력 포맷 ──────────────────────────────────
  function handleAmountChange(val: string) {
    const digits = val.replace(/\D/g, "")
    setAmountStr(digits ? Number(digits).toLocaleString("ko-KR") : "")
  }

  // ── 렌더 ────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-xl font-bold text-kb-navy mb-1">이체 완료</h2>
        <p className="text-kb-gray text-sm mb-2">
          <span className="font-semibold text-kb-navy">{formatKRW(amount)}</span>을<br />
          {toName}님에게 보냈습니다.
        </p>
        <p className="text-xs text-kb-gray/60 mb-8">처리번호 {doneId.slice(0, 8).toUpperCase()}</p>
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex-1 py-3 rounded-xl border border-kb-gray-border text-kb-navy font-semibold text-sm"
          >
            홈으로
          </button>
          <button
            onClick={() => router.push("/accounts")}
            className="flex-1 py-3 rounded-xl bg-kb-navy text-white font-semibold text-sm"
          >
            내 계좌
          </button>
        </div>
      </div>
    )
  }

  if (step === "confirm") {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button
          onClick={() => setStep("form")}
          className="flex items-center gap-1 text-kb-gray text-sm mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> 수정
        </button>

        <h2 className="text-lg font-bold text-kb-navy mb-6">이체 확인</h2>

        <div className="bg-white rounded-2xl shadow-card divide-y divide-kb-gray-border">
          <Row label="출금 계좌">
            <span className="text-right">
              <span className="block text-sm font-semibold text-kb-navy">
                {accountLabel(fromAccount!)}
              </span>
              <span className="block text-xs text-kb-gray font-mono">
                {maskAccountNumber(fromAccount!.accountNumber)}
              </span>
            </span>
          </Row>
          <Row label="받는 계좌">
            <span className="text-right">
              <span className="block text-sm font-semibold text-kb-navy">{toName}</span>
              <span className="block text-xs text-kb-gray font-mono">{toNumber}</span>
            </span>
          </Row>
          <Row label="이체 금액">
            <span className="text-kb-navy font-bold text-base">{formatKRW(amount)}</span>
          </Row>
          {memo && (
            <Row label="메모">
              <span className="text-kb-gray text-sm">{memo}</span>
            </Row>
          )}
        </div>

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        <button
          onClick={doTransfer}
          disabled={isPending}
          className="mt-6 w-full py-4 bg-kb-navy text-white font-bold rounded-2xl text-base disabled:opacity-60 active:scale-[0.98] transition-transform"
        >
          {isPending ? "처리 중…" : "이체하기"}
        </button>
      </div>
    )
  }

  // step === "form"
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-lg font-bold text-kb-navy mb-6">이체</h2>

      <div className="space-y-4">
        {/* 출금 계좌 */}
        <div className="bg-white rounded-2xl shadow-card p-4">
          <p className="text-xs text-kb-gray font-medium mb-2">출금 계좌</p>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="w-full bg-transparent text-kb-navy font-semibold text-sm outline-none"
          >
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {accountLabel(a)} — {maskAccountNumber(a.accountNumber)} ({formatKRW(a.balance)})
              </option>
            ))}
          </select>
          {fromAccount && (
            <p className="text-xs text-kb-gray mt-1">
              잔액 <span className="font-semibold text-kb-navy">{formatKRW(fromAccount.balance)}</span>
            </p>
          )}
        </div>

        {/* 받는 계좌 */}
        <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
          <p className="text-xs text-kb-gray font-medium">받는 계좌</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="계좌번호 입력 (숫자만)"
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value.replace(/[^\d-]/g, ""))}
            className="w-full text-sm text-kb-navy placeholder:text-kb-gray/40 border-b border-kb-gray-border pb-2 outline-none"
          />
          <input
            type="text"
            placeholder="받는 분 이름"
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            className="w-full text-sm text-kb-navy placeholder:text-kb-gray/40 border-b border-kb-gray-border pb-2 outline-none"
          />
        </div>

        {/* 금액 */}
        <div className="bg-white rounded-2xl shadow-card p-4">
          <p className="text-xs text-kb-gray font-medium mb-2">이체 금액</p>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amountStr}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="flex-1 text-2xl font-bold text-kb-navy placeholder:text-kb-gray/30 outline-none tabular-nums"
            />
            <span className="text-kb-gray font-medium">원</span>
          </div>
          {/* 빠른 금액 버튼 */}
          <div className="flex gap-2 mt-3">
            {[10000, 50000, 100000].map((n) => (
              <button
                key={n}
                onClick={() => handleAmountChange(String((amount || 0) + n))}
                className="flex-1 py-1.5 text-xs font-semibold text-kb-navy bg-kb-gray-light rounded-lg"
              >
                +{(n / 10000).toFixed(0)}만
              </button>
            ))}
            <button
              onClick={() => fromAccount && handleAmountChange(fromAccount.balance)}
              className="flex-1 py-1.5 text-xs font-semibold text-kb-navy bg-kb-gray-light rounded-lg"
            >
              전액
            </button>
          </div>
        </div>

        {/* 메모 */}
        <div className="bg-white rounded-2xl shadow-card p-4">
          <p className="text-xs text-kb-gray font-medium mb-2">메모 (선택)</p>
          <input
            type="text"
            placeholder="받는 분 통장에 표시될 메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full text-sm text-kb-navy placeholder:text-kb-gray/40 outline-none"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
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
