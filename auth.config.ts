import type { NextAuthConfig } from "next-auth"

// Edge 런타임 호환 최소 설정 — bcrypt/prisma 미포함
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },  // 8시간
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { partyId?: string; isEmployee?: boolean; isAdmin?: boolean; sessionToken?: string }
        token.partyId = u.partyId
        token.isEmployee = u.isEmployee ?? false
        token.isAdmin = u.isAdmin ?? false
        token.sessionToken = u.sessionToken
      }
      return token
    },
    session({ session, token }) {
      session.user.partyId = token.partyId as string
      session.user.isEmployee = token.isEmployee as boolean
      session.user.isAdmin = token.isAdmin as boolean
      session.user.sessionToken = token.sessionToken as string
      return session
    },
  },
} satisfies NextAuthConfig
