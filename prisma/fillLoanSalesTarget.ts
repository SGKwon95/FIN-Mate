import "dotenv/config"
import { prisma } from "../lib/prisma"

// 대출 유형별 가중치 (현실적 배분)
const EMPLOYMENT_WEIGHTS: Record<string, Array<{ value: string; weight: number }>> = {
  REAL_ESTATE: [
    { value: "EMPLOYED",      weight: 45 },
    { value: "SELF_EMPLOYED", weight: 30 },
    { value: "CONTRACT",      weight: 15 },
    { value: "RETIRED",       weight: 10 },
  ],
  JEONSE_RIGHT: [
    { value: "EMPLOYED",      weight: 40 },
    { value: "SELF_EMPLOYED", weight: 25 },
    { value: "CONTRACT",      weight: 25 },
    { value: "UNEMPLOYED",    weight: 10 },
  ],
  CREDIT: [
    { value: "EMPLOYED",      weight: 50 },
    { value: "SELF_EMPLOYED", weight: 20 },
    { value: "CONTRACT",      weight: 25 },
    { value: "UNEMPLOYED",    weight: 5  },
  ],
}

function weightedRandom(weights: Array<{ value: string; weight: number }>): string {
  const total = weights.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const { value, weight } of weights) {
    r -= weight
    if (r <= 0) return value
  }
  return weights[weights.length - 1].value
}

async function main() {
  const products = await prisma.product.findMany({
    where: { productTypeCode: "LOAN", salesTarget: "INDIVIDUAL" },
    select: {
      productId: true,
      loanDetail: { select: { collateralType: true, collateralRequired: true } },
    },
  })

  console.log(`업데이트 대상: ${products.length}개`)

  for (const p of products) {
    const d = p.loanDetail
    const key =
      d?.collateralType === "REAL_ESTATE"  ? "REAL_ESTATE" :
      d?.collateralType === "JEONSE_RIGHT" ? "JEONSE_RIGHT" :
      "CREDIT"

    const salesTarget = weightedRandom(EMPLOYMENT_WEIGHTS[key])
    await prisma.product.update({
      where: { productId: p.productId },
      data: { salesTarget },
    })
  }

  // 결과 집계
  const result = await prisma.product.groupBy({
    by: ["salesTarget"],
    where: { productTypeCode: "LOAN" },
    _count: true,
  })
  console.log("결과:", result.map(r => `${r.salesTarget}: ${r._count}개`).join(", "))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
