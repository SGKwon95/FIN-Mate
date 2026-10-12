import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { embed, cosineSimilarity } from './embeddings'
import { logger } from './logger'

// RAG 답변 품질 평가 — RAGAS 원 논문/라이브러리의 산식을 TypeScript로 재구현.
// 지표마다 별도 함수로 분리되어 있고, evaluateRag()는 이들을 오케스트레이션하는 얇은 래퍼다.
// evaluateRag() 1회 호출당 LLM 호출 최대 4회 + 임베딩 1회가 발생하므로,
// 로컬 LM Studio 단일 인스턴스 부담을 줄이기 위해 지표 간 실행은 병렬(Promise.all)이 아닌 순차(await)로 처리한다.

export interface EvalChunk {
  id: string
  content: string
}

function buildJudgeClient() {
  return createOpenAI({
    baseURL: `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'}/v1`,
    apiKey: 'lm-studio',
  })
}

async function runJudge(modelId: string, prompt: string): Promise<string> {
  const judge = buildJudgeClient()
  const { text } = await generateText({
    model: judge(modelId),
    prompt,
    temperature: 0,
  })
  return text
}

function extractJsonObject<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`LLM judge JSON 객체 파싱 실패: ${text.slice(0, 100)}`)
  return JSON.parse(match[0]) as T
}

function extractJsonArray<T>(text: string): T[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`LLM judge JSON 배열 파싱 실패: ${text.slice(0, 100)}`)
  return JSON.parse(match[0]) as T[]
}

/** rank 기반 Average Precision. relevance는 랭크 순서(입력 순서)를 그대로 유지해야 한다. */
export function averagePrecision(relevance: (0 | 1)[]): number {
  const totalRelevant = relevance.reduce((s: number, r) => s + r, 0)
  if (totalRelevant === 0) return 0

  let hits = 0
  let sumPrecision = 0
  relevance.forEach((r, i) => {
    if (r === 1) {
      hits += 1
      sumPrecision += hits / (i + 1)
    }
  })
  return sumPrecision / totalRelevant
}

// ── Faithfulness ──────────────────────────────────────────────
// 답변을 원자적 claim으로 분해한 뒤, 각 claim이 컨텍스트만으로 추론 가능한지 검증.
// score = 컨텍스트로 지지되는 claim 수 / 전체 claim 수

export interface FaithfulnessResult {
  score: number
  claims: Array<{ claim: string; verdict: 0 | 1 }>
}

export async function evaluateFaithfulness(
  question: string,
  context: string,
  answer: string,
  modelId: string,
): Promise<FaithfulnessResult> {
  const decomposePrompt = `질문과 답변이 주어집니다. 답변에 담긴 사실적 주장들을 더 이상 쪼갤 수 없는 원자적 문장(claim) 단위로 분해하십시오. 대명사나 생략된 주어는 질문 맥락을 참고해 명시적으로 풀어 쓰십시오.

## 질문
${question}

## 답변
${answer.slice(0, 1000)}

## 출력 형식 (JSON 배열만 출력, 다른 텍스트 없음)
["claim 1", "claim 2", ...]`

  const claimsText = await runJudge(modelId, decomposePrompt)
  const claims = extractJsonArray<string>(claimsText)

  if (claims.length === 0) {
    logger.warn({ event: 'faithfulness_no_claims' }, '분해된 claim이 없어 score=1로 처리')
    return { score: 1, claims: [] }
  }

  const verifyPrompt = `아래 컨텍스트만을 근거로, 각 claim이 참으로 추론 가능하면 1, 아니면(컨텍스트에 없거나 모순되면) 0을 부여하십시오.

## 컨텍스트
${context.slice(0, 3000)}

## Claim 목록
${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 출력 형식 (JSON 배열만 출력, claim 개수와 반드시 동일한 길이)
[1, 0, 1, ...]`

  const verdictsText = await runJudge(modelId, verifyPrompt)
  let verdicts = extractJsonArray<0 | 1>(verdictsText)

  if (verdicts.length !== claims.length) {
    logger.warn(
      { event: 'faithfulness_verdict_length_mismatch', expected: claims.length, got: verdicts.length },
      'verdict 배열 길이 불일치 — 부족분은 0으로 패딩',
    )
    verdicts = claims.map((_, i) => verdicts[i] ?? 0)
  }

  const supported = verdicts.filter((v) => v === 1).length
  return {
    score: supported / claims.length,
    claims: claims.map((claim, i) => ({ claim, verdict: verdicts[i] })),
  }
}

