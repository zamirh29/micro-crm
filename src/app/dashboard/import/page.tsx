import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getSubscription, isProSubscription } from "@/lib/subscription"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import ProGate from "@/components/pro-gate"
import ImportWizard from "@/components/import-wizard"

export default async function ImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()

  if (!membership) return null

  const { data: org } = await supabase
    .from("organizations")
    .select("name, currency")
    .eq("id", membership.org_id)
    .maybeSingle()

  const canImport =
    (await hasSuperAdminPrivilege(user)) ||
    isProSubscription(await getSubscription(supabase, user.id))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import invoices and quotes</h1>
        <p className="mt-1 text-muted-foreground">
          Bring in documents you issued in an earlier system. Your own numbers are
          kept as a reference, and MicroCRM assigns fresh numbers in date order.
        </p>
      </div>

      {canImport ? (
        <ImportWizard orgCurrency={org?.currency ?? "GBP"} />
      ) : (
        <ProGate
          title="Import is a Pro feature"
          description="Upgrade to Pro to bring in your historical invoices and quotes."
          features={[
            "Upload invoices and quotes from a spreadsheet",
            "Your original numbers are kept for reference",
            "Customers are matched automatically",
            "Dates, totals and statuses are preserved",
          ]}
        />
      )}
    </div>
  )
}