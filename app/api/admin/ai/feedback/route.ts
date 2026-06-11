import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isEmployee)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const feedbacks = await prisma.chatFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      feedbackId: true,
      feedback:   true,
      question:   true,
      createdAt:  true,
    },
  })

  return NextResponse.json(
    feedbacks.map(f => ({
      feedbackId: f.feedbackId,
      feedback:   f.feedback,
      question:   f.question,
      createdAt:  f.createdAt.toISOString(),
    })),
  )
}
