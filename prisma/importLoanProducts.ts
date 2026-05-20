import "dotenv/config"
import { readFileSync } from "fs"
import { join } from "path"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as never)

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000001"

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const records: string[][] = []
  let cur = ""
  let inQuote = false
  let row: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i]
    if (inQuote) {
      if (ch === '"') {
        if (lines[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === ',') {
        row.push(cur); cur = ""
      } else if (ch === '\n') {
        row.push(cur); cur = ""
        records.push(row); row = []
      } else {
        cur += ch
      }
    }
  }
  if (cur || row.length) { row.push(cur); records.push(row) }

  const headers = records[0]
  return records.slice(1).filter(r => r.length >= headers.length).map(r => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h.trim()] = (r[i] ?? "").trim() })
    return obj
  })
}

function parseDate(s: string): Date | null {
  if (!s || s.length < 8) return null
  const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8)
  const dt = new Date(`${y}-${m}-${d}`)
  return isNaN(dt.getTime()) ? null : dt
}

function parseExpiryDate(s: string): string | null {
  if (!s || s.length < 8) return null
  if (s === "99991231") return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/** loan_lmt에서 LTV 비율 추출 (예: "LTV 70%" → 0.70) */
function parseLtv(text: string): number | null {
  const m = text.match(/LTV\s*(?:최대\s*)?([0-9]+)%/)
  return m ? Number(m[1]) / 100 : null
}

/** loan_lmt에서 최대 대출금액 추출 (예: "최대4.44억원" → 444000000) */
function parseMaxLoanAmount(text: string): number | null {
  const eokM = text.match(/최대\s*([0-9.]+)\s*억원/)
  if (eokM) return Math.round(Number(eokM[1]) * 100_000_000)
  const manM = text.match(/최대\s*([0-9,]+)\s*만원/)
  if (manM) return Number(manM[1].replace(/,/g, "")) * 10_000
  const wonM = text.match(/최대\s*([0-9,]+)\s*원/)
  if (wonM) return Number(wonM[1].replace(/,/g, ""))
  return null
}

/** erly_rpay_fee에서 중도상환수수료율 추출 (첫 번째 숫자% 기준) */
function parseEarlyRepaymentFee(text: string): number | null {
  const m = text.match(/([0-9.]+)%/)
  return m ? Number(m[1]) / 100 : null
}

/** dly_rate에서 최고 연체이자율 추출 (예: "최고연체이자율 : 12%" → 0.12) */
function parseOverdueRate(text: string): number | null {
  const m = text.match(/최고\s*연체이자율\s*[:：]\s*(?:연\s*)?([0-9.]+)%/)
  return m ? Number(m[1]) / 100 : null
}

type LoanType = "MORTGAGE" | "RENT_HOUSE" | "CREDIT"

async function importLoanCsv(csvFile: string, loanType: LoanType) {
  const csvPath = join(process.cwd(), csvFile)
  const rows = parseCsv(readFileSync(csvPath, "utf-8"))
  console.log(`[${csvFile}] 파싱된 상품 수: ${rows.length}`)

  const isCredit = loanType === "CREDIT"
  const collateralType =
    loanType === "MORTGAGE" ? "REAL_ESTATE" :
    loanType === "RENT_HOUSE" ? "JEONSE_RIGHT" : null

  let created = 0
  for (const row of rows) {
    const launchDate = parseDate(row.dcls_strt_day)
    if (!launchDate) { console.warn(`날짜 파싱 실패, 건너뜀: ${row.fin_prdt_nm}`); continue }

    const expiryDate = parseExpiryDate(row.dcls_end_day)

    const productName = (
      isCredit && row.crdt_prdt_type_nm
        ? `${row.fin_prdt_nm} (${row.crdt_prdt_type_nm})`
        : row.fin_prdt_nm
    ).slice(0, 199)

    const description = [
      row.join_way ? `가입방법: ${row.join_way}` : "",
      !isCredit && row.loan_inci_expn ? `부대비용: ${row.loan_inci_expn}` : "",
      !isCredit && row.erly_rpay_fee ? `중도상환수수료: ${row.erly_rpay_fee}` : "",
      !isCredit && row.dly_rate ? `연체이자율: ${row.dly_rate}` : "",
      !isCredit && row.loan_lmt ? `대출한도: ${row.loan_lmt}` : "",
      isCredit && row.cb_name ? `CB기관: ${row.cb_name}` : "",
      isCredit && row.crdt_prdt_type_nm ? `상품유형: ${row.crdt_prdt_type_nm}` : "",
    ].filter(Boolean).join("\n\n")

    const ltvRatio = !isCredit ? parseLtv(row.loan_lmt || "") : null
    const maxLoanAmount = !isCredit ? parseMaxLoanAmount(row.loan_lmt || "") : null
    const earlyRepaymentFeeRate = !isCredit ? parseEarlyRepaymentFee(row.erly_rpay_fee || "") : null
    const overdueInterestRate = !isCredit ? parseOverdueRate(row.dly_rate || "") : null
    const earlyRepaymentAllowed = !isCredit
      ? (row.erly_rpay_fee?.trim() !== "")
      : true

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          productName,
          productTypeCode: "LOAN",
          productStatus: "ACTIVE",
          launchDate,
          expiryDate,
          periodType: "UNLIMITED",
          salesTarget: "ALL",
          isDepositInsured: false,
          description,
          createdBy: SYSTEM_UUID,
          updatedBy: SYSTEM_UUID,
        },
      })

      await tx.loanDetail.create({
        data: {
          productId: product.productId,
          baseRateType: "VARIABLE",
          interestType: "SIMPLE",
          collateralRequired: !isCredit,
          collateralType,
          maxLtvRatio: ltvRatio,
          maxLoanAmount,
          repaymentMethod: "EQUAL_INSTALLMENT",
          earlyRepaymentAllowed,
          earlyRepaymentFeeRate,
          overdueInterestRate,
          createdBy: SYSTEM_UUID,
          updatedBy: SYSTEM_UUID,
        },
      })

      await tx.productRate.create({
        data: {
          productId: product.productId,
          rateType: "BASE",
          rateStructure: "FIXED",
          rate: 0,
          effectiveFrom: launchDate,
          createdBy: SYSTEM_UUID,
          updatedBy: SYSTEM_UUID,
        },
      })
    })

    created++
    console.log(`[${created}/${rows.length}] ${productName}`)
  }

  console.log(`완료: ${created}개 상품 임포트\n`)
  return created
}

async function main() {
  await importLoanCsv("data/product/mortgageloan_products.csv", "MORTGAGE")
  await importLoanCsv("data/product/renthouseloan_products.csv", "RENT_HOUSE")
  await importLoanCsv("data/product/creditloan_products.csv", "CREDIT")
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
