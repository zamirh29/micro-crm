import type { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail } from "@/lib/resend"
import { getCompanyProfile } from "@/lib/company"
import { quoteEmail } from "@/components/email/quote-email"
import { invoiceEmail } from "@/components/email/invoice-email"
import { generateQuoteNumber, generateInvoiceNumber, formatDate } from "@/lib/utils"
import { assertDocumentCreationAllowed } from "@/lib/limits"
import { logActivity } from "@/lib/activity"
import type { QuoteStatus, InvoiceStatus, ContactStatus } from "@/types/database"

export interface LineItemInput {
  description: string
  quantity: number
  unit_price: number
}

export interface ContactFields {
  first_name: string
  last_name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  status?: ContactStatus
  notes?: string | null
}

function nameOf(row: { first_name: string; last_name?: string | null }) {
  return `${row.first_name} ${row.last_name ?? ""}`.trim()
}

async function assertContactBelongsToOrg(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
) {
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!contact) {
    throw new Error("Customer not found")
  }
}

function computeTotals(items: LineItemInput[], taxRate: number) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
  const tax_amount = Math.round(subtotal * (taxRate / 100))
  const total = subtotal + tax_amount
  return { subtotal, tax_amount, total }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function createContactRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId?: string; input: ContactFields }
) {
  const { orgId, userId, input } = opts

  const row: Record<string, unknown> = {
    org_id: orgId,
    first_name: input.first_name.trim(),
    last_name: (input.last_name ?? "").trim(),
    email: (input.email ?? "").trim() || null,
    phone: (input.phone ?? "").trim() || null,
    company: (input.company ?? "").trim() || null,
  }
  if (input.status) row.status = input.status
  if (input.notes !== undefined) row.notes = (input.notes ?? "").trim() || null

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(error.message)

  await logActivity(supabase, {
    orgId,
    userId,
    action: "created",
    entity: "contact",
    entityId: contact.id,
    label: nameOf(contact),
  })

  return contact
}

export async function updateContactRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId?: string; id: string; input: Partial<ContactFields> }
) {
  const { orgId, userId, id, input } = opts

  const patch: Record<string, unknown> = {}
  if (input.first_name !== undefined) patch.first_name = input.first_name.trim()
  if (input.last_name !== undefined) patch.last_name = (input.last_name ?? "").trim()
  if (input.email !== undefined) patch.email = (input.email ?? "").trim() || null
  if (input.phone !== undefined) patch.phone = (input.phone ?? "").trim() || null
  if (input.company !== undefined) patch.company = (input.company ?? "").trim() || null
  if (input.status !== undefined) patch.status = input.status
  if (input.notes !== undefined) patch.notes = (input.notes ?? "").trim() || null

  if (Object.keys(patch).length === 0) {
    const { data: unchanged } = await supabase
      .from("contacts")
      .select()
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()
    return unchanged
  }

  const { error } = await supabase
    .from("contacts")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)

  if (error) throw new Error(error.message)

  const { data: contact } = await supabase
    .from("contacts")
    .select()
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (contact) {
    await logActivity(supabase, {
      orgId,
      userId,
      action: "updated",
      entity: "contact",
      entityId: id,
      label: nameOf(contact),
    })
  }

  return contact
}

export async function deleteContactRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId?: string; id: string }
) {
  const { orgId, userId, id } = opts

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (!contact) {
    throw new Error("Contact not found")
  }

  const { data: quoteRows } = await supabase
    .from("quotes")
    .select("*")
    .eq("contact_id", id)
  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select("*")
    .eq("contact_id", id)

  const quotes = (quoteRows ?? []).map((quote) => ({
    row: quote,
    items: [] as Record<string, unknown>[],
  }))
  const invoices = (invoiceRows ?? []).map((invoice) => ({
    row: invoice,
    items: [] as Record<string, unknown>[],
  }))

  if (quotes.length > 0) {
    const quoteIds = quotes.map((q) => q.row.id)
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .in("quote_id", quoteIds)
    for (const quote of quotes) {
      quote.items = (items ?? []).filter((i) => i.quote_id === quote.row.id)
    }
  }

  if (invoices.length > 0) {
    const invoiceIds = invoices.map((inv) => inv.row.id)
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .in("invoice_id", invoiceIds)
    for (const invoice of invoices) {
      invoice.items = (items ?? []).filter((i) => i.invoice_id === invoice.row.id)
    }
  }

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)

  if (error) throw new Error(error.message)

  const label = `${nameOf(contact)} (${quotes.length} quote${quotes.length === 1 ? "" : "s"}, ${invoices.length} invoice${invoices.length === 1 ? "" : "s"})`
  await logActivity(supabase, {
    orgId,
    userId,
    action: "deleted",
    entity: "contact",
    entityId: id,
    label,
    payload: { contact, quotes, invoices },
  })

  return { contact, quoteCount: quotes.length, invoiceCount: invoices.length }
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

