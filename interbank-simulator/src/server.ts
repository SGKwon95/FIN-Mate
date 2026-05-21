import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { findAccount, listTransactions, listAccounts, listInstructions, listKftcReceipts } from './db.js'

const PORT = Number(process.env.INTERBANK_HTTP_PORT ?? 4000)

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

function route(req: IncomingMessage, res: ServerResponse) {
  const url  = req.url ?? '/'
  const path = url.split('?')[0]
  const q    = parseQuery(url)

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

export function startHttpServer() {
  createServer(route).listen(PORT, () => {
    console.log(`[타행 HTTP] http://localhost:${PORT}`)
    console.log('  GET /transactions?limit=50&status=COMPLETED|FAILED')
    console.log('  GET /accounts')
    console.log('  GET /accounts/:accountNumber')
    console.log('  GET /instructions?limit=50&status=PENDING|COMPLETED|FAILED')
    console.log('  GET /kftc-receipts?limit=50')
  })
}
