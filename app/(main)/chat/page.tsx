import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ChatInterface from '@/components/chat/ChatInterface'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'AI 금융 상담' }

export default async function ChatPage() {
  const session = await auth()
  if (!session?.user?.isEmployee) redirect('/dashboard')

  return (
    <div className="h-[calc(100dvh-56px)]">
      <ChatInterface />
    </div>
  )
}