async function nextQuoteNumber(supabase: SupabaseClient, orgId: string) {
  const { data: maxQuote } = await supabase
    .from("quotes")
    .select("number")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSequence = 200001
  if (maxQuote?.number) {
    const match = maxQuote.number.match(/Q-(\d+)/)
    if (match) {
      nextSequence = Math.max(200001, parseInt(match[1], 10) + 1)
    }
  }

  return generateQuoteNumber(nextSequence)
}

export interface QuoteInput {
  contact_id: string
  title: string
  description?: string | null
  tax_rate?: number
  notes?: string | null
  valid_until?: string | null
  currency?: string
  status?: QuoteStatus
  items: LineItemInput[]
}

export async function createQuoteRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; input: QuoteInput }
) {
  const { orgId, userId, input } = opts

  await assertDocumentCreationAllowed({
    supabase,
    userId,
    orgId,
    type: "quote",
  })
  await assertContactBelongsToOrg(supabase, orgId, input.contact_id)

  const tax_rate = input.tax_rate ?? 0
  const { subtotal, tax_amount, total } = computeTotals(input.items, tax_rate)

  const number = await nextQuoteNumber(supabase, orgId)

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      org_id: orgId,
      contact_id: input.contact_id,
      number,
      title: input.title.trim(),
      description: input.description ?? null,
      status: (input.status ?? "draft") as QuoteStatus,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      currency: input.currency ?? "GBP",
      valid_until: input.valid_until || null,
      notes: input.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error

  const quoteItems = input.items.map((item) => ({
    quote_id: quote.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.quantity * item.unit_price,
  }))

  const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems)
  if (itemsError) throw itemsError

  await logActivity(supabase, {
    orgId,
    userId,
    action: "created",
    entity: "quote",
    entityId: quote.id,
    label: `Quote ${quote.number} — ${input.title.trim()}`,
  })

  return quote
}

export interface QuotePatch {
  contact_id?: string
  title?: string
  description?: string | null
  tax_rate?: number
  notes?: string | null
  valid_until?: string | null
  status?: QuoteStatus
  items?: LineItemInput[]
}

export async function updateQuoteRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; id: string; input: QuotePatch }
) {
  const { orgId, userId, id, input } = opts

  const { data: existing } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (!existing) throw new Error("Quote not found")

  if (input.contact_id !== undefined) {
    await assertContactBelongsToOrg(supabase, orgId, input.contact_id)
  }

  let items: LineItemInput[] = []
  if (input.items) {
    items = input.items
  } else {
    const { data: itemRows } = await supabase
      .from("quote_items")
      .select("description, quantity, unit_price")
      .eq("quote_id", id)
    items = itemRows ?? []
  }

  const tax_rate = input.tax_rate ?? existing.tax_rate
  const { subtotal, tax_amount, total } = computeTotals(items, tax_rate)

  const patch: Record<string, unknown> = {
    tax_rate,
    subtotal,
    tax_amount,
    total,
    updated_at: new Date().toISOString(),
  }
  if (input.contact_id !== undefined) patch.contact_id = input.contact_id
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.description !== undefined) patch.description = input.description
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.valid_until !== undefined) patch.valid_until = input.valid_until
  if (input.status !== undefined) patch.status = input.status

  const { error } = await supabase.from("quotes").update(patch).eq("id", id)
  if (error) throw error

  if (input.items) {
    await supabase.from("quote_items").delete().eq("quote_id", id)

    const quoteItems = input.items.map((item) => ({
      quote_id: id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
    }))
    const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems)
    if (itemsError) throw itemsError
  }

  const { data: updated } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single()

  await logActivity(supabase, {
    orgId,
    userId,
    action: "updated",
    entity: "quote",
    entityId: id,
    label: `Quote ${updated?.title ?? input.title ?? existing.title}`,
  })

  return updated
}

export async function deleteQuoteRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; id: string }
) {
  const { orgId, userId, id } = opts

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  const { data: items } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)

  await supabase.from("quote_items").delete().eq("quote_id", id)
  const { error } = await supabase.from("quotes").delete().eq("id", id)
  if (error) throw error

  if (quote) {
    await logActivity(supabase, {
      orgId,
      userId,
      action: "deleted",
      entity: "quote",
      entityId: id,
      label: `Quote ${quote.number} — ${quote.title}`,
      payload: { row: quote, items: items ?? [] },
    })
  }

  return { quote, items: items ?? [] }
}

