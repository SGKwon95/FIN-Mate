import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import LoanApplyWizard from "./LoanApplyWizard"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "대출 신청" }

export default async function LoanApplyPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params

  const product = await prisma.product.findUnique({
    where: { productId, productStatus: "ACTIVE" },
    select: {
      productId: true,
      productName: true,
      productTypeCode: true,
      loanDetail: {
        select: {
          maxLoanAmount: true,
          maxLoanPeriodMonths: true,
        },
      },
      productRates: {
        where: { rateType: "BASE" },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { rate: true },
      },
    },
  })

  if (!product || product.productTypeCode !== "LOAN") notFound()

  return (
    <LoanApplyWizard
      product={{
        productId: product.productId,
        productName: product.productName,
        baseRate: Number(product.productRates[0]?.rate ?? 0),
        maxLoanAmount: product.loanDetail?.maxLoanAmount
          ? Number(product.loanDetail.maxLoanAmount)
          : null,
        maxLoanPeriodMonths: product.loanDetail?.maxLoanPeriodMonths ?? null,
      }}
    />
  )
}
