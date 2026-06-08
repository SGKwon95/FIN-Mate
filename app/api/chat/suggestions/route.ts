import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { auth } from '@/auth'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const { context, modelId } = await req.json()
  if (!modelId) return Response.json({ questions: [] })

  const lm = createOpenAI({ baseURL: `${OLLAMA_BASE_URL}/v1`, apiKey: 'lm-studio' })

  const systemPrompt = context?.trim()
    ? `당신은 친절한 금융 상담 AI입니다. 아래 상품 정보를 바탕으로 고객이 궁금해할 만한 짧은 질문 4개를 한국어로 생성하세요. JSON 배열 형식으로만 응답하세요. 다른 설명 없이 배열만 출력하세요.\n예시 형식: ["질문1", "질문2", "질문3", "질문4"]`
    : `당신은 친절한 금융 상담 AI입니다. 은행 고객이 자주 묻는 일반적인 금융 질문 4개를 한국어로 생성하세요. JSON 배열 형식으로만 응답하세요. 다른 설명 없이 배열만 출력하세요.\n예시 형식: ["질문1", "질문2", "질문3", "질문4"]`

  const userPrompt = context?.trim()
    ? `상품 정보:\n${context.trim()}`
    : '일반 금융 상담 질문을 생성해주세요.'

  try {
    const { text } = await generateText({
      model: lm(modelId),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 300,
      temperature: 0.7,
    })

    // JSON 배열 파싱 — LLM이 마크다운 코드블록으로 감쌀 수 있으므로 추출
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return Response.json({ questions: [] })

    const questions: unknown = JSON.parse(match[0])
    if (!Array.isArray(questions)) return Response.json({ questions: [] })

    const valid = questions
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      .slice(0, 4)

    return Response.json({ questions: valid })
  } catch {
    return Response.json({ questions: [] })
  }
}
