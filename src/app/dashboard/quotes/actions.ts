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
} from "@/lib/documents"
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

  const items = JSON.parse(formData.get("items") as string) as LineItemInput[]

  await updateQuoteRecord(supabase, {
    orgId,
    userId: user.id,
    id,
    input: {
      title: (formData.get("title") as string) ?? "",
      description: (formData.get("description") as string) || null,
      tax_rate: Number(formData.get("tax_rate")) || 0,
      notes: (formData.get("notes") as string) || null,
      valid_until: (formData.get("valid_until") as string) || undefined,
      status: formData.get("status") as QuoteStatus,
      items,
    },
  })

  revalidatePath("/dashboard/quotes")
  revalidatePath(`/dashboard/quotes/${id}`)
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
