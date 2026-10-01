"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  createQuoteRecord,
  updateQuoteRecord,
  deleteQuoteRecord,
  sendQuoteRecord,
  convertQuoteToInvoiceRecord,
  type LineItemInput,
  type QuotePatch,
} from "@/lib/documents"
import { checkEditGate } from "@/lib/subscription"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import type { QuoteStatus } from "@/types/database"

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

export async function createQuote(formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  const contact_id = formData.get("contact_id") as string
  const title = formData.get("title") as string

  if (!contact_id) throw new Error("Please select a customer")
  if (!title?.trim()) throw new Error("Please enter a title")

  const items = JSON.parse(formData.get("items") as string) as LineItemInput[]

  await createQuoteRecord(supabase, {
    orgId,
    userId: user.id,
    input: {
      contact_id,
      title,
      description: (formData.get("description") as string) || null,
      tax_rate: Number(formData.get("tax_rate")) || 0,
      notes: (formData.get("notes") as string) || null,
      valid_until: (formData.get("valid_until") as string) || null,
      currency: (formData.get("currency") as string) || "GBP",
      items,
    },
  })

  revalidatePath("/dashboard/quotes")
  redirect("/dashboard/quotes")
}

export async function updateQuote(id: string, formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  const { data: existing } = await supabase
    .from("quotes")
    .select("status, org_id")
    .eq("id", id)
    .maybeSingle()

  if (!existing || existing.org_id !== orgId) redirect("/dashboard/quotes")

  const gate = await checkEditGate(supabase, user, existing)
  if (!gate.ok) {
    redirect(`/dashboard/quotes/${id}/edit?error=${encodeURIComponent(gate.message)}`)
  }

  const items = JSON.parse(formData.get("items") as string) as LineItemInput[]

  const datePattern = /^\d{4}-\d{2}-\d{2}$/

  const rawQuoteDate = formData.get("quote_date")
  const quoteDate = typeof rawQuoteDate === "string" ? rawQuoteDate : ""
  const rawSentDate = formData.get("sent_date")
  const rawAcceptedDate = formData.get("accepted_date")
  const sentDate = formData.has("sent_date")
    ? typeof rawSentDate === "string"
      ? rawSentDate
      : ""
    : null
  const acceptedDate = formData.has("accepted_date")
    ? typeof rawAcceptedDate === "string"
      ? rawAcceptedDate
      : ""
    : null

  if (
    (Boolean(quoteDate) || sentDate !== null || acceptedDate !== null) &&
    !(await hasSuperAdminPrivilege(user))
  ) {
    redirect(
      `/dashboard/quotes/${id}/edit?error=${encodeURIComponent("Only the super admin can change quote dates.")}`
    )
  }

  const badDate = [quoteDate, sentDate, acceptedDate].find(
    (value) => value !== null && value !== "" && !datePattern.test(value)
  )
  if (badDate !== undefined) {
    redirect(
      `/dashboard/quotes/${id}/edit?error=${encodeURIComponent("Dates must be in YYYY-MM-DD format")}`
    )
  }

  const rawStatus = formData.get("status")

  const input: QuotePatch = {
    title: (formData.get("title") as string) ?? "",
    description: (formData.get("description") as string) || null,
    tax_rate: Number(formData.get("tax_rate")) || 0,
    notes: (formData.get("notes") as string) || null,
    valid_until: formData.has("valid_until")
      ? ((formData.get("valid_until") as string) || null)
      : undefined,
    currency: (formData.get("currency") as string) || undefined,
    items,
  }
  if (typeof rawStatus === "string" && rawStatus) input.status = rawStatus as QuoteStatus

  await updateQuoteRecord(supabase, {
    orgId,
    userId: user.id,
    id,
    input,
  })

  const stamp = (value: string | null) =>
    value ? `${value}T12:00:00.000Z` : null

  const datePatch: Record<string, string | null> = {}
  if (quoteDate) datePatch.created_at = stamp(quoteDate)
  if (sentDate !== null) datePatch.sent_at = stamp(sentDate)
  if (acceptedDate !== null) datePatch.accepted_at = stamp(acceptedDate)

  if (Object.keys(datePatch).length > 0) {
    await supabase
      .from("quotes")
      .update(datePatch)
      .eq("id", id)
      .eq("org_id", orgId)
  }

  revalidatePath("/dashboard/quotes")
  revalidatePath(`/dashboard/quotes/${id}`)
  redirect(`/dashboard/quotes/${id}`)
}

export async function deleteQuote(id: string) {
  const { supabase, user, orgId } = await getSession()

  await deleteQuoteRecord(supabase, { orgId, userId: user.id, id })

  revalidatePath("/dashboard/quotes")
  redirect("/dashboard/quotes")
}

export async function sendQuote(id: string) {
  const { supabase, user } = await getSession()

  await sendQuoteRecord(supabase, { userId: user.id, id })

  revalidatePath("/dashboard/quotes")
  revalidatePath(`/dashboard/quotes/${id}`)
}

export async function convertToInvoice(id: string) {
  const { supabase, user } = await getSession()

  const invoice = await convertQuoteToInvoiceRecord(supabase, {
    userId: user.id,
    id,
  })

  revalidatePath("/dashboard/quotes")
  revalidatePath("/dashboard/invoices")
  redirect(`/dashboard/invoices/${invoice.id}`)
}
