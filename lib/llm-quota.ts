import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { toKSTDateCode } from '@/lib/formatters'

// Anthropic 폴백 일일 호출 한도 — 계정 무관 전역, KST 날짜 단위
// 카운터 파일 형식: "YYYYMMDD 횟수" 한 줄. 날짜가 다르거나 파일이 없으면 0회로 간주 (삭제 = 리셋)
export const ANTHROPIC_DAILY_LIMIT = parseInt(process.env.ANTHROPIC_DAILY_LIMIT ?? '20', 10)
const USAGE_FILE = path.join(process.cwd(), 'data', 'anthropic-usage.txt')

// 동시 요청이 read→write 사이에 끼어들지 않도록 프로세스 내 직렬화
// dev HMR로 모듈이 재평가돼도 큐가 유지되도록 globalThis에 보관 (lib/prisma.ts와 같은 패턴)
// 단일 프로세스 기준 — 여러 인스턴스를 띄우면 소폭 초과 가능
const globalForQuota = globalThis as unknown as { anthropicQuotaQueue?: Promise<unknown> }

async function readUsage(today: string): Promise<number> {
  try {
    const [date, count] = (await readFile(USAGE_FILE, 'utf8')).trim().split(/\s+/)
    const n = parseInt(count, 10)
    return date === today && Number.isFinite(n) ? n : 0
  } catch {
    return 0  // 파일 없음 → 오늘 첫 호출
  }
}

/** 한도 내면 1 증가시키고 allowed=true, 초과면 증가 없이 allowed=false */
export function tryConsumeAnthropicQuota(): Promise<{ allowed: boolean; used: number }> {
  const run = (globalForQuota.anthropicQuotaQueue ?? Promise.resolve()).then(async () => {
    const today = toKSTDateCode(new Date())
    const used = await readUsage(today)
    if (used >= ANTHROPIC_DAILY_LIMIT) return { allowed: false, used }
    await mkdir(path.dirname(USAGE_FILE), { recursive: true })
    const tmp = `${USAGE_FILE}.tmp`
    await writeFile(tmp, `${today} ${used + 1}\n`, 'utf8')
    await rename(tmp, USAGE_FILE)  // 원자적 교체 — 쓰다 죽어도 파일이 깨지지 않음
    return { allowed: true, used: used + 1 }
  })
  globalForQuota.anthropicQuotaQueue = run.catch(() => {})  // 한 건 실패가 이후 요청을 막지 않게
  return run
}
