/**
 * FIN-Mate 인바운드 Consumer (타행 → FIN-Mate 입금)
 * 흐름:
 *   Gateway → [INBOUND_REQUESTS] → FIN-Mate (여기서 수신)
 *   FIN-Mate DB 입금 처리 (PostgreSQL)
 *   FIN-Mate → [INBOUND_RESULTS] → Gateway (처리 결과)
 * 실행: npm run kafka:inbound
 */
import './otel-init'
import { kafka, TOPICS } from '@/lib/kafka'
import { prisma } from '@/lib/prisma'
import { toKSTDateCode } from '@/lib/formatters'
import { createWorkerLogger } from '@/lib/logger'
import { runWithKafkaSpan } from '@/lib/kafka-otel'

const log = createWorkerLogger('inbound-consumer')
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const OWN_BANK_CODE = '004'

const consumer = kafka.consumer({ groupId: 'fin-mate-inbound-group' })
const producer  = kafka.producer()

type InboundRequest = {
  transactionId:     string
  instructionId?:    string
  transactionNo:     string
  fromBankCode:      string
  fromAccountNumber: string
  fromPartyName:     string
  toBankCode:        string
  toAccountNumber:   string
  toAccountName:     string
  amount:            number
  memo:              string | null
  requestedAt:       string
}

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: Object.values(TOPICS).map((topic) => ({
      topic,
      numPartitions:     1,
      replicationFactor: 1,
    })),
  })
  await admin.disconnect()

  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topics: [TOPICS.INBOUND_REQUESTS], fromBeginning: false })

  log.info({ event: 'worker_started', topics: [TOPICS.INBOUND_REQUESTS] }, '타행 입금 수신 대기 중')

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return
      return runWithKafkaSpan(TOPICS.INBOUND_REQUESTS, message.headers, async () => {
      const req = JSON.parse(message.value!.toString()) as InboundRequest

      log.info({
        event: 'inbound_request_received',
        transactionNo: req.transactionNo,
        fromBankCode: req.fromBankCode,
        fromAccountNumber: req.fromAccountNumber,
        toAccountNumber: req.toAccountNumber,
        amount: req.amount,
      }, '입금 요청')

      const now = new Date()
      let status:      'COMPLETED' | 'FAILED'
      let failureCode: string | null = null

      // 수신 계좌 조회 — DB에 하이픈 포함/미포함 혼재 가능하므로 REPLACE로 정규화 비교
      const rows = await prisma.$queryRaw<Array<{
        account_id: string; party_id: string; balance: string; account_status: string; is_locked: boolean
      }>>`
        SELECT account_id, party_id, balance, account_status, is_locked
        FROM account
        WHERE REPLACE(account_number, '-', '') = ${req.toAccountNumber}
        LIMIT 1
      `
      const account = rows[0] ? {
        accountId:     rows[0].account_id,
        partyId:       rows[0].party_id,
        balance:       rows[0].balance,
        accountStatus: rows[0].account_status,
        isLocked:      rows[0].is_locked,
      } : null

      if (!account || account.accountStatus !== 'ACTIVE' || account.isLocked) {
        status      = 'FAILED'
        failureCode = !account ? 'ACCOUNT_NOT_FOUND' : 'ACCOUNT_INACTIVE'
        log.warn({ event: 'account_unavailable', toAccountNumber: req.toAccountNumber, failureCode }, '계좌 불가')
      } else {
        const balanceBefore = Number(account.balance)
        const balanceAfter  = balanceBefore + req.amount
        const txDate        = toKSTDateCode(now)
        const txNo          = `IN${Date.now()}`

        await prisma.$transaction(async (tx: TxClient) => {
          const created = await tx.transaction.create({
            data: {
              accountId:                account.accountId,
              transactionType:          'TRANSFER_IN',
              amount:                   req.amount,
              balanceBefore:            balanceBefore,
              balanceAfter:             balanceAfter,
              transactionStatus:        'COMPLETED',
              channel:                  'INTERBANK',
              counterpartAccountNumber: req.fromAccountNumber,
              counterpartBankCode:      req.fromBankCode,
              counterpartName:          req.fromPartyName,
              transactionNo:            txNo,
              remark:                   req.fromPartyName,
              memo:                     req.memo ?? null,
              transactionDate:          txDate,
              transactedAt:             now,
            },
          })
          await tx.account.update({
            where: { accountId: account.accountId },
            data:  { balance: balanceAfter, lastTransactionAt: now },
          })
          await tx.notification.create({
            data: {
              partyId:           account.partyId,
              notificationType:  'TRANSFER_IN',
              notificationTitle: '타행 입금',
              notificationBody:  `${req.fromPartyName}님으로부터 ${req.amount.toLocaleString('ko-KR')}원이 입금되었습니다.`,
            },
          })
          await tx.kftcReceipt.create({
            data: {
              direction:     'INBOUND',
              transactionId: created.transactionId,
              rspCode:       '000',
              rspMessage:    '정상',
              bankTranId:    req.transactionNo,
              receivedAt:    now,
            },
          })
        })

        status = 'COMPLETED'
        log.info({ event: 'inbound_completed', toAccountNumber: req.toAccountNumber, amount: req.amount, balanceAfter }, '입금 완료')
      }

      // 처리 결과를 Gateway로 발신
      await producer.send({
        topic:    TOPICS.INBOUND_RESULTS,
        messages: [{ key: req.transactionId, value: JSON.stringify({
          transactionId: req.transactionId,
          transactionNo: req.transactionNo,
          status,
          failureCode,
          settledAt:     now.toISOString(),
        }) }],
      })
      log.info({ event: 'inbound_result_sent', transactionNo: req.transactionNo, status }, '처리 결과 발신')
      }) // end runWithKafkaSpan
    },
  })
}

main().catch((err) => {
  log.fatal({ err }, '인바운드 Consumer 치명적 오류')
  process.exit(1)
})
