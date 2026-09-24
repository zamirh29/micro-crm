"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/resend"
import { invoiceEmail } from "@/components/email/invoice-email"
import { generateInvoiceNumber, formatDate } from "@/lib/utils"
import type { InvoiceStatus } from "@/types/database"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
}

export async function createInvoice(formData: FormData) {
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

  const contact_id = formData.get("contact_id") as string
  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const tax_rate = Number(formData.get("tax_rate")) || 0
  const notes = (formData.get("notes") as string) || null
  const due_date = formData.get("due_date") as string
  const currency = (formData.get("currency") as string) || "GBP"
  const itemsRaw = formData.get("items") as string
  const items: LineItem[] = JSON.parse(itemsRaw)

  const { data: maxInvoice } = await supabase
    .from("invoices")
    .select("number")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  let nextSequence = 100000
  if (maxInvoice?.number) {
    const match = maxInvoice.number.match(/INV-(\d+)/)
    if (match) {
      nextSequence = Math.max(100000, parseInt(match[1], 10) + 1)
    }
  }

  const number = generateInvoiceNumber(nextSequence)
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
  const tax_amount = Math.round(subtotal * (tax_rate / 100))
  const total = subtotal + tax_amount

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      org_id: membership.org_id,
      contact_id,
      number,
      title,
      description,
      status: "draft" as InvoiceStatus,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      currency,
      due_date,
      notes,
    })
    .select()
    .single()

  if (error) throw error

  const invoiceItems = items.map((item) => ({
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

  revalidatePath("/dashboard/invoices")
  redirect("/dashboard/invoices")
}

export async function updateInvoice(id: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const tax_rate = Number(formData.get("tax_rate")) || 0
  const notes = (formData.get("notes") as string) || null
  const due_date = formData.get("due_date") as string
  const status = formData.get("status") as InvoiceStatus
  const itemsRaw = formData.get("items") as string
  const items: LineItem[] = JSON.parse(itemsRaw)

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
  const tax_amount = Math.round(subtotal * (tax_rate / 100))
  const total = subtotal + tax_amount

  const { error } = await supabase
    .from("invoices")
    .update({
      title,
      description,
      tax_rate,
      notes,
      due_date,
      status,
      subtotal,
      tax_amount,
      total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error

  await supabase.from("invoice_items").delete().eq("invoice_id", id)

  const invoiceItems = items.map((item) => ({
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

  revalidatePath("/dashboard/invoices")
  revalidatePath(`/dashboard/invoices/${id}`)
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  await supabase.from("invoice_items").delete().eq("invoice_id", id)
  const { error } = await supabase.from("invoices").delete().eq("id", id)
  if (error) throw error

  revalidatePath("/dashboard/invoices")
  redirect("/dashboard/invoices")
}

export async function sendInvoice(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

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

  const contact = invoice.contacts as unknown as {
    first_name: string
    last_name: string
    email: string
  } | null

  if (contact?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const html = invoiceEmail({
      recipientName: `${contact.first_name} ${contact.last_name}`.trim(),
      number: invoice.number,
      title: invoice.title,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: formatDate(invoice.due_date),
      viewUrl: `${baseUrl}/dashboard/invoices/${invoice.id}`,
    })

    await sendEmail({
      to: [contact.email],
      subject: `Invoice ${invoice.number} from Your Business`,
      html,
    })
  }

  revalidatePath("/dashboard/invoices")
  revalidatePath(`/dashboard/invoices/${id}`)
}

export async function markAsPaid(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid" as InvoiceStatus,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error

  revalidatePath("/dashboard/invoices")
  revalidatePath(`/dashboard/invoices/${id}`)
}
