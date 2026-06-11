import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isEmployee)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const type = req.nextUrl.searchParams.get('type')

  if (type === 'quality') {
    const [docs, chunkAggs] = await Promise.all([
      prisma.document.findMany({
        where: { entityType: 'EMPLOYEE_UPLOAD' },
        orderBy: { uploadedAt: 'desc' },
        select: {
          documentId: true,
          originalName: true,
          storedName: true,
          documentType: true,
          uploadedAt: true,
        },
      }),
      prisma.documentChunk.groupBy({
        by: ['docName'],
        _count: { id: true },
        _avg: { qualityScore: true },
      }),
    ])

    const chunkMap = new Map(
      chunkAggs.map(c => [c.docName, { count: c._count.id, avg: c._avg.qualityScore ?? 0 }]),
    )

    const result = docs.map(d => {
      const agg = chunkMap.get(d.storedName ?? '') ?? { count: 0, avg: 0 }
      return {
        documentId:   d.documentId,
        originalName: d.originalName,
        storedName:   d.storedName,
        documentType: d.documentType,
        uploadedAt:   d.uploadedAt.toISOString(),
        chunkCount:   agg.count,
        avgQuality:   Number(Number(agg.avg).toFixed(3)),
      }
    })

    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'type 파라미터 필요' }, { status: 400 })
}
