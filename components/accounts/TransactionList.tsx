import TransactionItem from "./TransactionItem"

type TxItem = {
  transactionId: string
  transactionType: string
  amount: string
  balanceAfter: string
  transactedAt: string
  counterpartName: string | null
  remark: string | null
  memo: string | null
}

export default function TransactionList({ transactions }: { transactions: TxItem[] }) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-kb-gray text-sm gap-2">
        <p>해당 기간에 거래 내역이 없습니다.</p>
      </div>
    )
  }

  // 날짜별 그룹핑
  const groups = transactions.reduce<Record<string, TxItem[]>>((acc, tx) => {
    const day = tx.transactedAt.slice(0, 10)
    if (!acc[day]) acc[day] = []
    acc[day].push(tx)
    return acc
  }, {})

  return (
    <div className="bg-white">
      {Object.entries(groups).map(([day, txs]) => (
        <section key={day}>
          <div className="px-5 py-2 bg-kb-gray-light border-b border-kb-gray-border">
            <p className="text-xs font-medium text-kb-gray">
              {new Date(day).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </p>
          </div>
          <ul className="divide-y divide-kb-gray-border">
            {txs.map((tx) => (
              <TransactionItem key={tx.transactionId} {...tx} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
