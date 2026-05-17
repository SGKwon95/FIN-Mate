import { formatKRW, TX_TYPE_LABEL } from "@/lib/formatters"
import { ArrowDownLeft, ArrowUpRight, RotateCcw, Minus } from "lucide-react"

const CREDIT_TYPES = new Set(["DEPOSIT", "TRANSFER_IN", "INTEREST"])

type Props = {
  transactionId: string
  transactionType: string
  amount: string
  balanceAfter: string
  transactedAt: string
  counterpartName: string | null
  remark: string | null
  memo: string | null
}

function TypeIcon({ type }: { type: string }) {
  if (CREDIT_TYPES.has(type)) {
    return <ArrowDownLeft className="w-4 h-4 text-kb-blue" />
  }
  if (type === "INTEREST") {
    return <RotateCcw className="w-4 h-4 text-kb-green" />
  }
  if (type === "FEE") {
    return <Minus className="w-4 h-4 text-kb-gray" />
  }
  return <ArrowUpRight className="w-4 h-4 text-kb-red" />
}

export default function TransactionItem({
  transactionType,
  amount,
  balanceAfter,
  transactedAt,
  counterpartName,
  remark,
  memo,
}: Props) {
  const isCredit = CREDIT_TYPES.has(transactionType)
  const label = counterpartName || remark || memo || TX_TYPE_LABEL[transactionType] || transactionType

  const date = new Date(transactedAt)
  const dateStr = date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
  const timeStr = date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })

  return (
    <li className="flex items-center gap-3 px-5 py-4">
      {/* 아이콘 */}
      <div className="w-8 h-8 rounded-full bg-kb-gray-light flex items-center justify-center shrink-0">
        <TypeIcon type={transactionType} />
      </div>

      {/* 거래 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-kb-navy truncate">{label}</p>
        <p className="text-[11px] text-kb-gray mt-0.5">
          {TX_TYPE_LABEL[transactionType] ?? transactionType} · {dateStr} {timeStr}
        </p>
      </div>

      {/* 금액 + 잔액 */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold tabular-nums ${isCredit ? "text-kb-blue" : "text-kb-red"}`}>
          {isCredit ? "+" : "-"}{formatKRW(amount)}
        </p>
        <p className="text-[11px] text-kb-gray mt-0.5 tabular-nums">
          잔액 {formatKRW(balanceAfter)}
        </p>
      </div>
    </li>
  )
}
