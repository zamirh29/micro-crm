import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { logActivity } from "@/lib/activity"

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).nullish(),
  contact_id: z.string().uuid().nullish(),
  quote_id: z.string().uuid().nullish(),
  invoice_id: z.string().uuid().nullish(),
  scheduled_at: z.string().min(1, "Scheduled date is required"),
})

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { data: reminders, error } = await auth.supabase
    .from("reminders")
    .select("*, contacts(first_name, last_name)")
    .eq("org_id", auth.orgId)
    .order("scheduled_at", { ascending: false })
    .limit(500)

  if (error) return jsonError(error.message, 400)

  return NextResponse.json({ reminders: reminders ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const parsed = await readJson(request, createSchema)
  if (!parsed.ok) return parsed.response

  const scheduledAt = new Date(parsed.data.scheduled_at)
  if (Number.isNaN(scheduledAt.getTime())) {
    return jsonError("Scheduled date is invalid", 400)
  }

  try {
    const { data: reminder, error } = await auth.supabase
      .from("reminders")
      .insert({
        org_id: auth.orgId,
        contact_id: parsed.data.contact_id || null,
        quote_id: parsed.data.quote_id || null,
        invoice_id: parsed.data.invoice_id || null,
        title: parsed.data.title,
        description: parsed.data.description || null,
        scheduled_at: scheduledAt.toISOString(),
        status: "pending",
      })
      .select("*, contacts(first_name, last_name)")
      .single()

    if (error) throw new Error(error.message)

    await logActivity(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      action: "created",
      entity: "reminder",
      entityId: reminder?.id,
      label: parsed.data.title,
    })

    return NextResponse.json({ reminder }, { status: 201 })
  } catch (err) {
    return errorFromThrown(err)
  }
}
