'use client'

import { useState } from 'react'
import ChatInterface from '@/components/chat/ChatInterface'
import { cn } from '@/lib/utils'

type DocCategory = 'all' | 'banking' | 'product'

const CATEGORY_LABELS: Record<DocCategory, string> = {
  all:     '전체',
  banking: '은행업무',
  product: '상품',
}

export default function ChatPage() {
  const [docCategory, setDocCategory] = useState<DocCategory>('all')

  return (
    <div className="h-[calc(100dvh-56px)] flex flex-col">
      {/* 문서 카테고리 필터 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-kb-gray-border shrink-0">
        <span className="text-xs text-kb-gray shrink-0">검색 범위</span>
        {(['all', 'banking', 'product'] as DocCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setDocCategory(cat)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              docCategory === cat
                ? 'bg-kb-navy text-white'
                : 'bg-kb-gray-light text-kb-gray hover:text-kb-navy',
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface docCategory={docCategory} />
      </div>
    </div>
  )
}
