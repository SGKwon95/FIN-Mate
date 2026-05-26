'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useState } from 'react'
import { Send, Bot, User, Paperclip, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

const MODELS = [
  { id: 'llama3',     label: 'Llama 3' },
  { id: 'gemma2',     label: 'Gemma 2' },
  { id: 'mistral',    label: 'Mistral' },
  { id: 'qwen2.5',   label: 'Qwen 2.5' },
  { id: 'phi4',       label: 'Phi-4' },
]

export default function ChatInterface() {
  const [modelId, setModelId] = useState('llama3')
  const [retrievedContext, setRetrievedContext] = useState('')
  const [fileName, setFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    body: { modelId, retrievedContext },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }, [input])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setRetrievedContext(ev.target?.result as string ?? '')
      setFileName(file.name)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  function clearDocument() {
    setRetrievedContext('')
    setFileName('')
  }

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
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* 문서 업로드 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
        {fileName ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-kb-yellow-light border border-kb-yellow text-kb-navy text-xs font-medium max-w-[160px]">
            <Paperclip className="w-3.5 h-3.5 shrink-0 text-kb-navy" />
            <span className="truncate">{fileName}</span>
            <button
              onClick={clearDocument}
              className="shrink-0 ml-0.5 hover:text-kb-red transition-colors"
              aria-label="문서 제거"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-kb-gray-border bg-kb-gray-light text-xs text-kb-gray hover:bg-kb-yellow-light hover:text-kb-navy hover:border-kb-yellow transition-colors font-medium"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">문서 업로드</span>
          </button>
        )}
      </div>

      {/* ── 채팅 영역 ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-16">
            <div className="w-16 h-16 rounded-2xl bg-kb-navy flex items-center justify-center shadow-card">
              <Bot className="w-8 h-8 text-kb-yellow" />
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-kb-navy text-base">AI 금융 상담원</p>
              <p className="text-kb-gray text-sm leading-relaxed max-w-xs">
                업무 문서를 업로드하고 궁금한 내용을 질문하세요.
                <br />문서 내용만을 기반으로 정확하게 답변해 드립니다.
              </p>
            </div>
            {!fileName && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-kb-navy text-white text-sm font-medium hover:bg-kb-navy-light transition-colors shadow-card"
              >
                <Paperclip className="w-4 h-4" />
                문서 업로드하기
              </button>
            )}
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
              {m.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-kb-navy">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="mt-1.5 space-y-1 list-none">{children}</ul>
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
                    code: ({ children }) => (
                      <code className="bg-kb-gray-light px-1 py-0.5 rounded text-xs font-mono">
                        {children}
                      </code>
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
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
        {!fileName && messages.length > 0 && (
          <p className="text-xs text-kb-gray text-center mb-2">
            업무 문서를 업로드하면 더 정확한 답변을 받을 수 있어요.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="질문을 입력하세요… (Shift+Enter로 줄바꿈)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-kb-gray-border bg-kb-gray-light px-4 py-2.5 text-sm text-kb-navy placeholder:text-kb-gray focus:outline-none focus:ring-2 focus:ring-kb-yellow focus:border-transparent transition-shadow max-h-32"
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
