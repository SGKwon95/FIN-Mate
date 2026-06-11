import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isEmployee)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const caches = await prisma.ragCache.findMany({
    orderBy: { hitCount: 'desc' },
    select: {
      cacheId:   true,
      question:  true,
      docScope:  true,
      hitCount:  true,
      createdAt: true,
      lastHitAt: true,
    },
  })

  return NextResponse.json(
    caches.map(c => ({
      cacheId:   c.cacheId,
      question:  c.question,
      docScope:  c.docScope,
      hitCount:  c.hitCount,
      createdAt: c.createdAt.toISOString(),
      lastHitAt: c.lastHitAt?.toISOString() ?? null,
    })),
  )
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.isAdmin)
    return NextResponse.json({ error: 'Forbidden — 관리자만 가능합니다' }, { status: 403 })

  const { count } = await prisma.ragCache.deleteMany({})

  return NextResponse.json({ ok: true, deleted: count })
}
