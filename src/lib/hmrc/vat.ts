import type { SupabaseClient } from "@supabase/supabase-js"
import type { VatReturnPayload } from "@/lib/hmrc/client"

export interface VatReturnFigures {
  vatDueSales: number
  vatDueAcquisitions: number
  totalVatDue: number
  vatReclaimedCurrPeriod: number
  netVatDue: number
  totalValueSalesExVAT: number
  totalValuePurchasesExVAT: number
  totalValueGoodsSuppliedExVAT: number
  totalAcquisitionsExVAT: number
  invoiceCount: number
  expenseCount: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Builds VAT return boxes from the records in MicroCRM.
 *
 * Sales use invoices that have been issued (draft invoices are excluded, as
 * they have no tax point yet). Purchases use expenses, which this app stores
 * gross with no VAT split, so input VAT is zero unless the figures are
 * overridden by the user before submitting.
 */
export async function computeVatReturnFigures(
  supabase: SupabaseClient,
  orgId: string,
  period: { from: string; to: string }
): Promise<VatReturnFigures> {
  const toExclusive = new Date(`${period.to}T00:00:00Z`)
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)

  const [{ data: invoices, error: invoiceError }, { data: expenses, error: expenseError }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("subtotal, tax_amount, status, created_at")
        .eq("org_id", orgId)
        .in("status", ["sent", "paid", "overdue"])
        .gte("created_at", `${period.from}T00:00:00.000Z`)
        .lt("created_at", toExclusive.toISOString()),
      supabase
        .from("expenses")
        .select("amount, incurred_on")
        .eq("org_id", orgId)
        .gte("incurred_on", period.from)
        .lte("incurred_on", period.to),
    ])

  if (invoiceError) throw new Error(invoiceError.message)
  if (expenseError) throw new Error(expenseError.message)

  const sales = invoices ?? []
  const purchases = expenses ?? []

  const vatDueSales = round2(
    sales.reduce((sum, row) => sum + Number(row.tax_amount ?? 0), 0) / 100
  )
  const totalValueSalesExVAT = round2(
    sales.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0) / 100
  )
  const vatReclaimedCurrPeriod = 0
  const totalValuePurchasesExVAT = round2(
    purchases.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) / 100
  )
  const totalVatDue = round2(vatDueSales + 0)
  const netVatDue = round2(Math.abs(totalVatDue - vatReclaimedCurrPeriod))

  return {
    vatDueSales,
    vatDueAcquisitions: 0,
    totalVatDue,
    vatReclaimedCurrPeriod,
    netVatDue,
    totalValueSalesExVAT,
    totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
    invoiceCount: sales.length,
    expenseCount: purchases.length,
  }
}

export function toHmrcPayload(
  periodKey: string,
  figures: VatReturnFigures,
  finalised = true
): VatReturnPayload {
  return {
    periodKey,
    vatDueSales: figures.vatDueSales,
    vatDueAcquisitions: figures.vatDueAcquisitions,
    totalVatDue: figures.totalVatDue,
    vatReclaimedCurrPeriod: figures.vatReclaimedCurrPeriod,
    netVatDue: figures.netVatDue,
    totalValueSalesExVAT: figures.totalValueSalesExVAT,
    totalValuePurchasesExVAT: figures.totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT: figures.totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT: figures.totalAcquisitionsExVAT,
    finalised,
  }
}
