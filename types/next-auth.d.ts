import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      partyId: string
    } & DefaultSession["user"]
  }
  interface User {
    partyId?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    partyId?: string
  }
}
