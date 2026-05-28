import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Header from "@/components/layout/Header"
import Sidebar from "@/components/layout/Sidebar"
import BottomNav from "@/components/layout/BottomNav"
import NextAuthProvider from "@/components/layout/NextAuthProvider"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const partyAuth = await prisma.partyAuth.findUnique({
    where: { partyId: session.user.partyId },
    select: { sessionToken: true },
  })
  if (partyAuth?.sessionToken && partyAuth.sessionToken !== session.user.sessionToken) {
    redirect("/login?error=duplicate")
  }

  return (
    <NextAuthProvider>
      <div className="min-h-screen flex flex-col bg-kb-gray-light">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </NextAuthProvider>
  )
}
