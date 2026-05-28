'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const IDLE_MS = 10 * 60 * 1000

export default function IdleTimeout() {
  const endTimeRef = useRef(Date.now() + IDLE_MS)
  const [remaining, setRemaining] = useState(IDLE_MS / 1000) // seconds
  const signedOut = useRef(false)
  const pathname = usePathname()

  const extend = useCallback(() => {
    endTimeRef.current = Date.now() + IDLE_MS
    setRemaining(IDLE_MS / 1000)
  }, [])

  // 페이지 이동 시 연장
  useEffect(() => {
    extend()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // 1초마다 카운트다운
  useEffect(() => {
    const tick = setInterval(() => {
      const secs = Math.ceil((endTimeRef.current - Date.now()) / 1000)
      if (secs <= 0 && !signedOut.current) {
        signedOut.current = true
        clearInterval(tick)
        signOut({ callbackUrl: '/login' })
        return
      }
      setRemaining(Math.max(0, secs))
    }, 1000)

    return () => clearInterval(tick)
  }, [])

  const mins = String(Math.floor(remaining / 60)).padStart(2, '0')
  const secs = String(remaining % 60).padStart(2, '0')
  const isWarning = remaining <= 120

  return (
    <div className="hidden sm:flex items-center gap-2">
      <span
        className={[
          'tabular-nums font-mono text-sm font-semibold',
          isWarning ? 'text-red-600' : 'text-kb-navy/60',
        ].join(' ')}
      >
        {mins}:{secs}
      </span>
      <button
        onClick={extend}
        className={[
          'rounded-full px-3 py-0.5 text-xs font-bold transition-all active:scale-95',
          isWarning
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-kb-navy text-white hover:bg-kb-navy/80',
        ].join(' ')}
      >
        연장하기
      </button>
    </div>
  )
}
