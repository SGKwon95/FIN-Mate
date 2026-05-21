import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.partyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const notifications = await prisma.notification.findMany({
    where: { partyId: session.user.partyId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      notificationId: true,
      notificationType: true,
      notificationTitle: true,
      notificationBody: true,
      isRead: true,
      linkedEntityId: true,
      createdAt: true,
    },
  })

  return NextResponse.json(notifications)
}

// 전체 알림 읽음 처리
export async function PATCH() {
  const session = await auth()
  if (!session?.user?.partyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await prisma.notification.updateMany({
    where: { partyId: session.user.partyId, isRead: false },
    data: { isRead: true },
  })

  return NextResponse.json({ ok: true })
}
