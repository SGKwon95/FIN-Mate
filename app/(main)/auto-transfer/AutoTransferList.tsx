"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import Link from "next/link"
import { Plus, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react"
import { formatKRW } from "@/lib/formatters"
import { cancelScheduledTransfer } from "./actions"
import { cn } from "@/lib/utils"

type Execution = {
  executionId:   string
  executionDate: string
  status:        string
  failureReason: string | null
}

type Schedule = {
  scheduledTransferId: string
  fromAccountNumber:   string
  toBankCode:          string
  toBankName:          string
  toAccountNumber:     string
  toAccountName:       string
  amount:              string
  memo:                string | null
  transferDay:         number
  nextExecutionDate:   string | null
  lastExecutedDate:    string | null
  startDate:           string
  endDate:             string | null
  status:              string
  executions:          Execution[]
}

function formatDate(yyyymmdd: string) {
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE:    "자동이체",
  COMPLETED: "완료",
  CANCELLED: "해지",
}

export default function AutoTransferList({ schedules }: { schedules: Schedule[] }) {
  const router    = useRouter()
  const [pending, startTransition] = useTransition()

  function handleCancel(scheduledTransferId: string) {
    if (!confirm("자동이체를 해지하시겠습니까?")) return
    startTransition(async () => {
      const result = await cancelScheduledTransfer(scheduledTransferId)
      if (result.ok) {
        router.refresh()
      } else {
        alert(result.message)
      }
    })
  }

  return (
    <div className="space-y-4">
      {schedules.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card py-16 text-center text-kb-gray text-sm">
          등록된 자동이체가 없습니다.
        </div>
      ) : (
        schedules.map((s) => (
          <div key={s.scheduledTransferId} className="bg-white rounded-2xl shadow-card overflow-hidden">
            {/* 헤더 */}
            <div className="px-5 py-4 border-b border-kb-gray-border bg-kb-gray-light flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-kb-navy" />
                <span className="text-sm font-semibold text-kb-navy">
                  {s.toAccountName} · {s.toBankName}
                </span>
              </div>
              <span className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded-full",
                s.status === "ACTIVE"    ? "bg-blue-100 text-blue-700" :
                s.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                                           "bg-gray-100 text-gray-500"
              )}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
            </div>

            {/* 이체 정보 */}
            <div className="px-5 py-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-kb-gray mb-0.5">{s.toBankName} {s.toAccountNumber}</p>
                  <p className="text-lg font-bold text-kb-navy tabular-nums">
                    {formatKRW(s.amount)}
                  </p>
                  {s.memo && <p className="text-xs text-kb-gray mt-0.5">{s.memo}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-kb-gray mb-0.5">출금계좌</p>
                  <p className="text-xs font-mono text-kb-navy">{s.fromAccountNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-kb-gray">이체일</span>
                <span className="text-kb-navy font-medium text-right">매월 {s.transferDay}일</span>

                {s.nextExecutionDate && (
                  <>
                    <span className="text-kb-gray">다음 이체일</span>
                    <span className="text-blue-600 font-semibold text-right">{formatDate(s.nextExecutionDate)}</span>
                  </>
                )}

                {s.endDate && (
                  <>
                    <span className="text-kb-gray">종료일</span>
                    <span className="text-kb-navy font-medium text-right">{formatDate(s.endDate)}</span>
                  </>
                )}
              </div>
            </div>

            {/* 최근 실행 이력 */}
            {s.executions.length > 0 && (
              <div className="px-5 py-3 border-t border-kb-gray-border bg-kb-gray-light">
                <p className="text-[11px] font-semibold text-kb-gray mb-2">최근 실행 이력</p>
                <div className="space-y-1.5">
                  {s.executions.map((e) => (
                    <div key={e.executionId} className="flex items-center gap-2 text-xs">
                      {e.status === "SUCCESS" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      <span className="text-kb-gray">{formatDate(e.executionDate)}</span>
                      <span className={e.status === "SUCCESS" ? "text-green-600" : "text-red-500"}>
                        {e.status === "SUCCESS" ? "성공" : `실패${e.failureReason ? ` (${e.failureReason})` : ""}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 해지 버튼 */}
            {s.status === "ACTIVE" && (
              <div className="px-5 py-3 border-t border-kb-gray-border">
                <button
                  onClick={() => handleCancel(s.scheduledTransferId)}
                  disabled={pending}
                  className="w-full py-2 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  해지
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {/* 등록 버튼 */}
      <Link
        href="/auto-transfer/new"
        className="flex items-center justify-center gap-2 w-full py-3.5 bg-kb-navy text-white rounded-2xl text-sm font-semibold hover:bg-kb-navy/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        자동이체 등록
      </Link>
    </div>
  )
}
