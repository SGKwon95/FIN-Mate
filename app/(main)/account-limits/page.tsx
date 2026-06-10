import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AccountLimitsClient from "./AccountLimitsClient"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "계좌 한도 관리" }

export default async function AccountLimitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  if (!session?.user?.isEmployee) redirect("/dashboard")

  const { q } = await searchParams
  const query = q?.trim() ?? ""

  const parties = query
    ? await prisma.party.findMany({
        where: {
          partyRole: "INDIVIDUAL",
          partyStatus: "ACTIVE",
          OR: [
            { partyName: { contains: query } },
            { accounts: { some: { accountNumber: { contains: query } } } },
          ],
        },
        include: {
          individual: {
            select: {
              transferLimitPerTransaction: true,
              transferLimitPerDay: true,
            },
          },
          accounts: {
            where: { accountStatus: { not: "CLOSED" } },
            orderBy: { displayOrder: "asc" },
            select: {
              accountId: true,
              accountNumber: true,
              accountPurpose: true,
              accountStatus: true,
              balance: true,
              isLocked: true,
              transferLimitPerTransaction: true,
              transferLimitPerDay: true,
            },
          },
        },
        take: 20,
      })
    : []

  const serialized = parties.map((p) => ({
    partyId: p.partyId,
    partyName: p.partyName,
    individualLimitPerTx: p.individual?.transferLimitPerTransaction != null
      ? Number(p.individual.transferLimitPerTransaction)
      : null,
    individualLimitPerDay: p.individual?.transferLimitPerDay != null
      ? Number(p.individual.transferLimitPerDay)
      : null,
    accounts: p.accounts.map((a) => ({
      accountId: a.accountId,
      accountNumber: a.accountNumber,
      accountPurpose: a.accountPurpose ?? "GENERAL",
      accountStatus: a.accountStatus,
      balance: a.balance.toFixed(0),
      isLocked: a.isLocked,
      transferLimitPerTransaction: a.transferLimitPerTransaction != null
        ? Number(a.transferLimitPerTransaction)
        : null,
      transferLimitPerDay: a.transferLimitPerDay != null
        ? Number(a.transferLimitPerDay)
        : null,
    })),
  }))

  return <AccountLimitsClient query={query} parties={serialized} />
}
