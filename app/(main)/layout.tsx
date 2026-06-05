import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Header from "@/components/layout/Header"
import Sidebar from "@/components/layout/Sidebar"
import BottomNav from "@/components/layout/BottomNav"
import EmployeeHeader from "@/components/layout/EmployeeHeader"
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

  const jar = await cookies()
  const viewAsCustomer = jar.get("view-as-customer")?.value === "1"

  // 직원 전용 레이아웃: 고객 모드 전환 전까지
  if (session.user.isEmployee && !viewAsCustomer) {
    const hasAccounts = await prisma.account.count({
      where: { partyId: session.user.partyId },
    }) > 0

    return (
      <NextAuthProvider>
        <div className="min-h-screen flex flex-col bg-kb-gray-light">
          <EmployeeHeader isAlsoCustomer={hasAccounts} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </NextAuthProvider>
    )
  }

  // 고객 레이아웃
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
