import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toKSTDateCode } from "@/lib/formatters"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params
  const today = toKSTDateCode(new Date())

  const product = await prisma.product.findUnique({
    where: { productId, productStatus: "ACTIVE" },
    select: { productId: true },
  })
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })
  }

  const terms = await prisma.productTerms.findMany({
    where: {
      productId,
      effectiveDate: { lte: today },
      OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
    },
    orderBy: [{ termsType: "asc" }, { effectiveDate: "desc" }],
    select: {
      termsId: true,
      termsType: true,
      version: true,
      effectiveDate: true,
      contentUrl: true,
    },
  })

  return NextResponse.json({ terms })
}
