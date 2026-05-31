import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { deleteChunks } from '@/lib/rag'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await auth()
  if (!session?.user?.isEmployee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { documentId } = await params

  const doc = await prisma.document.findUnique({
    where: { documentId },
    select: { storedName: true, entityType: true },
  })

  if (!doc || doc.entityType !== 'EMPLOYEE_UPLOAD')
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  if (doc.storedName) await deleteChunks(doc.storedName)
  await prisma.document.delete({ where: { documentId } })

  return NextResponse.json({ ok: true })
}
