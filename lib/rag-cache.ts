import { createHash } from 'node:crypto'
import { prisma } from './prisma'

// ── 타입 ─────────────────────────────────────────────────────

export interface CacheHit {
  cacheId: string
  answer: string
  chunkIds: string[]
}

// ── 캐시 키 생성 ─────────────────────────────────────────────

export function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function buildDocScope(docCategory?: string, docNames?: string[]): string {
  const category = docCategory ?? 'all'
  const names = [...(docNames ?? [])].sort()
  return JSON.stringify({ category, names })
}

export function buildCacheKey(normalizedQ: string, docScope: string): string {
  return createHash('sha256')
    .update(normalizedQ + '\x00' + docScope)
    .digest('hex')
}

// ── 1단계: Exact match 조회 ───────────────────────────────────

export async function lookupExact(cacheKey: string): Promise<CacheHit | null> {
  const row = await prisma.ragCache.findUnique({
    where: { cacheKey },
    select: { cacheId: true, answer: true, chunkIds: true },
  })
  if (!row) return null

  prisma.ragCache
    .update({
      where: { cacheKey },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => {})

  return { cacheId: row.cacheId, answer: row.answer, chunkIds: row.chunkIds }
}

// ── 2단계: Semantic match 조회 ────────────────────────────────

// 임계값 0.95: 금융 약관 QA 특성상 false positive 비용이 높으므로 높은 임계값 채택
export async function lookupSemantic(
  queryEmbedding: number[],
  docScope: string,
  threshold = 0.95,
): Promise<CacheHit | null> {
  const vec = `[${queryEmbedding.join(',')}]`

  const rows = await prisma.$queryRaw<
    Array<{ cache_id: string; answer: string; chunk_ids: string[]; similarity: number }>
  >`
    SELECT
      cache_id,
      answer,
      chunk_ids,
      1 - (embedding <=> ${vec}::vector) AS similarity
    FROM rag_cache
    WHERE doc_scope = ${docScope}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vec}::vector) >= ${threshold}
    ORDER BY embedding <=> ${vec}::vector
    LIMIT 1
  `

  if (rows.length === 0) return null

  const row = rows[0]
  prisma.$executeRaw`
    UPDATE rag_cache
    SET hit_count = hit_count + 1, last_hit_at = NOW()
    WHERE cache_id = ${row.cache_id}::uuid
  `.catch(() => {})

  return { cacheId: row.cache_id, answer: row.answer, chunkIds: row.chunk_ids }
}

// ── 캐시 저장 ─────────────────────────────────────────────────

export async function saveCache(params: {
  cacheKey: string
  question: string
  docScope: string
  answer: string
  chunkIds: string[]
  queryEmbedding: number[]
}): Promise<void> {
  const { cacheKey, question, docScope, answer, chunkIds, queryEmbedding } = params
  const vec = `[${queryEmbedding.join(',')}]`

  await prisma.$executeRaw`
    INSERT INTO rag_cache
      (cache_key, question, doc_scope, answer, chunk_ids, embedding)
    VALUES (
      ${cacheKey},
      ${question},
      ${docScope},
      ${answer},
      ${chunkIds}::uuid[],
      ${vec}::vector
    )
    ON CONFLICT (cache_key) DO NOTHING
  `
}

// ── 캐시 무효화 ───────────────────────────────────────────────

export async function invalidateCacheByDocName(docName: string): Promise<void> {
  const pattern = `%"${docName}"%`
  await prisma.$executeRaw`
    DELETE FROM rag_cache WHERE doc_scope LIKE ${pattern}
  `
}

// ── 캐시 히트 스트림 응답 생성 ────────────────────────────────

export function buildCacheHitStream(answer: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(answer))
      controller.close()
    },
  })
}
