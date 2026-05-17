"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"
import { cn } from "@/lib/utils"

const PERIODS = [
  { label: "1주일", value: "7" },
  { label: "1개월", value: "30" },
  { label: "3개월", value: "90" },
  { label: "6개월", value: "180" },
] as const

const TX_TYPES = [
  { label: "전체", value: "ALL" },
  { label: "입금", value: "DEPOSIT" },
  { label: "출금", value: "WITHDRAWAL" },
  { label: "이체", value: "TRANSFER_OUT" },
] as const

export default function TransactionFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const period = searchParams.get("period") ?? "30"
  const type = searchParams.get("type") ?? "ALL"

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(key, value)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="bg-white px-4 pt-3 pb-2 border-b border-kb-gray-border space-y-2">
      {/* 기간 필터 */}
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => updateParam("period", p.value)}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors",
              period === p.value
                ? "bg-kb-navy text-white"
                : "bg-kb-gray-light text-kb-gray hover:bg-kb-gray-border",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 거래 유형 필터 */}
      <div className="flex gap-1.5">
        {TX_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => updateParam("type", t.value)}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors",
              type === t.value
                ? "bg-kb-yellow text-kb-navy"
                : "bg-kb-gray-light text-kb-gray hover:bg-kb-gray-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
