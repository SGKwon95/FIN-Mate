import type { NextAuthConfig } from "next-auth"

// Edge 런타임 호환 최소 설정 — bcrypt/prisma 미포함
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { partyId?: string; isEmployee?: boolean }
        token.partyId = u.partyId
        token.isEmployee = u.isEmployee ?? false
      }
      return token
    },
    session({ session, token }) {
      session.user.partyId = token.partyId as string
      session.user.isEmployee = token.isEmployee as boolean
      return session
    },
  },
} satisfies NextAuthConfig
