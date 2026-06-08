import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import LoanReviewClient from './LoanReviewClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '대출 심사' }

export default async function LoanReviewPage() {
  const session = await auth()
  if (!session?.user?.isEmployee) redirect('/dashboard')

  const applications = await prisma.loanApplication.findMany({
    where: { applicationStatus: { in: ['SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'] } },
    include: {
      party: { select: { partyName: true } },
      product: { select: { productName: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  const serialized = applications.map((a) => ({
    applicationId: a.applicationId,
    partyName: a.party.partyName,
    productName: a.product.productName,
    requestedAmount: a.requestedAmount.toFixed(0),
    requestedPeriodMonths: a.requestedPeriodMonths,
    loanPurpose: a.loanPurpose,
    applicationStatus: a.applicationStatus,
    mlDecision: a.mlDecision,
    mlScore: a.mlScore,
    mlDefaultProb: a.mlDefaultProb ? Number(a.mlDefaultProb).toFixed(4) : null,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    decidedAt: a.decidedAt?.toISOString() ?? null,
  }))

  return <LoanReviewClient applications={serialized} />
}
