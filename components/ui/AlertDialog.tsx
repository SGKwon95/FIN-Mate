'use client'

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'error' | 'warning' | 'info' | 'success'

const VARIANT_STYLES: Record<Variant, { icon: React.ReactNode; header: string; btn: string }> = {
  error: {
    icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
    header: 'bg-red-50 border-b border-red-100',
    btn: 'bg-red-500 hover:bg-red-600 text-white',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    header: 'bg-amber-50 border-b border-amber-100',
    btn: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-500" />,
    header: 'bg-blue-50 border-b border-blue-100',
    btn: 'bg-kb-navy hover:bg-kb-navy/90 text-white',
  },
  success: {
    icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    header: 'bg-green-50 border-b border-green-100',
    btn: 'bg-green-600 hover:bg-green-700 text-white',
  },
}

type Props = {
  open: boolean
  title: string
  message: string
  variant?: Variant
  confirmLabel?: string
  onConfirm: () => void
}

export default function AlertDialog({
  open,
  title,
  message,
  variant = 'error',
  confirmLabel = '확인',
  onConfirm,
}: Props) {
  if (!open) return null

  const styles = VARIANT_STYLES[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onConfirm} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* 헤더 */}
        <div className={cn('flex items-center justify-between px-5 py-4', styles.header)}>
          <div className="flex items-center gap-2">
            {styles.icon}
            <span className="font-semibold text-sm text-kb-navy">{title}</span>
          </div>
          <button onClick={onConfirm} className="text-kb-gray hover:text-kb-navy transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 py-4">
          <p className="text-sm text-kb-navy/80 leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>

        {/* 버튼 */}
        <div className="px-5 pb-5">
          <button
            onClick={onConfirm}
            className={cn('w-full py-2.5 rounded-xl text-sm font-semibold transition-colors', styles.btn)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
