"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity"
import type { ContactStatus } from "@/types/database"

async function getOrgId() {
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

  return membership.org_id
}

export async function createContact(formData: FormData) {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const firstName = formData.get("first_name") as string
  const lastName = formData.get("last_name") as string
  const email = (formData.get("email") as string) || null
  const phone = (formData.get("phone") as string) || null
  const company = (formData.get("company") as string) || null
  const status = (formData.get("status") as ContactStatus) || "lead"
  const notes = (formData.get("notes") as string) || null

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      org_id: orgId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      company,
      status,
      notes,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  await logActivity(supabase, {
    orgId,
    userId: user?.id,
    action: "created",
    entity: "contact",
    entityId: created?.id,
    label: `${firstName} ${lastName}`.trim(),
  })

  revalidatePath("/dashboard/contacts")
  redirect("/dashboard/contacts")
}

export async function updateContact(id: string, formData: FormData) {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const firstName = formData.get("first_name") as string
  const lastName = formData.get("last_name") as string
  const email = (formData.get("email") as string) || null
  const phone = (formData.get("phone") as string) || null
  const company = (formData.get("company") as string) || null
  const status = (formData.get("status") as ContactStatus) || "lead"
  const notes = (formData.get("notes") as string) || null

  const { error } = await supabase
    .from("contacts")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      company,
      status,
      notes,
    })
    .eq("id", id)
    .eq("org_id", orgId)

  if (error) throw new Error(error.message)

  await logActivity(supabase, {
    orgId,
    userId: user?.id,
    action: "updated",
    entity: "contact",
    entityId: id,
    label: `${firstName} ${lastName}`.trim(),
  })

  revalidatePath("/dashboard/contacts")
  revalidatePath(`/dashboard/contacts/${id}`)
  redirect(`/dashboard/contacts/${id}`)
}

export async function deleteContact(id: string) {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const quotes = (quoteRows ?? []).map((quote) => ({ row: quote, items: [] as Record<string, unknown>[] }))
  const invoices = (invoiceRows ?? []).map((invoice) => ({ row: invoice, items: [] as Record<string, unknown>[] }))

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

  const name = `${contact.first_name} ${contact.last_name}`.trim()
  await logActivity(supabase, {
    orgId,
    userId: user?.id,
    action: "deleted",
    entity: "contact",
    entityId: id,
    label: `${name} (${quotes.length} quote${quotes.length === 1 ? "" : "s"}, ${invoices.length} invoice${invoices.length === 1 ? "" : "s"})`,
    payload: {
      contact,
      quotes,
      invoices,
    },
  })

  revalidatePath("/dashboard/contacts")
  redirect("/dashboard/contacts")
}
