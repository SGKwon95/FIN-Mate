import type { NextAuthConfig } from "next-auth"

// Edge 런타임 호환 최소 설정 — bcrypt/prisma 미포함
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
        // maxAge 없음 = 브라우저 닫으면 만료되는 세션 쿠키
      },
    },
  },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { partyId?: string; isEmployee?: boolean; sessionToken?: string }
        token.partyId = u.partyId
        token.isEmployee = u.isEmployee ?? false
        token.sessionToken = u.sessionToken
      }
      return token
    },
    session({ session, token }) {
      session.user.partyId = token.partyId as string
      session.user.isEmployee = token.isEmployee as boolean
      session.user.sessionToken = token.sessionToken as string
      return session
    },
  },
} satisfies NextAuthConfig
