// LM Studio 생존 확인 — 연결 불가 시 채팅 라우트가 Anthropic 폴백으로 전환하는 데 사용
// app/api/models/route.ts와 같은 엔드포인트를 쓰되, 호스트가 꺼져 있을 때 TCP 대기로 멈추지 않도록 타임아웃을 둔다
export async function isLmStudioReachable(timeoutMs = 1500): Promise<boolean> {
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseURL}/v1/models`, {
      headers: { Authorization: 'Bearer lm-studio' },
      signal: controller.signal,
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
