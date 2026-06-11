import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

// 고객 전용 경로 — 직원 접근 차단
const CUSTOMER_ONLY = [
  "/dashboard", "/accounts", "/transactions",
  "/transfer", "/auto-transfer", "/products", "/rates", "/settings",
  "/analysis", "/recommend",
]
// 직원 전용 경로 — 고객 접근 차단
const EMPLOYEE_ONLY = ["/chat", "/loan-review", "/ai-admin"]

export default auth(function proxy(req) {
  const isLoggedIn = !!req.auth
  const isEmployee = req.auth?.user?.isEmployee === true
  // 직원이 고객 모드로 전환한 경우 — 고객처럼 취급 (역방향 전환 불가)
  const viewAsCustomer = req.cookies.get("view-as-customer")?.value === "1"
  const effectiveEmployee = isEmployee && !viewAsCustomer

  const { pathname } = req.nextUrl
  const isPublic = pathname === "/login" || pathname === "/register"

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn) {
    // 로그인 후 공개 경로 → 역할별 홈으로
    if (isPublic && req.nextUrl.searchParams.get("error") !== "duplicate") {
      return NextResponse.redirect(new URL(effectiveEmployee ? "/chat" : "/dashboard", req.url))
    }
    // 직원(고객 모드 아님)이 고객 전용 경로 접근 → /chat
    if (effectiveEmployee && CUSTOMER_ONLY.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/chat", req.url))
    }
    // 고객(또는 고객 모드 직원)이 직원 전용 경로 접근 → /dashboard
    if (!effectiveEmployee && EMPLOYEE_ONLY.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|test-transfer\\.html).*)"],
}
