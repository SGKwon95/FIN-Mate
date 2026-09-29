/**
 * RAG 답변 품질 평가 — 실제 RAGAS 산식 기반
 *
 * 평가 지표:
 *  1. Faithfulness       — 답변을 claim 단위로 분해 후 컨텍스트 지지 여부 검증, 지지 비율
 *  2. Answer Relevancy   — 답변으로부터 역질문 생성 후 원본 질문과의 임베딩 코사인 유사도 평균
 *  3. Context Precision  — 랭크 순 청크마다 관련성 판정 후 rank 기반 Average Precision
 *  4. Context Recall     — (groundTruth가 있는 케이스만) 정답을 문장 분해 후 컨텍스트 귀속 여부 검증, 귀속 비율
 *
 * 사용법: npm run rag:eval
 */

import {
  evaluateFaithfulness,
  evaluateAnswerRelevancy,
  evaluateContextPrecision,
  evaluateContextRecall,
  type EvalChunk,
} from '../lib/rag-eval'
import { logger } from '../lib/logger'

const MODEL_ID = 'qwen2.5-14b-instruct'

interface EvalCase {
  question: string
  contexts: string[]     // 검색 랭크 순 청크 목록
  answer: string
  groundTruth?: string    // 있으면 Context Recall 계산
}

interface CaseResult {
  faithfulness: number
  answerRelevancy: number
  contextPrecision: number
  contextRecall: number | null
}

const EVAL_CASES: EvalCase[] = [
  {
    question: '정기예금 중도해지 시 6개월 이상 9개월 미만 보유하면 이자는 어떻게 되나요?',
    contexts: [
      `제5조 (중도해지)
③ 중도해지이율은 가입기간 대비 실제 예치기간 비율에 따라 다음과 같이 적용한다:
  • 6개월 이상 9개월 미만: 약정이율의 60%
  • 9개월 이상 만기 미만: 약정이율의 80%`,
    ],
    answer: '정기예금 중도해지 시 실제 예치기간이 6개월 이상 9개월 미만인 경우, 약정이율의 60%를 적용하여 이자를 계산합니다. (제5조 ③항에 의거)',
    groundTruth: '실제 예치기간이 6개월 이상 9개월 미만이면 약정이율의 60%가 적용된다.',
  },
  {
    question: '적금 예금자보호 한도는 얼마인가요?',
    contexts: [
      `제7조 (예금자보호)
① 이 예금은 예금자보호법에 따라 예금보험공사가 보호하되, 보호한도는 본 은행의 여타 보호대상 금융상품과 합산하여 1인당 최고 5,000만원까지 보호한다.`,
    ],
    answer: '적금은 예금자보호법에 따라 예금보험공사가 보호하며, 보호한도는 KB국민은행의 다른 보호 대상 금융상품과 합산하여 1인당 최고 **5,000만원**입니다. 5,000만원 초과 금액은 보호받지 못합니다. (근거: 제7조 ①항)',
    groundTruth: '예금보험공사가 보호하며, 다른 보호대상 금융상품과 합산하여 1인당 최고 5,000만원까지 보호된다.',
  },
]

async function evalOne(c: EvalCase): Promise<CaseResult> {
  const context = c.contexts.join('\n\n')
  const chunks: EvalChunk[] = c.contexts.map((content, i) => ({ id: String(i + 1), content }))

  const faithfulness = await evaluateFaithfulness(c.question, context, c.answer, MODEL_ID)
  const answerRelevancy = await evaluateAnswerRelevancy(c.question, c.answer, MODEL_ID)
  const contextPrecision = await evaluateContextPrecision(c.question, c.answer, chunks, MODEL_ID)
  const contextRecall = c.groundTruth
    ? await evaluateContextRecall(c.groundTruth, context, MODEL_ID)
    : null

  return {
    faithfulness: faithfulness.score,
    answerRelevancy: answerRelevancy.score,
    contextPrecision: contextPrecision.score,
    contextRecall: contextRecall?.score ?? null,
  }
}

async function main() {
  console.log('🔍 RAG 답변 품질 평가 시작 (실제 RAGAS 산식)\n')
  const results: CaseResult[] = []

  for (let i = 0; i < EVAL_CASES.length; i++) {
    const c = EVAL_CASES[i]
    console.log(`[케이스 ${i + 1}] ${c.question.slice(0, 40)}...`)
    try {
      const result = await evalOne(c)
      results.push(result)
      console.log(`  Faithfulness      : ${result.faithfulness.toFixed(2)}`)
      console.log(`  Answer Relevancy  : ${result.answerRelevancy.toFixed(2)}`)
      console.log(`  Context Precision : ${result.contextPrecision.toFixed(2)}`)
      console.log(`  Context Recall    : ${result.contextRecall !== null ? result.contextRecall.toFixed(2) : '- (ground truth 없음)'}\n`)
    } catch (err) {
      logger.error({ err }, `케이스 ${i + 1} 평가 실패`)
    }
  }

  if (results.length > 0) {
    const avg = (key: keyof CaseResult) => {
      const values = results.map((r) => r[key]).filter((v): v is number => v !== null)
      if (values.length === 0) return null
      return values.reduce((s, v) => s + v, 0) / values.length
    }

    console.log('─'.repeat(50))
    console.log('📊 평균 점수')
    console.log(`  Faithfulness      : ${avg('faithfulness')!.toFixed(2)}`)
    console.log(`  Answer Relevancy  : ${avg('answerRelevancy')!.toFixed(2)}`)
    console.log(`  Context Precision : ${avg('contextPrecision')!.toFixed(2)}`)
    const recallAvg = avg('contextRecall')
    console.log(`  Context Recall    : ${recallAvg !== null ? recallAvg.toFixed(2) : '- (ground truth 없음)'}`)
  }
}

main().catch((err) => {
  console.error('평가 실패:', err)
  process.exit(1)
})
