import { NextResponse } from 'next/server'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/v1/models`, {
      headers: { Authorization: 'Bearer lm-studio' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return NextResponse.json([], { status: 200 })
    const data = await res.json()
    const EMBED_PATTERN = /embed|embedding/i
    const models = (data.data ?? [])
      .filter((m: { id: string; type?: string }) =>
        m.type !== 'embedding' && !EMBED_PATTERN.test(m.id)
      )
      .map((m: { id: string }) => ({ id: m.id, label: m.id }))
    return NextResponse.json(models)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
