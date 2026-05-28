"use client"

import { signOut } from "next-auth/react"
import { useSession } from "next-auth/react"
import { LogOut, Star } from "lucide-react"

export default function EmployeeHeader() {
  const { data: session } = useSession()
  const userName = session?.user?.name ?? "직원"

  return (
    <header className="sticky top-0 z-40 bg-kb-navy">
      <div className="flex items-center justify-between h-14 px-4 max-w-screen-xl mx-auto">
        {/* 로고 */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-kb-yellow rounded-full flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-kb-navy fill-kb-navy" />
          </div>
          <div className="leading-tight">
            <span className="text-kb-yellow font-extrabold text-sm tracking-tight">KB</span>
            <span className="text-white font-bold text-sm ml-1">직원 포털</span>
          </div>
        </div>

        {/* 우측: 직원 정보 + 로그아웃 */}
        <div className="flex items-center gap-3">
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
  )
}
