import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, errorFromThrown } from "@/lib/api-utils"
import { runSalesReport } from "@/lib/report-runner"
import { parseDateBand, monthBand } from "@/lib/report-dates"

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const month = url.searchParams.get("month")
  const from = url.searchParams.get("from") ?? undefined
  const to = url.searchParams.get("to") ?? undefined
  const customerId = url.searchParams.get("customer_id")

  let band
  if (month) {
    band = monthBand(month)
    if (!band) return jsonError("month must be YYYY-MM", 400)
  } else {
    band = parseDateBand(from, to)
  }

  try {
    const result = await runSalesReport(
      auth.supabase,
      auth.orgId,
      band,
      customerId
    )
    return NextResponse.json({
      label: band.label,
      rows: result.rows,
      totals: result.totals,
      includesSingleCustomer: result.includesSingleCustomer,
    })
  } catch (err) {
    return errorFromThrown(err)
  }
}
