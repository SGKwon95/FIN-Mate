import { prisma } from "@/lib/prisma"

export type NotificationType =
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "LOW_BALANCE"
  | "ACCOUNT_LOCKED"
  | "SAVINGS_DUE"
  | "SAVINGS_PAID"
  | "SAVINGS_MATURITY"
  | "RISK_ALERT"

export async function createNotification(params: {
  partyId: string
  type: NotificationType
  title: string
  body: string
  linkedEntityId?: string
}) {
  return prisma.notification.create({
    data: {
      partyId:          params.partyId,
      notificationType: params.type,
      notificationTitle: params.title,
      notificationBody:  params.body,
      linkedEntityId:   params.linkedEntityId ?? null,
    },
  })
}

export async function getUnreadCount(partyId: string): Promise<number> {
  return prisma.notification.count({
    where: { partyId, isRead: false },
  })
}
