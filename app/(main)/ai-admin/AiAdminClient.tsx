'use client'

import { useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, MessageSquare, Database, FileText, Activity,
  ThumbsUp, ThumbsDown, Trash2, Layers, Zap,
  HelpCircle, Loader2, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── 타입 ──────────────────────────────────────────────────────────────────────

type Stats = {
  totalFeedback: number
  upCount:       number
  downCount:     number
  nullCount:     number
  positiveRate:  number
  cacheCount:    number
  totalHits:     number
  docCount:      number
  chunkCount:    number
  avgQuality:    number
}

type FeedbackItem = {
  feedbackId: string
  feedback:   string | null
  question:   string
  createdAt:  string
}

type CacheItem = {
  cacheId:   string
  question:  string
  docScope:  string
  hitCount:  number
  lastHitAt: string | null
  createdAt: string
}

type DocQualityItem = {
  documentId:   string
  originalName: string
  storedName:   string | null
  documentType: string
  uploadedAt:   string
  chunkCount:   number
  avgQuality:   number
}

type FeedbackFilter = 'all' | 'up' | 'down' | 'none'
type Tab = 'dashboard' | 'feedback' | 'cache' | 'quality' | 'phoenix'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit',  minute: '2-digit',
  })
}

function parsedDocScope(docScope: string): string {
  try {
    const obj = JSON.parse(docScope) as { category?: string }
    const cat = obj.category ?? 'all'
    return cat === 'all' ? '전체' : cat === 'banking' ? '은행업무' : cat === 'product' ? '상품' : cat
  } catch {
    return docScope.slice(0, 12)
  }
}

function qualityStyle(score: number) {
  if (score >= 1.2) return { text: 'text-green-700',  bg: 'bg-green-100',  label: '우수' }
  if (score >= 0.8) return { text: 'text-amber-700',  bg: 'bg-amber-100',  label: '보통' }
  return               { text: 'text-red-700',    bg: 'bg-red-100',    label: '낮음' }
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

type IconComp = React.ComponentType<{ className?: string }>

function StatCard({
  label, value, icon: Icon, color = 'navy',
}: {
  label: string; value: string | number; icon: IconComp
  color?: 'navy' | 'green' | 'red' | 'blue' | 'amber' | 'gray'
}) {
  const colorMap: Record<string, string> = {
    navy:  'text-kb-navy bg-kb-navy/10',
    green: 'text-green-600 bg-green-50',
    red:   'text-red-600 bg-red-50',
    blue:  'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    gray:  'text-kb-gray bg-kb-gray-light',
  }
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-2', colorMap[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-kb-gray mb-0.5">{label}</p>
      <p className="text-xl font-bold text-kb-navy">{value}</p>
    </div>
  )
}

function ParamBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-kb-gray">{label}</span>
      <span className="text-sm font-bold text-kb-navy font-mono">{value}</span>
    </div>
  )
}

function FeedbackBadge({ feedback }: { feedback: string | null }) {
  if (feedback === 'up')
    return <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><ThumbsUp className="w-3.5 h-3.5" />긍정</span>
  if (feedback === 'down')
    return <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><ThumbsDown className="w-3.5 h-3.5" />부정</span>
  return <span className="text-kb-gray text-xs">-</span>
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: IconComp }[] = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { key: 'feedback',  label: '피드백',   icon: MessageSquare },
  { key: 'cache',     label: '캐시',     icon: Database },
  { key: 'quality',   label: '문서 품질', icon: FileText },
  { key: 'phoenix',   label: 'Phoenix',  icon: Activity },
]

