"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/resend"
import { getCompanyProfile } from "@/lib/company"
import { quoteEmail } from "@/components/email/quote-email"
import { generateQuoteNumber, formatDate } from "@/lib/utils"
import { assertDocumentCreationAllowed } from "@/lib/limits"
import { logActivity } from "@/lib/activity"
import type { QuoteStatus } from "@/types/database"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
}

export async function createQuote(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()
  if (!membership) redirect("/login")

  await assertDocumentCreationAllowed({
    supabase,
    userId: user.id,
    orgId: membership.org_id,
    type: "quote",
  })

  const contact_id = formData.get("contact_id") as string
  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const tax_rate = Number(formData.get("tax_rate")) || 0
  const notes = (formData.get("notes") as string) || null
  const valid_until = formData.get("valid_until") as string
  const currency = (formData.get("currency") as string) || "GBP"
  const itemsRaw = formData.get("items") as string
  const items: LineItem[] = JSON.parse(itemsRaw)

  if (!contact_id) throw new Error("Please select a customer")
  if (!title?.trim()) throw new Error("Please enter a title")

  const { data: maxQuote } = await supabase
    .from("quotes")
    .select("number")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  let nextSequence = 200001
  if (maxQuote?.number) {
    const match = maxQuote.number.match(/Q-(\d+)/)
    if (match) {
      nextSequence = Math.max(200001, parseInt(match[1], 10) + 1)
    }
  }

  const number = generateQuoteNumber(nextSequence)
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const tax_amount = Math.round(subtotal * (tax_rate / 100))
  const total = subtotal + tax_amount

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      org_id: membership.org_id,
      contact_id,
      number,
      title,
      description,
      status: "draft" as QuoteStatus,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      currency,
      valid_until,
      notes,
    })
    .select()
    .single()

  if (error) throw error

  const quoteItems = items.map((item) => ({
    quote_id: quote.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.quantity * item.unit_price,
  }))

  const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems)
  if (itemsError) throw itemsError

  await logActivity(supabase, {
    orgId: membership.org_id,
    userId: user.id,
    action: "created",
    entity: "quote",
    entityId: quote.id,
    label: `Quote ${quote.number} — ${title}`,
  })

  revalidatePath("/dashboard/quotes")
  redirect("/dashboard/quotes")
}

export async function updateQuote(id: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()
  if (!membership) redirect("/login")

  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const tax_rate = Number(formData.get("tax_rate")) || 0
  const notes = (formData.get("notes") as string) || null
  const valid_until = formData.get("valid_until") as string
  const status = formData.get("status") as QuoteStatus
  const itemsRaw = formData.get("items") as string
  const items: LineItem[] = JSON.parse(itemsRaw)

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const tax_amount = Math.round(subtotal * (tax_rate / 100))
  const total = subtotal + tax_amount

  const { error } = await supabase
    .from("quotes")
    .update({
      title,
      description,
      tax_rate,
      notes,
      valid_until,
      status,
      subtotal,
      tax_amount,
      total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error

  await supabase.from("quote_items").delete().eq("quote_id", id)

  const quoteItems = items.map((item) => ({
    quote_id: id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.quantity * item.unit_price,
  }))

  const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems)
  if (itemsError) throw itemsError

  await logActivity(supabase, {
    orgId: membership.org_id,
    userId: user.id,
    action: "updated",
    entity: "quote",
    entityId: id,
    label: `Quote ${title}`,
  })

  revalidatePath("/dashboard/quotes")
  revalidatePath(`/dashboard/quotes/${id}`)
}

export async function deleteQuote(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()
  if (!membership) redirect("/login")

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
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
      orgId: membership.org_id,
      userId: user.id,
      action: "deleted",
      entity: "quote",
      entityId: id,
      label: `Quote ${quote.number} — ${quote.title}`,
      payload: { row: quote, items: items ?? [] },
    })
  }

  revalidatePath("/dashboard/quotes")
  redirect("/dashboard/quotes")
}

export async function sendQuote(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

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
    userId: user.id,
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

  revalidatePath("/dashboard/quotes")
  revalidatePath(`/dashboard/quotes/${id}`)
}

export async function convertToInvoice(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, quote_items(*)")
    .eq("id", id)
    .single()

  if (!quote) throw new Error("Quote not found")

  await assertDocumentCreationAllowed({
    supabase,
    userId: user.id,
    orgId: quote.org_id,
    type: "invoice",
  })

  const { data: maxInvoice } = await supabase
    .from("invoices")
    .select("number")
    .eq("org_id", quote.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  let nextSequence = 100001
  if (maxInvoice?.number) {
    const match = maxInvoice.number.match(/INV-(\d+)/)
    if (match) {
      nextSequence = Math.max(100001, parseInt(match[1], 10) + 1)
    }
  }

  const { generateInvoiceNumber } = await import("@/lib/utils")
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
    (item: { description: string; quantity: number; unit_price: number; total: number }) => ({
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
    userId: user.id,
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

  revalidatePath("/dashboard/quotes")
  revalidatePath("/dashboard/invoices")
  redirect(`/dashboard/invoices/${invoice.id}`)
}
