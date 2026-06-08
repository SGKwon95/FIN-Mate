import { readFileSync } from 'fs'
import { embed, EMBEDDING_MODEL } from '../lib/embeddings'
import { saveChunks } from '../lib/rag'
import { prisma } from '../lib/prisma'
import type { DocChunk } from '../lib/rag'

const DOC_NAME = 'rag-guide'

async function main() {
  const text = readFileSync('rag_guide.txt', 'utf-8')

  // ### [주제 N] 단위로 청킹 (각 주제별 독립 청크)
  const sections = text.split(/(?=###\s*\[주제\s*\d+\])/).filter(s => s.trim().length > 50)
  const chunks: DocChunk[] = sections.map((content) => ({
    content: content.trim(),
    docName: DOC_NAME,
    articleNum: content.match(/###\s*(\[주제\s*\d+\])/)?.[1],
  }))

  console.log(`청크 생성: ${chunks.length}개 | 모델: ${EMBEDDING_MODEL}`)

  const BATCH_SIZE = 8
  const allEmbeddings: number[][] = []
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const embeddings = await embed(batch.map(c => c.content))
    allEmbeddings.push(...embeddings)
    process.stdout.write(`임베딩 진행: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}\r`)
  }
  console.log('\n임베딩 완료')

  await saveChunks(chunks, allEmbeddings)

  const total = await prisma.documentChunk.count()
  console.log(`완료: 총 ${total}개 청크 (rag-guide ${chunks.length}개 추가)`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('인덱싱 실패:', err)
  process.exit(1)
})
