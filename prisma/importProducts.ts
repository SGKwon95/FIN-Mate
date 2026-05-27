import "dotenv/config"
import { readFileSync } from "fs"
import { join } from "path"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as never)

// 시스템 처리용 UUID (실제 party 없이 임포트 시 사용)
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000001"

/**
 * RFC 4180 호환 CSV 파서 (멀티라인 quoted 필드 지원)
 */
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
  if (s === "99991231") return null // 무기한은 null 처리
  return s.slice(0, 8)
}

/** etc_note에서 최소 가입금액(원) 추출 */
function parseMinAmount(text: string): number {
  const m = text.match(/(?:최소\s*)?가입\s*(?:금액|한도)[^0-9]*([0-9,]+)\s*(?:만원|백만원|천만원|원)/)
  if (!m) return 1_000_000
  const num = Number(m[1].replace(/,/g, ""))
  if (text.includes("천만원")) return num * 10_000_000
  if (text.includes("백만원")) return num * 1_000_000
  if (text.includes("만원")) return num * 10_000
  return num
}

/** etc_note에서 가입기간(개월) 추출 → [min, max] */
function parsePeriod(text: string): [number, number] {
  // "1개월 이상 36개월 이하" 형태
  const rangeM = text.match(/([0-9]+)\s*개월\s*이상[^0-9]*([0-9]+)\s*개월/)
  if (rangeM) return [Number(rangeM[1]), Number(rangeM[2])]
  // "1~36개월" 형태
  const tildaM = text.match(/([0-9]+)\s*[~～]\s*([0-9]+)\s*개월/)
  if (tildaM) return [Number(tildaM[1]), Number(tildaM[2])]
  // "12개월" 단일 값
  const singleM = text.match(/([0-9]+)\s*개월/)
  if (singleM) { const v = Number(singleM[1]); return [v, v] }
  return [1, 36]
}

/** spcl_cnd 텍스트를 줄 단위로 분리해 우대 항목 목록 반환 */
function parseBenefits(text: string): string[] {
  return text
    .split("\n")
    .map(l => l.replace(/^[\s①②③④⑤⑥⑦⑧⑨⑩\-*·•.]+/, "").trim())
    .filter(l => l.length > 5 && l.length < 200)
    .slice(0, 10)
}

async function importCsv(csvFile: string, transactionType: "TIME_DEPOSIT" | "SAVINGS") {
  const csvPath = join(process.cwd(), csvFile)
  const rows = parseCsv(readFileSync(csvPath, "utf-8"))
  console.log(`[${csvFile}] 파싱된 상품 수: ${rows.length}`)

  let created = 0
  for (const row of rows) {
    const launchDate = parseDate(row.dcls_strt_day)
    if (!launchDate) { console.warn(`날짜 파싱 실패, 건너뜀: ${row.fin_prdt_nm}`); continue }

    const expiryDate = parseExpiryDate(row.dcls_end_day)
    const maxAmount = row.max_limit ? Number(row.max_limit) : null
    const minAmount = parseMinAmount(row.etc_note || "")
    const [minPeriod, maxPeriod] = parsePeriod(row.etc_note || "")
    const description = [
      row.join_way ? `가입방법: ${row.join_way}` : "",
      row.join_member ? `가입대상: ${row.join_member}` : "",
      row.mtrt_int ? `만기 후 이율: ${row.mtrt_int}` : "",
      row.etc_note ? `기타: ${row.etc_note}` : "",
    ].filter(Boolean).join("\n\n")

    const benefits = parseBenefits(row.spcl_cnd || "")

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          productName: row.fin_prdt_nm,
          productTypeCode: "DEPOSIT",
          productStatus: "ACTIVE",
          launchDate,
          expiryDate,
          periodType: "UNLIMITED",
          salesTarget: "ALL",
          isDepositInsured: true,
          depositInsuranceLimit: 50_000_000,
          description,
          createdBy: SYSTEM_UUID,
          updatedBy: SYSTEM_UUID,
        },
      })

      await tx.depositDetail.create({
        data: {
          productId: product.productId,
          interestType: "SIMPLE",
          rateType: "FIXED",
          transactionType,
          minAmount,
          maxAmount,
          minPeriodMonths: minPeriod,
          maxPeriodMonths: maxPeriod,
          earlyWithdrawalPenaltyRate: 0.005,
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

      for (const benefitName of benefits) {
        await tx.productRateBenefit.create({
          data: {
            productId: product.productId,
            benefitName: benefitName.slice(0, 99),
            benefitRate: 0,
            conditionDescription: benefitName,
            effectiveFrom: launchDate,
            createdBy: SYSTEM_UUID,
            updatedBy: SYSTEM_UUID,
          },
        })
      }
    })

    created++
    console.log(`[${created}/${rows.length}] ${row.fin_prdt_nm}`)
  }

  console.log(`완료: ${created}개 상품 임포트\n`)
  return created
}

async function main() {
  await importCsv("data/product/savings_products.csv", "SAVINGS")
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