export default function AiAdminClient({
  stats,
  recentFeedbacks,
  isAdmin,
  phoenixUrl,
}: {
  stats: Stats
  recentFeedbacks: FeedbackItem[]
  isAdmin: boolean
  phoenixUrl: string
}) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [caches, setCaches]       = useState<CacheItem[]>([])
  const [docQualities, setDocQualities] = useState<DocQualityItem[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const loaded = useRef<Set<Tab>>(new Set(['dashboard']))

  async function switchTab(tab: Tab) {
    setActiveTab(tab)
    setError(null)
    if (tab === 'phoenix' || loaded.current.has(tab)) return

    setLoading(true)
    try {
      if (tab === 'feedback') {
        const res = await fetch('/api/admin/ai/feedback')
        if (!res.ok) throw new Error()
        setFeedbacks(await res.json())
      } else if (tab === 'cache') {
        const res = await fetch('/api/admin/ai/cache')
        if (!res.ok) throw new Error()
        setCaches(await res.json())
      } else if (tab === 'quality') {
        const res = await fetch('/api/admin/ai/stats?type=quality')
        if (!res.ok) throw new Error()
        setDocQualities(await res.json())
      }
      loaded.current.add(tab)
    } catch {
      setError('데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteCache(cacheId: string) {
    setDeletingId(cacheId)
    try {
      const res = await fetch(`/api/admin/ai/cache/${cacheId}`, { method: 'DELETE' })
      if (res.ok) {
        setCaches(prev => prev.filter(c => c.cacheId !== cacheId))
      } else {
        setError('캐시 삭제에 실패했습니다.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function clearAllCache() {
    setConfirmClear(false)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ai/cache', { method: 'DELETE' })
      if (res.ok) {
        setCaches([])
      } else {
        setError('전체 캐시 초기화에 실패했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  const filteredFeedbacks = useMemo(() => {
    const src = activeTab === 'dashboard' ? recentFeedbacks : feedbacks
    if (feedbackFilter === 'all')  return src
    if (feedbackFilter === 'none') return src.filter(f => f.feedback === null)
    return src.filter(f => f.feedback === feedbackFilter)
  }, [feedbacks, recentFeedbacks, feedbackFilter, activeTab])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">AI 에이전트 관리</h1>

      {/* 탭 바 */}
      <div className="flex bg-white rounded-2xl shadow-card mb-5 overflow-hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2',
              activeTab === key
                ? 'text-kb-navy border-kb-navy'
                : 'text-kb-gray border-transparent hover:text-kb-navy',
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-kb-navy" />
        </div>
      )}

      {/* ── 대시보드 ── */}
      {!loading && activeTab === 'dashboard' && (
        <div className="space-y-5">
          {/* 통계 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="총 피드백"    value={stats.totalFeedback} icon={MessageSquare} />
            <StatCard label="긍정률"       value={`${stats.positiveRate}%`} icon={ThumbsUp}  color="green" />
            <StatCard label="부정 피드백"  value={stats.downCount}     icon={ThumbsDown}   color="red" />
            <StatCard label="미응답"       value={stats.nullCount}     icon={HelpCircle}   color="amber" />
            <StatCard label="캐시 항목"    value={stats.cacheCount}    icon={Database} />
            <StatCard label="총 캐시 히트" value={stats.totalHits}     icon={Zap}          color="blue" />
            <StatCard label="RAG 문서"     value={stats.docCount}      icon={FileText} />
            <StatCard label="청크 / 평균품질" value={`${stats.chunkCount} / ${stats.avgQuality}`} icon={Layers} color="gray" />
          </div>

          {/* RAG 파라미터 */}
          <div className="bg-white rounded-2xl shadow-card p-4">
            <p className="text-sm font-semibold text-kb-navy mb-3">현재 RAG 파라미터</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ParamBadge label="Top-K"                    value="5" />
              <ParamBadge label="최소 유사도"               value="0.30" />
              <ParamBadge label="캐시 Semantic 임계값"      value="0.95" />
              <ParamBadge label="품질점수 조정 (up / down)" value="+0.1 / −0.1" />
            </div>
          </div>

          {/* 최근 피드백 */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <p className="text-sm font-semibold text-kb-navy px-4 py-3 border-b border-kb-gray-border">
              최근 피드백 5건
            </p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-kb-gray-border">
                {recentFeedbacks.map(f => (
                  <tr key={f.feedbackId} className="hover:bg-kb-gray-light/30">
                    <td className="px-4 py-3 text-kb-navy/80 max-w-xs truncate">{f.question || '(질문 없음)'}</td>
                    <td className="px-4 py-3 w-20"><FeedbackBadge feedback={f.feedback} /></td>
                    <td className="px-4 py-3 w-32 text-right text-kb-gray text-xs">{formatDateTime(f.createdAt)}</td>
                  </tr>
                ))}
                {recentFeedbacks.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-kb-gray text-sm">피드백 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 피드백 탭 ── */}
      {!loading && activeTab === 'feedback' && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex gap-2">
            {(['all', 'up', 'down', 'none'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFeedbackFilter(f)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  feedbackFilter === f
                    ? 'bg-kb-navy text-white'
                    : 'bg-white border border-kb-gray-border text-kb-gray hover:text-kb-navy',
                )}
              >
                {{ all: '전체', up: '긍정', down: '부정', none: '미응답' }[f]}
              </button>
            ))}
            <span className="ml-auto text-xs text-kb-gray self-center">{filteredFeedbacks.length}건</span>
          </div>

          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-kb-gray-border bg-kb-gray-light/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-kb-navy">질문</th>
                  <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-20">평가</th>
                  <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-32 text-right">시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kb-gray-border">
                {filteredFeedbacks.map(f => (
                  <tr key={f.feedbackId} className="hover:bg-kb-gray-light/30">
                    <td className="px-4 py-3 text-kb-navy/80 max-w-xs truncate">{f.question || '(질문 없음)'}</td>
                    <td className="px-4 py-3"><FeedbackBadge feedback={f.feedback} /></td>
                    <td className="px-4 py-3 text-right text-kb-gray text-xs">{formatDateTime(f.createdAt)}</td>
                  </tr>
                ))}
                {filteredFeedbacks.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-kb-gray text-sm">해당 피드백 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 캐시 탭 ── */}
      {!loading && activeTab === 'cache' && (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          {/* 헤더 + 관리자 버튼 */}
          <div className="px-4 py-3 border-b border-kb-gray-border flex items-center justify-between">
            <p className="text-sm font-semibold text-kb-navy">캐시 {caches.length}건</p>
            {isAdmin && (
              confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">정말 전체 초기화하시겠습니까?</span>
                  <button
                    onClick={clearAllCache}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
                  >
                    확인
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1 rounded-lg bg-kb-gray-light text-kb-gray text-xs font-semibold hover:text-kb-navy transition-colors"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
                >
                  전체 초기화
                </button>
              )
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-kb-gray-border bg-kb-gray-light/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-kb-navy">질문</th>
                <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-20 text-center">범위</th>
                <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-14 text-center">히트</th>
                <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-28 text-right">마지막 히트</th>
                {isAdmin && <th className="w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-kb-gray-border">
              {caches.map(c => (
                <tr key={c.cacheId} className="hover:bg-kb-gray-light/30">
                  <td className="px-4 py-3 text-kb-navy/80 max-w-xs truncate">{c.question}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-kb-navy/10 text-kb-navy font-medium">
                      {parsedDocScope(c.docScope)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-kb-navy">{c.hitCount}</td>
                  <td className="px-4 py-3 text-right text-kb-gray text-xs">
                    {c.lastHitAt ? formatDateTime(c.lastHitAt) : '-'}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => deleteCache(c.cacheId)}
                        disabled={deletingId === c.cacheId}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        {deletingId === c.cacheId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {caches.length === 0 && (
                <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-6 text-center text-kb-gray text-sm">캐시 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 문서 품질 탭 ── */}
      {!loading && activeTab === 'quality' && (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-kb-gray-border bg-kb-gray-light/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-kb-navy">문서명</th>
                <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-20 text-center">카테고리</th>
                <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-14 text-center">청크</th>
                <th className="px-4 py-3 text-xs font-semibold text-kb-navy w-28 text-right">평균 품질</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kb-gray-border">
              {docQualities.map(d => {
                const { text, bg, label } = qualityStyle(d.avgQuality)
                return (
                  <tr key={d.documentId} className="hover:bg-kb-gray-light/30">
                    <td className="px-4 py-3">
                      <p className="text-kb-navy font-medium truncate max-w-xs">{d.originalName}</p>
                      <p className="text-[11px] text-kb-gray mt-0.5">{formatDateTime(d.uploadedAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-kb-navy/10 text-kb-navy font-medium">
                        {d.documentType === 'banking' ? '은행업무' : '상품'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-kb-navy">{d.chunkCount}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', bg, text)}>
                        {label} {d.chunkCount > 0 ? d.avgQuality.toFixed(2) : '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {docQualities.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-kb-gray text-sm">업로드된 문서 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Phoenix 탭 ── */}
      {activeTab === 'phoenix' && (
        <div className="rounded-2xl overflow-hidden border border-gray-200" style={{ height: '80vh' }}>
          <iframe
            src={phoenixUrl}
            className="w-full h-full"
            title="Arize Phoenix"
          />
        </div>
      )}
    </div>
  )
}
