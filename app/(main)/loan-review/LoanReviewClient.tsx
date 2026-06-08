"use client"

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Clock, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
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
  if (status === 'PENDING_REVIEW')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
        <AlertCircle className="w-3 h-3" /> 검토 필요
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
  const [deciding, startDeciding] = useTransition()
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runScreening(applicationId: string) {
    setError(null)
    setScreeningId(applicationId)
    startScreening(async () => {
      try {
        const res = await fetch(`/api/loan-applications/${applicationId}/screen`, { method: 'POST' })
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
                  decidedAt: data.decidedAt ?? null,
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

  async function decide(applicationId: string, decision: 'APPROVED' | 'REJECTED') {
    setError(null)
    setDecidingId(applicationId)
    startDeciding(async () => {
      try {
        const res = await fetch(`/api/loan-applications/${applicationId}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? '결정 실패')
        setItems((prev) =>
          prev.map((a) =>
            a.applicationId === applicationId
              ? { ...a, applicationStatus: data.applicationStatus, decidedAt: data.decidedAt }
              : a,
          ),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      } finally {
        setDecidingId(null)
      }
    })
  }

  const pending = items.filter((a) => a.applicationStatus === 'SUBMITTED')
  const pendingReview = items.filter((a) => a.applicationStatus === 'PENDING_REVIEW')
  const decided = items.filter((a) => a.applicationStatus === 'APPROVED' || a.applicationStatus === 'REJECTED')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-kb-navy">대출 심사</h1>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ML 심사 대기 */}
      <section>
        <h2 className="text-sm font-semibold text-kb-gray uppercase tracking-wide mb-3">
          ML 심사 대기 ({pending.length}건)
        </h2>
        {pending.length === 0 ? (
          <div className="text-center py-8 text-kb-gray text-sm bg-white rounded-2xl border border-kb-gray-border">
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
                onDecide={decide}
                isDeciding={deciding && decidingId === a.applicationId}
              />
            ))}
          </div>
        )}
      </section>

      {/* 직원 검토 필요 */}
      {pendingReview.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wide mb-3">
            직원 검토 필요 ({pendingReview.length}건)
          </h2>
          <div className="space-y-2">
            {pendingReview.map((a) => (
              <AppCard
                key={a.applicationId}
                app={a}
                expanded={expanded === a.applicationId}
                onToggle={() => setExpanded(expanded === a.applicationId ? null : a.applicationId)}
                onScreen={() => runScreening(a.applicationId)}
                isScreening={screening && screeningId === a.applicationId}
                onDecide={decide}
                isDeciding={deciding && decidingId === a.applicationId}
              />
            ))}
          </div>
        </section>
      )}

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
                onDecide={decide}
                isDeciding={deciding && decidingId === a.applicationId}
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
  onDecide,
  isDeciding,
}: {
  app: Application
  expanded: boolean
  onToggle: () => void
  onScreen: () => void
  isScreening: boolean
  onDecide: (id: string, decision: 'APPROVED' | 'REJECTED') => void
  isDeciding: boolean
}) {
  const submittedDate = app.submittedAt
    ? new Date(app.submittedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '-'

  const scoreColor =
    app.mlScore === null ? '' :
    app.mlScore >= 800 ? 'text-green-600' :
    app.mlScore < 300 ? 'text-red-600' :
    'text-orange-600'

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
        <div className="flex items-center gap-3 shrink-0">
          {app.mlScore !== null && (
            <span className={cn('text-sm font-bold', scoreColor)}>{app.mlScore}점</span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-kb-gray" /> : <ChevronDown className="w-4 h-4 text-kb-gray" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-kb-gray-border">
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <Detail label="신청 목적" value={app.loanPurpose ?? '-'} />
            <Detail label="ML 판정" value={app.mlDecision ?? '미실행'} />
            {app.mlScore !== null && (
              <Detail label="ML 점수" value={`${app.mlScore}점`} valueClass={scoreColor} />
            )}
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

          {/* ML 심사 실행 버튼 (SUBMITTED 상태) */}
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

          {/* 직원 최종 결정 버튼 (PENDING_REVIEW 상태) */}
          {app.applicationStatus === 'PENDING_REVIEW' && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-orange-600 font-medium">
                ML 점수 {app.mlScore}점 — 직원 검토 후 최종 결정이 필요합니다.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onDecide(app.applicationId, 'APPROVED')}
                  disabled={isDeciding}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isDeciding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '승인'}
                </button>
                <button
                  onClick={() => onDecide(app.applicationId, 'REJECTED')}
                  disabled={isDeciding}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeciding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '거절'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs text-kb-gray">{label}</p>
      <p className={cn('font-medium text-kb-navy mt-0.5', valueClass)}>{value}</p>
    </div>
  )
}