// ── Answer Relevancy ──────────────────────────────────────────
// 답변으로부터 역질문을 생성해 원본 질문과의 임베딩 코사인 유사도를 평균.
// 회피성(noncommittal) 답변은 역질문 생성이 무의미하므로 score=0.

export interface AnswerRelevancyResult {
  score: number
  generatedQuestions: string[]
  noncommittal: boolean
}

export async function evaluateAnswerRelevancy(
  question: string,
  answer: string,
  modelId: string,
  sampleSize = 3,
): Promise<AnswerRelevancyResult> {
  const prompt = `아래 답변만 보고, 이 답변이 나올 법한 질문을 ${sampleSize}개 생성하십시오. 답변이 "모르겠다", "확인이 안 된다" 등 회피적이거나 무성의하면 noncommittal을 true로 표시하십시오.

## 답변
${answer.slice(0, 1000)}

## 출력 형식 (JSON만 출력)
{"noncommittal": <true|false>, "questions": ["질문1", "질문2", ...]}`

  const resultText = await runJudge(modelId, prompt)
  const parsed = extractJsonObject<{ noncommittal: boolean; questions: string[] }>(resultText)

  if (parsed.noncommittal || parsed.questions.length === 0) {
    return { score: 0, generatedQuestions: parsed.questions ?? [], noncommittal: true }
  }

  const vectors = await embed([question, ...parsed.questions])
  const [questionVec, ...generatedVecs] = vectors
  const similarities = generatedVecs.map((v) => cosineSimilarity(questionVec, v))
  const score = similarities.reduce((s, v) => s + v, 0) / similarities.length

  return { score, generatedQuestions: parsed.questions, noncommittal: false }
}

// ── Context Precision (reference-free / context utilization) ──
// ground-truth 없이 생성된 답변을 의사-reference로 사용해, 랭크 순 청크마다 관련성을 판정한 뒤
// rank 기반 Average Precision을 계산. 진짜 ground-truth 기반 Context Precision과는 다른 근사치다.

export interface ContextPrecisionResult {
  score: number
  chunkVerdicts: Array<{ chunkId: string; relevant: boolean }>
}

export async function evaluateContextPrecision(
  question: string,
  answer: string,
  chunks: EvalChunk[],
  modelId: string,
): Promise<ContextPrecisionResult> {
  if (chunks.length === 0) return { score: 0, chunkVerdicts: [] }

  const prompt = `질문과 답변, 그리고 검색 랭크 순으로 정렬된 청크 목록이 주어집니다. 각 청크가 질문에 답하는 데 관련이 있으면 1, 없으면 0을 부여하십시오. 답변은 정답 참고용입니다.

## 질문
${question}

## 답변 (참고용)
${answer.slice(0, 500)}

## 청크 목록 (랭크 순)
${chunks.map((c, i) => `${i + 1}. ${c.content.slice(0, 500)}`).join('\n\n')}

## 출력 형식 (JSON 배열만 출력, 청크 개수와 반드시 동일한 길이, 랭크 순서 유지)
[1, 0, 1, ...]`

  const verdictsText = await runJudge(modelId, prompt)
  let verdicts = extractJsonArray<0 | 1>(verdictsText)

  if (verdicts.length !== chunks.length) {
    logger.warn(
      { event: 'context_precision_verdict_length_mismatch', expected: chunks.length, got: verdicts.length },
      'verdict 배열 길이 불일치 — 부족분은 0으로 패딩',
    )
    verdicts = chunks.map((_, i) => verdicts[i] ?? 0)
  }

  return {
    score: averagePrecision(verdicts),
    chunkVerdicts: chunks.map((c, i) => ({ chunkId: c.id, relevant: verdicts[i] === 1 })),
  }
}