export async function sendQuoteRecord(
  supabase: SupabaseClient,
  opts: { userId: string; id: string }
) {
  const { userId, id } = opts

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, contacts(first_name, last_name, email)")
    .eq("id", id)
    .single()

  if (!quote) throw new Error("Quote not found")

  const { error } = await supabase
    .from("quotes")
    .update({
      status: "sent" as QuoteStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error

  await logActivity(supabase, {
    orgId: quote.org_id,
    userId,
    action: "updated",
    entity: "quote",
    entityId: id,
    label: `Quote ${quote.number} sent`,
  })

  const contact = quote.contacts as unknown as {
    first_name: string
    last_name: string
    email: string
  } | null

  if (contact?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const company = await getCompanyProfile(supabase, quote.org_id)
    const html = quoteEmail({
      recipientName: `${contact.first_name} ${contact.last_name}`.trim(),
      number: quote.number,
      title: quote.title,
      total: quote.total,
      currency: quote.currency,
      validUntil: formatDate(quote.valid_until),
      viewUrl: `${baseUrl}/dashboard/quotes/${quote.id}`,
      companyName: company.name,
      companyPhone: company.phone ?? undefined,
      companyEmail: company.email ?? undefined,
    })

    await sendEmail({
      to: [contact.email],
      subject: `Quote ${quote.number} from ${company.name}`,
      html,
    })
  }

  const { data: fresh } = await supabase
    .from("quotes")
    .select("*, contacts(first_name, last_name, email)")
    .eq("id", id)
    .single()

  return fresh ?? quote
}

export async function convertQuoteToInvoiceRecord(
  supabase: SupabaseClient,
  opts: { userId: string; id: string }
) {
  const { userId, id } = opts

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, quote_items(*)")
    .eq("id", id)
    .single()

  if (!quote) throw new Error("Quote not found")

  await assertDocumentCreationAllowed({
    supabase,
    userId,
    orgId: quote.org_id,
    type: "invoice",
  })

  const { data: maxInvoice } = await supabase
    .from("invoices")
    .select("number")
    .eq("org_id", quote.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSequence = 100001
  if (maxInvoice?.number) {
    const match = maxInvoice.number.match(/INV-(\d+)/)
    if (match) {
      nextSequence = Math.max(100001, parseInt(match[1], 10) + 1)
    }
  }

  const number = generateInvoiceNumber(nextSequence)

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      org_id: quote.org_id,
      contact_id: quote.contact_id,
      quote_id: quote.id,
      number,
      title: quote.title,
      description: quote.description,
      status: "draft",
      subtotal: quote.subtotal,
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      total: quote.total,
      currency: quote.currency,
      due_date: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      notes: quote.notes,
    })
    .select()
    .single()

  if (error) throw error

  const invoiceItems = quote.quote_items.map(
    (item: {
      description: string
      quantity: number
      unit_price: number
      total: number
    }) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
    })
  )

  const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItems)
  if (itemsError) throw itemsError

  await logActivity(supabase, {
    orgId: quote.org_id,
    userId,
    action: "created",
    entity: "invoice",
    entityId: invoice.id,
    label: `Invoice ${number} — ${quote.title} (from quote)`,
  })

  await supabase
    .from("quotes")
    .update({
      status: "accepted" as QuoteStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  return invoice
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

async function nextInvoiceNumber(supabase: SupabaseClient, orgId: string) {
  const { data: maxInvoice } = await supabase
    .from("invoices")
    .select("number")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSequence = 100001
  if (maxInvoice?.number) {
    const match = maxInvoice.number.match(/INV-(\d+)/)
    if (match) {
      nextSequence = Math.max(100001, parseInt(match[1], 10) + 1)
    }
  }

  return generateInvoiceNumber(nextSequence)
}

export interface InvoiceInput {
  contact_id: string
  title: string
  description?: string | null
  tax_rate?: number
  notes?: string | null
  due_date?: string | null
  currency?: string
  status?: InvoiceStatus
  items: LineItemInput[]
}

export async function createInvoiceRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; input: InvoiceInput }
) {
  const { orgId, userId, input } = opts

  await assertDocumentCreationAllowed({
    supabase,
    userId,
    orgId,
    type: "invoice",
  })
  await assertContactBelongsToOrg(supabase, orgId, input.contact_id)

  const tax_rate = input.tax_rate ?? 0
  const { subtotal, tax_amount, total } = computeTotals(input.items, tax_rate)

  const number = await nextInvoiceNumber(supabase, orgId)

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      org_id: orgId,
      contact_id: input.contact_id,
      number,
      title: input.title.trim(),
      description: input.description ?? null,
      status: (input.status ?? "draft") as InvoiceStatus,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      currency: input.currency ?? "GBP",
      due_date: input.due_date || null,
      notes: input.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error

  const invoiceItems = input.items.map((item) => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.quantity * item.unit_price,
  }))

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(invoiceItems)
  if (itemsError) throw itemsError

  await logActivity(supabase, {
    orgId,
    userId,
    action: "created",
    entity: "invoice",
    entityId: invoice.id,
    label: `Invoice ${invoice.number} — ${input.title.trim()}`,
  })

  return invoice
}

