import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { isProUser } from "@/lib/pro"
import {
  MTD_INCOME_TAX_SCHEDULE,
  assessMtdLiability,
  computeIncomeTax,
  getTaxYearForDate,
} from "@/lib/uk-tax"

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  if (!(await isProUser(auth.supabase, auth.user.id))) {
    return jsonError("Tax Reports are a Pro feature", 403)
  }

  const taxYear = getTaxYearForDate()

  const { data: invoices, error: invoiceError } = await auth.supabase
    .from("invoices")
    .select("total, status, created_at")
    .eq("org_id", auth.orgId)
    .gte("created_at", taxYear.start.toISOString())
    .lt("created_at", taxYear.end.toISOString())

  if (invoiceError) return jsonError(invoiceError.message, 400)

  const paidPence =
    invoices?.reduce(
      (sum, invoice) => sum + (invoice.status === "paid" ? invoice.total : 0),
      0
    ) ?? 0

  const invoicedPence =
    invoices?.reduce(
      (sum, invoice) =>
        sum +
        (invoice.status === "paid" ||
        invoice.status === "sent" ||
        invoice.status === "overdue"
          ? invoice.total
          : 0),
      0
    ) ?? 0

  const { data: expenseRows, error: expenseError } = await auth.supabase
    .from("expenses")
    .select("amount")
    .eq("org_id", auth.orgId)
    .gte("incurred_on", taxYear.start.toISOString().slice(0, 10))
    .lt("incurred_on", taxYear.end.toISOString().slice(0, 10))

  if (expenseError) return jsonError(expenseError.message, 400)

  const expensesPence =
    expenseRows?.reduce((sum, row) => sum + row.amount, 0) ?? 0

  const grossIncome = paidPence / 100
  const taxableIncome = Math.max(paidPence - expensesPence, 0) / 100
  const tax = computeIncomeTax(taxableIncome)
  const mtd = assessMtdLiability(grossIncome)

  return NextResponse.json({
    taxYear: {
      key: taxYear.key,
      label: taxYear.label,
      start: taxYear.start.toISOString(),
      end: taxYear.end.toISOString(),
      bands: taxYear.bands,
    },
    paidPence,
    invoicedPence,
    expensesPence,
    taxableIncome,
    tax: {
      gross: tax.gross,
      totalTax: tax.totalTax,
      effectiveRate: tax.effectiveRate,
      rows: tax.rows.map((row) => ({
        label: row.band.label,
        from: row.band.from,
        to: row.band.to,
        rate: row.band.rate,
        taxable: row.taxable,
        tax: row.tax,
      })),
    },
    mtd,
    schedule: MTD_INCOME_TAX_SCHEDULE,
  })
}
