/**
 * 약관 HTML → 청킹 → 임베딩 → pgvector 저장
 *
 * 사용법: npm run rag:index
 *
 * 전제 조건:
 *  - LM Studio에 임베딩 모델(nomic-embed-text-v1.5)이 로드되어 있어야 함
 *  - pgvector 마이그레이션이 적용되어 있어야 함 (npx prisma migrate deploy)
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { htmlToPlainText, chunkDocument, saveChunks } from '../lib/rag'
import { embed, EMBEDDING_MODEL } from '../lib/embeddings'
import { prisma } from '../lib/prisma'

const TERMS_FILES = [
  {
    path: 'public/terms/time-deposit.html',
    docName: 'KB 정기예금 약관',
  },
  {
    path: 'public/terms/savings.html',
    docName: 'KB 적금 약관',
  },
]

const BATCH_SIZE = 8 // LM Studio API 한 번에 처리할 청크 수

async function indexFile(filePath: string, docName: string) {
  console.log(`\n📄 처리 중: ${docName}`)

  const html = readFileSync(resolve(process.cwd(), filePath), 'utf-8')
  const text = htmlToPlainText(html)
  const chunks = chunkDocument(text, docName)

  console.log(`   ✔ 청크 생성: ${chunks.length}개`)
  console.log(`   ✔ 임베딩 모델: ${EMBEDDING_MODEL}`)

  // 배치로 임베딩 요청 (LM Studio API 과부하 방지)
  const allEmbeddings: number[][] = []
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => c.content)
    const embeddings = await embed(texts)
    allEmbeddings.push(...embeddings)
    process.stdout.write(`   ⏳ 임베딩 진행: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}\r`)
  }
  console.log(`   ✔ 임베딩 완료`)

  await saveChunks(chunks, allEmbeddings)
  console.log(`   ✔ pgvector 저장 완료`)
}

async function main() {
  console.log('🚀 RAG 인덱싱 시작\n')

  for (const { path, docName } of TERMS_FILES) {
    await indexFile(path, docName)
  }

  const total = await prisma.documentChunk.count()
  console.log(`\n✅ 완료: 총 ${total}개 청크가 document_chunks 테이블에 저장됨`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('❌ 인덱싱 실패:', err)
  process.exit(1)
})
