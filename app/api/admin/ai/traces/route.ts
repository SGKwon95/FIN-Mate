import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

const PHOENIX = process.env.PHOENIX_ENDPOINT ?? 'http://localhost:6006'
const PROJECT = process.env.PHOENIX_PROJECT_NAME ?? 'fin-mate'

type RawSpan = {
  id:          string
  name:        string
  context:     { trace_id: string; span_id: string }
  span_kind:   string
  parent_id:   string | null
  start_time:  string
  end_time:    string
  status_code: string
  attributes:  Record<string, unknown>
  events:      unknown[]
}

type RawAnnotation = {
  span_id: string
  name:    string
  result?: { score?: number }
}

function latencyMs(s: RawSpan) {
  return Math.round(Date.parse(s.end_time) - Date.parse(s.start_time))
}

async function fetchSpans(projectName: string): Promise<RawSpan[]> {
  const res = await fetch(
    `${PHOENIX}/v1/projects/${encodeURIComponent(projectName)}/spans?limit=300`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data ?? [])
}

async function fetchAnnotations(
  projectName: string,
  spanIds: string[],
): Promise<Record<string, Record<string, number>>> {
  if (spanIds.length === 0) return {}
  try {
    const params = spanIds.map(id => `span_ids=${encodeURIComponent(id)}`).join('&')
    const res = await fetch(
      `${PHOENIX}/v1/projects/${encodeURIComponent(projectName)}/span_annotations?${params}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return {}
    const json = await res.json()
    const list: RawAnnotation[] = Array.isArray(json) ? json : (json.data ?? [])
    const map: Record<string, Record<string, number>> = {}
    for (const ann of list) {
      if (!ann.span_id) continue
      map[ann.span_id] ??= {}
      const score = ann.result?.score
      if (score != null) map[ann.span_id][ann.name] = score
    }
    return map
  } catch {
    return {}
  }
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // fin-mate 프로젝트 없으면 default 폴백
    let spans = await fetchSpans(PROJECT)
    let projectUsed = PROJECT
    if (spans.length === 0 && PROJECT !== 'default') {
      spans = await fetchSpans('default')
      projectUsed = 'default'
    }

    if (spans.length === 0) return NextResponse.json([])

    // /api/chat 처리 스팬 필터: input.value가 있는 /api/chat 스팬
    // (span_kind=LLM은 ai.streamText도 해당되므로 name으로 구분)
    const chatSpans = spans.filter(s =>
      s.attributes?.['input.value'] &&
      (s.name?.includes('/api/chat') || s.span_kind === 'LLM') &&
      !s.name?.startsWith('ai.')
    )

    // 자식 스팬 인덱스 (부모 span_id → 자식 배열)
    const childByParent: Record<string, RawSpan[]> = {}
    for (const s of spans) {
      if (s.parent_id) {
        childByParent[s.parent_id] ??= []
        childByParent[s.parent_id].push(s)
      }
    }

    const spanIds = chatSpans.map(s => s.context.span_id).filter(Boolean)
    const annotations = await fetchAnnotations(projectUsed, spanIds)

    const traces = chatSpans.map(s => {
      const sid = s.context.span_id
      const children = childByParent[sid] ?? []

      // ai.streamText* 자식 스팬 — 답변·프롬프트·LLM 레이턴시
      const streamTextSpan = children.find(c => c.name?.startsWith('ai.streamText') || c.name?.startsWith('ai.generateText'))

      const answer = streamTextSpan
        ? String(streamTextSpan.attributes?.['ai.response.text'] ?? s.attributes?.['output.value'] ?? '')
        : String(s.attributes?.['output.value'] ?? '')

      // 프롬프트: ai.streamText의 ai.prompt ({"system":..., "messages":[...]} 또는 배열)
      let prompt: unknown[] = []
      const rawPrompt = streamTextSpan?.attributes?.['ai.prompt']
        ?? streamTextSpan?.attributes?.['ai.prompt.messages']
        ?? s.attributes?.['gen_ai.prompt']
      if (rawPrompt) {
        try {
          const parsed = typeof rawPrompt === 'string' ? JSON.parse(rawPrompt) : rawPrompt
          if (Array.isArray(parsed)) {
            prompt = parsed
          } else if (parsed && typeof parsed === 'object') {
            // {"system": "...", "messages": [...]} 형태
            const msgs: unknown[] = []
            if (parsed.system) msgs.push({ role: 'system', content: parsed.system })
            if (Array.isArray(parsed.messages)) msgs.push(...parsed.messages)
            prompt = msgs
          }
        } catch { /* noop */ }
      }

      // 검색된 청크
      let chunks: unknown[] = []
      const rawChunks = s.attributes?.['retrieval.documents']
      if (typeof rawChunks === 'string') {
        try { chunks = JSON.parse(rawChunks) } catch { /* noop */ }
      } else if (Array.isArray(rawChunks)) {
        chunks = rawChunks
      }

      // 레이턴시 breakdown (ai.streamText* 전체 기준)
      const llmMs = streamTextSpan ? latencyMs(streamTextSpan) : null
      const dbSpans = children.filter(c => c.name?.startsWith('pg.query:SELECT'))
      const dbMs = dbSpans.length > 0
        ? dbSpans.reduce((sum, c) => sum + latencyMs(c), 0)
        : null

      return {
        spanId:    sid,
        traceId:   s.context.trace_id,
        question:  String(s.attributes?.['input.value'] ?? ''),
        answer,
        startTime: s.start_time,
        totalMs:   latencyMs(s),
        llmMs,
        dbMs,
        status:    s.status_code,
        chunks,
        prompt,
        evals:     annotations[sid] ?? {},
      }
    })

    // 최신순 정렬, 질문 없는 항목 제외
    traces
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))

    return NextResponse.json(
      traces.filter(t => t.question).slice(0, 30)
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Phoenix 연결 실패'
    return NextResponse.json({ error: msg }, { status: 503 })
  }
}