export interface InvoicePatch {
  contact_id?: string
  title?: string
  description?: string | null
  tax_rate?: number
  notes?: string | null
  due_date?: string | null
  status?: InvoiceStatus
  items?: LineItemInput[]
}

export async function updateInvoiceRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; id: string; input: InvoicePatch }
) {
  const { orgId, userId, id, input } = opts

  const { data: existing } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (!existing) throw new Error("Invoice not found")

  if (input.contact_id !== undefined) {
    await assertContactBelongsToOrg(supabase, orgId, input.contact_id)
  }

  let items: LineItemInput[] = []
  if (input.items) {
    items = input.items
  } else {
    const { data: itemRows } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", id)
    items = itemRows ?? []
  }

  const tax_rate = input.tax_rate ?? existing.tax_rate
  const { subtotal, tax_amount, total } = computeTotals(items, tax_rate)

  const patch: Record<string, unknown> = {
    tax_rate,
    subtotal,
    tax_amount,
    total,
    updated_at: new Date().toISOString(),
  }
  if (input.contact_id !== undefined) patch.contact_id = input.contact_id
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.description !== undefined) patch.description = input.description
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.due_date !== undefined) patch.due_date = input.due_date
  if (input.status !== undefined) patch.status = input.status

  const { error } = await supabase.from("invoices").update(patch).eq("id", id)
  if (error) throw error

  if (input.items) {
    await supabase.from("invoice_items").delete().eq("invoice_id", id)

    const invoiceItems = input.items.map((item) => ({
      invoice_id: id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
    }))
    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(invoiceItems)
    if (itemsError) throw itemsError
  }

  const { data: updated } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single()

  await logActivity(supabase, {
    orgId,
    userId,
    action: "updated",
    entity: "invoice",
    entityId: id,
    label: `Invoice ${updated?.title ?? input.title ?? existing.title}`,
  })

  return updated
}

export async function deleteInvoiceRecord(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; id: string }
) {
  const { orgId, userId, id } = opts

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)

  await supabase.from("invoice_items").delete().eq("invoice_id", id)
  const { error } = await supabase.from("invoices").delete().eq("id", id)
  if (error) throw error

  if (invoice) {
    await logActivity(supabase, {
      orgId,
      userId,
      action: "deleted",
      entity: "invoice",
      entityId: id,
      label: `Invoice ${invoice.number} — ${invoice.title}`,
      payload: { row: invoice, items: items ?? [] },
    })
  }

  return { invoice, items: items ?? [] }
}

export async function sendInvoiceRecord(
  supabase: SupabaseClient,
  opts: { userId: string; id: string }
) {
  const { userId, id } = opts

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, contacts(first_name, last_name, email)")
    .eq("id", id)
    .single()

  if (!invoice) throw new Error("Invoice not found")

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "sent" as InvoiceStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error

  await logActivity(supabase, {
    orgId: invoice.org_id,
    userId,
    action: "updated",
    entity: "invoice",
    entityId: id,
    label: `Invoice ${invoice.number} sent`,
  })

  const contact = invoice.contacts as unknown as {
    first_name: string
    last_name: string
    email: string
  } | null

  if (contact?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const company = await getCompanyProfile(supabase, invoice.org_id)
    const html = invoiceEmail({
      recipientName: `${contact.first_name} ${contact.last_name}`.trim(),
      number: invoice.number,
      title: invoice.title,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: formatDate(invoice.due_date),
      viewUrl: `${baseUrl}/dashboard/invoices/${invoice.id}`,
      companyName: company.name,
      companyPhone: company.phone ?? undefined,
      companyEmail: company.email ?? undefined,
    })

    await sendEmail({
      to: [contact.email],
      subject: `Invoice ${invoice.number} from ${company.name}`,
      html,
    })
  }

  const { data: fresh } = await supabase
    .from("invoices")
    .select("*, contacts(first_name, last_name, email)")
    .eq("id", id)
    .single()

  return fresh ?? invoice
}

export async function markInvoicePaidRecord(
  supabase: SupabaseClient,
  opts: { userId: string; id: string }
) {
  const { userId, id } = opts

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single()

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid" as InvoiceStatus,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error

  if (invoice) {
    await logActivity(supabase, {
      orgId: invoice.org_id,
      userId,
      action: "updated",
      entity: "invoice",
      entityId: id,
      label: `Invoice ${invoice.number} paid`,
    })
  }

  const { data: fresh } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single()

  return fresh ?? invoice
}
