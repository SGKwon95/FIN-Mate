/**
 * 타행 → FIN-Mate 입금 테스트 스크립트
 * 실행: npx tsx --env-file=.env scripts/test-inbound.ts [계좌번호] [금액]
 *
 * 기본값: testuser 입출금 계좌(009001234567​81), 50,000원
 * 예시:
 *   npx tsx --env-file=.env scripts/test-inbound.ts
 *   npx tsx --env-file=.env scripts/test-inbound.ts 00900123456781 100000
 */
import { kafka, TOPICS } from '@/lib/kafka'

async function main() {
  const toAccountNumber = process.argv[2] ?? '00900123456781'  // testuser 입출금 계좌 (하이픈 제거)
  const amount          = Number(process.argv[3] ?? 50_000)

  const payload = {
    transactionId:     crypto.randomUUID(),
    transactionNo:     `INTEST-${Date.now()}`,
    fromBankCode:      '020',                    // 우리은행 코드 (임의)
    fromAccountNumber: '1002-123-456789',
    fromPartyName:     '김테스트',
    toBankCode:        '004',                    // FIN-Mate (KB 004)
    toAccountNumber,
    toAccountName:     '홍길동',
    amount,
    memo:              '테스트 입금',
    requestedAt:       new Date().toISOString(),
  }

  const producer = kafka.producer()
  await producer.connect()

  await producer.send({
    topic:    TOPICS.INBOUND_REQUESTS,
    messages: [{ key: payload.transactionId, value: JSON.stringify(payload) }],
  })

  console.log('✅ 인바운드 입금 메시지 발행 완료')
  console.log(`   토픽    : ${TOPICS.INBOUND_REQUESTS}`)
  console.log(`   수신계좌 : ${toAccountNumber}`)
  console.log(`   금액    : ${amount.toLocaleString('ko-KR')}원`)
  console.log(`   보낸이  : ${payload.fromPartyName} (${payload.fromBankCode})`)
  console.log(`   txId    : ${payload.transactionId}`)

  await producer.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
