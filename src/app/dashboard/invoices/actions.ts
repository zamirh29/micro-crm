"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  createInvoiceRecord,
  updateInvoiceRecord,
  deleteInvoiceRecord,
  sendInvoiceRecord,
  markInvoicePaidRecord,
  type LineItemInput,
  type InvoicePatch,
} from "@/lib/documents"
import { checkEditGate } from "@/lib/subscription"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import type { InvoiceStatus } from "@/types/database"

async function getSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) redirect("/login")

  return { supabase, user, orgId: membership.org_id }
}

export async function createInvoice(formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  const contact_id = formData.get("contact_id") as string
  const title = formData.get("title") as string

  if (!contact_id) throw new Error("Please select a customer")
  if (!title?.trim()) throw new Error("Please enter a title")

  const items = JSON.parse(formData.get("items") as string) as LineItemInput[]

  await createInvoiceRecord(supabase, {
    orgId,
    userId: user.id,
    input: {
      contact_id,
      title,
      description: (formData.get("description") as string) || null,
      tax_rate: Number(formData.get("tax_rate")) || 0,
      notes: (formData.get("notes") as string) || null,
      due_date: (formData.get("due_date") as string) || null,
      currency: (formData.get("currency") as string) || "GBP",
      items,
    },
  })

  revalidatePath("/dashboard/invoices")
  redirect("/dashboard/invoices")
}

export async function updateInvoice(id: string, formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  const { data: existing } = await supabase
    .from("invoices")
    .select("status, org_id")
    .eq("id", id)
    .maybeSingle()

  if (!existing || existing.org_id !== orgId) redirect("/dashboard/invoices")

  const gate = await checkEditGate(supabase, user, existing)
  if (!gate.ok) {
    redirect(`/dashboard/invoices/${id}/edit?error=${encodeURIComponent(gate.message)}`)
  }

  const rawInvoiceDate = formData.get("invoice_date")
  const invoiceDate = typeof rawInvoiceDate === "string" ? rawInvoiceDate : ""
  if (invoiceDate) {
    if (!(await hasSuperAdminPrivilege(user))) {
      redirect(
        `/dashboard/invoices/${id}/edit?error=${encodeURIComponent("Only the super admin can change the invoice date.")}`
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      redirect(
        `/dashboard/invoices/${id}/edit?error=${encodeURIComponent("Invoice date must be YYYY-MM-DD")}`
      )
    }
  }

  const items = JSON.parse(formData.get("items") as string) as LineItemInput[]

  const rawStatus = formData.get("status")

  const input: InvoicePatch = {
    title: (formData.get("title") as string) ?? "",
    description: (formData.get("description") as string) || null,
    tax_rate: Number(formData.get("tax_rate")) || 0,
    notes: (formData.get("notes") as string) || null,
    due_date: formData.has("due_date")
      ? ((formData.get("due_date") as string) || null)
      : undefined,
    currency: (formData.get("currency") as string) || undefined,
    items,
  }
  if (typeof rawStatus === "string" && rawStatus) input.status = rawStatus as InvoiceStatus

  await updateInvoiceRecord(supabase, {
    orgId,
    userId: user.id,
    id,
    input,
  })

  if (invoiceDate) {
    await supabase
      .from("invoices")
      .update({ created_at: `${invoiceDate}T12:00:00.000Z` })
      .eq("id", id)
      .eq("org_id", orgId)
  }

  revalidatePath("/dashboard/invoices")
  revalidatePath(`/dashboard/invoices/${id}`)
  redirect(`/dashboard/invoices/${id}`)
}

export async function deleteInvoice(id: string) {
  const { supabase, user, orgId } = await getSession()

  await deleteInvoiceRecord(supabase, { orgId, userId: user.id, id })

  revalidatePath("/dashboard/invoices")
  redirect("/dashboard/invoices")
}

export async function sendInvoice(id: string) {
  const { supabase, user } = await getSession()

  await sendInvoiceRecord(supabase, { userId: user.id, id })

  revalidatePath("/dashboard/invoices")
  revalidatePath(`/dashboard/invoices/${id}`)
}

export async function markAsPaid(id: string) {
  const { supabase, user } = await getSession()

  await markInvoicePaidRecord(supabase, { userId: user.id, id })

  revalidatePath("/dashboard/invoices")
  revalidatePath(`/dashboard/invoices/${id}`)
}
