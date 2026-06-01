'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useState } from 'react'
import { Send, Bot, User, X, ThumbsUp, ThumbsDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

type Model = { id: string; label: string }

export default function ChatInterface({
  onClose,
  initialContext,
  docCategory,
}: {
  onClose?: () => void
  initialContext?: string
  docCategory?: 'all' | 'banking' | 'product'
} = {}) {
  const [models, setModels] = useState<Model[]>([])
  const [modelId, setModelId] = useState('')
  const [feedbackMap, setFeedbackMap]     = useState<Record<string, string>>({})
  const [feedbackState, setFeedbackState] = useState<Record<string, 'up' | 'down'>>({})
  const pendingFeedbackIdRef = useRef<string | null>(null)

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then((data: Model[]) => {
        setModels(data)
        if (data.length > 0) setModelId(data[0].id)
      })
      .catch(() => {})
  }, [])
  const [retrievedContext, setRetrievedContext] = useState(initialContext ?? '')

  useEffect(() => {
    if (initialContext) setRetrievedContext(initialContext)
  }, [initialContext])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    body: { modelId, retrievedContext, docCategory },
    streamProtocol: 'text',
    onResponse: (response) => {
      const fid = response.headers.get('X-Feedback-Id')
      if (fid) pendingFeedbackIdRef.current = fid
    },
    onFinish: (message) => {
      const fid = pendingFeedbackIdRef.current
      if (fid && message.id) {
        setFeedbackMap(prev => ({ ...prev, [message.id]: fid }))
        pendingFeedbackIdRef.current = null
      }
    },
  })

  async function handleFeedback(messageId: string, feedback: 'up' | 'down') {
    const feedbackId = feedbackMap[messageId]
    if (!feedbackId || feedbackState[feedbackId]) return
    setFeedbackState(prev => ({ ...prev, [feedbackId]: feedback }))
    try {
      await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId, feedback }),
      })
    } catch {
      setFeedbackState(prev => { const n = { ...prev }; delete n[feedbackId]; return n })
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }, [input])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) {
        handleSubmit(e as unknown as React.FormEvent)
      }
    }
  }

  return (
    <div className="h-full flex flex-col bg-kb-gray-light">
      {/* ── 상단바 ─────────────────────────────────────── */}
      <div className="bg-white border-b border-kb-gray-border px-4 py-3 flex items-center gap-3 shrink-0 shadow-card">
        <div className="w-8 h-8 rounded-lg bg-kb-navy flex items-center justify-center shrink-0">
          <Bot className="w-4.5 h-4.5 text-kb-yellow" />
        </div>
        <span className="font-semibold text-kb-navy flex-1 text-sm">AI 금융 상담</span>

        {/* 모델 선택 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-kb-gray hidden sm:inline">모델</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="text-sm border border-kb-gray-border rounded-lg px-2.5 py-1.5 bg-kb-gray-light text-kb-navy focus:outline-none focus:ring-2 focus:ring-kb-yellow cursor-pointer font-medium"
          >
            {models.length === 0 && <option value="">모델 로딩 중…</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-kb-gray hover:bg-kb-gray-light transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── 채팅 영역 ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-16">
            <div className="w-16 h-16 rounded-2xl bg-kb-navy flex items-center justify-center shadow-card">
              <Bot className="w-8 h-8 text-kb-yellow" />
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-kb-navy text-base">AI 금융 상담원</p>
              <p className="text-kb-gray text-sm leading-relaxed max-w-xs">
                {onClose
                  ? "상품에 관해 질문해보세요."
                  : "궁금한 금융 상품에 대해 질문해보세요."
                }
              </p>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('flex gap-2.5', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-kb-navy flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-kb-yellow" />
              </div>
            )}

            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card',
                m.role === 'user'
                  ? 'bg-kb-navy text-white rounded-tr-sm'
                  : 'bg-white text-kb-navy rounded-tl-sm',
              )}
            >
              {m.role === 'assistant' ? (<>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-kb-navy">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="mt-1.5 space-y-1 list-none">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mt-1.5 space-y-1 list-decimal list-inside">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="flex gap-1.5">
                        <span className="shrink-0 text-kb-navy font-bold">•</span>
                        <span>{children}</span>
                      </li>
                    ),
                    h1: ({ children }) => (
                      <h1 className="font-bold text-base mb-2 mt-1">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="font-semibold text-sm mb-1.5 mt-1">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="font-semibold text-xs mb-1 mt-1 text-kb-gray">{children}</h3>
                    ),
                    code: ({ children }) => (
                      <code className="bg-kb-gray-light px-1 py-0.5 rounded text-xs font-mono">
                        {children}
                      </code>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="w-full text-xs border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-kb-navy text-white">{children}</thead>
                    ),
                    tbody: ({ children }) => (
                      <tbody className="divide-y divide-kb-gray-border">{children}</tbody>
                    ),
                    tr: ({ children }) => <tr className="even:bg-kb-gray-light">{children}</tr>,
                    th: ({ children }) => (
                      <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-2 py-1.5 whitespace-nowrap">{children}</td>
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
                {!(isLoading && m.id === messages.at(-1)?.id) && (
                  <div className="flex gap-1 mt-2 pt-2 border-t border-kb-gray-border/40">
                    {(() => {
                      const fid = feedbackMap[m.id]
                      const selected = fid ? feedbackState[fid] : undefined
                      return (
                        <>
                          <button
                            onClick={() => handleFeedback(m.id, 'up')}
                            disabled={!!selected}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors',
                              selected === 'up'
                                ? 'bg-kb-navy text-white'
                                : 'text-kb-gray hover:bg-kb-gray-light disabled:opacity-40',
                            )}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            도움이 됐어요
                          </button>
                          <button
                            onClick={() => handleFeedback(m.id, 'down')}
                            disabled={!!selected}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors',
                              selected === 'down'
                                ? 'bg-red-500 text-white'
                                : 'text-kb-gray hover:bg-kb-gray-light disabled:opacity-40',
                            )}
                          >
                            <ThumbsDown className="w-3 h-3" />
                            도움이 안 됐어요
                          </button>
                        </>
                      )
                    })()}
                  </div>
                )}
              </>) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>

            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-kb-yellow flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-kb-navy" />
              </div>
            )}
          </div>
        ))}

        {/* 로딩 인디케이터 */}
        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-8 h-8 rounded-full bg-kb-navy flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-kb-yellow" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-card">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-kb-gray rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-kb-gray rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-kb-gray rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-kb-red text-xs px-4 py-2 bg-red-50 rounded-xl border border-red-100">
              오류가 발생했습니다: {error.message}
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 하단 입력바 ───────────────────────────────── */}
      <div className="bg-white border-t border-kb-gray-border px-4 py-3 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="질문을 입력하세요… (Shift+Enter로 줄바꿈)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-kb-gray-border bg-kb-gray-light px-4 py-2.5 text-sm text-kb-navy placeholder:text-kb-gray focus:outline-none focus:ring-2 focus:ring-kb-yellow focus:border-transparent transition-shadow max-h-32 scrollbar-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-10 h-10 rounded-xl bg-kb-navy text-white flex items-center justify-center shrink-0 hover:bg-kb-navy-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="전송"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
