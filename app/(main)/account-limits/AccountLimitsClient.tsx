"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Search, Lock, LockOpen, CheckCircle2, Ban, ChevronDown, ChevronUp,
  AlertCircle, User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatKRW, maskAccountNumber } from "@/lib/formatters"
import { updateAccountLimits } from "./actions"

// ── 타입 ──────────────────────────────────────────────────────────────────────

type AccountData = {
  accountId: string
  accountNumber: string
  accountPurpose: string
  accountStatus: string
  balance: string
  isLocked: boolean
  transferLimitPerTransaction: number | null
  transferLimitPerDay: number | null
}

type PartyData = {
  partyId: string
  partyName: string
  individualLimitPerTx: number | null
  individualLimitPerDay: number | null
  accounts: AccountData[]
}

type FormState = {
  limitPerTx: string
  limitPerDay: string
  isLocked: boolean
  accountStatus: string
}

// ── 상수 ──────────────────────────────────────────────────────────────────────

const PURPOSE_LABEL: Record<string, string> = {
  GENERAL: "입출금",
  SALARY: "급여",
  SAVINGS: "적금",
  TIME_DEPOSIT: "정기예금",
  LOAN: "대출",
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

function StatusBadge({ status, isLocked }: { status: string; isLocked: boolean }) {
  if (isLocked)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">
        <Lock className="w-3 h-3" /> 잠금
      </span>
    )
  if (status === "ACTIVE")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> 정상
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
      <Ban className="w-3 h-3" /> 정지
    </span>
  )
}

