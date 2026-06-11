import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { htmlToPlainText, chunkDocument, saveChunks } from '@/lib/rag'
import { embed } from '@/lib/embeddings'
import { minioClient, BUCKET } from '@/lib/minio'
import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

const BATCH_SIZE = 8
const ALLOWED_TYPES = ['text/plain', 'text/markdown', 'text/html', 'text/htm', 'application/pdf']
const ALLOWED_EXTS  = ['.txt', '.md', '.html', '.htm', '.pdf']

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
    return NextResponse.json({ error: '.txt .md .html .htm .pdf 파일만 지원합니다.' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  let text: string
  if (ext === '.pdf') {
    text = await extractPdfText(buffer.buffer as ArrayBuffer)
  } else {
    const raw = buffer.toString('utf8')
    text = (ext === '.html' || ext === '.htm') ? htmlToPlainText(raw) : raw
  }

  if (!text.trim()) return NextResponse.json({ error: '파일 내용이 비어 있습니다.' }, { status: 400 })

  const docName = `emp-${category}-${Date.now()}`
  const mimeType = ALLOWED_TYPES[ALLOWED_EXTS.indexOf(ext)] ?? 'application/octet-stream'
  const minioObject = `employee-docs/${docName}${ext}`

  const chunks = chunkDocument(text, docName)
  if (chunks.length === 0) return NextResponse.json({ error: '청크를 생성할 수 없습니다.' }, { status: 400 })

  const [allEmbeddings] = await Promise.all([
    (async () => {
      const embeddings: number[][] = []
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)
        const vecs  = await embed(batch.map(c => c.content))
        embeddings.push(...vecs)
      }
      return embeddings
    })(),
    minioClient.putObject(BUCKET, minioObject, buffer, buffer.length, { 'Content-Type': mimeType }),
  ])

  await saveChunks(chunks, allEmbeddings)

  const doc = await prisma.document.create({
    data: {
      originalName:    file.name,
      storedName:      docName,
      fileUrl:         minioObject,
      mimeType,
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

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const tmpPath = path.join(tmpdir(), `pdf-${Date.now()}.pdf`)
  await writeFile(tmpPath, Buffer.from(buffer))

  try {
    return await new Promise((resolve, reject) => {
      const script = path.join(process.cwd(), 'scripts', 'pdf_extract.py')
      const proc = spawn('python3', [script, tmpPath])
      const chunks: Buffer[] = []
      const errChunks: Buffer[] = []

      proc.stdout.on('data', (d: Buffer) => chunks.push(d))
      proc.stderr.on('data', (d: Buffer) => errChunks.push(d))
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(Buffer.concat(errChunks).toString()))
        else resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
  } finally {
    await unlink(tmpPath).catch(() => null)
  }
}
