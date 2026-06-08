import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

const BASE_URL        = __ENV.BASE_URL        || 'http://localhost:3000'
const FROM_ACCOUNT_ID = __ENV.FROM_ACCOUNT_ID || '9c7a7f9f-3ab9-4198-bb9d-a63055c656f1'

// ── 커스텀 메트릭 ────────────────────────────────────────────
const pendingCount  = new Counter('transfer_pending')
const completedCount= new Counter('transfer_completed')
const failedCount   = new Counter('transfer_failed')
const errorRate     = new Rate('transfer_error_rate')
const transferDur   = new Trend('transfer_duration_ms', true)

// ── 부하 시나리오 ─────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '1m', target: 20  },  // 워밍업
    { duration: '3m', target: 100 },  // 램프업
    { duration: '5m', target: 100 },  // 피크 유지
    { duration: '1m', target: 0   },  // 쿨다운
  ],
  thresholds: {
    http_req_duration:    ['p(95)<3000'],   // 95%ile 3초 이내
    http_req_failed:      ['rate<0.05'],    // HTTP 실패율 5% 미만
    transfer_error_rate:  ['rate<0.05'],    // 이체 오류율 5% 미만
  },
}

// ── 인증 (setup 단계 — 1회 실행) ─────────────────────────────
export function setup() {
  // 1) CSRF 토큰 취득
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`)
  const csrf    = csrfRes.json('csrfToken')
  if (!csrf) throw new Error(`CSRF 토큰 취득 실패: ${csrfRes.body}`)

  // 2) Credentials 로그인
  const loginRes = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    { loginId: 'testuser', password: 'Test1234!', csrfToken: csrf },
    { redirects: 0 },
  )

  // next-auth.session-token 또는 __Secure-next-auth.session-token
  const cookies   = loginRes.cookies
  const tokenKey  = Object.keys(cookies).find(k => k.includes('session-token'))
  if (!tokenKey) throw new Error(`세션 쿠키 없음. 로그인 실패. status=${loginRes.status}`)

  const sessionToken = cookies[tokenKey][0].value
  console.log(`로그인 성공 — cookie: ${tokenKey}`)
  return { sessionToken, cookieName: tokenKey }
}

// ── 메인 VU 루프 ─────────────────────────────────────────────
export default function (data) {
  const { sessionToken, cookieName } = data

  const idempotencyKey = `k6-vu${__VU}-iter${__ITER}-${Date.now()}`

  const payload = JSON.stringify({
    fromAccountId:  FROM_ACCOUNT_ID,
    toAccountNumber:'3020000000001',
    toName:         '김신한',
    bankCode:       '302',
    amount:         100,
    memo:           'k6-load-test',
    idempotencyKey,
  })

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie':        `${cookieName}=${sessionToken}`,
    },
  }

  const start = Date.now()
  const res   = http.post(`${BASE_URL}/api/transfers`, payload, params)
  transferDur.add(Date.now() - start)

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'ok: true':   (r) => {
      try { return r.json('ok') === true } catch { return false }
    },
  })

  if (!ok || res.status !== 200) {
    errorRate.add(1)
    failedCount.add(1)
    console.error(`VU${__VU} iter${__ITER} 실패 status=${res.status} body=${res.body?.slice(0, 200)}`)
  } else {
    errorRate.add(0)
    const status = res.json('status')
    if (status === 'PENDING')   pendingCount.add(1)
    else                        completedCount.add(1)
  }

  sleep(0.5)
}

// ── 종료 요약 ─────────────────────────────────────────────────
export function teardown() {
  console.log('테스트 종료 — DB에서 아래 쿼리로 실제 처리 건수 확인:')
  console.log("SELECT count(*) FROM transaction WHERE memo = 'k6-load-test';")
}
