"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createExpenseRecord, deleteExpenseRecord } from "@/lib/expenses"

async function getSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) throw new Error("No organization found")

  return { supabase, user, orgId: membership.org_id }
}

function toPence(value: FormDataEntryValue | null): number {
  const raw = typeof value === "string" ? value.trim() : ""
  const pounds = Number.parseFloat(raw)
  if (!Number.isFinite(pounds) || pounds <= 0) {
    throw new Error("Enter an amount greater than zero")
  }
  return Math.round(pounds * 100)
}

export async function createExpense(formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  await createExpenseRecord(supabase, {
    orgId,
    userId: user.id,
    input: {
      incurred_on: (formData.get("incurred_on") as string) || null,
      category: ((formData.get("category") as string) ?? "").trim() || "Other",
      description: ((formData.get("description") as string) ?? "").trim() || null,
      amount: toPence(formData.get("amount")),
    },
  })

  revalidatePath("/dashboard/expenses")
}

export async function deleteExpense(id: string) {
  const { supabase, orgId } = await getSession()

  await deleteExpenseRecord(supabase, { orgId, id })

  revalidatePath("/dashboard/expenses")
}
