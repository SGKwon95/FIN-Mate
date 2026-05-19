import Link from "next/link";
import {
  ArrowLeftRight,
  ClipboardList,
  MoreHorizontal,
  PiggyBank,
} from "lucide-react";

const ACTIONS = [
  {
    label: "이체",
    icon: ArrowLeftRight,
    href: "/transfer",
    color: "text-kb-navy",
  },
  {
    label: "내계좌",
    icon: ClipboardList,
    href: "/accounts",
    color: "text-kb-navy",
  },
  {
    label: "적금",
    icon: PiggyBank,
    href: "/products?type=savings",
    color: "text-kb-navy",
  },
  { label: "더보기", icon: MoreHorizontal, href: "#", color: "text-kb-gray" },
];

export default function QuickActions() {
  return (
    <section className="bg-white rounded-2xl px-5 py-4 shadow-card">
      <h2 className="text-kb-navy font-bold text-base mb-4">빠른 서비스</h2>
      <div className="grid grid-cols-5 gap-1">
        {ACTIONS.map(({ label, icon: Icon, href, color }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-1.5 group py-1"
          >
            <div className="w-12 h-12 rounded-2xl bg-kb-gray-light flex items-center justify-center group-hover:bg-kb-yellow group-active:scale-95 transition-all duration-150">
              <Icon className={`w-5 h-5 ${color} group-hover:text-kb-navy`} />
            </div>
            <span className="text-[11px] text-kb-gray font-medium text-center leading-tight">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
