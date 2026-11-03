import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { canEditDocuments } from "@/lib/subscription"
import { RESTORE_WINDOW_DAYS, restoreWindowCutoff, type ActivityLogRow } from "@/lib/activity"

export const dynamic = "force-dynamic"

/**
 * Activity feed for the mobile app, mirroring the web Activity page: the last
 * ten days of workspace history, newest first.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const allowed = await canEditDocuments(auth.supabase, auth.user)
  if (!allowed) {
    return jsonError("Activity Log is a Pro feature", 403)
  }

  const { data, error } = await auth.supabase
    .from("activity_log")
    .select("*")
    .eq("org_id", auth.orgId)
    .gte("created_at", restoreWindowCutoff().toISOString())
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return jsonError(error.message, 400)

  return NextResponse.json(
    {
      logs: (data ?? []) as ActivityLogRow[],
      windowDays: RESTORE_WINDOW_DAYS,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
