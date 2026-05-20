import "dotenv/config"
import { prisma } from "../lib/prisma"

function randStep(min: number, max: number, step: number) {
  const steps = Math.floor((max - min) / step)
  return (Math.floor(Math.random() * (steps + 1)) * step + min)
}

async function main() {
  const nullAmounts = await prisma.loanDetail.findMany({
    where: { maxLoanAmount: null },
    select: { loanDetailId: true, collateralType: true, collateralRequired: true },
  })

  console.log(`업데이트 대상: ${nullAmounts.length}개`)

  for (const d of nullAmounts) {
    let amount: number

    if (d.collateralType === "REAL_ESTATE") {
      // 주택담보: 2억 ~ 10억, 5천만 단위
      amount = randStep(200_000_000, 1_000_000_000, 50_000_000)
    } else if (d.collateralType === "JEONSE_RIGHT") {
      // 전세자금: 1억 ~ 5억, 5천만 단위
      amount = randStep(100_000_000, 500_000_000, 50_000_000)
    } else {
      // 신용: 3천만 ~ 1억, 1천만 단위
      amount = randStep(30_000_000, 100_000_000, 10_000_000)
    }

    await prisma.loanDetail.update({
      where: { loanDetailId: d.loanDetailId },
      data: { maxLoanAmount: amount },
    })
  }

  console.log("완료")
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
