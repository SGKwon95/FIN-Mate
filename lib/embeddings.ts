// LM Studio OpenAI-compatible embeddings endpoint
// 필요한 모델: nomic-embed-text-v1.5 (768dim) 또는 mxbai-embed-large (1024dim)
// EMBEDDING_DIM을 변경할 경우 migration.sql의 vector(768)도 함께 변경 필요

export const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '768', 10)
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text-v1.5'

export async function embed(texts: string[]): Promise<number[][]> {
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'
  const res = await fetch(`${baseURL}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer lm-studio',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Embedding API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as { data: { embedding: number[] }[] }
  return data.data.map((d) => d.embedding)
}

export async function embedOne(text: string): Promise<number[]> {
  const results = await embed([text])
  return results[0]
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
