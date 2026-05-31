import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { htmlToPlainText, chunkDocument, saveChunks } from '@/lib/rag'
import { embed } from '@/lib/embeddings'

const BATCH_SIZE = 8
const ALLOWED_TYPES = ['text/plain', 'text/markdown', 'text/html', 'text/htm']
const ALLOWED_EXTS  = ['.txt', '.md', '.html', '.htm']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isEmployee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const category = req.nextUrl.searchParams.get('category') ?? undefined

  const docs = await prisma.document.findMany({
    where: {
      entityType: 'EMPLOYEE_UPLOAD',
      ...(category ? { documentType: category } : {}),
    },
    orderBy: { uploadedAt: 'desc' },
    select: {
      documentId: true,
      originalName: true,
      storedName: true,
      documentType: true,
      uploadedAt: true,
    },
  })

  return NextResponse.json(docs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isEmployee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const category = form.get('category') as string | null

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  if (!category || !['banking', 'product'].includes(category))
    return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 })

  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTS.includes(ext))
    return NextResponse.json({ error: '.txt .md .html .htm 파일만 지원합니다.' }, { status: 400 })

  const raw = await file.text()
  const isHtml = ext === '.html' || ext === '.htm'
  const text   = isHtml ? htmlToPlainText(raw) : raw

  if (!text.trim()) return NextResponse.json({ error: '파일 내용이 비어 있습니다.' }, { status: 400 })

  const docName = `emp-${category}-${Date.now()}`

  const chunks = chunkDocument(text, docName)
  if (chunks.length === 0) return NextResponse.json({ error: '청크를 생성할 수 없습니다.' }, { status: 400 })

  const allEmbeddings: number[][] = []
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const vecs  = await embed(batch.map(c => c.content))
    allEmbeddings.push(...vecs)
  }

  await saveChunks(chunks, allEmbeddings)

  const doc = await prisma.document.create({
    data: {
      originalName:    file.name,
      storedName:      docName,
      fileUrl:         `emp-doc://${docName}`,
      mimeType:        ALLOWED_TYPES[ALLOWED_EXTS.indexOf(ext)] ?? 'text/plain',
      fileSize:        BigInt(file.size),
      uploadStatus:    'COMPLETED',
      uploadedBy:      session.user.partyId,
      entityType:      'EMPLOYEE_UPLOAD',
      entityId:        session.user.partyId,
      documentType:    category,
    },
  })

  return NextResponse.json({
    ok: true,
    document: {
      documentId:   doc.documentId,
      originalName: doc.originalName,
      storedName:   doc.storedName,
      documentType: doc.documentType,
      uploadedAt:   doc.uploadedAt,
    },
  })
}
