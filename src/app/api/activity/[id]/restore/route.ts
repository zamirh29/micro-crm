import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { canEditDocuments } from "@/lib/subscription"
import {
  logActivity,
  restoreEntity,
  restoreWindowCutoff,
  RESTORE_WINDOW_DAYS,
  type ActivityLogRow,
} from "@/lib/activity"

export const dynamic = "force-dynamic"

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Restores a deleted document from the Activity feed. Matches the web server
 * action: Pro-only, inside the restore window, and only a once-restorable
 * delete entry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const allowed = await canEditDocuments(auth.supabase, auth.user)
  if (!allowed) {
    return jsonError("Restoring entries is a Pro feature", 403)
  }

  const { data: log } = await auth.supabase
    .from("activity_log")
    .select("*")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!log) return jsonError("Activity entry not found", 404)
  if (log.action !== "deleted" || log.restored) {
    return jsonError("This entry can't be restored", 400)
  }
  if (!log.payload) return jsonError("No restore data available", 400)

  if (new Date(log.created_at).getTime() < restoreWindowCutoff().getTime()) {
    return jsonError(
      `Deleted documents can only be restored within ${RESTORE_WINDOW_DAYS} days`,
      400
    )
  }

  try {
    await restoreEntity(auth.supabase, log as ActivityLogRow)
  } catch (err) {
    return jsonError(
      err instanceof Error ? `Could not restore: ${err.message}` : "Could not restore this entry",
      400
    )
  }

  await auth.supabase
    .from("activity_log")
    .update({
      restored: true,
      restored_at: new Date().toISOString(),
    })
    .eq("id", id)

  await logActivity(auth.supabase, {
    orgId: auth.orgId,
    userId: auth.user.id,
    action: "restored",
    entity: log.entity,
    entityId: log.entity_id,
    label: log.label,
  })

  return NextResponse.json({
    success: `${capitalize(log.entity)} restored: ${log.label}`,
  })
}
