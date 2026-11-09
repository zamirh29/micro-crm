import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { logActivity } from "@/lib/activity"

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullish(),
    contact_id: z.string().uuid().nullish(),
    quote_id: z.string().uuid().nullish(),
    invoice_id: z.string().uuid().nullish(),
    scheduled_at: z.string().min(1).optional(),
    status: z.enum(["pending", "sent", "completed"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes supplied",
  })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsed = await readJson(request, updateSchema)
  if (!parsed.ok) return parsed.response

  const changes: Record<string, unknown> = { ...parsed.data }

  if (parsed.data.scheduled_at !== undefined) {
    const scheduledAt = new Date(parsed.data.scheduled_at)
    if (Number.isNaN(scheduledAt.getTime())) {
      return jsonError("Scheduled date is invalid", 400)
    }
    changes.scheduled_at = scheduledAt.toISOString()
  }

  if (parsed.data.description === null) changes.description = null
  if (parsed.data.contact_id === null) changes.contact_id = null
  if (parsed.data.quote_id === null) changes.quote_id = null
  if (parsed.data.invoice_id === null) changes.invoice_id = null

  try {
    const { data: reminder, error } = await auth.supabase
      .from("reminders")
      .update(changes)
      .eq("id", id)
      .eq("org_id", auth.orgId)
      .select("*, contacts(first_name, last_name)")
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!reminder) return jsonError("Reminder not found", 404)

    await logActivity(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      action: "updated",
      entity: "reminder",
      entityId: id,
      label: reminder.title ?? "Reminder",
    })

    return NextResponse.json({ reminder })
  } catch (err) {
    return errorFromThrown(err)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const { data: reminder } = await auth.supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!reminder) return jsonError("Reminder not found", 404)

  const { error } = await auth.supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId)

  if (error) return jsonError(error.message, 400)

  await logActivity(auth.supabase, {
    orgId: auth.orgId,
    userId: auth.user.id,
    action: "deleted",
    entity: "reminder",
    entityId: id,
    label: reminder.title,
    payload: { row: reminder },
  })

  return NextResponse.json({ success: true })
}
