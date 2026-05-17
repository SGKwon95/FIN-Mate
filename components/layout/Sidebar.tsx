"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, CreditCard, ArrowLeftRight, TrendingUp, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/dashboard", icon: Home,            label: "홈" },
  { href: "/accounts",  icon: CreditCard,       label: "내 계좌" },
  { href: "/transfer",  icon: ArrowLeftRight,   label: "이체" },
  { href: "/products",  icon: TrendingUp,       label: "상품" },
  { href: "/settings",  icon: Settings,         label: "설정" },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex flex-col w-52 bg-white border-r border-kb-gray-border shrink-0">
      <nav className="flex-1 py-5 px-2.5 space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href))

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-kb-yellow text-kb-navy font-semibold shadow-sm"
                  : "text-kb-gray hover:bg-kb-gray-light hover:text-kb-navy"
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-kb-gray-border">
        <p className="text-[10px] text-kb-gray/60 text-center">
          © 2026 KB국민은행
        </p>
      </div>
    </aside>
  )
}
