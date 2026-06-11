import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AiAdminClient from './AiAdminClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'AI 관리' }

export default async function AiAdminPage() {
  const session = await auth()
  if (!session?.user?.isEmployee) redirect('/dashboard')

  const [feedbackStats, cacheStats, docCount, chunkStats, recentFeedbacks] =
    await Promise.all([
      prisma.chatFeedback.groupBy({
        by: ['feedback'],
        _count: { feedbackId: true },
      }),
      prisma.ragCache.aggregate({
        _count: { cacheId: true },
        _sum:   { hitCount: true },
      }),
      prisma.document.count({ where: { entityType: 'EMPLOYEE_UPLOAD' } }),
      prisma.documentChunk.aggregate({
        _count: { id: true },
        _avg:   { qualityScore: true },
      }),
      prisma.chatFeedback.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { feedbackId: true, feedback: true, question: true, createdAt: true },
      }),
    ])

  const upCount   = feedbackStats.find(f => f.feedback === 'up')?._count.feedbackId   ?? 0
  const downCount = feedbackStats.find(f => f.feedback === 'down')?._count.feedbackId ?? 0
  const nullCount = feedbackStats.find(f => f.feedback === null)?._count.feedbackId   ?? 0
  const ratedTotal = upCount + downCount

  const stats = {
    totalFeedback: upCount + downCount + nullCount,
    upCount,
    downCount,
    nullCount,
    positiveRate: ratedTotal > 0 ? Math.round((upCount / ratedTotal) * 100) : 0,
    cacheCount:   cacheStats._count.cacheId,
    totalHits:    Number(cacheStats._sum.hitCount ?? 0),
    docCount,
    chunkCount:   chunkStats._count.id,
    avgQuality:   chunkStats._avg.qualityScore
      ? Number(Number(chunkStats._avg.qualityScore).toFixed(3))
      : 0,
  }

  return (
    <AiAdminClient
      stats={stats}
      recentFeedbacks={recentFeedbacks.map(f => ({
        feedbackId: f.feedbackId,
        feedback:   f.feedback,
        question:   f.question,
        createdAt:  f.createdAt.toISOString(),
      }))}
      isAdmin={session.user.isAdmin === true}
    />
  )
}
