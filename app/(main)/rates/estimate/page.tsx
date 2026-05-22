import { auth } from "@/auth"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import RateCalculator from "./RateCalculator"

export const metadata: Metadata = { title: "예상금리 계산" }

export default async function RateEstimatePage() {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      <h1 className="text-lg font-bold text-kb-navy mb-4">예상금리 계산</h1>
      <RateCalculator />
    </div>
  )
}
