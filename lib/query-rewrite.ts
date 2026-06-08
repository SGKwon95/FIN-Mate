import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'

// 조사 패턴: 한국어 문장 형태 여부 판단
const KO_PARTICLE_RE = /[이가을를은는에의로으로에서에게부터까지]/

export async function rewriteQuery(question: string, modelId: string): Promise<string> {
  // 30자 초과이고 조사가 포함된 경우 → 이미 서술형 질문 → 그대로 반환
  if (question.length > 30 && KO_PARTICLE_RE.test(question)) return question

  const lmstudio = createOpenAI({
    baseURL: `${OLLAMA_BASE_URL}/v1`,
    apiKey: 'lm-studio',
  })

  const { text } = await generateText({
    model: lmstudio(modelId || 'local-model'),
    prompt: `다음 사용자 입력을 금융 약관/규정 문서 검색에 최적화된 질문 한 문장으로 다시 작성하라.
단어·짧은 구문이면 "~에 대해 설명하시오" 형태로 확장하라.
구어체는 문어체로 변환하라. 의미를 유지하고 핵심 금융 키워드를 포함하라.
한 문장만 출력하고 따옴표·번호·설명은 붙이지 마라.

입력: ${question}
재작성:`,
    temperature: 0.2,
    maxTokens: 120,
  })

  const rewritten = text.trim().split('\n')[0].replace(/^["'「『]|["'」』]$/g, '').trim()
  return rewritten || question
}
