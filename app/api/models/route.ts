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
    const models = (data.data ?? []).map((m: { id: string }) => ({
      id: m.id,
      label: m.id,
    }))
    return NextResponse.json(models)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
