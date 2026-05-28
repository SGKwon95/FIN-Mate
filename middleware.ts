import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

// 고객 전용 경로 — 직원 접근 차단
const CUSTOMER_ONLY = [
  "/dashboard", "/accounts", "/transactions",
  "/transfer", "/auto-transfer", "/products", "/rates", "/settings",
]
// 직원 전용 경로 — 고객 접근 차단
const EMPLOYEE_ONLY = ["/chat"]

export default auth(function middleware(req) {
  const isLoggedIn = !!req.auth
  const isEmployee = req.auth?.user?.isEmployee === true
  const { pathname } = req.nextUrl
  const isPublic = pathname === "/login" || pathname === "/register"

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn) {
    // 로그인 후 공개 경로 → 역할별 홈으로
    if (isPublic && req.nextUrl.searchParams.get("error") !== "duplicate") {
      return NextResponse.redirect(new URL(isEmployee ? "/chat" : "/dashboard", req.url))
    }
    // 직원이 고객 전용 경로 접근 → /chat
    if (isEmployee && CUSTOMER_ONLY.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/chat", req.url))
    }
    // 고객이 직원 전용 경로 접근 → /dashboard
    if (!isEmployee && EMPLOYEE_ONLY.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
