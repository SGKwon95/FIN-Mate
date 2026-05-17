import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth(function middleware(req) {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl
  const isOnLogin = pathname === "/login"

  if (!isLoggedIn && !isOnLogin) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  if (isLoggedIn && isOnLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
  return NextResponse.next()
})

export const config = {
  // api, static, image, favicon, login 제외한 모든 경로에 미들웨어 적용
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
