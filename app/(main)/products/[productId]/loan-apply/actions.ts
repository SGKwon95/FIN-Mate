"use server"

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export type LoanApplyFormData = {
  productId: string
  requestedAmount: number
  requestedPeriodMonths: number
  loanPurpose: string
  mlCreditScore: number
  mlHomeOwnership: string
  mlDti: number
  mlInqLast6Mths: number
  mlPubRec: number
}

export async function submitLoanApplication(data: LoanApplyFormData): Promise<{ applicationId: string }> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  const product = await prisma.product.findUnique({
    where: { productId: data.productId, productStatus: "ACTIVE" },
    select: { productTypeCode: true },
  })
  if (!product || product.productTypeCode !== "LOAN") {
    throw new Error("대출 상품이 아닙니다")
  }

  const application = await prisma.loanApplication.create({
    data: {
      partyId: session.user.partyId,
      productId: data.productId,
      requestedAmount: data.requestedAmount,
      requestedPeriodMonths: data.requestedPeriodMonths,
      loanPurpose: data.loanPurpose,
      applicationStatus: "SUBMITTED",
      channel: "WEB",
      submittedAt: new Date(),
      mlCreditScore: data.mlCreditScore,
      mlHomeOwnership: data.mlHomeOwnership,
      mlDti: data.mlDti,
      mlInqLast6Mths: data.mlInqLast6Mths,
      mlPubRec: data.mlPubRec,
    },
    select: { applicationId: true },
  })

  return { applicationId: application.applicationId }
}
