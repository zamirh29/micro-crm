"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity"

async function getContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()

  if (!membership) throw new Error("No organization found")

  return { supabase, user, orgId: membership.org_id }
}

export async function createReminder(data: {
  contact_id?: string | null
  quote_id?: string | null
  invoice_id?: string | null
  title: string
  description?: string | null
  scheduled_at: string
}) {
  const { supabase, user, orgId } = await getContext()

  const { data: created, error } = await supabase
    .from("reminders")
    .insert({
      org_id: orgId,
      contact_id: data.contact_id || null,
      quote_id: data.quote_id || null,
      invoice_id: data.invoice_id || null,
      title: data.title,
      description: data.description || null,
      scheduled_at: data.scheduled_at,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) throw error.message

  await logActivity(supabase, {
    orgId,
    userId: user.id,
    action: "created",
    entity: "reminder",
    entityId: created?.id,
    label: data.title,
  })

  revalidatePath("/dashboard/reminders")
}

export async function updateReminder(
  id: string,
  data: {
    contact_id?: string | null
    quote_id?: string | null
    invoice_id?: string | null
    title?: string
    description?: string | null
    scheduled_at?: string
  }
) {
  const { supabase, user, orgId } = await getContext()
  const { error } = await supabase.from("reminders").update(data).eq("id", id)

  if (error) throw error.message

  await logActivity(supabase, {
    orgId,
    userId: user.id,
    action: "updated",
    entity: "reminder",
    entityId: id,
    label: data.title ?? "Reminder",
  })

  revalidatePath("/dashboard/reminders")
}

export async function deleteReminder(id: string) {
  const { supabase, user, orgId } = await getContext()

  const { data: reminder } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .single()

  const { error } = await supabase.from("reminders").delete().eq("id", id)

  if (error) throw error.message

  if (reminder) {
    await logActivity(supabase, {
      orgId,
      userId: user.id,
      action: "deleted",
      entity: "reminder",
      entityId: id,
      label: reminder.title,
      payload: { row: reminder },
    })
  }

  revalidatePath("/dashboard/reminders")
}

export async function completeReminder(id: string) {
  const { supabase, user, orgId } = await getContext()

  const { data: reminder } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .single()

  const { error } = await supabase
    .from("reminders")
    .update({ status: "completed" })
    .eq("id", id)

  if (error) throw error.message

  if (reminder) {
    await logActivity(supabase, {
      orgId,
      userId: user.id,
      action: "updated",
      entity: "reminder",
      entityId: id,
      label: reminder.title,
    })
  }

  revalidatePath("/dashboard/reminders")
}
