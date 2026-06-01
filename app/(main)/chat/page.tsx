'use client'

import { useState } from 'react'
import { MessageSquare, FolderOpen } from 'lucide-react'
import ChatInterface from '@/components/chat/ChatInterface'
import DocManager from '@/components/chat/DocManager'
import { cn } from '@/lib/utils'

type Tab = 'chat' | 'docs'
type DocCategory = 'all' | 'banking' | 'product'

const CATEGORY_LABELS: Record<DocCategory, string> = {
  all:     '전체',
  banking: '은행업무',
  product: '상품',
}

export default function ChatPage() {
  const [activeTab, setActiveTab]   = useState<Tab>('chat')
  const [docCategory, setDocCategory] = useState<DocCategory>('all')

  return (
    <div className="h-[calc(100dvh-56px)] flex flex-col">
      {/* 탭 바 */}
      <div className="flex bg-white border-b border-kb-gray-border shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors',
            activeTab === 'chat'
              ? 'text-kb-navy border-b-2 border-kb-navy'
              : 'text-kb-gray hover:text-kb-navy',
          )}
        >
          <MessageSquare className="w-4 h-4" />
          채팅
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors',
            activeTab === 'docs'
              ? 'text-kb-navy border-b-2 border-kb-navy'
              : 'text-kb-gray hover:text-kb-navy',
          )}
        >
          <FolderOpen className="w-4 h-4" />
          문서 관리
        </button>
      </div>

      {/* 채팅 탭 — 항상 마운트, 비활성 시 숨김 */}
      <div className={cn('flex-1 flex flex-col overflow-hidden', activeTab !== 'chat' && 'hidden')}>
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

      {/* 문서 관리 탭 — 항상 마운트, 비활성 시 숨김 */}
      <div className={cn('flex-1 flex flex-col bg-kb-gray-light overflow-hidden', activeTab !== 'docs' && 'hidden')}>
        <DocManager />
      </div>
    </div>
  )
}
