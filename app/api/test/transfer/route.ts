import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccount } from '@/app/(main)/transfer/actions'
import { getProducer, TOPICS } from '@/lib/kafka'
import { toKSTDateCode } from '@/lib/formatters'
import { injectTraceContext } from '@/lib/kafka-otel'

const OWN_BANK_CODE = '004'
const TEST_NAME = '[테스트]'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const action = searchParams.get('action')

  if (action === 'accounts') {
    const accounts = await prisma.account.findMany({
      where: {
        accountStatus: 'ACTIVE',
        accountPurpose: { notIn: ['SAVINGS', 'TIME_DEPOSIT'] },
      },
      select: { accountId: true, accountNumber: true, accountPurpose: true, balance: true, partyId: true },
      orderBy: { displayOrder: 'asc' },
    })
    return NextResponse.json({
      accounts: accounts.map((a) => ({ ...a, balance: a.balance.toFixed(0) })),
    })
  }

  if (action === 'status') {
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const tx = await prisma.transaction.findUnique({
      where: { transactionId: id },
      select: { transactionId: true, transactionStatus: true, transactedAt: true, amount: true, balanceAfter: true },
    })
    if (!tx) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({
      ...tx,
      amount: tx.amount.toFixed(0),
      balanceAfter: tx.balanceAfter.toFixed(0),
      transactedAt: tx.transactedAt.toISOString(),
    })
  }

  if (action === 'banks') {
    const banks = await prisma.commonCode.findMany({
      where: { groupId: 'BANK_CODE' },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, codeName: true },
    })
    return NextResponse.json({ banks })
  }

  return NextResponse.json({ error: 'action required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.action === 'simulate-inbound') {
    const toAccountNumber   = String(body.toAccountNumber ?? '').replace(/-/g, '')
    const amount            = Number(body.amount)
    const fromBankCode      = String(body.fromBankCode ?? '302')
    const fromAccountNumber = String(body.fromAccountNumber ?? '3020000000001')
    const fromPartyName     = String(body.fromPartyName ?? TEST_NAME)
    const memo: string | null = body.memo || null

    if (!toAccountNumber)
      return NextResponse.json({ ok: false, message: '수신 계좌번호를 입력하세요.' })
    if (!Number.isInteger(amount) || amount <= 0)
      return NextResponse.json({ ok: false, message: '유효하지 않은 금액입니다.' })

    const rows = await prisma.$queryRaw<Array<{ account_id: string; account_number: string }>>`
      SELECT account_id, account_number FROM account
      WHERE REPLACE(account_number, '-', '') = ${toAccountNumber}
        AND account_status = 'ACTIVE'
      LIMIT 1
    `
    if (!rows[0]) return NextResponse.json({ ok: false, message: '수신 계좌를 찾을 수 없습니다.' })

    const transactionId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const transactionNo = `SIM${Date.now()}`
    const requestedAt   = new Date().toISOString()

    try {
      const producer = await getProducer()
      await producer.send({
        topic: TOPICS.TRANSFER_REQUESTS,
        messages: [{
          key:   transactionId,
          value: JSON.stringify({
            transactionId,
            transactionNo,
            fromBankCode,
            fromAccountNumber,
            fromPartyName,
            toBankCode:      OWN_BANK_CODE,
            toAccountNumber: rows[0].account_number.replace(/-/g, ''),
            toAccountName:   '',
            amount,
            memo,
            requestedAt,
          }),
          headers: injectTraceContext(),
        }],
      })
    } catch (e) {
      console.error('[Test] 인바운드 Kafka 발행 실패:', e)
      return NextResponse.json({ ok: false, message: 'Kafka 발행 실패' })
    }

    return NextResponse.json({ ok: true, transactionId, transactionNo, toAccountId: rows[0].account_id })
  }

  if (body.action === 'verify') {
    const result = await verifyAccount({
      accountNumber: String(body.accountNumber),
      bankCode: String(body.bankCode),
    })
    return NextResponse.json(result)
  }

  if (body.action === 'transfer') {
    const fromAccountId = String(body.fromAccountId)
    const toAccountNumber = String(body.toAccountNumber)
    const toName = String(body.toName)
    const bankCode = String(body.bankCode)
    const amount = Number(body.amount)
    const memo: string | null = body.memo || null

    if (!Number.isInteger(amount) || amount <= 0)
      return NextResponse.json({ ok: false, message: '유효하지 않은 금액입니다.' })

    const idempotencyKey = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const fromAccount = await prisma.account.findUnique({
      where: { accountId: fromAccountId },
      select: { accountId: true, partyId: true, balance: true, accountStatus: true, isLocked: true, accountNumber: true, accountPurpose: true },
    })
    if (!fromAccount) return NextResponse.json({ ok: false, message: '출금 계좌를 찾을 수 없습니다.' })
    if (fromAccount.accountStatus !== 'ACTIVE' || fromAccount.isLocked)
      return NextResponse.json({ ok: false, message: '출금이 불가한 계좌입니다.' })
    if (Number(fromAccount.balance) < amount)
      return NextResponse.json({ ok: false, message: '잔액이 부족합니다.' })

    const isExternal = bankCode !== OWN_BANK_CODE

    const now = new Date()
    const txDate = toKSTDateCode(now)
    const txNo = `TX${Date.now()}`

    // ── 타행 이체 ──────────────────────────────────────────────
    if (isExternal) {
      const { findOtherBankAccount } = await import('@/lib/interbank-db')
      if (!findOtherBankAccount(toAccountNumber))
        return NextResponse.json({ ok: false, message: '수신 계좌가 존재하지 않습니다.' })

      const result = await prisma.$transaction(async (tx) => {
        const balanceBefore = Number(fromAccount.balance)
        const balanceAfter = balanceBefore - amount

        await tx.account.update({
          where: { accountId: fromAccountId },
          data: { balance: balanceAfter, lastTransactionAt: now },
        })

        const instruction = await tx.transferInstruction.create({
          data: {
            instructionType: 'OUTWARD',
            transferScope: 'INTERBANK',
            clearingNetwork: 'KFTC',
            networkSeqNo: txNo,
            instructionStatus: 'PENDING',
            totalCount: 1,
            totalAmount: amount,
            submittedBy: fromAccount.partyId,
            executedAt: now,
          },
        })

        const outTx = await tx.transaction.create({
          data: {
            accountId: fromAccountId,
            transactionType: 'TRANSFER_OUT',
            amount,
            balanceBefore,
            balanceAfter,
            transactionStatus: 'PENDING',
            channel: 'MOBILE',
            counterpartAccountNumber: toAccountNumber,
            counterpartBankCode: bankCode,
            counterpartName: toName,
            transactionNo: txNo,
            transactionKey: idempotencyKey,
            instructionId: instruction.instructionId,
            remark: toName,
            memo,
            transactionDate: txDate,
            transactedAt: now,
          },
        })

        return { transactionId: outTx.transactionId, instructionId: instruction.instructionId }
      })

      try {
        const producer = await getProducer()
        await producer.send({
          topic: TOPICS.TRANSFER_REQUESTS,
          messages: [{
            key: result.transactionId,
            value: JSON.stringify({
              transactionId: result.transactionId,
              instructionId: result.instructionId,
              transactionNo: txNo,
              fromBankCode: OWN_BANK_CODE,
              fromAccountNumber: fromAccount.accountNumber,
              fromPartyName: TEST_NAME,
              toBankCode: bankCode,
              toAccountNumber,
              toAccountName: toName,
              amount,
              memo,
              requestedAt: now.toISOString(),
            }),
            headers: injectTraceContext(),
          }],
        })
      } catch (e) {
        console.error('[Test] Kafka 발행 실패 (transactionId=%s):', result.transactionId, e)
      }

      return NextResponse.json({ ok: true, transactionId: result.transactionId, status: 'PENDING' })
    }

    // ── 자행 이체 ──────────────────────────────────────────────
    const toAccount = await prisma.account.findUnique({
      where: { accountNumber: toAccountNumber },
      select: { accountId: true, accountStatus: true, balance: true },
    })

    const result = await prisma.$transaction(async (tx) => {
      const balanceBefore = Number(fromAccount.balance)
      const balanceAfter = balanceBefore - amount

      await tx.account.update({
        where: { accountId: fromAccountId },
        data: { balance: balanceAfter, lastTransactionAt: now },
      })

      const outTx = await tx.transaction.create({
        data: {
          accountId: fromAccountId,
          transactionType: 'TRANSFER_OUT',
          amount,
          balanceBefore,
          balanceAfter,
          transactionStatus: 'COMPLETED',
          channel: 'MOBILE',
          counterpartAccountNumber: toAccountNumber,
          counterpartBankCode: bankCode,
          counterpartName: toName,
          counterpartyAccountId: toAccount?.accountId ?? null,
          transactionNo: txNo,
          transactionKey: idempotencyKey,
          remark: toName,
          memo,
          transactionDate: txDate,
          transactedAt: now,
        },
      })

      if (toAccount?.accountStatus === 'ACTIVE') {
        const toBalanceBefore = Number(toAccount.balance)
        const toBalanceAfter = toBalanceBefore + amount
        await tx.account.update({
          where: { accountId: toAccount.accountId },
          data: { balance: toBalanceAfter, lastTransactionAt: now },
        })
        await tx.transaction.create({
          data: {
            accountId: toAccount.accountId,
            transactionType: 'TRANSFER_IN',
            amount,
            balanceBefore: toBalanceBefore,
            balanceAfter: toBalanceAfter,
            transactionStatus: 'COMPLETED',
            channel: 'MOBILE',
            counterpartAccountNumber: fromAccount.accountNumber,
            counterpartName: TEST_NAME,
            counterpartyAccountId: fromAccountId,
            transactionNo: `${txNo}-IN`,
            remark: memo ?? TEST_NAME,
            memo,
            transactionDate: txDate,
            transactedAt: now,
          },
        })
      }

      return { transactionId: outTx.transactionId }
    })

    return NextResponse.json({ ok: true, transactionId: result.transactionId, status: 'COMPLETED' })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
