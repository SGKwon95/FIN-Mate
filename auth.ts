import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) return null

        const partyAuth = await prisma.partyAuth.findUnique({
          where: { loginId: credentials.loginId as string },
          include: { party: { select: { partyName: true } } },
        })

        if (!partyAuth || partyAuth.partyAuthStatus !== "ACTIVE") return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          partyAuth.passwordHash,
        )
        if (!isValid) {
          // 실패 횟수 증가 (5회 초과 시 잠금은 별도 로직으로 구현 가능)
          await prisma.partyAuth.update({
            where: { authId: partyAuth.authId },
            data: { failedAttemptCount: { increment: 1 } },
          })
          return null
        }

        // 로그인 성공 — 마지막 로그인 시각 갱신
        await prisma.partyAuth.update({
          where: { authId: partyAuth.authId },
          data: { lastLoginAt: new Date(), failedAttemptCount: 0 },
        })

        return {
          id: partyAuth.partyId,
          name: partyAuth.party.partyName,
          partyId: partyAuth.partyId,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.partyId = (user as { partyId?: string }).partyId
      return token
    },
    session({ session, token }) {
      session.user.partyId = token.partyId as string
      return session
    },
  },
})
