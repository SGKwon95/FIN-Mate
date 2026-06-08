// 임베딩 기반 비지도학습 상품 추천 유틸리티
// 모든 값은 Number()로 변환된 plain number를 받는다 (Prisma Decimal 불포함)

export type UserProfile = {
  totalBalance: number
  hasTimeDeposit: boolean
  hasSavings: boolean
  hasLoan: boolean
  avgMonthlySpend: number
  avgMonthlyIncome: number
}

export type AccountForRecommend = {
  accountType: string
  accountPurpose: string | null
  balance: number
}

export type TxnForRecommend = {
  transactionType: string
  amount: number
}

export type ProductForRecommend = {
  productId: string
  productName: string
  productTypeCode: string
  isDepositInsured: boolean
  depositInsuranceLimit: number | null
  description: string | null
  depositDetail: {
    transactionType: string
    minAmount: number | null
    minPeriodMonths: number | null
    maxPeriodMonths: number | null
  } | null
  loanDetail: {
    loanType: string
    minLoanAmount: number | null
    maxLoanAmount: number | null
  } | null
  productRates: { rate: number }[]
}

export type ScoredProduct = {
  product: ProductForRecommend
  score: number
  reasons: string[]
}

const SPEND_TYPES = ['TRANSFER_OUT', 'WITHDRAWAL', 'FEE']
const INCOME_TYPES = ['DEPOSIT', 'TRANSFER_IN', 'INTEREST']

export function computeUserProfile(
  accounts: AccountForRecommend[],
  txns: TxnForRecommend[],
): UserProfile {
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const hasTimeDeposit = accounts.some(a => a.accountPurpose === 'TIME_DEPOSIT')
  const hasSavings     = accounts.some(a => a.accountPurpose === 'SAVINGS')
  const hasLoan        = accounts.some(a => a.accountType === 'LOAN')

  const totalSpend  = txns.filter(t => SPEND_TYPES.includes(t.transactionType)).reduce((s, t) => s + t.amount, 0)
  const totalIncome = txns.filter(t => INCOME_TYPES.includes(t.transactionType)).reduce((s, t) => s + t.amount, 0)

  return {
    totalBalance,
    hasTimeDeposit,
    hasSavings,
    hasLoan,
    avgMonthlySpend:  totalSpend  / 3,
    avgMonthlyIncome: totalIncome / 3,
  }
}

// 고객 프로필 → "이 고객에게 필요한 상품의 특성" 텍스트 (임베딩 입력용)
// 사실 나열이 아닌 니즈/목표 중심으로 작성해 상품 텍스트와 의미적으로 가깝게 함
export function buildUserProfileText(profile: UserProfile): string {
  const lines: string[] = []

  if (profile.totalBalance > 1_000_000 && !profile.hasTimeDeposit) {
    lines.push(
      '목돈을 안전하게 예치하여 확정 이자를 받는 정기예금 상품이 필요합니다. ' +
      '원금 보장, 높은 금리, 만기 이자 수령, 안정적 자산 운용에 관심이 있습니다.',
    )
  }
  if (profile.avgMonthlyIncome > 500_000 && !profile.hasSavings) {
    lines.push(
      '매월 일정 금액을 납입하여 목표 금액을 모을 수 있는 적금 상품을 원합니다. ' +
      '저축 습관 형성, 목돈 마련, 재테크를 고려하고 있습니다.',
    )
  }
  if (profile.hasTimeDeposit) {
    lines.push('이미 정기예금을 보유하고 있어 추가 금융 상품을 비교하고 있습니다.')
  }
  if (profile.hasSavings) {
    lines.push('적금을 납입 중이며 다른 금융 상품도 함께 검토하고 있습니다.')
  }
  if (profile.hasLoan) {
    lines.push(
      '기존 대출의 금리를 낮추거나 리파이낸싱할 수 있는 저금리 대출 상품을 찾고 있습니다.',
    )
  }
  if (!profile.hasLoan && profile.totalBalance > 0 && lines.length === 0) {
    lines.push('다양한 금융 상품을 통해 자산을 효율적으로 운용하고 싶습니다.')
  }

  return lines.join(' ') || '금융 상품을 통해 자산을 늘리고 싶습니다.'
}

