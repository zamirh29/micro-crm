import type { SupabaseClient } from "@supabase/supabase-js"
import { isSuperAdmin } from "@/lib/admin"

type SubRow = { status: string | null; plan: string | null } | null

export type EditUser = { id: string; email?: string | null }

export type EditGate =
  | { ok: true }
  | { ok: false; message: string; status: 403 | 400 }

export async function getSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<SubRow> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", userId)
    .maybeSingle()
  return data
}

export function isProSubscription(sub: SubRow): boolean {
  if (!sub || (sub.plan ?? "free") !== "pro") return false
  return sub.status === "active" || sub.status === "trialing"
}

export async function canEditDocuments(
  supabase: SupabaseClient,
  user: EditUser
): Promise<boolean> {
  if (isSuperAdmin(user.email)) return true
  return isProSubscription(await getSubscription(supabase, user.id))
}

export async function checkEditGate(
  supabase: SupabaseClient,
  user: EditUser,
  document: { status: string | null }
): Promise<EditGate> {
  if (!(await canEditDocuments(supabase, user))) {
    return {
      ok: false,
      message:
        "Editing invoices and quotes is a Pro feature. Upgrade your plan to make changes.",
      status: 403,
    }
  }
  if (document.status === "paid" && !isSuperAdmin(user.email)) {
    return {
      ok: false,
      message:
        "Paid invoices cannot be edited. Only the account owner can change a paid invoice.",
      status: 400,
    }
  }
  return { ok: true }
}
