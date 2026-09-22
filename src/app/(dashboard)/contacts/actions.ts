"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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

  const firstName = formData.get("first_name") as string
  const lastName = formData.get("last_name") as string
  const email = (formData.get("email") as string) || null
  const phone = (formData.get("phone") as string) || null
  const company = (formData.get("company") as string) || null
  const status = (formData.get("status") as ContactStatus) || "lead"
  const notes = (formData.get("notes") as string) || null

  const { error } = await supabase.from("contacts").insert({
    org_id: orgId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    company,
    status,
    notes,
  })

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard/contacts")
  redirect("/dashboard/contacts")
}

export async function updateContact(id: string, formData: FormData) {
  const orgId = await getOrgId()
  const supabase = await createClient()

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

  revalidatePath("/dashboard/contacts")
  revalidatePath(`/dashboard/contacts/${id}`)
  redirect(`/dashboard/contacts/${id}`)
}

export async function deleteContact(id: string) {
  const orgId = await getOrgId()
  const supabase = await createClient()

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard/contacts")
  redirect("/dashboard/contacts")
}
