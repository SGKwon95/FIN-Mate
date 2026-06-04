/**
 * 과부하 장애 테스트 — sleep 없음, 고VU로 Kafka 처리 한계 및 장애 시뮬레이션
 *
 * 실행 예시:
 *   # Scenario A: 컨슈머 과부하 (lag 급증 관찰)
 *   k6 run -e BASE_URL=http://localhost:3000 -e FROM_ACCOUNT_ID=<UUID> \
 *     -e SCENARIO=consumer-lag scripts/load-test/k6-overload.js
 *
 *   # Scenario B: 브로커 장애 내성 (실행 중 브로커 1개 중지)
 *   k6 run -e BASE_URL=http://localhost:3000 -e FROM_ACCOUNT_ID=<UUID> \
 *     -e SCENARIO=broker-failure scripts/load-test/k6-overload.js
 *
 *   # Scenario C: 최대 처리량 (TPS 한계 측정)
 *   k6 run -e BASE_URL=http://localhost:3000 -e FROM_ACCOUNT_ID=<UUID> \
 *     -e SCENARIO=max-tps scripts/load-test/k6-overload.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend, Gauge } from 'k6/metrics'

const BASE_URL        = __ENV.BASE_URL        || 'http://localhost:3000'
const FROM_ACCOUNT_ID = __ENV.FROM_ACCOUNT_ID || ''
const SCENARIO        = __ENV.SCENARIO        || 'consumer-lag'

const successCount = new Counter('transfer_success')
const failCount    = new Counter('transfer_fail')
const errorRate    = new Rate('transfer_error_rate')
const latency      = new Trend('transfer_latency_ms', true)

// ── 시나리오별 부하 설정 ────────────────────────────────────────
const SCENARIOS = {
  // A: 컨슈머 과부하 — 워커를 중간에 kill 하면서 lag 누적 관찰
  'consumer-lag': {
    stages: [
      { duration: '30s', target: 50  },
      { duration: '2m',  target: 200 },  // lag 급증 구간 — 이때 워커 kill
      { duration: '2m',  target: 200 },  // kill 상태 유지
      { duration: '2m',  target: 200 },  // 워커 재시작 후 lag 복구 관찰
      { duration: '30s', target: 0   },
    ],
    thresholds: {
      http_req_failed:     ['rate<0.30'],  // 장애 상황이므로 허용 범위 넓게
      transfer_error_rate: ['rate<0.30'],
    },
  },

  // B: 브로커 장애 — 실행 중 Naver Cloud 브로커 1개 docker stop
  'broker-failure': {
    stages: [
      { duration: '1m',  target: 50  },  // 안정 상태 확인
      { duration: '3m',  target: 50  },  // 이때 브로커 1개 중지
      { duration: '2m',  target: 50  },  // 2-broker로 운영 확인
      { duration: '2m',  target: 50  },  // 브로커 재시작 후 안정화
      { duration: '30s', target: 0   },
    ],
    thresholds: {
      http_req_failed:     ['rate<0.10'],  // 브로커 1개 다운에도 10% 미만 실패
      transfer_error_rate: ['rate<0.10'],
    },
  },

  // C: 최대 TPS — sleep 없이 VU 극대화, DB/Kafka 병목 지점 파악
  'max-tps': {
    stages: [
      { duration: '30s', target: 100 },
      { duration: '1m',  target: 300 },
      { duration: '3m',  target: 500 },
      { duration: '30s', target: 0   },
    ],
    thresholds: {
      http_req_duration:   ['p(95)<5000'],
      http_req_failed:     ['rate<0.20'],
    },
  },
}

export const options = {
  stages:     (SCENARIOS[SCENARIO] || SCENARIOS['consumer-lag']).stages,
  thresholds: (SCENARIOS[SCENARIO] || SCENARIOS['consumer-lag']).thresholds,
}

// ── 인증 ────────────────────────────────────────────────────────
export function setup() {
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`)
  const csrf    = csrfRes.json('csrfToken')
  if (!csrf) throw new Error(`CSRF 실패: ${csrfRes.body}`)

  const loginRes = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    { loginId: 'testuser', password: 'Test1234!', csrfToken: csrf },
    { redirects: 0 },
  )
  const tokenKey = Object.keys(loginRes.cookies).find(k => k.includes('session-token'))
  if (!tokenKey) throw new Error(`로그인 실패 status=${loginRes.status}`)

  console.log(`[setup] 시나리오: ${SCENARIO}  계좌: ${FROM_ACCOUNT_ID}`)
  return { token: loginRes.cookies[tokenKey][0].value, cookieName: tokenKey }
}

// ── VU 루프 (sleep 없음 → 최대 압박) ───────────────────────────
export default function (data) {
  const { token, cookieName } = data

  const res = http.post(
    `${BASE_URL}/api/transfers`,
    JSON.stringify({
      fromAccountId:   FROM_ACCOUNT_ID,
      toAccountNumber: '3020000000001',
      toName:          '김신한',
      bankCode:        '302',
      amount:          100,
      memo:            `overload-${SCENARIO}`,
      idempotencyKey:  `k6-vu${__VU}-iter${__ITER}-${Date.now()}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie':       `${cookieName}=${token}`,
      },
      timeout: '10s',
    },
  )

  latency.add(res.timings.duration)

  const ok = check(res, {
    'status 200': r => r.status === 200,
    'ok:true':    r => { try { return r.json('ok') === true } catch { return false } },
  })

  if (ok) {
    errorRate.add(0)
    successCount.add(1)
  } else {
    errorRate.add(1)
    failCount.add(1)
    if (__ITER % 50 === 0) {
      console.error(`VU${__VU} iter${__ITER} | status=${res.status} | ${res.body?.slice(0, 150)}`)
    }
  }
  // sleep 없음 — 최대 압박
}

export function teardown() {
  console.log(`\n[teardown] 시나리오 완료: ${SCENARIO}`)
  console.log('처리 건수 확인:')
  console.log(`  SELECT count(*), transaction_status FROM transaction WHERE memo='overload-${SCENARIO}' GROUP BY 2;`)
}
