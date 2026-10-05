import type { SupabaseClient } from "@supabase/supabase-js"
import { generateInvoiceNumber, generateQuoteNumber } from "@/lib/utils"
import { logActivity } from "@/lib/activity"
import type { ImportDraft, ImportKind } from "@/lib/import/parse"
import type { InvoiceStatus, QuoteStatus } from "@/types/database"

export interface ImportRowInput {
  /** Sheet row this document came from, for error reporting. */
  rowNumber?: number
  /** Uploaded file this row came from, for error reporting. */
  sourceFile?: string
  originalNumber: string
  customerName: string
  customerEmail: string
  customerCompany: string
  title: string
  documentDate: string | null
  sentDate: string | null
  dueDate: string | null
  paidDate: string | null
  acceptedDate: string | null
  validUntil: string | null
  status: string | null
  notes: string
  currency: string
  items: { description: string; quantity: number; unitPrice: number }[]
}

export interface ImportOutcome {
  created: number
  skipped: number
  createdContacts: number
  createdInvoices: number
  createdQuotes: number
  errors: { rowNumber: number; originalNumber: string; sourceFile?: string; reason: string }[]
}

const INVOICE_FLOOR = 100001
const QUOTE_FLOOR = 200001
const DEFAULT_VALIDITY_DAYS = 30

