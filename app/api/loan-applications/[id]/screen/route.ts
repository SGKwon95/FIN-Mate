import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { runLoanInference } from "@/lib/mlInference"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.partyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const isEmployee = session.user.isEmployee === true
  const application = await prisma.loanApplication.findUnique({
    where: {
      applicationId: id,
      // 직원은 모든 신청건 심사 가능, 고객은 본인 것만
      ...(isEmployee ? {} : { partyId: session.user.partyId }),
    },
    include: {
      product: {
        include: {
          productRates: {
            where: { rateType: "BASE" },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      },
      party: {
        include: {
          individual: true,
          accounts: {
            where: { accountStatus: "ACTIVE" },
            include: { transactions: false },
          },
          contracts: {
            include: { loanApplications: false, delinquencies: true },
          },
        },
      },
    },
  })

  if (!application) {
    return NextResponse.json({ error: "신청 건을 찾을 수 없습니다" }, { status: 404 })
  }

  const individual = application.party.individual
  const accounts = application.party.accounts

  // ── DB에서 자동 추출 가능한 피처 ──────────────────────────────────────────────

  // emp_length: 고용 시작일 기반 경력 연수
  let empLength = 0
  if (individual?.employmentStartDate) {
    const startStr = individual.employmentStartDate // "YYYYMMDD"
    const startYear = parseInt(startStr.slice(0, 4))
    const startMonth = parseInt(startStr.slice(4, 6))
    const now = new Date()
    empLength = Math.max(0, (now.getFullYear() - startYear) * 12 + (now.getMonth() + 1 - startMonth)) / 12
  }

  // open_acc / total_acc: ACTIVE 계좌 수 / 전체 계좌 수
  const openAcc = accounts.filter(a => a.accountStatus === "ACTIVE").length
  const totalAcc = await prisma.account.count({ where: { partyId: application.partyId } })

  // delinq_2yrs: 최근 2년 연체 건수
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const delinqContracts = application.party.contracts.flatMap(c => c.delinquencies)
  const delinq2yrs = delinqContracts.filter(d => new Date(d.startedAt) >= twoYearsAgo).length

  // revol_util: 마이너스통장 한도 대비 사용 비율 (%)
  let revolUtil = 0
  const creditAccounts = accounts.filter(a => a.creditLimit && Number(a.creditLimit) > 0)
  if (creditAccounts.length > 0) {
    const totalLimit = creditAccounts.reduce((s, a) => s + Number(a.creditLimit ?? 0), 0)
    const totalUsed = creditAccounts.reduce((s, a) => s + Math.max(0, -Number(a.balance)), 0)
    revolUtil = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0
  }

  // int_rate: 상품 기준 금리 (소수)
  const baseRate = Number(application.product.productRates[0]?.rate ?? 0)

  // annual_inc
  const annualInc = Number(individual?.annualIncome ?? 0)

  // ── ML 서버 호출 ──────────────────────────────────────────────────────────────
  const purposeMap: Record<string, string> = {
    "주택구입": "home",
    "생활자금": "other",
    "사업자금": "small_business",
    "의료비": "medical",
    "교육비": "educational",
    "차량구입": "car",
    "채무상환": "debt_consolidation",
    "기타": "other",
  }
  const purpose = purposeMap[application.loanPurpose ?? "기타"] ?? "other"

  const payload = {
    loan_amnt: Number(application.requestedAmount),
    term: application.requestedPeriodMonths ?? 36,
    int_rate: baseRate,
    annual_inc: annualInc,
    emp_length: Math.min(empLength, 10),
    open_acc: openAcc,
    total_acc: totalAcc,
    delinq_2yrs: delinq2yrs,
    revol_util: revolUtil,
    fico_score: application.mlCreditScore ?? 650,
    home_ownership: application.mlHomeOwnership ?? "RENT",
    dti: Number(application.mlDti ?? 20),
    inq_last_6mths: application.mlInqLast6Mths ?? 0,
    pub_rec: application.mlPubRec ?? 0,
    purpose,
  }

  logger.info({ event: 'inference_start', applicationId: id, loanAmnt: payload.loan_amnt }, '추론 시작')
  const mlStart = Date.now()

  let mlResult: { decision: string; default_prob: number; score: number; threshold: number }
  try {
    mlResult = await runLoanInference(payload)
    logger.info({
      event: 'inference_result',
      applicationId: id,
      decision: mlResult.decision,
      score: mlResult.score,
      defaultProb: mlResult.default_prob,
      durationMs: Date.now() - mlStart,
    }, '추론 완료')
  } catch (err) {
    logger.error({ event: 'inference_error', applicationId: id, err: (err as Error).message, durationMs: Date.now() - mlStart }, '추론 실패')
    return NextResponse.json(
      { error: `추론 실패: ${(err as Error).message}` },
      { status: 500 }
    )
  }

  // ── 점수 기반 3단계 결정 ────────────────────────────────────────────────────
  // 800+ → 자동 승인 / 300 미만 → 자동 거절 / 그 외 → 직원 검토 필요
  let applicationStatus: string
  let decidedAt: Date | null = null
  if (mlResult.score >= 800) {
    applicationStatus = "APPROVED"
    decidedAt = new Date()
  } else if (mlResult.score < 300) {
    applicationStatus = "REJECTED"
    decidedAt = new Date()
  } else {
    applicationStatus = "PENDING_REVIEW"
  }

  // ── 결과 DB 저장 ──────────────────────────────────────────────────────────────
  const updated = await prisma.loanApplication.update({
    where: { applicationId: id },
    data: {
      mlScore: mlResult.score,
      mlDecision: mlResult.decision,
      mlDefaultProb: mlResult.default_prob,
      mlScreenedAt: new Date(),
      applicationStatus,
      ...(decidedAt ? { decidedAt } : {}),
    },
    select: {
      applicationId: true,
      mlScore: true,
      mlDecision: true,
      mlDefaultProb: true,
      mlScreenedAt: true,
      applicationStatus: true,
    },
  })

  return NextResponse.json(updated)
}
