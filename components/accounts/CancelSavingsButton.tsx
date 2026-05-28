'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW, maskAccountNumber } from '@/lib/formatters'
import { cancelSavings } from '@/app/(main)/accounts/[accountId]/actions'

type DepositAccount = {
  accountId: string
  accountNumber: string
  accountPurpose: string | null
}

type Props = {
  accountId: string
  balance: string
  maturityDate: string | null
  depositAccounts: DepositAccount[]
}

const PURPOSE_LABEL: Record<string, string> = {
  GENERAL:    '일반',
  SALARY:     '급여',
  SAVINGS:    '저축',
  BUSINESS:   '사업',
  INVESTMENT: '투자',
}

export default function CancelSavingsButton({ accountId, balance, maturityDate, depositAccounts }: Props) {
  const [open, setOpen]           = useState(false)
  const [toAccountId, setTo]      = useState(depositAccounts[0]?.accountId ?? '')
  const [error, setError]         = useState('')
  const [pending, startTransition] = useTransition()
  const idempotencyKey            = useRef(crypto.randomUUID())
  const router                    = useRouter()

  const isEarly = maturityDate
    ? new Date() < new Date(`${maturityDate.slice(0, 4)}-${maturityDate.slice(4, 6)}-${maturityDate.slice(6, 8)}`)
    : false

  function handleConfirm() {
    if (!toAccountId) {
      setError('환급받을 계좌를 선택해주세요.')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await cancelSavings({
        accountId,
        toAccountId,
        idempotencyKey: idempotencyKey.current,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOpen(false)
      router.push('/accounts')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-4 rounded-xl border border-red-300 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
      >
        해약하기
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* 오버레이 */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !pending && setOpen(false)}
          />

          {/* 모달 */}
          <div className="relative w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl px-6 pt-6 pb-8 z-10">
            <h2 className="text-lg font-bold text-kb-navy mb-1">적금 해약</h2>

            {isEarly && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">중도 해지</span> — 만기일({maturityDate!.slice(0,4)}.{maturityDate!.slice(4,6)}.{maturityDate!.slice(6,8)}) 전 해약 시
                약정 이율보다 낮은 이율이 적용될 수 있습니다.
              </div>
            )}

            <div className="rounded-xl bg-kb-gray-light px-4 py-3 mb-5">
              <p className="text-xs text-kb-gray mb-0.5">환급 예정 금액</p>
              <p className="text-xl font-bold text-kb-navy tabular-nums">{formatKRW(balance)}</p>
            </div>

            <label className="block text-sm font-semibold text-kb-navy mb-2">
              환급받을 계좌
            </label>
            {depositAccounts.length === 0 ? (
              <p className="text-sm text-red-500">환급받을 입출금 계좌가 없습니다.</p>
            ) : (
              <select
                value={toAccountId}
                onChange={(e) => setTo(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-kb-gray-border px-4 py-3 text-sm text-kb-navy bg-white focus:outline-none focus:ring-2 focus:ring-kb-navy/30"
              >
                {depositAccounts.map((acc) => (
                  <option key={acc.accountId} value={acc.accountId}>
                    {maskAccountNumber(acc.accountNumber)}
                    {acc.accountPurpose ? ` (${PURPOSE_LABEL[acc.accountPurpose] ?? acc.accountPurpose})` : ''}
                  </option>
                ))}
              </select>
            )}

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-xl border border-kb-gray-border py-3 text-sm font-semibold text-kb-gray hover:bg-kb-gray-light transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending || depositAccounts.length === 0}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {pending ? '처리 중...' : '해약 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
