"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import { getSubscription, isProSubscription } from "@/lib/subscription"
import {
  logActivity,
  restoreEntity,
  restoreWindowCutoff,
  RESTORE_WINDOW_DAYS,
  type ActivityLogRow,
} from "@/lib/activity"

export type RestoreState = { error?: string; success?: string }

async function canRestore(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null }) {
  if (await hasSuperAdminPrivilege(user)) return true
  return isProSubscription(await getSubscription(supabase, user.id))
}

export async function restoreEntry(
  _prev: RestoreState | null,
  logId: string
): Promise<RestoreState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in" }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()
  if (!membership) return { error: "No organization found" }

  if (!(await canRestore(supabase, user))) {
    return { error: "Restoring entries is a Pro feature" }
  }

  const { data: log } = await supabase
    .from("activity_log")
    .select("*")
    .eq("id", logId)
    .eq("org_id", membership.org_id)
    .single()

  if (!log) return { error: "Activity entry not found" }
  if (log.action !== "deleted" || log.restored) {
    return { error: "This entry can't be restored" }
  }
  if (!log.payload) return { error: "No restore data available" }

  const cutoff = restoreWindowCutoff().getTime()
  if (new Date(log.created_at).getTime() < cutoff) {
    return {
      error: `Deleted documents can only be restored within ${RESTORE_WINDOW_DAYS} days`,
    }
  }

  try {
    await restoreEntity(supabase, log as ActivityLogRow)
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Could not restore: ${e.message}`
          : "Could not restore this entry",
    }
  }

  await supabase
    .from("activity_log")
    .update({
      restored: true,
      restored_at: new Date().toISOString(),
    })
    .eq("id", logId)

  await logActivity(supabase, {
    orgId: membership.org_id,
    userId: user.id,
    action: "restored",
    entity: log.entity,
    entityId: log.entity_id,
    label: log.label,
  })

  revalidatePath("/dashboard/activity")
  revalidatePath("/dashboard/quotes")
  revalidatePath("/dashboard/invoices")
  revalidatePath("/dashboard/contacts")
  return { success: `${capitalize(log.entity)} restored: ${log.label}` }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}