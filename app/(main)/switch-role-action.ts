"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function switchToCustomer() {
  const jar = await cookies()
  jar.set("view-as-customer", "1", { path: "/", httpOnly: true, sameSite: "lax" })
  redirect("/dashboard")
}
