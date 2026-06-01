import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { adjustChunkQuality } from '@/lib/rag'

const DELTA_UP   =  0.1
const DELTA_DOWN = -0.1

export async function POST(req: Request) {
  const { feedbackId, feedback } = await req.json() as {
    feedbackId: string
    feedback: 'up' | 'down'
  }

  if (!feedbackId || !['up', 'down'].includes(feedback)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const record = await prisma.chatFeedback.findUnique({ where: { feedbackId } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (record.feedback !== null) return NextResponse.json({ error: 'Already submitted' }, { status: 409 })

  await prisma.chatFeedback.update({ where: { feedbackId }, data: { feedback } })

  if (record.chunkIds.length > 0) {
    await adjustChunkQuality(record.chunkIds, feedback === 'up' ? DELTA_UP : DELTA_DOWN)
  }

  return NextResponse.json({ ok: true })
}
