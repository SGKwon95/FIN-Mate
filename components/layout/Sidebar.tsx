"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  CreditCard,
  History,
  ArrowLeftRight,
  Settings,
  Search,
  ChevronDown,
  Landmark,
  PiggyBank,
  Banknote,
  TrendingUp,
  Percent,
  RefreshCw,
  BarChart2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLeaf = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};
type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  basePath?: string;
  children: NavLeaf[];
};
type NavItem = NavLeaf | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: Home, label: "홈" },
  {
    label: "조회",
    icon: Search,
    children: [
      { href: "/accounts",     icon: CreditCard,  label: "내 계좌" },
      { href: "/transactions", icon: History,     label: "거래내역" },
      { href: "/analysis",     icon: BarChart2,   label: "소비분석" },
    ],
  },
  { href: "/rates", icon: Percent, label: "금리" },
  {
    label: "이체",
    icon: ArrowLeftRight,
    children: [
      { href: "/transfer",      icon: ArrowLeftRight, label: "즉시이체" },
      { href: "/auto-transfer", icon: RefreshCw,      label: "자동이체" },
    ],
  },
  {
    label: "상품",
    icon: TrendingUp,
    basePath: "/products",
    children: [
      { href: "/products/deposit", icon: Landmark,  label: "정기예금" },
      { href: "/products/savings", icon: PiggyBank, label: "적금" },
      { href: "/products/loan",    icon: Banknote,  label: "대출" },
      { href: "/recommend",        icon: Sparkles,  label: "맞춤추천" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  return (
    <aside className="hidden lg:flex flex-col w-52 bg-white border-r border-kb-gray-border shrink-0">
      <nav className="flex-1 py-5 px-2.5 space-y-1">
        {NAV_ITEMS.map((item) => {
          if (isGroup(item)) {
            const isGroupActive =
              (item.basePath ? pathname.startsWith(item.basePath) : false) ||
              item.children.some((c) => pathname.startsWith(c.href));
            const isOpen = isGroupActive || openGroups.includes(item.label);

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isGroupActive
                      ? "bg-kb-yellow text-kb-navy font-semibold shadow-sm"
                      : "text-kb-gray hover:bg-kb-gray-light hover:text-kb-navy",
                  )}
                >
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l-2 border-kb-gray-border space-y-0.5">
                    {item.children.map((child) => {
                      const isActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                            isActive
                              ? "bg-kb-navy/10 text-kb-navy font-semibold"
                              : "text-kb-gray hover:bg-kb-gray-light hover:text-kb-navy",
                          )}
                        >
                          <child.icon className="w-4 h-4 shrink-0" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-kb-yellow text-kb-navy font-semibold shadow-sm"
                  : "text-kb-gray hover:bg-kb-gray-light hover:text-kb-navy",
              )}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-kb-gray-border">
        <p className="text-[10px] text-kb-gray/60 text-center">
          © 2026 KB국민은행
        </p>
      </div>
    </aside>
  );
}
