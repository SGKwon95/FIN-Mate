import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { deleteChunks } from '@/lib/rag'
import { minioClient, BUCKET } from '@/lib/minio'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await auth()
  if (!session?.user?.isEmployee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { documentId } = await params

  const doc = await prisma.document.findUnique({
    where: { documentId },
    select: { storedName: true, originalName: true, fileUrl: true, entityType: true },
  })

  if (!doc || doc.entityType !== 'EMPLOYEE_UPLOAD')
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  const chunks = await prisma.documentChunk.findMany({
    where: { docName: doc.storedName ?? '' },
    orderBy: { createdAt: 'asc' },
    select: { content: true },
  })

  const content = chunks.map(c => c.content).join('\n\n')

  // fileUrl이 MinIO 객체 경로인 경우 presigned URL 생성 (1시간 유효)
  let downloadUrl: string | null = null
  if (doc.fileUrl && !doc.fileUrl.startsWith('emp-doc://')) {
    try {
      downloadUrl = await minioClient.presignedGetObject(BUCKET, doc.fileUrl, 60 * 60)
    } catch {
      // MinIO 미가동 등의 경우 무시
    }
  }

  return NextResponse.json({ originalName: doc.originalName, content, downloadUrl })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { documentId } = await params

  const doc = await prisma.document.findUnique({
    where: { documentId },
    select: { storedName: true, fileUrl: true, entityType: true },
  })

  if (!doc || doc.entityType !== 'EMPLOYEE_UPLOAD')
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  await Promise.all([
    doc.storedName ? deleteChunks(doc.storedName) : Promise.resolve(),
    doc.fileUrl && !doc.fileUrl.startsWith('emp-doc://')
      ? minioClient.removeObject(BUCKET, doc.fileUrl).catch(() => null)
      : Promise.resolve(),
  ])

  await prisma.document.delete({ where: { documentId } })

  return NextResponse.json({ ok: true })
}
