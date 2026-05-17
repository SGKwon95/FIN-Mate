import Link from "next/link"
import { ChevronRight, Wallet } from "lucide-react"
import { formatKRW, maskAccountNumber } from "@/lib/formatters"

type AccountItem = {
  accountId: string
  accountNumber: string
  accountType: string
  accountPurpose: string | null
  balance: string // Decimal을 문자열로 직렬화
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT:   "입출금",
  LOAN:      "대출",
  OVERDRAFT: "마이너스통장",
}

const PURPOSE_LABEL: Record<string, string> = {
  GENERAL:    "일반",
  SALARY:     "급여",
  SAVINGS:    "저축",
  UTILITY:    "공과금",
  BUSINESS:   "사업",
  INVESTMENT: "투자",
}

export default function AccountSummaryCard({ accounts }: { accounts: AccountItem[] }) {
  if (accounts.length === 0) {
    return (
      <section className="bg-white rounded-2xl p-5 shadow-card">
        <h2 className="text-kb-navy font-bold text-base mb-3">내 계좌</h2>
        <div className="flex flex-col items-center py-8 text-kb-gray text-sm gap-2">
          <Wallet className="w-10 h-10 text-kb-gray-border" />
          <p>등록된 계좌가 없습니다.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl shadow-card overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-kb-gray-border">
        <h2 className="text-kb-navy font-bold text-base">내 계좌</h2>
        <Link
          href="/accounts"
          className="flex items-center gap-0.5 text-kb-gray text-xs hover:text-kb-navy transition-colors"
        >
          전체보기
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 계좌 목록 */}
      <ul className="divide-y divide-kb-gray-border">
        {accounts.map((acc) => (
          <li key={acc.accountId}>
            <Link
              href={`/accounts/${acc.accountId}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-kb-gray-light transition-colors group"
            >
              <div className="flex flex-col gap-1">
                {/* 뱃지 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] bg-kb-yellow-light text-kb-navy font-semibold px-1.5 py-0.5 rounded-md">
                    {ACCOUNT_TYPE_LABEL[acc.accountType] ?? acc.accountType}
                  </span>
                  {acc.accountPurpose && (
                    <span className="text-[11px] text-kb-gray">
                      {PURPOSE_LABEL[acc.accountPurpose] ?? acc.accountPurpose}
                    </span>
                  )}
                </div>
                {/* 계좌번호 */}
                <p className="text-xs text-kb-gray font-mono tracking-wide">
                  {maskAccountNumber(acc.accountNumber)}
                </p>
              </div>

              {/* 잔액 + 화살표 */}
              <div className="flex items-center gap-2">
                <p className="text-kb-navy font-bold text-base tabular-nums">
                  {formatKRW(acc.balance)}
                </p>
                <ChevronRight className="w-4 h-4 text-kb-gray-border group-hover:text-kb-gray transition-colors shrink-0" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
