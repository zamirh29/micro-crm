"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function updateCompanyProfile(formData: FormData) {
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

  const name = (formData.get("name") as string)?.trim() || null
  const logoData = (formData.get("logo_data") as string) || null
  const address = (formData.get("address") as string)?.trim() || null
  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const website = (formData.get("website") as string)?.trim() || null
  const currency = ((formData.get("currency") as string) || "").trim()

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      logo_data: logoData,
      address,
      phone,
      email,
      website,
      currency: currency || "GBP",
    })
    .eq("id", membership.org_id)

  if (error) throw error

  revalidatePath("/dashboard/settings")
  revalidatePath("/dashboard/quotes")
  revalidatePath("/dashboard/invoices")
  revalidatePath("/dashboard/reports/customers")
  revalidatePath("/dashboard/reports/month-end")
  revalidatePath("/dashboard/tax")
}