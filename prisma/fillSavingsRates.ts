import "dotenv/config"
import { prisma } from "../lib/prisma"

// 2024~2025년 국내 적금 기준금리 범위: 2.8% ~ 5.5% → 소수 형식 (0.028 ~ 0.055)
function randRate(min: number, max: number) {
  const steps = Math.round((max - min) / 0.0005)
  return Math.round((Math.floor(Math.random() * (steps + 1)) * 0.0005 + min) * 10000) / 10000
}

async function main() {
  const targets = await prisma.productRate.findMany({
    where: {
      rate: 0,
      rateType: "BASE",
      product: { depositDetail: { transactionType: "SAVINGS" } },
    },
    select: { productRateId: true },
  })

  console.log(`업데이트 대상: ${targets.length}개`)

  for (const r of targets) {
    // 0.0280 ~ 0.0550 (2.80% ~ 5.50%), 0.05% 단위
    const rate = randRate(0.0280, 0.0550)
    await prisma.productRate.update({
      where: { productRateId: r.productRateId },
      data: { rate },
    })
  }

  console.log("완료")
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
