"use client"

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/formatters'

type Application = {
  applicationId: string
  partyName: string
  productName: string
  requestedAmount: string
  requestedPeriodMonths: number | null
  loanPurpose: string | null
  applicationStatus: string
  mlDecision: string | null
  mlScore: number | null
  mlDefaultProb: string | null
  submittedAt: string | null
  decidedAt: string | null
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: '심사 대기',
  APPROVED: '승인',
  REJECTED: '거절',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> 승인
      </span>
    )
  if (status === 'REJECTED')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" /> 거절
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
      <Clock className="w-3 h-3" /> 심사 대기
    </span>
  )
}

export default function LoanReviewClient({ applications }: { applications: Application[] }) {
  const [items, setItems] = useState(applications)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [screening, startScreening] = useTransition()
  const [screeningId, setScreeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runScreening(applicationId: string) {
    setError(null)
    setScreeningId(applicationId)
    startScreening(async () => {
      try {
        const res = await fetch(`/api/loan-applications/${applicationId}/screen`, {
          method: 'POST',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? '심사 실패')
        setItems((prev) =>
          prev.map((a) =>
            a.applicationId === applicationId
              ? {
                  ...a,
                  applicationStatus: data.applicationStatus,
                  mlDecision: data.mlDecision,
                  mlScore: data.mlScore,
                  mlDefaultProb: data.mlDefaultProb ? Number(data.mlDefaultProb).toFixed(4) : null,
                  decidedAt: data.decidedAt ?? new Date().toISOString(),
                }
              : a,
          ),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      } finally {
        setScreeningId(null)
      }
    })
  }

  const pending = items.filter((a) => a.applicationStatus === 'SUBMITTED')
  const decided = items.filter((a) => a.applicationStatus !== 'SUBMITTED')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-kb-navy">대출 심사</h1>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 심사 대기 */}
      <section>
        <h2 className="text-sm font-semibold text-kb-gray uppercase tracking-wide mb-3">
          심사 대기 ({pending.length}건)
        </h2>
        {pending.length === 0 ? (
          <div className="text-center py-10 text-kb-gray text-sm bg-white rounded-2xl border border-kb-gray-border">
            대기 중인 신청이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((a) => (
              <AppCard
                key={a.applicationId}
                app={a}
                expanded={expanded === a.applicationId}
                onToggle={() => setExpanded(expanded === a.applicationId ? null : a.applicationId)}
                onScreen={() => runScreening(a.applicationId)}
                isScreening={screening && screeningId === a.applicationId}
              />
            ))}
          </div>
        )}
      </section>

      {/* 심사 완료 */}
      {decided.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-kb-gray uppercase tracking-wide mb-3">
            심사 완료 ({decided.length}건)
          </h2>
          <div className="space-y-2">
            {decided.map((a) => (
              <AppCard
                key={a.applicationId}
                app={a}
                expanded={expanded === a.applicationId}
                onToggle={() => setExpanded(expanded === a.applicationId ? null : a.applicationId)}
                onScreen={() => runScreening(a.applicationId)}
                isScreening={screening && screeningId === a.applicationId}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AppCard({
  app,
  expanded,
  onToggle,
  onScreen,
  isScreening,
}: {
  app: Application
  expanded: boolean
  onToggle: () => void
  onScreen: () => void
  isScreening: boolean
}) {
  const submittedDate = app.submittedAt
    ? new Date(app.submittedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '-'

  return (
    <div className="bg-white rounded-2xl border border-kb-gray-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-kb-gray-light/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={app.applicationStatus} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-kb-navy text-sm">{app.partyName}</span>
              <span className="text-kb-gray text-xs truncate hidden sm:inline">{app.productName}</span>
            </div>
            <div className="text-xs text-kb-gray mt-0.5">
              {formatKRW(Number(app.requestedAmount))} · {app.requestedPeriodMonths}개월 · {submittedDate}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-kb-gray shrink-0" /> : <ChevronDown className="w-4 h-4 text-kb-gray shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-kb-gray-border">
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <Detail label="신청 목적" value={app.loanPurpose ?? '-'} />
            <Detail label="심사 결과" value={app.mlDecision ?? '미실행'} />
            {app.mlScore !== null && <Detail label="ML 점수" value={String(app.mlScore)} />}
            {app.mlDefaultProb !== null && (
              <Detail label="부도 확률" value={`${(Number(app.mlDefaultProb) * 100).toFixed(2)}%`} />
            )}
            {app.decidedAt && (
              <Detail
                label="결정일시"
                value={new Date(app.decidedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              />
            )}
          </div>

          {app.applicationStatus === 'SUBMITTED' && (
            <button
              onClick={onScreen}
              disabled={isScreening}
              className={cn(
                "mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
                isScreening
                  ? "bg-kb-gray-border text-kb-gray cursor-not-allowed"
                  : "bg-kb-navy text-white hover:bg-kb-navy/90",
              )}
            >
              {isScreening ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> ML 심사 실행 중...
                </span>
              ) : (
                'ML 심사 실행'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-kb-gray">{label}</p>
      <p className="font-medium text-kb-navy mt-0.5">{value}</p>
    </div>
  )
}