function LimitDisplay({ value, fallback, label }: { value: number | null; fallback: number | null; label: string }) {
  const effective = value ?? fallback
  return (
    <div className="text-right">
      <p className="text-xs font-semibold text-kb-navy">
        {effective != null ? formatKRW(effective) : "미설정"}
      </p>
      {value == null && fallback != null && (
        <p className="text-[10px] text-kb-gray">고객 기본값</p>
      )}
      {value != null && (
        <p className="text-[10px] text-kb-gray">계좌 개별 설정</p>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AccountLimitsClient({
  query: initialQuery,
  parties,
}: {
  query: string
  parties: PartyData[]
}) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(initialQuery)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, FormState>>({})
  const [saving, startSave] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ok: boolean; message?: string }>>({})
  const formRef = useRef<HTMLFormElement>(null)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/account-limits?q=${encodeURIComponent(searchInput.trim())}`)
  }

  function openEdit(account: AccountData) {
    if (expandedId === account.accountId) {
      setExpandedId(null)
      return
    }
    setExpandedId(account.accountId)
    setForms((prev) => ({
      ...prev,
      [account.accountId]: {
        limitPerTx: account.transferLimitPerTransaction != null
          ? String(account.transferLimitPerTransaction)
          : "",
        limitPerDay: account.transferLimitPerDay != null
          ? String(account.transferLimitPerDay)
          : "",
        isLocked: account.isLocked,
        accountStatus: account.accountStatus,
      },
    }))
    setResults((prev) => { const n = { ...prev }; delete n[account.accountId]; return n })
  }

  function handleFormChange(accountId: string, field: keyof FormState, value: string | boolean) {
    setForms((prev) => ({
      ...prev,
      [accountId]: { ...prev[accountId], [field]: value },
    }))
  }

  function handleSave(accountId: string) {
    const form = forms[accountId]
    if (!form) return
    setSavingId(accountId)
    startSave(async () => {
      const txAmt = form.limitPerTx ? Number(form.limitPerTx.replace(/,/g, "")) : null
      const dayAmt = form.limitPerDay ? Number(form.limitPerDay.replace(/,/g, "")) : null

      if ((txAmt != null && txAmt <= 0) || (dayAmt != null && dayAmt <= 0)) {
        setResults((prev) => ({ ...prev, [accountId]: { ok: false, message: "한도는 0보다 커야 합니다." } }))
        setSavingId(null)
        return
      }

      const res = await updateAccountLimits({
        accountId,
        transferLimitPerTransaction: txAmt,
        transferLimitPerDay: dayAmt,
        isLocked: form.isLocked,
        accountStatus: form.accountStatus,
      })
      setResults((prev) => ({ ...prev, [accountId]: res }))
      setSavingId(null)
      if (res.ok) {
        setExpandedId(null)
        router.refresh()
      }
    })
  }

  const isSaving = (id: string) => saving && savingId === id

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-kb-navy mb-5">계좌 한도 관리</h1>

      {/* 검색 */}
      <form ref={formRef} onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kb-gray" />
          <input
            type="text"
            placeholder="고객명 또는 계좌번호 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-kb-gray-border bg-white text-sm text-kb-navy placeholder:text-kb-gray/50 outline-none focus:border-kb-navy transition-colors"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl bg-kb-navy text-white text-sm font-semibold hover:bg-kb-navy/90 transition-colors"
        >
          검색
        </button>
      </form>

      {/* 결과 없음 */}
      {initialQuery && parties.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-kb-gray">
          <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">"{initialQuery}"에 해당하는 고객을 찾을 수 없습니다.</p>
        </div>
      )}

      {/* 검색 전 안내 */}
      {!initialQuery && (
        <div className="flex flex-col items-center justify-center py-16 text-kb-gray">
          <Search className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">고객명 또는 계좌번호로 검색하세요.</p>
        </div>
      )}

      {/* 고객 목록 */}
      <div className="space-y-5">
        {parties.map((party) => (
          <div key={party.partyId} className="bg-white rounded-2xl shadow-card overflow-hidden">
            {/* 고객 헤더 */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-kb-gray-border bg-kb-gray-light/50">
              <div className="w-8 h-8 rounded-full bg-kb-navy/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-kb-navy" />
              </div>
              <div>
                <p className="text-sm font-bold text-kb-navy">{party.partyName}</p>
                {(party.individualLimitPerTx != null || party.individualLimitPerDay != null) && (
                  <p className="text-[11px] text-kb-gray mt-0.5">
                    기본 한도 — 건별{" "}
                    <span className="font-medium text-kb-navy">
                      {party.individualLimitPerTx != null ? formatKRW(party.individualLimitPerTx) : "미설정"}
                    </span>
                    {" · "}일별{" "}
                    <span className="font-medium text-kb-navy">
                      {party.individualLimitPerDay != null ? formatKRW(party.individualLimitPerDay) : "미설정"}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* 계좌 목록 */}
            {party.accounts.length === 0 ? (
              <p className="px-5 py-4 text-xs text-kb-gray">활성 계좌 없음</p>
            ) : (
              <ul className="divide-y divide-kb-gray-border">
                {party.accounts.map((account) => {
                  const isExpanded = expandedId === account.accountId
                  const form = forms[account.accountId]
                  const result = results[account.accountId]

                  return (
                    <li key={account.accountId}>
                      {/* 계좌 행 */}
                      <div
                        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-kb-gray-light/40 transition-colors"
                        onClick={() => openEdit(account)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-kb-navy">
                              {PURPOSE_LABEL[account.accountPurpose] ?? account.accountPurpose}
                            </span>
                            <StatusBadge status={account.accountStatus} isLocked={account.isLocked} />
                          </div>
                          <p className="text-[11px] text-kb-gray font-mono">
                            {maskAccountNumber(account.accountNumber)}
                          </p>
                        </div>

                        <div className="hidden sm:grid grid-cols-2 gap-x-8 gap-y-0.5 text-right shrink-0">
                          <div>
                            <p className="text-[10px] text-kb-gray">건별</p>
                            <LimitDisplay
                              value={account.transferLimitPerTransaction}
                              fallback={party.individualLimitPerTx}
                              label="건별"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-kb-gray">일별</p>
                            <LimitDisplay
                              value={account.transferLimitPerDay}
                              fallback={party.individualLimitPerDay}
                              label="일별"
                            />
                          </div>
                        </div>

                        <div className="shrink-0 ml-2 text-kb-gray">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>

                      {/* 편집 폼 */}
                      {isExpanded && form && (
                        <div className="px-5 pb-5 pt-2 border-t border-kb-gray-border bg-kb-gray-light/30">
                          <p className="text-xs font-semibold text-kb-navy mb-3">한도 수정</p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            {/* 건별 이체 한도 */}
                            <div>
                              <label className="block text-[11px] text-kb-gray mb-1">
                                건별 이체 한도
                                {party.individualLimitPerTx != null && (
                                  <span className="ml-1 text-kb-gray/60">
                                    (기본: {formatKRW(party.individualLimitPerTx)})
                                  </span>
                                )}
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="미입력 시 고객 기본값 적용"
                                  value={form.limitPerTx}
                                  onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, "")
                                    handleFormChange(account.accountId, "limitPerTx", digits)
                                  }}
                                  className="w-full px-3 py-2 pr-7 rounded-lg border border-kb-gray-border bg-white text-sm text-kb-navy outline-none focus:border-kb-navy transition-colors"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-kb-gray">원</span>
                              </div>
                            </div>

                            {/* 일별 이체 한도 */}
                            <div>
                              <label className="block text-[11px] text-kb-gray mb-1">
                                일별 이체 한도
                                {party.individualLimitPerDay != null && (
                                  <span className="ml-1 text-kb-gray/60">
                                    (기본: {formatKRW(party.individualLimitPerDay)})
                                  </span>
                                )}
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="미입력 시 고객 기본값 적용"
                                  value={form.limitPerDay}
                                  onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, "")
                                    handleFormChange(account.accountId, "limitPerDay", digits)
                                  }}
                                  className="w-full px-3 py-2 pr-7 rounded-lg border border-kb-gray-border bg-white text-sm text-kb-navy outline-none focus:border-kb-navy transition-colors"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-kb-gray">원</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            {/* 계좌 상태 */}
                            <div>
                              <label className="block text-[11px] text-kb-gray mb-1">계좌 상태</label>
                              <div className="flex gap-2">
                                {(["ACTIVE", "SUSPENDED"] as const).map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => handleFormChange(account.accountId, "accountStatus", s)}
                                    className={cn(
                                      "flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors",
                                      form.accountStatus === s
                                        ? s === "ACTIVE"
                                          ? "bg-green-600 text-white border-green-600"
                                          : "bg-gray-500 text-white border-gray-500"
                                        : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy"
                                    )}
                                  >
                                    {s === "ACTIVE" ? "정상" : "정지"}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 계좌 잠금 */}
                            <div>
                              <label className="block text-[11px] text-kb-gray mb-1">계좌 잠금</label>
                              <div className="flex gap-2">
                                {([false, true] as const).map((locked) => (
                                  <button
                                    key={String(locked)}
                                    type="button"
                                    onClick={() => handleFormChange(account.accountId, "isLocked", locked)}
                                    className={cn(
                                      "flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-center gap-1",
                                      form.isLocked === locked
                                        ? locked
                                          ? "bg-red-600 text-white border-red-600"
                                          : "bg-green-600 text-white border-green-600"
                                        : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy"
                                    )}
                                  >
                                    {locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
                                    {locked ? "잠금" : "해제"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* 결과 메시지 */}
                          {result && (
                            <div
                              className={cn(
                                "flex items-center gap-2 text-xs mb-3 px-3 py-2 rounded-lg",
                                result.ok
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-600"
                              )}
                            >
                              {result.ok ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              {result.ok ? "저장되었습니다." : result.message}
                            </div>
                          )}

                          {/* 저장 / 취소 */}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(null)}
                              className="flex-1 py-2 rounded-xl border border-kb-gray-border text-kb-navy text-sm font-semibold hover:bg-kb-gray-light transition-colors"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSave(account.accountId)}
                              disabled={isSaving(account.accountId)}
                              className="flex-1 py-2 rounded-xl bg-kb-navy text-white text-sm font-semibold disabled:opacity-50 hover:bg-kb-navy/90 transition-colors"
                            >
                              {isSaving(account.accountId) ? "저장 중…" : "저장"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
