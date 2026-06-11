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

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const { context, modelId, docCategory, messages } = await req.json()
  if (!modelId) return Response.json({ questions: [] })

  const lm = createOpenAI({ baseURL: `${OLLAMA_BASE_URL}/v1`, apiKey: 'lm-studio' })

  // 대화 기록이 있으면 파생 질문, 없으면 문서/일반 기반 초기 질문
  const recentMessages: ChatMessage[] = Array.isArray(messages) ? messages.slice(-4) : []
  const hasConversation = recentMessages.length >= 2

  let systemPrompt: string
  let userPrompt: string

  if (hasConversation) {
    const lastQ = recentMessages.filter(m => m.role === 'user').at(-1)?.content ?? ''
    const lastA = recentMessages.filter(m => m.role === 'assistant').at(-1)?.content ?? ''
    systemPrompt = `당신은 금융 상담 AI입니다. 아래 대화를 바탕으로 사용자가 자연스럽게 이어서 물어볼 수 있는 파생 질문 3개를 한국어로 생성하세요. 대화 주제에서 벗어나지 마세요. JSON 배열 형식으로만 응답하세요.\n예시 형식: ["질문1", "질문2", "질문3"]`
    userPrompt = `사용자 질문: ${lastQ.slice(0, 300)}\nAI 답변: ${lastA.slice(0, 500)}`
  } else {
    let resolvedContext: string = context?.trim() ?? ''
    if (!resolvedContext && docCategory) {
      try { resolvedContext = await fetchDocSample(docCategory) } catch { /* fallback */ }
    }
    systemPrompt = resolvedContext
      ? `당신은 친절한 금융 상담 AI입니다. 아래 문서 내용을 바탕으로 실제로 확인할 수 있는 짧은 질문 3개를 한국어로 생성하세요. 문서에 없는 내용은 절대 만들지 마세요. JSON 배열 형식으로만 응답하세요.\n예시 형식: ["질문1", "질문2", "질문3"]`
      : `당신은 친절한 금융 상담 AI입니다. 은행 업무 관련 일반적인 질문 3개를 한국어로 생성하세요. JSON 배열 형식으로만 응답하세요.\n예시 형식: ["질문1", "질문2", "질문3"]`
    userPrompt = resolvedContext ? `문서 내용:\n${resolvedContext.slice(0, 1500)}` : '일반 금융 업무 질문을 생성해주세요.'
  }

  try {
    const { text } = await generateText({
      model: lm(modelId),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 200,
      temperature: 0.7,
    })

    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return Response.json({ questions: [] })

    const questions: unknown = JSON.parse(match[0])
    if (!Array.isArray(questions)) return Response.json({ questions: [] })

    const valid = questions
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      .slice(0, 3)

    return Response.json({ questions: valid })
  } catch {
    return Response.json({ questions: [] })
  }
}
