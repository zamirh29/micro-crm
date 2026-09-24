import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { computeCustomerSales, type CustomerBrief } from "@/lib/sales-report"
import type { DateBand } from "@/lib/report-dates"

export type ReportDb = SupabaseClient<Database, "public">

export interface SalesReportResult {
  customers: CustomerBrief[]
  rows: ReturnType<typeof computeCustomerSales>["rows"]
  totals: ReturnType<typeof computeCustomerSales>["totals"]
  includesSingleCustomer: boolean
}

export async function runSalesReport(
  supabase: ReportDb,
  orgId: string,
  band: DateBand,
  customerId: string | null = null
): Promise<SalesReportResult> {
  const [{ data: contacts }, quotes, invoicesCreated, invoicesPaid] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, company")
        .eq("org_id", orgId)
        .order("first_name"),
      fetchQuotes(supabase, orgId, band, customerId),
      fetchInvoicesCreated(supabase, orgId, band, customerId),
      fetchInvoicesPaid(supabase, orgId, band, customerId),
    ])

  const customers = (contacts ?? []) as CustomerBrief[]
  const summary = computeCustomerSales({
    customers,
    quotes,
    invoicesCreated,
    invoicesPaid,
  })

  return {
    customers,
    rows: summary.rows,
    totals: summary.totals,
    includesSingleCustomer: summary.includesSingleCustomer,
  }
}

export async function fetchQuotes(
  supabase: ReportDb,
  orgId: string,
  band: { from: Date | null; to: Date | null },
  customerId: string | null
) {
  let q = supabase
    .from("quotes")
    .select("contact_id, status, total")
    .eq("org_id", orgId)
  if (band.from) q = q.gte("created_at", band.from.toISOString())
  if (band.to) q = q.lt("created_at", band.to.toISOString())
  if (customerId) q = q.eq("contact_id", customerId)
  const { data } = await q
  return data ?? []
}

export async function fetchInvoicesCreated(
  supabase: ReportDb,
  orgId: string,
  band: { from: Date | null; to: Date | null },
  customerId: string | null
) {
  let q = supabase
    .from("invoices")
    .select("contact_id, status, total")
    .eq("org_id", orgId)
  if (band.from) q = q.gte("created_at", band.from.toISOString())
  if (band.to) q = q.lt("created_at", band.to.toISOString())
  if (customerId) q = q.eq("contact_id", customerId)
  const { data } = await q
  return data ?? []
}

export async function fetchInvoicesPaid(
  supabase: ReportDb,
  orgId: string,
  band: { from: Date | null; to: Date | null },
  customerId: string | null
) {
  let q = supabase
    .from("invoices")
    .select("contact_id, total")
    .eq("org_id", orgId)
    .eq("status", "paid")
  if (band.from) q = q.gte("paid_at", band.from.toISOString())
  if (band.to) q = q.lt("paid_at", band.to.toISOString())
  if (customerId) q = q.eq("contact_id", customerId)
  const { data } = await q
  return data ?? []
}