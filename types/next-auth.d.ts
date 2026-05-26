import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      partyId: string
      isEmployee: boolean
    } & DefaultSession["user"]
  }
  interface User {
    partyId?: string
    isEmployee?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    partyId?: string
    isEmployee?: boolean
  }
}
