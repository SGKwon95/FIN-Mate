import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.isEmployee) {
    return NextResponse.json({ error: "직원만 접근 가능합니다" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const decision: string = body.decision

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "decision은 APPROVED 또는 REJECTED 이어야 합니다" }, { status: 400 })
  }

  const application = await prisma.loanApplication.findUnique({
    where: { applicationId: id },
    select: { applicationStatus: true },
  })

  if (!application) {
    return NextResponse.json({ error: "신청 건을 찾을 수 없습니다" }, { status: 404 })
  }

  if (application.applicationStatus !== "PENDING_REVIEW") {
    return NextResponse.json({ error: "검토 대기 상태인 신청 건만 결정할 수 있습니다" }, { status: 409 })
  }

  const updated = await prisma.loanApplication.update({
    where: { applicationId: id },
    data: {
      applicationStatus: decision,
      decidedAt: new Date(),
    },
    select: {
      applicationId: true,
      applicationStatus: true,
      decidedAt: true,
    },
  })

  return NextResponse.json(updated)
}
