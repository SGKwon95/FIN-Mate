import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

export interface RagEvalResult {
  contextRelevance: number  // 0~1
  faithfulness: number      // 0~1
  answerRelevance: number   // 0~1
  reasoning: string
}

function buildJudgePrompt(question: string, context: string, answer: string) {
  return `당신은 금융 RAG 시스템의 답변 품질을 평가하는 심사위원입니다.
아래 질문, 검색된 컨텍스트, 생성된 답변을 보고 3가지 기준으로 1~5점을 부여하십시오.

## 질문
${question}

## 검색된 컨텍스트
${context.slice(0, 2000)}

## 생성된 답변
${answer.slice(0, 1000)}

## 평가 기준
- context_relevance: 질문에 필요한 정보가 컨텍스트에 충분한가 (1~5)
- faithfulness: 답변이 컨텍스트에만 근거하는가, 할루시네이션 없는가 (1~5)
- answer_relevance: 답변이 질문 의도에 직접 답하는가 (1~5)

## 출력 형식 (JSON만 출력)
{"context_relevance":<1~5>,"faithfulness":<1~5>,"answer_relevance":<1~5>,"reasoning":"<100자 이내 한국어 근거>"}`
}

export async function evaluateRag(
  question: string,
  context: string,
  answer: string,
): Promise<RagEvalResult> {
  const judge = createOpenAI({
    baseURL: `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'}/v1`,
    apiKey: 'lm-studio',
  })

  const { text } = await generateText({
    model: judge(process.env.EVAL_MODEL ?? 'local-model'),
    prompt: buildJudgePrompt(question, context, answer),
    temperature: 0,
  })

  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) throw new Error(`LLM judge JSON 파싱 실패: ${text.slice(0, 100)}`)

  const parsed = JSON.parse(jsonMatch[0]) as {
    context_relevance: number
    faithfulness: number
    answer_relevance: number
    reasoning: string
  }

  return {
    contextRelevance: parsed.context_relevance / 5,
    faithfulness:     parsed.faithfulness / 5,
    answerRelevance:  parsed.answer_relevance / 5,
    reasoning:        parsed.reasoning,
  }
}
