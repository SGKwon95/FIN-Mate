import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { executeTransfer } from "@/lib/transfer-execute"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.partyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const accountId = searchParams.get("accountId")
  const from = searchParams.get("from")   // YYYY-MM-DD
  const to = searchParams.get("to")       // YYYY-MM-DD
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")))

  // 요청한 계좌가 본인 소유인지 확인
  if (accountId) {
    const account = await prisma.account.findUnique({
      where: { accountId },
      select: { partyId: true },
    })
    if (!account || account.partyId !== session.user.partyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // accountId 미지정 시 본인 전체 계좌 대상
  const ownAccountIds = accountId
    ? [accountId]
    : (
        await prisma.account.findMany({
          where: { partyId: session.user.partyId },
          select: { accountId: true },
        })
      ).map((a) => a.accountId)

  const where = {
    accountId: { in: ownAccountIds },
    transactionType: { in: ["TRANSFER_IN", "TRANSFER_OUT"] },
    ...(from || to
      ? {
          transactedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  }

  const [total, items] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { transactedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        transactionId: true,
        accountId: true,
        transactionType: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        transactionStatus: true,
        channel: true,
        counterpartAccountNumber: true,
        counterpartName: true,
        memo: true,
        remark: true,
        transactionDate: true,
        transactedAt: true,
        account: {
          select: { accountNumber: true, accountPurpose: true },
        },
      },
    }),
  ])

  const data = items.map((tx) => ({
    transactionId: tx.transactionId,
    accountId: tx.accountId,
    accountNumber: tx.account.accountNumber,
    accountPurpose: tx.account.accountPurpose,
    transactionType: tx.transactionType,
    amount: tx.amount.toFixed(0),
    balanceBefore: tx.balanceBefore.toFixed(0),
    balanceAfter: tx.balanceAfter.toFixed(0),
    transactionStatus: tx.transactionStatus,
    channel: tx.channel,
    counterpartAccountNumber: tx.counterpartAccountNumber,
    counterpartName: tx.counterpartName,
    memo: tx.memo,
    remark: tx.remark,
    transactionDate: tx.transactionDate,
    transactedAt: tx.transactedAt.toISOString(),
  }))

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.partyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const result = await executeTransfer({
    ...body,
    callerPartyId: session.user.partyId,
    callerName:    session.user.name ?? "",
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
