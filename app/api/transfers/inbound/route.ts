import { NextRequest, NextResponse } from 'next/server'
import { getProducer, TOPICS } from '@/lib/kafka'
import { injectTraceContext } from '@/lib/kafka-otel'

type InboundPayload = {
  transactionNo:     string
  fromBankCode:      string
  fromAccountNumber: string
  fromPartyName:     string
  toBankCode:        string
  toAccountNumber:   string
  toAccountName:     string
  amount:            number
  memo?:             string | null
  requestedAt?:      string
}

export async function POST(req: NextRequest) {
  // 공동망 게이트웨이 인증 — X-Gateway-Token 헤더 검증
  const secret = process.env.GATEWAY_SECRET
  if (secret) {
    const token = req.headers.get('x-gateway-token')
    if (token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: InboundPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    transactionNo, fromBankCode, fromAccountNumber, fromPartyName,
    toBankCode, toAccountNumber, toAccountName, amount, memo, requestedAt,
  } = body

  if (!transactionNo || !fromBankCode || !fromAccountNumber || !fromPartyName ||
      !toBankCode || !toAccountNumber || !toAccountName || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  const transactionId = crypto.randomUUID()
  const message = {
    transactionId,
    transactionNo,
    fromBankCode,
    fromAccountNumber,
    fromPartyName,
    toBankCode,
    toAccountNumber,
    toAccountName,
    amount,
    memo:        memo ?? null,
    requestedAt: requestedAt ?? new Date().toISOString(),
  }

  try {
    const producer = await getProducer()
    await producer.send({
      topic:    TOPICS.INBOUND_REQUESTS,
      messages: [{ key: transactionId, value: JSON.stringify(message), headers: injectTraceContext() }],
    })
  } catch (e) {
    console.error('[inbound] Kafka 발행 실패:', e)
    return NextResponse.json({ error: 'Failed to queue transfer' }, { status: 503 })
  }

  return NextResponse.json({ transactionId, status: 'QUEUED' }, { status: 202 })
}
