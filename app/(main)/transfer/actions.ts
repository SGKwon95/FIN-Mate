"use server"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import {
  executeTransfer as _executeTransfer,
  verifyAccount,
  type TransferResult,
  type VerifyAccountResult,
} from "@/lib/transfer-execute"

export type { TransferResult, VerifyAccountResult }
export { verifyAccount }

export async function executeTransfer(input: {
  fromAccountId: string
  toAccountNumber: string
  toName: string
  bankCode?: string
  amount: number
  memo?: string
  idempotencyKey: string
}): Promise<TransferResult> {
  const session = await auth()
  if (!session?.user?.partyId) redirect("/login")

  return _executeTransfer({
    ...input,
    callerPartyId: session.user.partyId,
    callerName:    session.user.name ?? "",
  })
}
