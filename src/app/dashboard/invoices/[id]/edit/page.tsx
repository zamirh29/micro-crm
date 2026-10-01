import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Lock } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import { checkEditGate } from "@/lib/subscription"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import ProGate from "@/components/pro-gate"
import type { InvoiceItem } from "@/types/database"
import InvoiceForm from "../../new/invoice-form"

export const dynamic = "force-dynamic"

export default async function EditInvoicePage({
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

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, contacts(*), invoice_items(*)")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!invoice) notFound()

  const company = await getCompanyProfile(supabase, membership.org_id)

  const gate = await checkEditGate(supabase, user, { status: invoice.status })

  if (!gate.ok && gate.status === 403) {
    return (
      <ProGate
        title="Editing invoices is a Pro feature"
        description="Upgrade to Pro to edit invoices and quotes after they have been created."
        features={[
          "Correct invoices after they have been sent",
          "Update line items, tax rate, due date and currency",
          "Change the customer an invoice is billed to",
        ]}
      />
    )
  }

  if (!gate.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10">
            <Lock className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            This invoice cannot be edited
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {gate.message}
          </p>
          <Link
            href={`/dashboard/invoices/${invoice.id}`}
            className="mt-8 inline-flex items-center gap-2 rounded-md border border-border px-6 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            Back to invoice
          </Link>
        </div>
      </div>
    )
  }

  const invoiceItems = (invoice.invoice_items ?? []) as InvoiceItem[]
  const invoiceDate = invoice.created_at.slice(0, 10)

  return (
    <InvoiceForm
      defaultCurrency={company.currency}
      invoice={{
        id: invoice.id,
        contact_id: invoice.contact_id,
        title: invoice.title,
        description: invoice.description,
        tax_rate: invoice.tax_rate,
        notes: invoice.notes,
        due_date: invoice.due_date,
        currency: invoice.currency,
      }}
      items={invoiceItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))}
      error={sp.error ?? null}
      invoice_date={invoiceDate}
      canEditDate={await hasSuperAdminPrivilege(user)}
    />
  )
}
