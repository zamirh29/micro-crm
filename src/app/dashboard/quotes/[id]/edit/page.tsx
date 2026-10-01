import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import { checkEditGate } from "@/lib/subscription"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import ProGate from "@/components/pro-gate"
import type { QuoteItem } from "@/types/database"
import QuoteForm from "../../new/quote-form"

export const dynamic = "force-dynamic"

export default async function EditQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const sp = await searchParams

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

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, contacts(*), quote_items(*)")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!quote) notFound()

  const gate = await checkEditGate(supabase, user, { status: quote.status })

  if (!gate.ok) {
    return (
      <ProGate
        title="Editing quotes is a Pro feature"
        description="Upgrade to Pro to edit invoices and quotes after they have been created."
        features={[
          "Edit quotes and invoices after they are sent",
          "Fix mistakes without starting over",
          "Unlimited quotes and invoices",
        ]}
      />
    )
  }

  const company = await getCompanyProfile(supabase, membership.org_id)

  const items = quote.quote_items as QuoteItem[]
  const quoteDate = quote.created_at.slice(0, 10)
  const sentDate = quote.sent_at ? quote.sent_at.slice(0, 10) : ""
  const acceptedDate = quote.accepted_at ? quote.accepted_at.slice(0, 10) : ""

  return (
    <QuoteForm
      defaultCurrency={company.currency}
      quote={{
        id: quote.id,
        contact_id: quote.contact_id,
        title: quote.title,
        description: quote.description,
        tax_rate: quote.tax_rate,
        notes: quote.notes,
        valid_until: quote.valid_until,
        currency: quote.currency,
      }}
      quoteItems={items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))}
      error={sp.error ?? null}
      quote_date={quoteDate}
      sent_date={sentDate}
      accepted_date={acceptedDate}
      canEditDate={await hasSuperAdminPrivilege(user)}
    />
  )
}