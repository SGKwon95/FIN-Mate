import Link from "next/link";
import { Star, LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import { getUnreadCount } from "@/lib/notifications";
import NotificationBell from "@/components/layout/NotificationBell";
import IdleTimeout from "@/components/layout/IdleTimeout";

export default async function Header() {
  const session = await auth();
  const userName = session?.user?.name ?? "고객";
  const unreadCount = session?.user?.partyId
    ? await getUnreadCount(session.user.partyId)
    : 0;

  return (
    <header className="sticky top-0 z-40 bg-kb-yellow">
      <div className="flex items-center justify-between h-14 px-4 max-w-screen-xl mx-auto">
        {/* 로고 */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <Star className="fill-kb-navy text-kb-navy w-5 h-5" />
          <span className="text-kb-navy font-bold text-[17px] tracking-tight">
            SG Star
          </span>
        </Link>

        {/* 우측 액션 */}
        <div className="flex items-center gap-2">
          <span className="text-kb-navy/70 text-sm hidden sm:block">
            <span className="font-semibold text-kb-navy">{userName}</span>
            <span>님</span>
          </span>

          {process.env.NODE_ENV !== 'development' && <IdleTimeout />}

          {/* 알림 */}
          <NotificationBell initialUnreadCount={unreadCount} />

          {/* 로그아웃 — Server Action */}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="p-2 rounded-lg hover:bg-kb-navy/10 transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5 text-kb-navy" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
