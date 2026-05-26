import ChatInterface from '@/components/chat/ChatInterface'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'AI 금융 상담' }

export default function ChatPage() {
  return (
    <div className="h-full">
      <ChatInterface />
    </div>
  )
}
