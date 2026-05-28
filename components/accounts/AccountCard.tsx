import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatKRW, formatAccountNumber } from "@/lib/formatters";

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "입출금",
  LOAN: "대출",
  OVERDRAFT: "마이너스통장",
};

const PURPOSE_LABEL: Record<string, string> = {
  GENERAL:      "일반",
  SALARY:       "급여",
  SAVINGS:      "저축",
  BUSINESS:     "사업",
  INVESTMENT:   "투자",
  TIME_DEPOSIT: "정기예금",
};

type Props = {
  accountId: string;
  accountNumber: string;
  accountType: string;
  accountPurpose: string | null;
  balance: string;
  openedDate: string;
  lastTransactionAt: string | null;
  productName: string | null;
};

export default function AccountCard({
  accountId,
  accountNumber,
  accountType,
  accountPurpose,
  balance,
  openedDate,
  lastTransactionAt,
  productName,
}: Props) {
  const typeLabel = ACCOUNT_TYPE_LABEL[accountType] ?? accountType;
  const purposeLabel = accountPurpose
    ? (PURPOSE_LABEL[accountPurpose] ?? accountPurpose)
    : null;

  return (
    <Link
      href={`/accounts/${accountId}`}
      className="block bg-white rounded-2xl shadow-card p-5 hover:shadow-card-hover transition-shadow group"
    >
      {/* 상단: 배지 + 화살표 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-kb-yellow-light text-kb-navy font-semibold px-2 py-0.5 rounded-md">
            {typeLabel}
          </span>
          {purposeLabel && (
            <span className="text-xs text-kb-gray bg-kb-gray-light px-2 py-0.5 rounded-md">
              {purposeLabel}
            </span>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-kb-gray-border group-hover:text-kb-gray transition-colors shrink-0" />
      </div>

      {/* 상품명 */}
      {productName && (
        <p className="text-sm font-semibold text-kb-navy mb-1">{productName}</p>
      )}

      {/* 계좌번호 */}
      <p className="text-sm font-mono text-kb-gray tracking-wide mb-3">
        {formatAccountNumber(accountNumber)}
      </p>

      {/* 잔액 */}
      <p className="text-2xl font-bold text-kb-navy tabular-nums">
        {formatKRW(balance)}
      </p>

      {/* 하단: 개설일 / 최근 거래일 */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-kb-gray-border text-xs text-kb-gray">
        <span>개설일 {openedDate}</span>
        {lastTransactionAt && (
          <span>
            최근거래{" "}
            {new Date(lastTransactionAt).toLocaleDateString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
            })}
          </span>
        )}
      </div>
    </Link>
  );
}
