"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { maskAccountNumber } from "@/lib/formatters"

type Account = {
  accountId: string
  accountNumber: string
  accountPurpose: string | null
}

const ACCOUNT_LABEL: Record<string, string> = {
  GENERAL: "입출금",
  SALARY: "급여",
  SAVINGS: "적금",
}

const PRESETS = [
  { label: "당일",   days: 0 },
  { label: "1주일",  days: 7 },
  { label: "1개월",  days: 30 },
  { label: "3개월",  days: 90 },
  { label: "6개월",  days: 180 },
  { label: "1년",    days: 365 },
]

const TX_TYPES = [
  { label: "전체",  value: "ALL" },
  { label: "입금",  value: "DEPOSIT" },
  { label: "출금",  value: "WITHDRAWAL" },
  { label: "이체",  value: "TRANSFER_OUT" },
]

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function presetRange(days: number): [string, string] {
  const today = new Date()
  const from = new Date(today)
  if (days > 0) from.setDate(from.getDate() - days)
  return [toDateStr(from), toDateStr(today)]
}

export default function TransactionSearchForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [accountId, setAccountId] = useState(sp.get("accountId") ?? accounts[0]?.accountId ?? "")
  const [from,      setFrom]      = useState(sp.get("from") ?? presetRange(30)[0])
  const [to,        setTo]        = useState(sp.get("to")   ?? presetRange(30)[1])
  const [type,      setType]      = useState(sp.get("type") ?? "ALL")
  const [preset,    setPreset]    = useState<number | null>(sp.get("from") ? null : 30)

  function applyPreset(days: number) {
    const [f, t] = presetRange(days)
    setFrom(f); setTo(t); setPreset(days)
  }

  function search() {
    const params = new URLSearchParams({ accountId, from, to, type })
    startTransition(() => { router.push(`/transactions?${params}`) })
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-4 mb-4 space-y-4">
      {/* 계좌 선택 */}
      <div>
        <p className="text-xs font-semibold text-kb-gray mb-1.5">계좌번호</p>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="w-full border border-kb-gray-border rounded-xl px-3 py-2.5 text-sm text-kb-navy font-medium outline-none bg-white"
        >
          {accounts.map(a => (
            <option key={a.accountId} value={a.accountId}>
              {ACCOUNT_LABEL[a.accountPurpose ?? ""] ?? "계좌"} — {maskAccountNumber(a.accountNumber)}
            </option>
          ))}
        </select>
      </div>

      {/* 조회 기간 프리셋 */}
      <div>
        <p className="text-xs font-semibold text-kb-gray mb-1.5">조회기간</p>
        <div className="flex gap-1.5 mb-2.5 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.days)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                preset === p.days
                  ? "bg-kb-navy text-white border-kb-navy"
                  : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy hover:text-kb-navy"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* 날짜 직접 입력 */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPreset(null) }}
            className="flex-1 border border-kb-gray-border rounded-xl px-3 py-2 text-sm text-kb-navy outline-none"
          />
          <span className="text-kb-gray text-sm shrink-0">~</span>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPreset(null) }}
            className="flex-1 border border-kb-gray-border rounded-xl px-3 py-2 text-sm text-kb-navy outline-none"
          />
        </div>
      </div>

      {/* 거래 구분 */}
      <div>
        <p className="text-xs font-semibold text-kb-gray mb-1.5">거래구분</p>
        <div className="flex gap-1.5">
          {TX_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors",
                type === t.value
                  ? "bg-kb-navy text-white border-kb-navy"
                  : "bg-white text-kb-gray border-kb-gray-border hover:border-kb-navy hover:text-kb-navy"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 조회 버튼 */}
      <button
        onClick={search}
        disabled={isPending}
        className="w-full py-3 bg-kb-navy text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
      >
        <Search className="w-4 h-4" />
        {isPending ? "조회 중…" : "조회"}
      </button>
    </div>
  )
}
