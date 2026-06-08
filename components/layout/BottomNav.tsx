"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  Home, ArrowLeftRight, TrendingUp, Settings, Search,
  CreditCard, History, Percent, BarChart2, RefreshCw,
  Landmark, PiggyBank, Banknote, X, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavLeaf = {
  kind: "leaf"
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}
type NavGroup = {
  kind: "group"
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }[]
}
type NavItem = NavLeaf | NavGroup

const NAV_ITEMS: NavItem[] = [
  {
    kind: "group", label: "조회", icon: Search,
    children: [
      { href: "/accounts",     icon: CreditCard, label: "내 계좌" },
      { href: "/transactions", icon: History,    label: "거래내역" },
      { href: "/analysis",     icon: BarChart2,  label: "소비분석" },
    ],
  },
  { kind: "leaf", href: "/rates", icon: Percent, label: "금리" },
  { kind: "leaf",  href: "/dashboard", icon: Home,           label: "홈" },
  {
    kind: "group", label: "이체", icon: ArrowLeftRight,
    children: [
      { href: "/transfer",      icon: ArrowLeftRight, label: "즉시이체" },
      { href: "/auto-transfer", icon: RefreshCw,      label: "자동이체" },
    ],
  },
  {
    kind: "group", label: "상품", icon: TrendingUp,
    children: [
      { href: "/products/deposit", icon: Landmark,  label: "정기예금" },
      { href: "/products/savings", icon: PiggyBank, label: "적금" },
      { href: "/products/loan",    icon: Banknote,  label: "대출" },
      { href: "/recommend",        icon: Sparkles,  label: "맞춤추천" },
    ],
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  const activeSheet = NAV_ITEMS.find(
    (item): item is NavGroup => item.kind === "group" && item.label === openGroup
  ) ?? null

  return (
    <>
      {/* 서브메뉴 시트 */}
      {activeSheet && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={() => setOpenGroup(null)}
          />
          <div className="fixed bottom-14 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-xl safe-area-pb">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-kb-navy">{activeSheet.label}</span>
              <button
                onClick={() => setOpenGroup(null)}
                className="p-1 text-kb-gray hover:text-kb-navy"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4">
              {activeSheet.children.map(({ href, icon: Icon, label }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/")
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpenGroup(null)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                      isActive
                        ? "bg-kb-navy/10 text-kb-navy font-semibold"
                        : "text-kb-gray hover:bg-kb-gray-light hover:text-kb-navy"
                    )}
                  >
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* 하단 내비게이션 바 */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-kb-gray-border lg:hidden safe-area-pb">
        <div className="flex h-14">
          {NAV_ITEMS.map((item) => {
            if (item.kind === "leaf") {
              const isActive = pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpenGroup(null)}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors",
                    isActive ? "text-kb-navy" : "text-kb-gray"
                  )}
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-kb-yellow rounded-b-full" />
                  )}
                  <item.icon className={cn("w-5 h-5", isActive && "stroke-2")} />
                  <span className={cn("text-[10px]", isActive ? "font-bold" : "font-medium")}>
                    {item.label}
                  </span>
                </Link>
              )
            }

            // group
            const isGroupActive = item.children.some(
              (c) => pathname === c.href || pathname.startsWith(c.href + "/")
            )
            const isOpen = openGroup === item.label

            return (
              <button
                key={item.label}
                onClick={() => setOpenGroup(isOpen ? null : item.label)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors",
                  isGroupActive ? "text-kb-navy" : "text-kb-gray"
                )}
              >
                {isGroupActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-kb-yellow rounded-b-full" />
                )}
                <item.icon className={cn("w-5 h-5", isGroupActive && "stroke-2")} />
                <span className={cn("text-[10px]", isGroupActive ? "font-bold" : "font-medium")}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
