import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cacheId: string }> },
) {
  const session = await auth()
  if (!session?.user?.isAdmin)
    return NextResponse.json({ error: 'Forbidden — 관리자만 가능합니다' }, { status: 403 })

  const { cacheId } = await params

  const exists = await prisma.ragCache.findUnique({
    where: { cacheId },
    select: { cacheId: true },
  })
  if (!exists)
    return NextResponse.json({ error: '캐시 항목을 찾을 수 없습니다' }, { status: 404 })

  await prisma.ragCache.delete({ where: { cacheId } })

  return NextResponse.json({ ok: true })
}