// ── Context Recall (오프라인 전용, ground-truth 필요) ──────────
// ground-truth 답변을 문장 단위로 분해한 뒤, 각 문장이 검색된 컨텍스트에서 근거를 찾을 수 있는지 검증.
// 운영 실시간 평가에는 ground-truth가 없으므로 사용하지 않고, 오프라인 배치 스크립트에서만 호출한다.

export interface ContextRecallResult {
  score: number
  sentences: Array<{ sentence: string; attributed: 0 | 1 }>
}

export async function evaluateContextRecall(
  groundTruth: string,
  context: string,
  modelId: string,
): Promise<ContextRecallResult> {
  const decomposePrompt = `아래 정답 답변을 더 이상 쪼갤 수 없는 문장 단위로 분해하십시오.

## 정답 답변
${groundTruth}

## 출력 형식 (JSON 배열만 출력, 다른 텍스트 없음)
["문장 1", "문장 2", ...]`

  const sentencesText = await runJudge(modelId, decomposePrompt)
  const sentences = extractJsonArray<string>(sentencesText)

  if (sentences.length === 0) {
    logger.warn({ event: 'context_recall_no_sentences' }, '분해된 문장이 없어 score=1로 처리')
    return { score: 1, sentences: [] }
  }

  const verifyPrompt = `아래 컨텍스트에서 각 문장의 근거를 찾을 수 있으면 1, 없으면 0을 부여하십시오.

## 컨텍스트
${context.slice(0, 3000)}

## 문장 목록
${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 출력 형식 (JSON 배열만 출력, 문장 개수와 반드시 동일한 길이)
[1, 0, 1, ...]`

  const verdictsText = await runJudge(modelId, verifyPrompt)
  let verdicts = extractJsonArray<0 | 1>(verdictsText)

  if (verdicts.length !== sentences.length) {
    logger.warn(
      { event: 'context_recall_verdict_length_mismatch', expected: sentences.length, got: verdicts.length },
      'verdict 배열 길이 불일치 — 부족분은 0으로 패딩',
    )
    verdicts = sentences.map((_, i) => verdicts[i] ?? 0)
  }

  const attributed = verdicts.filter((v) => v === 1).length
  return {
    score: attributed / sentences.length,
    sentences: sentences.map((sentence, i) => ({ sentence, attributed: verdicts[i] })),
  }
}

// ── 오케스트레이터 (운영 + 오프라인 공용) ───────────────────────

export interface RagEvalResult {
  faithfulness: number
  answerRelevancy: number
  contextPrecision: number
  reasoning: string
  detail: {
    faithfulness: FaithfulnessResult
    answerRelevancy: AnswerRelevancyResult
    contextPrecision: ContextPrecisionResult
  }
}

export async function evaluateRag(
  question: string,
  context: string,
  chunks: EvalChunk[],
  answer: string,
  modelId: string,
): Promise<RagEvalResult> {
  const faithfulness = await evaluateFaithfulness(question, context, answer, modelId)
  const answerRelevancy = await evaluateAnswerRelevancy(question, answer, modelId)
  const contextPrecision = await evaluateContextPrecision(question, answer, chunks, modelId)

  const unsupportedClaims = faithfulness.claims.filter((c) => c.verdict === 0).length
  const irrelevantChunks = contextPrecision.chunkVerdicts.filter((c) => !c.relevant).length
  const reasoning = [
    unsupportedClaims > 0 ? `근거 없는 claim ${unsupportedClaims}개` : '모든 claim이 컨텍스트로 지지됨',
    answerRelevancy.noncommittal ? '답변이 회피적/무성의함' : `역질문 유사도 평균 ${answerRelevancy.score.toFixed(2)}`,
    irrelevantChunks > 0 ? `비관련 청크 ${irrelevantChunks}개` : '모든 청크가 관련성 있음',
  ].join(' / ')

  return {
    faithfulness: faithfulness.score,
    answerRelevancy: answerRelevancy.score,
    contextPrecision: contextPrecision.score,
    reasoning,
    detail: { faithfulness, answerRelevancy, contextPrecision },
  }
}
