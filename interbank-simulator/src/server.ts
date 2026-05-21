import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import type { Producer } from 'kafkajs'
import { findAccount, listTransactions, listAccounts, listInstructions, listKftcReceipts } from './db.js'

const PORT = Number(process.env.INTERBANK_HTTP_PORT ?? 4000)

const TRANSFER_REQUESTS_TOPIC = 'interbank-transfer-requests'

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?')
  if (idx === -1) return {}
  return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)))
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function makeRoute(producer: Producer) {
  return async function route(req: IncomingMessage, res: ServerResponse) {
    const url  = req.url ?? '/'
    const path = url.split('?')[0]
    const q    = parseQuery(url)

    // POST /simulate-transfer — 타행 → FIN-Mate(004) 입금 시뮬레이션
    if (req.method === 'POST' && path === '/simulate-transfer') {
      let body: Record<string, unknown>
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return json(res, { error: '요청 바디가 올바른 JSON이 아닙니다.' }, 400)
      }

      const toAccountNumber   = String(body.toAccountNumber ?? '').replace(/-/g, '')
      const amount            = Number(body.amount)
      const fromBankCode      = String(body.fromBankCode      ?? '302')
      const fromAccountNumber = String(body.fromAccountNumber ?? '3020000000001')
      const fromPartyName     = String(body.fromPartyName     ?? '타행 송금인')
      const memo              = body.memo != null ? String(body.memo) : null

      if (!/^\d{10,16}$/.test(toAccountNumber))
        return json(res, { error: 'toAccountNumber 형식이 올바르지 않습니다.' }, 400)
      if (!Number.isInteger(amount) || amount <= 0)
        return json(res, { error: 'amount는 양의 정수여야 합니다.' }, 400)

      const transactionId = crypto.randomUUID()
      const transactionNo = `SIM${Date.now()}`
      const requestedAt   = new Date().toISOString()

      await producer.send({
        topic:    TRANSFER_REQUESTS_TOPIC,
        messages: [{
          key:   transactionId,
          value: JSON.stringify({
            transactionId,
            transactionNo,
            fromBankCode,
            fromAccountNumber,
            fromPartyName,
            toBankCode:       '004',
            toAccountNumber,
            toAccountName:    '',
            amount,
            memo,
            requestedAt,
          }),
        }],
      })

      console.log(`[타행 HTTP] ▶ 이체 요청 발행: ${transactionNo} | ${fromBankCode}:${fromAccountNumber} → 004:${toAccountNumber} | ${amount.toLocaleString('ko-KR')}원`)
      return json(res, { ok: true, transactionId, transactionNo })
    }

    if (req.method !== 'GET') return json(res, { error: 'Method Not Allowed' }, 405)

    // GET /transactions[?limit=N&status=COMPLETED|FAILED]
    if (path === '/transactions') {
      const limit  = Math.min(Number(q.limit ?? 50), 200)
      const status = q.status
      const rows   = listTransactions({ limit, status })
      return json(res, { count: rows.length, transactions: rows })
    }

    // GET /accounts
    if (path === '/accounts') {
      return json(res, { accounts: listAccounts() })
    }

    // GET /accounts/:accountNumber
    const m = path.match(/^\/accounts\/(\d+)$/)
    if (m) {
      const account = findAccount(m[1])
      if (!account) return json(res, { error: '계좌를 찾을 수 없습니다.' }, 404)
      return json(res, account)
    }

    // GET /instructions[?limit=N&status=PENDING|COMPLETED|FAILED]
    if (path === '/instructions') {
      const limit  = Math.min(Number(q.limit ?? 50), 200)
      const status = q.status
      const rows   = listInstructions({ limit, status })
      return json(res, { count: rows.length, instructions: rows })
    }

    // GET /kftc-receipts[?limit=N]
    if (path === '/kftc-receipts') {
      const limit = Math.min(Number(q.limit ?? 50), 200)
      const rows  = listKftcReceipts({ limit })
      return json(res, { count: rows.length, receipts: rows })
    }

    return json(res, { error: 'Not Found' }, 404)
  }
}

export function startHttpServer(producer: Producer) {
  createServer((req, res) => {
    makeRoute(producer)(req, res).catch((err) => {
      console.error('[타행 HTTP] 오류:', err)
      res.writeHead(500).end(JSON.stringify({ error: 'Internal Server Error' }))
    })
  }).listen(PORT, () => {
    console.log(`[타행 HTTP] http://localhost:${PORT}`)
    console.log('  POST /simulate-transfer  { toAccountNumber, amount, fromBankCode?, fromAccountNumber?, fromPartyName?, memo? }')
    console.log('  GET  /transactions?limit=50&status=COMPLETED|FAILED')
    console.log('  GET  /accounts')
    console.log('  GET  /accounts/:accountNumber')
    console.log('  GET  /instructions?limit=50&status=PENDING|COMPLETED|FAILED')
    console.log('  GET  /kftc-receipts?limit=50')
  })
}
