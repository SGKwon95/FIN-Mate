import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import DocManager from '@/components/chat/DocManager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '문서 관리' }

export default async function DocsPage() {
  const session = await auth()
  if (!session?.user?.isEmployee) redirect('/dashboard')

  return (
    <div className="h-[calc(100dvh-56px)] overflow-hidden bg-kb-gray-light">
      <DocManager />
    </div>
  )
}
