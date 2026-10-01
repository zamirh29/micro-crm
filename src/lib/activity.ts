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

export interface DeletedEntry {
  logId: string
  entity: ActivityEntity
  entityId: string
  label: string
  deletedAt: string
}

/** Deleted documents stay restorable for this many days. */
export const RESTORE_WINDOW_DAYS = 10

export function restoreWindowCutoff(from: Date = new Date()): Date {
  const cutoff = new Date(from)
  cutoff.setDate(cutoff.getDate() - RESTORE_WINDOW_DAYS)
  return cutoff
}

/**
 * Recently deleted quotes/invoices that are still restorable.
 * Only the newest delete entry per entity is returned, entries older than the
 * restore window are excluded, and entries whose underlying row already exists
 * (e.g. restored by other means) are dropped.
 */
export async function listDeletedDocuments(
  supabase: AnyDb,
  params: { orgId: string; entity: "quote" | "invoice"; limit?: number }
): Promise<DeletedEntry[]> {
  const { orgId, entity, limit = 10 } = params

  const { data } = await supabase
    .from("activity_log")
    .select("id, entity, entity_id, label, created_at, payload, restored")
    .eq("org_id", orgId)
    .eq("entity", entity)
    .eq("action", "deleted")
    .eq("restored", false)
    .gte("created_at", restoreWindowCutoff().toISOString())
    .order("created_at", { ascending: false })
    .limit(100)

  const seen = new Set<string>()
  const candidates: DeletedEntry[] = []

  for (const row of data ?? []) {
    const payload = row.payload as DeletedPayload | null
    if (!payload?.row) continue
    const entityId =
      row.entity_id ??
      ((payload.row as { id?: string }).id as string | undefined)
    if (!entityId || seen.has(entityId)) continue
    seen.add(entityId)
    candidates.push({
      logId: row.id,
      entity: row.entity,
      entityId,
      label: row.label,
      deletedAt: row.created_at,
    })
  }

  const table = entity === "quote" ? "quotes" : "invoices"
  const live = await Promise.all(
    candidates.map(async (entry) => {
      const { data: existing } = await supabase
        .from(table)
        .select("id")
        .eq("id", entry.entityId)
        .maybeSingle()
      return existing ? null : entry
    })
  )

  return live.filter((entry): entry is DeletedEntry => entry !== null).slice(0, limit)
}

/**
 * Re-inserts a deleted quote/invoice, including its line items.
 * Idempotent: if the row already exists it is treated as already restored.
 */
export async function restoreEntity(
  supabase: AnyDb,
  log: Pick<ActivityLogRow, "entity" | "payload" | "entity_id">
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
      await restoreDocument(supabase, "quotes", "quote_items", payload, log.entity_id)
      break
    case "invoice":
      await restoreDocument(
        supabase,
        "invoices",
        "invoice_items",
        payload,
        log.entity_id
      )
      break
    case "reminder":
      if (!payload.row) break
      await supabase.from("reminders").insert(payload.row)
      break
  }
}

async function restoreDocument(
  supabase: AnyDb,
  table: "quotes" | "invoices",
  itemTable: "quote_items" | "invoice_items",
  payload: DeletedPayload,
  entityId: string | null | undefined
): Promise<void> {
  const row = payload.row
  if (!row) return

  const id = (row.id as string | undefined) ?? entityId
  if (!id) return

  const { data: existing } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle()
  if (existing) return

  const { error } = await supabase.from(table).insert(row)
  if (error) throw new Error(error.message)

  const items = payload.items ?? []
  if (items.length > 0) {
    const foreignKey = itemTable === "quote_items" ? "quote_id" : "invoice_id"
    const { error: itemError } = await supabase
      .from(itemTable)
      .insert(items.map((item) => ({ ...item, [foreignKey]: id })))
    if (itemError) throw new Error(itemError.message)
  }
}