"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Bell } from "lucide-react"
import { formatDate } from "@/lib/formatters"

type Notification = {
  notificationId: string
  type: string
  title: string
  body: string
  isRead: boolean
  linkedEntityId: string | null
  createdAt: string
}

const TYPE_ICON: Record<string, string> = {
  TRANSFER_OUT:     "↑",
  TRANSFER_IN:      "↓",
  LOW_BALANCE:      "!",
  ACCOUNT_LOCKED:   "🔒",
  SAVINGS_DUE:      "📅",
  SAVINGS_PAID:     "✓",
  SAVINGS_MATURITY: "🎉",
  RISK_ALERT:       "⚠",
}

const TYPE_COLOR: Record<string, string> = {
  TRANSFER_OUT:     "bg-blue-100 text-blue-700",
  TRANSFER_IN:      "bg-green-100 text-green-700",
  LOW_BALANCE:      "bg-orange-100 text-orange-700",
  ACCOUNT_LOCKED:   "bg-red-100 text-red-700",
  SAVINGS_DUE:      "bg-yellow-100 text-yellow-700",
  SAVINGS_PAID:     "bg-green-100 text-green-700",
  SAVINGS_MATURITY: "bg-purple-100 text-purple-700",
  RISK_ALERT:       "bg-red-100 text-red-700",
}

export default function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchAndMarkRead = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/notifications")
    if (res.ok) {
      const data: Notification[] = await res.json()
      setNotifications(data)
      if (data.some((n) => !n.isRead)) {
        await fetch("/api/notifications", { method: "PATCH" })
        setUnreadCount(0)
      }
    }
    setLoading(false)
  }, [])

  const handleOpen = () => {
    if (!open) fetchAndMarkRead()
    setOpen((v) => !v)
  }

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-kb-navy/10 transition-colors"
        aria-label="알림"
      >
        <Bell className="w-5 h-5 text-kb-navy" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-card-hover border border-kb-gray-border z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-kb-gray-border">
            <span className="text-sm font-semibold text-kb-navy">알림</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-kb-gray">불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-kb-gray">알림이 없습니다</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-kb-gray-border">
              {notifications.map((n) => (
                <li
                  key={n.notificationId}
                  className={`px-4 py-3 flex gap-3 items-start ${n.isRead ? "bg-white" : "bg-blue-50/40"}`}
                >
                  <span
                    className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${TYPE_COLOR[n.type] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {TYPE_ICON[n.type] ?? "·"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-kb-navy truncate">{n.title}</p>
                    <p className="text-xs text-kb-gray mt-0.5 break-words">{n.body}</p>
                    <p className="text-[10px] text-kb-gray/60 mt-1">
                      {formatDate(n.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