/** TIMESTAMPTZ columns take a timestamp; midday UTC keeps the calendar date stable. */
function timestamp(date: string | null): string | null {
  if (!date) return null
  return new Date(`${date}T12:00:00.000Z`).toISOString()
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Build line items and totals from a single VAT rate.
 *
 * `quantity` is an INTEGER column, so fractional quantities are rounded and the
 * line total is derived from the rounded value; the parser warns about this on
 * the review screen rather than silently changing the money.
 */
function buildLines(
  items: { description: string; quantity: number; unitPrice: number }[],
  taxRate: number
) {
  const lines = items.map((item) => {
    const quantity =
      Number.isFinite(item.quantity) && item.quantity > 0
        ? Math.max(1, Math.round(item.quantity))
        : 1
    const unitPrice = Math.round(Number.isFinite(item.unitPrice) ? item.unitPrice : 0)
    return {
      description: item.description.trim() || "Imported line",
      quantity,
      unit_price: unitPrice,
      total: unitPrice * quantity,
    }
  })

  const subtotal = lines.reduce((sum, line) => sum + line.total, 0)
  const taxAmount = Math.round((subtotal * taxRate) / 100)
  return { lines, subtotal, taxAmount, total: subtotal + taxAmount }
}

/** Gross total for a row, matching how buildLines will round it. */
function rowTotal(row: ImportRowInput, taxRate: number): number {
  const subtotal = row.items.reduce((sum, item) => {
    const quantity =
      Number.isFinite(item.quantity) && item.quantity > 0
        ? Math.max(1, Math.round(item.quantity))
        : 1
    const unitPrice = Math.round(Number.isFinite(item.unitPrice) ? item.unitPrice : 0)
    return sum + unitPrice * quantity
  }, 0)

  return subtotal + Math.round((subtotal * taxRate) / 100)
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Split a name for the contacts table while preserving the original casing.
 * Only whitespace is collapsed; matching lowercases separately.
 */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: "Imported", last: "Customer" }
  if (parts.length === 1) return { first: parts[0], last: "" }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

interface ContactRow {
  id: string
  email: string | null
  first_name: string
  last_name: string
  company: string | null
}

/** Match on email first, then customer name, then company. */
function findContact(contacts: ContactRow[], row: ImportRowInput): ContactRow | null {
  const email = row.customerEmail.trim().toLowerCase()
  if (email) {
    const byEmail = contacts.find((c) => (c.email ?? "").trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }

  const name = normaliseName(row.customerName)
  if (name) {
    const byName = contacts.find(
      (c) => normaliseName(`${c.first_name} ${c.last_name}`) === name
    )
    if (byName) return byName
  }

  const company = normaliseName(row.customerCompany)
  if (company) {
    const byCompany = contacts.find((c) => normaliseName(c.company ?? "") === company)
    if (byCompany) return byCompany
  }

  return null
}

function cacheKey(row: ImportRowInput): string {
  return [
    row.customerEmail.trim().toLowerCase(),
    normaliseName(row.customerName),
    normaliseName(row.customerCompany),
  ].join("|")
}

/** One above the highest existing number, never below the sequence floor. */
function nextSequence(
  existing: { number: string | null }[],
  pattern: RegExp,
  floor: number
): number {
  let highest = floor - 1
  for (const row of existing) {
    const match = row.number?.match(pattern)
    if (!match) continue
    highest = Math.max(highest, parseInt(match[1], 10))
  }
  return Math.max(floor, highest + 1)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Resolve the status for a historical invoice.
 *
 * A recorded payment date always wins. Otherwise an invoice past its due date
 * with no payment is "overdue", so historical imports don't fill the list with
 * long-dead "sent" invoices.
 */
function invoiceStatus(
  raw: string | null,
  paidDate: string | null,
  dueDate: string,
  sentDate: string
): InvoiceStatus {
  if (paidDate) return "paid"
  if (raw === "paid" || raw === "draft") return raw
  if (dueDate < today()) return "overdue"
  if (raw === "overdue") return "overdue"
  return sentDate ? "sent" : "draft"
}

function quoteStatus(
  raw: string | null,
  acceptedDate: string | null,
  sentDate: string
): QuoteStatus {
  if (acceptedDate) return "accepted"
  if (raw === "draft" || raw === "sent" || raw === "accepted" || raw === "rejected" || raw === "expired") {
    return raw
  }
  return sentDate ? "sent" : "draft"
}

/**
 * Create historical documents.
 *
 * Rows are created oldest-first so generated numbers ascend with the historical
 * dates. Callers pass validated rows; anything that fails is reported rather
 * than silently dropped.
 */
export async function commitImport(
  supabase: SupabaseClient,
  params: {
    orgId: string
    userId: string
    kind: ImportKind
    rows: ImportRowInput[]
    taxRate: number
  }
): Promise<ImportOutcome> {
  const { orgId, userId, kind, rows, taxRate } = params

  const outcome: ImportOutcome = {
    created: 0,
    skipped: 0,
    createdContacts: 0,
    createdInvoices: 0,
    createdQuotes: 0,
    errors: [],
  }

  // Without a date a row cannot be ordered, and without lines there is nothing
  // to bill, so both are reported instead of imported.
  const usable = rows.filter((row) => {
    const fail = (reason: string) => {
      outcome.skipped++
      outcome.errors.push({
        rowNumber: row.rowNumber ?? 0,
        originalNumber: row.originalNumber,
        sourceFile: row.sourceFile,
        reason,
      })
      return false
    }
    if (!row.documentDate) return fail("Missing invoice/quote date")
    if (row.items.length === 0) return fail("No line items")
    if (!row.customerName && !row.customerCompany) {
      return fail("No customer name supplied")
    }
    return true
  })

  if (usable.length === 0) return outcome

  // Oldest first: numbering follows the historical order.
  const ordered = [...usable].sort((a, b) =>
    (a.documentDate ?? "").localeCompare(b.documentDate ?? "")
  )

  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, email, first_name, last_name, company")
    .eq("org_id", orgId)

  let contacts: ContactRow[] = existingContacts ?? []
  const contactIds = new Map<string, string>()

  const isInvoice = kind === "invoice"
  const table = isInvoice ? "invoices" : "quotes"
  const itemTable = isInvoice ? "invoice_items" : "quote_items"
  const foreignKey = isInvoice ? "invoice_id" : "quote_id"
  const pattern = isInvoice ? /INV-(\d+)/ : /Q-(\d+)/

  const { data: existingDocs } = await supabase
    .from(table)
    .select("number, original_number")
    .eq("org_id", orgId)

  let sequence = nextSequence(
    existingDocs ?? [],
    pattern,
    isInvoice ? INVOICE_FLOOR : QUOTE_FLOOR
  )

  // Guard against importing the same original number twice. It can already
  // exist from an earlier run, or a directory drop can contain the same
  // reference in two files. Previously a repeat would silently create a second
  // document, which matters much more when a whole folder goes in at once.
  const alreadyImported = new Set(
    (existingDocs ?? [])
      .map((doc) => (doc.original_number ?? "").trim().toLowerCase())
      .filter(Boolean)
  )

  // A repeated original number is usually legitimate: legacy systems often
  // restart numbering each year, so 2019 and 2020 can both hold INV-001 and they
  // must stay two separate documents. A repeat that also agrees on date and
  // total is the same document listed twice, typically a folder added twice,
  // so that one is reported as skipped instead of silently duplicating.
  const seenInBatch = new Set<string>()
  const importable = ordered.filter((row) => {
    const key = (row.originalNumber ?? "").trim().toLowerCase()
    if (!key) return true

    if (alreadyImported.has(key)) {
      outcome.skipped++
      outcome.errors.push({
        rowNumber: row.rowNumber ?? 0,
        originalNumber: row.originalNumber,
        sourceFile: row.sourceFile,
        reason: "An invoice/quote with this original number already exists",
      })
      return false
    }

    const fingerprint = `${key}|${row.documentDate ?? ""}|${rowTotal(row, taxRate)}`
    if (seenInBatch.has(fingerprint)) {
      outcome.skipped++
      outcome.errors.push({
        rowNumber: row.rowNumber ?? 0,
        originalNumber: row.originalNumber,
        sourceFile: row.sourceFile,
        reason: "The same number, date and total appear more than once in this selection",
      })
      return false
    }

    seenInBatch.add(fingerprint)
    return true
  })

  for (const row of importable) {
    try {
      // ---- resolve the customer -----------------------------------------
      let contactId = contactIds.get(cacheKey(row))
      if (!contactId) {
        let contact = findContact(contacts, row)

        if (!contact) {
          const name = row.customerName || row.customerCompany
          const parts = splitName(name)
          const { data: created, error } = await supabase
            .from("contacts")
            .insert({
              org_id: orgId,
              first_name: parts.first,
              last_name: parts.last,
              email: row.customerEmail || null,
              company: row.customerCompany || null,
              status: "client",
            })
            .select("id, email, first_name, last_name, company")
            .single()
          if (error) throw new Error(error.message)
          contact = created
          contacts = [...contacts, created]
          outcome.createdContacts++
        }

        contactId = contact.id
        contactIds.set(cacheKey(row), contact.id)
      }

      // ---- number, totals and dates ------------------------------------
      const number = isInvoice
        ? generateInvoiceNumber(sequence)
        : generateQuoteNumber(sequence)
      sequence++

      const { lines, subtotal, taxAmount, total } = buildLines(row.items, taxRate)
      const documentDate = row.documentDate as string
      const sentDate = row.sentDate ?? documentDate
      const createdAt = timestamp(documentDate)

      const base = {
        org_id: orgId,
        contact_id: contactId,
        number,
        title: row.title || (isInvoice ? "Imported invoice" : "Imported quote"),
        description: null,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        currency: row.currency || "GBP",
        notes: row.notes || null,
        created_at: createdAt,
        updated_at: createdAt,
        sent_at: timestamp(sentDate),
        original_number: row.originalNumber || null,
        is_imported: true,
      }

      let documentId: string

      if (isInvoice) {
        const dueDate = row.dueDate ?? addDays(documentDate, DEFAULT_VALIDITY_DAYS)
        const { data: invoice, error } = await supabase
          .from("invoices")
          .insert({
            ...base,
            status: invoiceStatus(row.status, row.paidDate, dueDate, sentDate),
            quote_id: null,
            due_date: dueDate,
            paid_at: timestamp(row.paidDate),
          })
          .select("id")
          .single()
        if (error) throw new Error(error.message)
        documentId = invoice.id
      } else {
        const { data: quote, error } = await supabase
          .from("quotes")
          .insert({
            ...base,
            status: quoteStatus(row.status, row.acceptedDate, sentDate),
            valid_until:
              row.validUntil ?? addDays(documentDate, DEFAULT_VALIDITY_DAYS),
            reminder_sent: false,
            accepted_at: timestamp(row.acceptedDate),
          })
          .select("id")
          .single()
        if (error) throw new Error(error.message)
        documentId = quote.id
      }

      const { error: itemError } = await supabase
        .from(itemTable)
        .insert(lines.map((line) => ({ ...line, [foreignKey]: documentId })))
      if (itemError) throw new Error(itemError.message)

      await logActivity(supabase, {
        orgId,
        userId,
        action: "created",
        entity: kind,
        entityId: documentId,
        label: `${isInvoice ? "Invoice" : "Quote"} ${number} — ${base.title} (imported)`,
      })

      outcome.created++
      if (isInvoice) outcome.createdInvoices++
      else outcome.createdQuotes++
    } catch (e) {
      outcome.skipped++
      outcome.errors.push({
        rowNumber: row.rowNumber ?? 0,
        originalNumber: row.originalNumber,
        sourceFile: row.sourceFile,
        reason: e instanceof Error ? e.message : "Could not create this document",
      })
    }
  }

  return outcome
}

/** Convert parsed drafts into commit-ready rows, dropping unusable ones. */
export function draftsToRows(drafts: ImportDraft[]): ImportRowInput[] {
  return drafts
    .filter((draft) => !draft.error)
    .map((draft) => ({
      rowNumber: draft.rowNumber,
      sourceFile: draft.sourceFile,
      originalNumber: draft.originalNumber,
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      customerCompany: draft.customerCompany,
      title: draft.title,
      documentDate: draft.documentDate,
      sentDate: draft.sentDate,
      dueDate: draft.dueDate,
      paidDate: draft.paidDate,
      acceptedDate: draft.acceptedDate,
      validUntil: draft.validUntil,
      status: draft.status,
      notes: draft.notes,
      currency: draft.currency,
      items: draft.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    }))
}