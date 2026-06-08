/**
 * 쿼리 재작성 효과 비교 평가
 *
 * 같은 질문에 대해 재작성 전/후 검색 품질(Context Relevance)을 비교하고
 * Markdown 보고서를 docs/ 에 저장한다.
 *
 * 사용법: npm run rag:rewrite-eval
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { embedOne } from '../lib/embeddings'
import { retrieveChunks, chunksToContext } from '../lib/rag'
import { rewriteQuery } from '../lib/query-rewrite'
import { prisma } from '../lib/prisma'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'
const MODEL_ID = process.env.EVAL_MODEL ?? 'local-model'

// ── 테스트 쿼리셋 ─────────────────────────────────────────────
interface TestQuery {
  query: string
  type: '단어형' | '구어체' | '완성형'
}

const TEST_QUERIES: TestQuery[] = [
  // 단어형: 명사만 입력, 벡터 검색에 불리
  { query: '보이스피싱',  type: '단어형' },
  { query: '중도해지',    type: '단어형' },
  { query: '예금자보호',  type: '단어형' },
  // 구어체: 축약·비문 표현
  { query: '적금 깨면 어떻게 돼',          type: '구어체' },
  { query: '계좌 만들려면 뭐 가져가야 해',  type: '구어체' },
  { query: '압류 얼마까지 보호돼',          type: '구어체' },
  // 완성형 대조군: 이미 서술형 질문
  { query: '정기예금 중도해지 이자 계산 방법은?',   type: '완성형' },
  { query: '보이스피싱 피해구제 신청 절차는?',       type: '완성형' },
  { query: '예금자보호법 보호 한도는?',              type: '완성형' },
  { query: '미성년자 계좌 개설 시 필요 서류는?',    type: '완성형' },
]

// ── Context Relevance 단독 평가 (LLM-as-a-Judge) ─────────────
interface JudgeResult {
  score: number       // 1~5
  reasoning: string
}

async function judgeContextRelevance(
  question: string,
  context: string,
  judge: ReturnType<typeof createOpenAI>,
): Promise<JudgeResult> {
  const contextText = context.trim() || '(검색 결과 없음)'

  const { text } = await generateText({
    model: judge(MODEL_ID),
    prompt: `당신은 RAG 검색 품질 평가 전문가입니다.
아래 질문과 검색된 컨텍스트를 보고, 컨텍스트가 질문에 답하는 데 필요한 정보를 얼마나 잘 포함하는지 1~5점으로 평가하세요.

질문: ${question}

검색된 컨텍스트:
${contextText}

평가 기준 (Context Relevance):
- 5: 질문에 필요한 모든 핵심 정보가 컨텍스트에 명확히 존재
- 4: 핵심 정보 대부분 포함, 일부 세부사항 누락
- 3: 관련 정보는 있으나 질문에 완전히 답하기 부족
- 2: 간접적으로 관련된 정보만 포함
- 1: 컨텍스트가 질문과 전혀 무관하거나 검색 결과 없음

JSON만 출력 (다른 텍스트 없음):
{"score": <1~5 정수>, "reasoning": "<50자 이내 한국어 근거>"}`,
    temperature: 0,
    maxTokens: 150,
  })

  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return { score: 1, reasoning: 'JSON 파싱 실패' }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { score: number; reasoning: string }
    return {
      score: Math.min(5, Math.max(1, Math.round(parsed.score))),
      reasoning: parsed.reasoning ?? '',
    }
  } catch {
    return { score: 1, reasoning: 'JSON 파싱 실패' }
  }
}

// ── 케이스 평가 ───────────────────────────────────────────────
interface CaseResult {
  query: string
  type: string
  rewritten: string
  wasRewritten: boolean
  before: { chunkCount: number; maxSimilarity: number; score: number; reasoning: string }
  after:  { chunkCount: number; maxSimilarity: number; score: number; reasoning: string }
}

async function evaluateCase(
  tq: TestQuery,
  judge: ReturnType<typeof createOpenAI>,
): Promise<CaseResult> {
  // 1) 쿼리 재작성
  let rewritten = tq.query
  try {
    rewritten = await rewriteQuery(tq.query, MODEL_ID)
  } catch {
    // 실패 시 원문 유지
  }
  const wasRewritten = rewritten !== tq.query

  // 2) 검색 가능한 문서 목록 (emp-* 제외)
  const customerDocs = await prisma.documentChunk
    .findMany({ where: { docName: { not: { startsWith: 'emp-' } } }, select: { docName: true }, distinct: ['docName'] })
    .then(rows => rows.map(r => r.docName))
  const docNames = customerDocs.length > 0 ? customerDocs : undefined

  // 3) 원문 검색
  const vecBefore = await embedOne(tq.query)
  const chunksBefore = await retrieveChunks(vecBefore, { topK: 5, docNames, minSimilarity: 0.1 })
  const contextBefore = chunksToContext(chunksBefore)
  const maxSimBefore = chunksBefore.length > 0 ? Math.max(...chunksBefore.map(c => c.similarity)) : 0

  // 4) 재작성 후 검색
  const vecAfter = await embedOne(rewritten)
  const chunksAfter = await retrieveChunks(vecAfter, { topK: 5, docNames, minSimilarity: 0.1 })
  const contextAfter = chunksToContext(chunksAfter)
  const maxSimAfter = chunksAfter.length > 0 ? Math.max(...chunksAfter.map(c => c.similarity)) : 0

  // 5) Context Relevance 평가
  const [judgeBefore, judgeAfter] = await Promise.all([
    judgeContextRelevance(tq.query, contextBefore, judge),
    judgeContextRelevance(tq.query, contextAfter, judge),
  ])

  return {
    query: tq.query,
    type: tq.type,
    rewritten,
    wasRewritten,
    before: { chunkCount: chunksBefore.length, maxSimilarity: maxSimBefore, score: judgeBefore.score, reasoning: judgeBefore.reasoning },
    after:  { chunkCount: chunksAfter.length,  maxSimilarity: maxSimAfter,  score: judgeAfter.score,  reasoning: judgeAfter.reasoning  },
  }
}

// ── Markdown 보고서 생성 ──────────────────────────────────────
function buildReport(results: CaseResult[], chunkTotal: number, now: string): string {
  const lines: string[] = []

  // 요약 지표
  const avgBefore = results.reduce((s, r) => s + r.before.score, 0) / results.length
  const avgAfter  = results.reduce((s, r) => s + r.after.score,  0) / results.length
  const successBefore = results.filter(r => r.before.chunkCount > 0).length
  const successAfter  = results.filter(r => r.after.chunkCount  > 0).length
  const totalCount = results.length

  lines.push(`# RAG 쿼리 재작성 효과 비교 평가`)
  lines.push(``)
  lines.push(`생성일: ${now} | 모델: ${MODEL_ID} | 문서 DB: 총 ${chunkTotal}개 청크`)
  lines.push(``)
  lines.push(`## 요약`)
  lines.push(``)
  lines.push(`| 지표 | 재작성 없음 | 재작성 있음 | 개선 |`)
  lines.push(`|------|------------|------------|------|`)
  lines.push(`| Context Relevance 평균 | ${avgBefore.toFixed(2)}/5 | ${avgAfter.toFixed(2)}/5 | ${avgAfter - avgBefore >= 0 ? '+' : ''}${(avgAfter - avgBefore).toFixed(2)} |`)
  lines.push(`| 청크 검색 성공률 (≥1개) | ${successBefore}/${totalCount} (${Math.round(successBefore/totalCount*100)}%) | ${successAfter}/${totalCount} (${Math.round(successAfter/totalCount*100)}%) | ${successAfter - successBefore >= 0 ? '+' : ''}${successAfter - successBefore} |`)
  lines.push(``)

  // 유형별 그룹 요약
  const types = ['단어형', '구어체', '완성형'] as const
  lines.push(`## 유형별 요약`)
  lines.push(``)
  lines.push(`| 유형 | 재작성 없음 (CR 평균) | 재작성 있음 (CR 평균) | 개선 |`)
  lines.push(`|------|----------------------|----------------------|------|`)
  for (const type of types) {
    const group = results.filter(r => r.type === type)
    if (group.length === 0) continue
    const b = group.reduce((s, r) => s + r.before.score, 0) / group.length
    const a = group.reduce((s, r) => s + r.after.score,  0) / group.length
    lines.push(`| ${type} | ${b.toFixed(2)}/5 | ${a.toFixed(2)}/5 | ${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)} |`)
  }
  lines.push(``)

  // 케이스별 상세
  lines.push(`## 케이스별 상세`)
  lines.push(``)

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const scoreDiff = r.after.score - r.before.score
    const diffStr = scoreDiff > 0 ? `▲ +${scoreDiff}` : scoreDiff < 0 ? `▼ ${scoreDiff}` : `= 0`
    lines.push(`### ${i + 1}. "${r.query}" (${r.type})`)
    lines.push(``)
    if (r.wasRewritten) {
      lines.push(`- **재작성**: "${r.rewritten}"`)
    } else {
      lines.push(`- 재작성 스킵 (이미 서술형 질문)`)
    }
    lines.push(``)
    lines.push(`| 구분 | 검색 청크 수 | 최고 유사도 | Context Relevance |`)
    lines.push(`|------|------------|------------|-------------------|`)
    lines.push(`| 재작성 없음 | ${r.before.chunkCount}개 | ${r.before.maxSimilarity.toFixed(3)} | ${r.before.score}/5 |`)
    lines.push(`| 재작성 있음 | ${r.after.chunkCount}개  | ${r.after.maxSimilarity.toFixed(3)}  | ${r.after.score}/5 ${diffStr} |`)
    lines.push(``)
    lines.push(`> 판정 근거: ${r.after.reasoning || r.before.reasoning || '—'}`)
    lines.push(``)
  }

  return lines.join('\n')
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  const judge = createOpenAI({ baseURL: `${OLLAMA_BASE_URL}/v1`, apiKey: 'lm-studio' })

  // DB 청크 수 조회
  const chunkTotal = await prisma.documentChunk.count()

  console.log(`RAG 쿼리 재작성 효과 비교 평가 시작`)
  console.log(`모델: ${MODEL_ID} | 청크 수: ${chunkTotal}`)
  console.log('─'.repeat(60))

  const results: CaseResult[] = []

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const tq = TEST_QUERIES[i]
    process.stdout.write(`[${i + 1}/${TEST_QUERIES.length}] "${tq.query}" (${tq.type}) ... `)
    try {
      const r = await evaluateCase(tq, judge)
      results.push(r)
      const diff = r.after.score - r.before.score
      const diffStr = diff > 0 ? `+${diff}` : String(diff)
      console.log(`CR: ${r.before.score}/5 → ${r.after.score}/5 (${diffStr}) | 청크: ${r.before.chunkCount} → ${r.after.chunkCount}`)
    } catch (err) {
      console.log(`실패: ${String(err)}`)
    }
  }

  if (results.length === 0) {
    console.error('평가 결과 없음 — LM Studio가 가동 중인지 확인하세요.')
    process.exit(1)
  }

  // 요약 출력
  const avgBefore = results.reduce((s, r) => s + r.before.score, 0) / results.length
  const avgAfter  = results.reduce((s, r) => s + r.after.score,  0) / results.length
  console.log('')
  console.log('─'.repeat(60))
  console.log(`Context Relevance 평균: ${avgBefore.toFixed(2)} → ${avgAfter.toFixed(2)} (${avgAfter - avgBefore >= 0 ? '+' : ''}${(avgAfter - avgBefore).toFixed(2)})`)

  // Markdown 보고서 저장
  const now = new Date()
  const ts = now.toISOString().slice(0, 16).replace('T', ' ')
  const fileTs = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(' ', '')
  const report = buildReport(results, chunkTotal, ts)

  const docsDir = join(process.cwd(), 'docs')
  mkdirSync(docsDir, { recursive: true })
  const filePath = join(docsDir, `query-rewrite-eval-${fileTs}.md`)
  writeFileSync(filePath, report, 'utf8')
  console.log(`보고서 저장: ${filePath}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('평가 실패:', err)
  process.exit(1)
})
