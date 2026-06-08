/** 숫자를 "1,234,567원" 형식으로 */
export function formatKRW(amount: number | string): string {
  return Number(amount).toLocaleString("ko-KR") + "원"
}

/** 금액을 "15억원", "3천만원", "500만원" 등 한국어 단위로 축약 */
export function formatKRWShort(amount: number): string {
  const eok = Math.floor(amount / 100_000_000)
  const man = Math.floor((amount % 100_000_000) / 10_000)
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString("ko-KR")}만원`
  if (eok > 0) return `${eok}억원`
  if (man > 0) return `${man.toLocaleString("ko-KR")}만원`
  return formatKRW(amount)
}

/** 계좌번호 마스킹: 00900-12-345678 → 009**-**-***678 */
export function maskAccountNumber(num: string): string {
  const digits = num.replace(/\D/g, "")
  if (digits.length < 6) return num
  return num.slice(0, 3) + "**-**-" + "***" + digits.slice(-3)
}

/** 계좌번호 완전 표시: 숫자 14자리 → XXX-XX-XXXXXX-XX */
export function formatAccountNumber(num: string): string {
  const d = num.replace(/\D/g, "")
  if (d.length === 14) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5, 11)}-${d.slice(11)}`
  return num
}

/** KST 기준 날짜 문자열 반환 (YYYYMMDD) — DB의 VarChar(8) 날짜 컬럼용 */
export function toKSTDateCode(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/-/g, "")
}

/** KST 기준 날짜 문자열 반환 (YYYY-MM-DD) — 계약/만기일 문자열 컬럼용 */
export function toKSTDateStr(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

/** 날짜 → 2026. 05. 18. */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
}

/** 거래 유형 한글 */
export const TX_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "입금",
  WITHDRAWAL: "출금",
  TRANSFER_OUT: "이체출금",
  TRANSFER_IN: "이체입금",
  INTEREST: "이자",
  FEE: "수수료",
}
