import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import SavingsWizard from "./SavingsWizard"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "적금 가입" }

export default async function SavingsSubscribePage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const [product, accounts] = await Promise.all([
    prisma.product.findUnique({
      where: { productId },
      select: {
        productId: true,
        productName: true,
        productStatus: true,
        depositDetail: {
          select: { transactionType: true, minAmount: true, maxAmount: true, minPeriodMonths: true, maxPeriodMonths: true },
        },
        productRates: {
          where: { rateType: "BASE" },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { rate: true },
        },
      },
    }),
    prisma.account.findMany({
      where: {
        partyId: session.user.partyId,
        accountStatus: "ACTIVE",
        isLocked: false,
        isHidden: false,
        accountPurpose: { in: ["GENERAL", "SALARY"] },
      },
      orderBy: { displayOrder: "asc" },
      select: { accountId: true, accountNumber: true, accountPurpose: true, balance: true },
    }),
  ])

  if (!product || product.productStatus !== "ACTIVE" || product.depositDetail?.transactionType !== "SAVINGS") {
    notFound()
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-kb-gray">출금 가능한 계좌가 없습니다.</p>
      </div>
    )
  }

  const serialized = accounts.map(a => ({ ...a, balance: a.balance.toFixed(0) }))

  return (
    <SavingsWizard
      product={{
        productId: product.productId,
        productName: product.productName,
        rate: Number(product.productRates[0]?.rate ?? 0),
        minAmount: Number(product.depositDetail!.minAmount ?? 10_000),
        maxAmount: Number(product.depositDetail!.maxAmount ?? 1_000_000),
        minPeriodMonths: product.depositDetail!.minPeriodMonths ?? 6,
        maxPeriodMonths: product.depositDetail!.maxPeriodMonths ?? 36,
        termsUrl: `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}/terms/savings.html`,
      }}
      accounts={serialized}
    />
  )
}
