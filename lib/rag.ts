/**
 * RAG 유틸: 계층 구조 청킹 + pgvector 검색
 *
 * 청킹 전략 (요청 1):
 *  - HTML → 평문 변환 후 제N조 단위로 1차 분할
 *  - 조가 800자 초과 시 ①②③ 항 단위로 2차 분할 (조 제목 prefix 유지)
 *  - 조 제목을 각 서브청크 앞에 반복 → 의미적 overlap 역할
 *
 * 검색 전략 (요청 2):
 *  - pgvector 코사인 유사도 top-K 검색
 *  - 문서명 필터로 범위 제한 가능
 */

import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

// ── 타입 ─────────────────────────────────────────────────────

export interface DocChunk {
  content: string
  docName: string
  articleNum?: string
  sectionNum?: string
  metadata?: Record<string, string | number>
}

export interface RetrievedChunk {
  content: string
  docName: string
  articleNum: string | null
  sectionNum: string | null
  metadata: Record<string, unknown>
  similarity: number
}

// ── HTML → 평문 변환 ─────────────────────────────────────────

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── 계층 구조 청킹 ────────────────────────────────────────────

const ARTICLE_RE = /(?=제\s*\d+\s*조\s*[\(\（])/g
const SECTION_RE = /(?=[①②③④⑤⑥⑦⑧⑨⑩]|\n\d+\.\s)/g
const MAX_CHUNK_CHARS = 800

export function chunkDocument(text: string, docName: string): DocChunk[] {
  // 제N조 단위로 분할
  const articles = text.split(ARTICLE_RE).filter((s) => s.trim().length > 20)
  const chunks: DocChunk[] = []

  for (const article of articles) {
    const articleMatch = article.match(/^(제\s*\d+\s*조\s*[\(\（][^\)\）]+[\)\）])/)
    const articleNum = articleMatch ? articleMatch[1].trim() : undefined
    const articleTitle = articleNum ?? ''

    if (article.length <= MAX_CHUNK_CHARS) {
      chunks.push({ content: article.trim(), docName, articleNum })
      continue
    }

    // 긴 조는 항(①②③) 단위로 추가 분할
    const subsections = article.split(SECTION_RE).filter((s) => s.trim().length > 10)
    let buffer = subsections[0] // 조 제목 + 첫 문장

    for (let i = 1; i < subsections.length; i++) {
      const next = subsections[i]
      if ((buffer + next).length > MAX_CHUNK_CHARS) {
        chunks.push({
          content: buffer.trim(),
          docName,
          articleNum,
          // 항 번호 추출 (①②...)
          sectionNum: buffer.match(/^[①②③④⑤⑥⑦⑧⑨⑩]/)?.[0],
        })
        // 다음 청크 앞에 조 제목 prefix → 문맥 유지
        buffer = articleTitle ? `${articleTitle}\n${next}` : next
      } else {
        buffer += '\n' + next
      }
    }

    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        docName,
        articleNum,
        sectionNum: buffer.match(/^[①②③④⑤⑥⑦⑧⑨⑩]/)?.[0],
      })
    }
  }

  return chunks
}

// ── 청크 저장 (pgvector $executeRaw) ─────────────────────────

export async function saveChunks(
  chunks: DocChunk[],
  embeddings: number[][],
): Promise<void> {
  // 기존 동일 docName 청크 삭제 (재색인)
  await prisma.documentChunk.deleteMany({ where: { docName: chunks[0].docName } })

  for (let i = 0; i < chunks.length; i++) {
    const { content, docName, articleNum, sectionNum, metadata = {} } = chunks[i]
    const vec = `[${embeddings[i].join(',')}]`
    await prisma.$executeRaw`
      INSERT INTO document_chunks (doc_name, article_num, section_num, content, metadata, embedding)
      VALUES (
        ${docName},
        ${articleNum ?? null},
        ${sectionNum ?? null},
        ${content},
        ${JSON.stringify(metadata)}::jsonb,
        ${vec}::vector
      )
    `
  }
}

// ── 벡터 검색 ────────────────────────────────────────────────

export async function retrieveChunks(
  queryEmbedding: number[],
  opts: { topK?: number; docNames?: string[]; minSimilarity?: number } = {},
): Promise<RetrievedChunk[]> {
  const { topK = 5, docNames, minSimilarity = 0.3 } = opts
  const vec = `[${queryEmbedding.join(',')}]`

  // doc_name 필터를 조건부로 추가
  const rows = docNames?.length
    ? await prisma.$queryRaw<RetrievedChunk[]>`
        SELECT
          content,
          doc_name    AS "docName",
          article_num AS "articleNum",
          section_num AS "sectionNum",
          metadata,
          1 - (embedding <=> ${vec}::vector) AS similarity
        FROM document_chunks
        WHERE doc_name = ANY(${docNames}::text[])
          AND 1 - (embedding <=> ${vec}::vector) >= ${minSimilarity}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${topK}
      `
    : await prisma.$queryRaw<RetrievedChunk[]>`
        SELECT
          content,
          doc_name    AS "docName",
          article_num AS "articleNum",
          section_num AS "sectionNum",
          metadata,
          1 - (embedding <=> ${vec}::vector) AS similarity
        FROM document_chunks
        WHERE 1 - (embedding <=> ${vec}::vector) >= ${minSimilarity}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${topK}
      `

  return rows
}

// ── 검색 결과 → 프롬프트 컨텍스트 문자열 ────────────────────

export function chunksToContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''
  return chunks
    .map((c, i) => {
      const cite = [c.articleNum, c.sectionNum].filter(Boolean).join(' ')
      return `[${i + 1}] ${cite ? `(${cite}) ` : ''}${c.content}`
    })
    .join('\n\n---\n\n')
}

export async function deleteChunks(docName: string): Promise<void> {
  await prisma.documentChunk.deleteMany({ where: { docName } })
}