// 상품 → 자연어 텍스트 (임베딩 입력용)
export function buildProductText(product: ProductForRecommend): string {
  const rateStr = product.productRates[0]
    ? `금리 연 ${(product.productRates[0].rate * 100).toFixed(2)}%`
    : ''
  const insurance = product.isDepositInsured ? '예금자보호 5000만원 한도' : ''
  const desc = product.description ?? ''

  if (product.depositDetail) {
    const txType =
      product.depositDetail.transactionType === 'TIME_DEPOSIT' ? '정기예금'
      : product.depositDetail.transactionType === 'SAVINGS' ? '적금'
      : '예금'
    const minAmount = product.depositDetail.minAmount
      ? `최소 ${Math.round(product.depositDetail.minAmount / 10_000)}만원 예치`
      : ''
    const period = product.depositDetail.minPeriodMonths
      ? `${product.depositDetail.minPeriodMonths}개월 이상`
      : ''
    const typeDesc =
      product.depositDetail.transactionType === 'TIME_DEPOSIT'
        ? '목돈 예치, 원금 보장, 확정 이자 수령, 안정적 자산 운용'
        : '매월 납입, 목표 저축, 재테크, 저축 습관 형성'

    return [product.productName, txType, rateStr, minAmount, period, insurance, typeDesc, desc]
      .filter(Boolean).join('. ')
  }

  if (product.loanDetail) {
    const LOAN_DESC: Record<string, string> = {
      MORTGAGE:  '주택담보대출, 부동산 담보, 큰 금액, 장기 상환',
      JEONSE:    '전세자금대출, 전세 보증금, 주거 안정',
      CREDIT:    '신용대출, 무담보, 빠른 심사, 유동성 확보',
      OVERDRAFT: '마이너스통장, 한도 내 자유 인출, 단기 자금',
    }
    const loanDesc = LOAN_DESC[product.loanDetail.loanType] ?? '대출'
    const maxAmount = product.loanDetail.maxLoanAmount
      ? `최대 ${Math.round(product.loanDetail.maxLoanAmount / 10_000)}만원`
      : ''
    return [product.productName, loanDesc, rateStr, maxAmount, desc].filter(Boolean).join('. ')
  }

  return [product.productName, rateStr, desc].filter(Boolean).join('. ')
}

// 코사인 유사도 (0~1)
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB)
  return mag === 0 ? 0 : dot / mag
}

// 규칙 기반 폴백 점수 (LLM 서버 미가동 시)
export function fallbackScore(profile: UserProfile, product: ProductForRecommend): number {
  let score = 0
  const txType = product.depositDetail?.transactionType

  if (txType === 'TIME_DEPOSIT') {
    if (profile.totalBalance > 1_000_000) score += 40
    if (!profile.hasTimeDeposit)          score += 30
    if (profile.totalBalance > 5_000_000) score += 20
  } else if (txType === 'SAVINGS') {
    if (profile.avgMonthlyIncome > 500_000) score += 40
    if (!profile.hasSavings)                score += 30
    const spendRatio = profile.avgMonthlyIncome > 0
      ? profile.avgMonthlySpend / profile.avgMonthlyIncome : 0
    if (spendRatio > 0.7) score += 20
  } else if (product.loanDetail) {
    if (!profile.hasLoan && profile.totalBalance > 0) score += 30
    if (profile.hasLoan)                              score += 20
  }

  return score
}

// 추천 이유 태그 생성
export function extractReasons(profile: UserProfile, product: ProductForRecommend): string[] {
  const reasons: string[] = []
  const txType = product.depositDetail?.transactionType

  if (txType === 'TIME_DEPOSIT') {
    if (profile.totalBalance > 1_000_000) reasons.push('예치 여력 있음')
    if (!profile.hasTimeDeposit)          reasons.push('정기예금 미보유')
    if (profile.totalBalance > 5_000_000) reasons.push('고잔액 우대')
  } else if (txType === 'SAVINGS') {
    if (profile.avgMonthlyIncome > 500_000) reasons.push('꾸준한 수입')
    if (!profile.hasSavings)                reasons.push('적금 미보유')
    const spendRatio = profile.avgMonthlyIncome > 0
      ? profile.avgMonthlySpend / profile.avgMonthlyIncome : 0
    if (spendRatio > 0.7) reasons.push('저축률 개선 필요')
  } else if (product.loanDetail) {
    if (!profile.hasLoan) reasons.push('신용 대출 가능')
    if (profile.hasLoan)  reasons.push('리파이낸싱 기회')
  }

  return reasons.length > 0 ? reasons : ['맞춤 추천']
}
