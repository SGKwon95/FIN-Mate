import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
