import Link from "next/link";
import { Star, Bell, LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";

export default async function Header() {
  const session = await auth();
  const userName = session?.user?.name ?? "고객";

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
        <div className="flex items-center gap-1">
          <span className="text-kb-navy/70 text-sm mr-1 hidden sm:block">
            <span className="font-semibold text-kb-navy">{userName}</span>
            <span>님</span>
          </span>

          {/* 알림 */}
          <button className="relative p-2 rounded-lg hover:bg-kb-navy/10 transition-colors">
            <Bell className="w-5 h-5 text-kb-navy" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </button>

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
