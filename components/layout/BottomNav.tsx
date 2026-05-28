"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, ArrowLeftRight, TrendingUp, Settings, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/dashboard",        icon: Home,           label: "홈",   match: "/dashboard" },
  { href: "/accounts",         icon: Search,         label: "조회", match: ["/accounts", "/transactions", "/rates"] },
  { href: "/transfer",         icon: ArrowLeftRight, label: "이체", match: ["/transfer", "/auto-transfer"] },
  { href: "/products/deposit", icon: TrendingUp,     label: "상품", match: "/products" },
  { href: "/settings",         icon: Settings,       label: "설정", match: "/settings" },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-kb-gray-border lg:hidden safe-area-pb">
      <div className="flex h-14">
        {NAV_ITEMS.map(({ href, icon: Icon, label, match }) => {
          const patterns = Array.isArray(match) ? match : [match]
          const isActive = patterns.some(p => pathname === p || pathname.startsWith(p + "/"))

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors",
                isActive ? "text-kb-navy" : "text-kb-gray"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-kb-yellow rounded-b-full" />
              )}
              <Icon className={cn("w-5 h-5", isActive && "stroke-2")} />
              <span className={cn("text-[10px]", isActive ? "font-bold" : "font-medium")}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
