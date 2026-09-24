import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import CompanyProfileForm from "./company-profile-form"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
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

  const company = await getCompanyProfile(supabase, membership.org_id)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your company branding — logo, address and contact details. Used on
          your quotes and invoices.
        </p>
      </div>

      <CompanyProfileForm company={company} />
    </div>
  )
}