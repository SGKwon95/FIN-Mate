import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
          await prisma.partyAuth.update({
            where: { authId: partyAuth.authId },
            data: { failedAttemptCount: { increment: 1 } },
          })
          return null
        }

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
})
