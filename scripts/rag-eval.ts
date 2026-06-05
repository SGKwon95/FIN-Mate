/**
 * RAG 답변 품질 평가 (LLM-as-a-Judge)
 *
 * 평가 기준 3가지 (각 1~5점):
 *  1. Context Relevance  — 검색된 청크가 질문에 필요한 정보를 포함하는가
 *  2. Faithfulness       — 답변이 컨텍스트에만 근거하는가 (할루시네이션 여부)
 *  3. Answer Relevance   — 답변이 질문 의도에 직접 답하는가
 *
 * 사용법: npm run rag:eval
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { logger } from '../lib/logger'

interface EvalCase {
  question: string
  retrievedContext: string
  answer: string
}

interface EvalResult {
  contextRelevance: number   // 1~5
  faithfulness: number       // 1~5
  answerRelevance: number    // 1~5
  overall: number            // 평균
  reasoning: string
}

// ── [요청 4] LLM-as-a-Judge 평가 프롬프트 ──────────────────────
const JUDGE_PROMPT = (c: EvalCase) => `
당신은 금융 RAG 시스템의 답변 품질을 평가하는 전문 심사위원입니다.
아래 질문, 검색된 컨텍스트, 생성된 답변을 보고 3가지 기준으로 1~5점을 부여하십시오.

---
## 질문
${c.question}

## 검색된 컨텍스트 (RAG 검색 결과)
${c.retrievedContext}

## 생성된 답변
${c.answer}

---
## 평가 기준

### 1. Context Relevance (문맥 적합성) — 1~5점
질문에 답변하기 위해 필요한 정보가 검색된 컨텍스트에 충분히 포함되어 있는가?
- 5: 질문에 필요한 모든 핵심 정보가 컨텍스트에 명확히 존재
- 3: 일부 관련 정보는 있으나 완전하지 않음
- 1: 컨텍스트가 질문과 전혀 무관하거나 필요한 정보가 없음

### 2. Faithfulness (충실성/할루시네이션) — 1~5점
생성된 답변의 모든 사실적 주장이 검색된 컨텍스트에만 근거하는가?
- 5: 답변의 모든 내용이 컨텍스트에 명시적으로 근거함. 외부 지식 사용 없음
- 3: 대부분 컨텍스트 기반이나 일부 추론/외부 지식 포함
- 1: 컨텍스트에 없는 내용을 지어내거나 수치 오류 존재 (할루시네이션)

### 3. Answer Relevance (답변 적합성) — 1~5점
생성된 답변이 사용자의 원래 질문 의도에 직접적으로 답하고 있는가?
- 5: 질문에 정확하고 완전하게 답변하며 불필요한 내용 없음
- 3: 질문에 어느 정도 답변하지만 핵심을 벗어나거나 불완전함
- 1: 질문과 무관한 답변이거나 요점을 완전히 벗어남

---
## 출력 형식 (JSON만 출력, 다른 텍스트 없음)
{
  "context_relevance": <1~5 정수>,
  "faithfulness": <1~5 정수>,
  "answer_relevance": <1~5 정수>,
  "reasoning": "<각 점수에 대한 100자 이내 한국어 근거>"
}
`

// 테스트 케이스 (실제 운영 시 DB 또는 파일에서 로드)
const EVAL_CASES: EvalCase[] = [
  {
    question: '정기예금 중도해지 시 6개월 이상 9개월 미만 보유하면 이자는 어떻게 되나요?',
    retrievedContext: `[1] 제5조 (중도해지)
③ 중도해지이율은 가입기간 대비 실제 예치기간 비율에 따라 다음과 같이 적용한다:
  • 6개월 이상 9개월 미만: 약정이율의 60%
  • 9개월 이상 만기 미만: 약정이율의 80%`,
    answer: '정기예금 중도해지 시 실제 예치기간이 6개월 이상 9개월 미만인 경우, 약정이율의 60%를 적용하여 이자를 계산합니다. (제5조 ③항에 의거)',
  },
  {
    question: '적금 예금자보호 한도는 얼마인가요?',
    retrievedContext: `[1] 제7조 (예금자보호)
① 이 예금은 예금자보호법에 따라 예금보험공사가 보호하되, 보호한도는 본 은행의 여타 보호대상 금융상품과 합산하여 1인당 최고 5,000만원까지 보호한다.`,
    answer: '적금은 예금자보호법에 따라 예금보험공사가 보호하며, 보호한도는 KB국민은행의 다른 보호 대상 금융상품과 합산하여 1인당 최고 **5,000만원**입니다. 5,000만원 초과 금액은 보호받지 못합니다. (근거: 제7조 ①항)',
  },
]

async function judgeOne(evalCase: EvalCase, judge: ReturnType<typeof createOpenAI>): Promise<EvalResult> {
  const { text } = await generateText({
    model: judge('qwen2.5-14b-instruct'),
    prompt: JUDGE_PROMPT(evalCase),
    temperature: 0,
  })

  // JSON 파싱 (LLM이 마크다운 코드블록으로 감쌀 수 있어 추출)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`JSON 파싱 실패: ${text.slice(0, 100)}`)

  const parsed = JSON.parse(jsonMatch[0]) as {
    context_relevance: number
    faithfulness: number
    answer_relevance: number
    reasoning: string
  }

  const overall = (parsed.context_relevance + parsed.faithfulness + parsed.answer_relevance) / 3

  return {
    contextRelevance: parsed.context_relevance,
    faithfulness: parsed.faithfulness,
    answerRelevance: parsed.answer_relevance,
    overall: Math.round(overall * 100) / 100,
    reasoning: parsed.reasoning,
  }
}

async function main() {
  const judge = createOpenAI({
    baseURL: `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'}/v1`,
    apiKey: 'lm-studio',
  })

  console.log('🔍 RAG 답변 품질 평가 시작\n')
  const results: EvalResult[] = []

  for (let i = 0; i < EVAL_CASES.length; i++) {
    const c = EVAL_CASES[i]
    console.log(`[케이스 ${i + 1}] ${c.question.slice(0, 40)}...`)
    try {
      const result = await judgeOne(c, judge)
      results.push(result)
      console.log(`  Context Relevance : ${result.contextRelevance}/5`)
      console.log(`  Faithfulness      : ${result.faithfulness}/5`)
      console.log(`  Answer Relevance  : ${result.answerRelevance}/5`)
      console.log(`  Overall           : ${result.overall}/5`)
      console.log(`  근거: ${result.reasoning}\n`)
    } catch (err) {
      logger.error({ err }, `케이스 ${i + 1} 평가 실패`)
    }
  }

  if (results.length > 0) {
    const avg = (key: keyof EvalResult) =>
      (results.reduce((s, r) => s + (r[key] as number), 0) / results.length).toFixed(2)

    console.log('─'.repeat(50))
    console.log('📊 평균 점수')
    console.log(`  Context Relevance : ${avg('contextRelevance')}/5`)
    console.log(`  Faithfulness      : ${avg('faithfulness')}/5`)
    console.log(`  Answer Relevance  : ${avg('answerRelevance')}/5`)
    console.log(`  Overall           : ${avg('overall')}/5`)
  }
}

main().catch((err) => {
  console.error('평가 실패:', err)
  process.exit(1)
})
