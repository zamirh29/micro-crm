import type { SupabaseClient } from "@supabase/supabase-js"

export type ActivityAction = "created" | "updated" | "deleted" | "restored"
export type ActivityEntity = "contact" | "quote" | "invoice" | "reminder"

export interface ActivityLogRow {
  id: string
  org_id: string
  user_id: string | null
  action: ActivityAction
  entity: ActivityEntity
  entity_id: string | null
  label: string
  payload: Record<string, unknown> | null
  restored: boolean
  restored_at: string | null
  created_at: string
}

export interface DeletedPayload {
  row?: Record<string, unknown>
  items?: Record<string, unknown>[]
  contact?: Record<string, unknown>
  quotes?: { row: Record<string, unknown>; items: Record<string, unknown>[] }[]
  invoices?: { row: Record<string, unknown>; items: Record<string, unknown>[] }[]
}

type AnyDb = SupabaseClient

export async function logActivity(
  supabase: AnyDb,
  input: {
    orgId: string
    userId?: string | null
    action: ActivityAction
    entity: ActivityEntity
    entityId?: string | null
    label: string
    payload?: Record<string, unknown>
  }
): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      org_id: input.orgId,
      user_id: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      label: input.label,
      payload: input.payload ?? null,
    })
  } catch {
    // Activity logging must never break the primary action.
  }
}

export async function restoreEntity(
  supabase: AnyDb,
  log: Pick<ActivityLogRow, "entity" | "payload">
): Promise<void> {
  const payload = log.payload as DeletedPayload | null
  if (!payload) return

  switch (log.entity) {
    case "contact":
      if (!payload.contact) break
      await supabase.from("contacts").insert(payload.contact)
      for (const quote of payload.quotes ?? []) {
        await supabase.from("quotes").insert(quote.row)
        if (quote.items.length > 0) {
          await supabase.from("quote_items").insert(quote.items)
        }
      }
      for (const invoice of payload.invoices ?? []) {
        await supabase.from("invoices").insert(invoice.row)
        if (invoice.items.length > 0) {
          await supabase.from("invoice_items").insert(invoice.items)
        }
      }
      break
    case "quote":
      if (!payload.row) break
      await supabase.from("quotes").insert(payload.row)
      if (payload.items && payload.items.length > 0) {
        await supabase.from("quote_items").insert(payload.items)
      }
      break
    case "invoice":
      if (!payload.row) break
      await supabase.from("invoices").insert(payload.row)
      if (payload.items && payload.items.length > 0) {
        await supabase.from("invoice_items").insert(payload.items)
      }
      break
    case "reminder":
      if (!payload.row) break
      await supabase.from("reminders").insert(payload.row)
      break
  }
}