import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import QuoteForm from "./quote-form"

export const dynamic = "force-dynamic"

export default async function NewQuotePage() {
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

  return <QuoteForm defaultCurrency={company.currency} />
}