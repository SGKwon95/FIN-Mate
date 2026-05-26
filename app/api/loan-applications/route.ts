import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.partyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const {
    productId,
    requestedAmount,
    requestedPeriodMonths,
    loanPurpose,
    // ML 사용자 입력 피처
    mlCreditScore,
    mlHomeOwnership,
    mlDti,
    mlInqLast6Mths,
    mlPubRec,
  } = body

  if (!productId || !requestedAmount || !requestedPeriodMonths) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 })
  }

  const product = await prisma.product.findUnique({
    where: { productId, productStatus: "ACTIVE" },
    select: { productId: true, productTypeCode: true },
  })
  if (!product || product.productTypeCode !== "LOAN") {
    return NextResponse.json({ error: "대출 상품이 아닙니다" }, { status: 400 })
  }

  const application = await prisma.loanApplication.create({
    data: {
      partyId: session.user.partyId,
      productId,
      requestedAmount,
      requestedPeriodMonths,
      loanPurpose: loanPurpose ?? null,
      applicationStatus: "SUBMITTED",
      channel: "WEB",
      submittedAt: new Date(),
      mlCreditScore: mlCreditScore ?? null,
      mlHomeOwnership: mlHomeOwnership ?? null,
      mlDti: mlDti ?? null,
      mlInqLast6Mths: mlInqLast6Mths ?? null,
      mlPubRec: mlPubRec ?? null,
    },
    select: { applicationId: true },
  })

  return NextResponse.json({ applicationId: application.applicationId }, { status: 201 })
}
