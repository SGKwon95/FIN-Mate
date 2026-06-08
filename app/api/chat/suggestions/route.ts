import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'

async function fetchDocSample(docCategory: string): Promise<string> {
  const where =
    docCategory === 'all'
      ? { docName: { startsWith: 'emp-' } }
      : { docName: { startsWith: `emp-${docCategory}-` } }
  const chunks = await prisma.documentChunk.findMany({
    where,
    orderBy: { qualityScore: 'desc' },
    take: 6,
    select: { content: true },
  })
  return chunks.map((c) => c.content).join('\n\n')
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const { context, modelId, docCategory } = await req.json()
  if (!modelId) return Response.json({ questions: [] })

  const lm = createOpenAI({ baseURL: `${OLLAMA_BASE_URL}/v1`, apiKey: 'lm-studio' })

  let resolvedContext: string = context?.trim() ?? ''

  // 상품 컨텍스트 없고 docCategory 있으면 → 업로드된 문서에서 샘플 추출
  if (!resolvedContext && docCategory) {
    try {
      resolvedContext = await fetchDocSample(docCategory)
    } catch {
      // DB 조회 실패 시 일반 질문으로 폴백
    }
  }

  const systemPrompt = resolvedContext
    ? `당신은 친절한 금융 상담 AI입니다. 아래 문서 내용을 바탕으로 직원이 이 문서에서 실제로 확인할 수 있는 짧은 질문 4개를 한국어로 생성하세요. 문서에 없는 내용은 절대 만들지 마세요. JSON 배열 형식으로만 응답하세요. 다른 설명 없이 배열만 출력하세요.\n예시 형식: ["질문1", "질문2", "질문3", "질문4"]`
    : `당신은 친절한 금융 상담 AI입니다. 은행 직원이 자주 묻는 일반적인 금융 업무 질문 4개를 한국어로 생성하세요. JSON 배열 형식으로만 응답하세요. 다른 설명 없이 배열만 출력하세요.\n예시 형식: ["질문1", "질문2", "질문3", "질문4"]`

  const userPrompt = resolvedContext
    ? `문서 내용:\n${resolvedContext.slice(0, 1500)}`
    : '일반 금융 업무 질문을 생성해주세요.'

  try {
    const { text } = await generateText({
      model: lm(modelId),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 300,
      temperature: 0.7,
    })

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
