"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  createContactRecord,
  updateContactRecord,
  deleteContactRecord,
} from "@/lib/documents"
import type { ContactStatus } from "@/types/database"

async function getSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) throw new Error("No organization found")

  return { supabase, user, orgId: membership.org_id }
}

export async function createContact(formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  await createContactRecord(supabase, {
    orgId,
    userId: user.id,
    input: {
      first_name: (formData.get("first_name") as string) ?? "",
      last_name: (formData.get("last_name") as string) || null,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      company: (formData.get("company") as string) || null,
      status: (formData.get("status") as ContactStatus) || "lead",
      notes: (formData.get("notes") as string) || null,
    },
  })

  revalidatePath("/dashboard/contacts")
  redirect("/dashboard/contacts")
}

export async function updateContact(id: string, formData: FormData) {
  const { supabase, user, orgId } = await getSession()

  await updateContactRecord(supabase, {
    orgId,
    userId: user.id,
    id,
    input: {
      first_name: (formData.get("first_name") as string) ?? "",
      last_name: (formData.get("last_name") as string) || null,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      company: (formData.get("company") as string) || null,
      status: (formData.get("status") as ContactStatus) || "lead",
      notes: (formData.get("notes") as string) || null,
    },
  })

  revalidatePath("/dashboard/contacts")
  revalidatePath(`/dashboard/contacts/${id}`)
  redirect(`/dashboard/contacts/${id}`)
}

export async function deleteContact(id: string) {
  const { supabase, user, orgId } = await getSession()

  await deleteContactRecord(supabase, { orgId, userId: user.id, id })

  revalidatePath("/dashboard/contacts")
  redirect("/dashboard/contacts")
}
