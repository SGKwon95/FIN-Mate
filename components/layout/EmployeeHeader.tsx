"use client"

import { signOut } from "next-auth/react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { LogOut, Star, MessageSquare, ClipboardList, UserRound, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { switchToCustomer } from "@/app/(main)/switch-role-action"

const NAV_ITEMS = [
  { href: "/chat",        label: "AI 상담",   icon: MessageSquare },
  { href: "/loan-review", label: "대출 심사", icon: ClipboardList },
]

export default function EmployeeHeader({ isAlsoCustomer = false }: { isAlsoCustomer?: boolean }) {
  const { data: session } = useSession()
  const userName = session?.user?.name ?? "직원"
  const pathname = usePathname()
  const [showAlert, setShowAlert] = useState(false)

  function handleSwitchClick() {
    if (!isAlsoCustomer) {
      setShowAlert(true)
      setTimeout(() => setShowAlert(false), 3000)
      return
    }
    const form = document.getElementById("switch-role-form") as HTMLFormElement
    form?.requestSubmit()
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-kb-navy">
        <div className="flex items-center justify-between h-14 px-4 max-w-screen-xl mx-auto">
          {/* 로고 + 네비게이션 */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 bg-kb-yellow rounded-full flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 text-kb-navy fill-kb-navy" />
              </div>
              <div className="leading-tight">
                <span className="text-kb-yellow font-extrabold text-sm tracking-tight">KB</span>
                <span className="text-white font-bold text-sm ml-1">직원 포털</span>
              </div>
            </div>

            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    pathname.startsWith(href)
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/10",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* 우측: 개인고객 전환 + 직원 정보 + 로그아웃 */}
          <div className="flex items-center gap-3">
            <form id="switch-role-form" action={switchToCustomer} className="hidden" />
            <button
              type="button"
              onClick={handleSwitchClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-kb-yellow text-kb-navy text-xs font-semibold hover:bg-kb-yellow/90 transition-colors"
            >
              <UserRound className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">개인고객으로 전환</span>
            </button>
            <span className="text-white/80 text-sm hidden sm:inline">{userName} 님</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors"
              aria-label="로그아웃"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* 계좌 없음 알림 토스트 */}
      {showAlert && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-kb-navy border border-white/20 shadow-lg text-white text-sm">
          <span>개인 계좌가 없어 전환할 수 없습니다.</span>
          <button onClick={() => setShowAlert(false)} className="text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  )
}
