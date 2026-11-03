import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { getHmrcConfig } from "@/lib/hmrc/config"
import { getVatObligations, type VatObligation } from "@/lib/hmrc/client"
import { getConnection, getValidAccessToken } from "@/lib/hmrc/store"
import { computeVatReturnFigures, type VatReturnFigures } from "@/lib/hmrc/vat"

export const dynamic = "force-dynamic"

interface ObligationWithFigures extends VatObligation {
  figures: VatReturnFigures | null
}

/**
 * Everything the mobile HMRC screen needs in one call: configuration, the
 * connection (never tokens), VAT details, obligations with computed box
 * figures, and recent submissions.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { supabase, orgId, user } = auth
  const config = getHmrcConfig()

  const [{ data: organization }, connection] = await Promise.all([
    supabase
      .from("organizations")
      .select("vat_number, vat_registered")
      .eq("id", orgId)
      .maybeSingle(),
    getConnection(orgId),
  ])

  const admin = createAdminClient()
  const { data: submissions } = await admin
    .from("hmrc_vat_submissions")
    .select("period_key, period_from, period_to, submitted_at, receipt")
    .eq("org_id", orgId)
    .order("submitted_at", { ascending: false })
    .limit(8)

  let obligations: ObligationWithFigures[] = []
  let obligationsError: string | null = null

  if (connection) {
    const to = new Date()
    const from = new Date(to)
    from.setFullYear(from.getFullYear() - 1)

    try {
      const accessToken = await getValidAccessToken(connection)
      const result = await getVatObligations({
        accessToken,
        vrn: connection.vrn,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        request,
        userId: user.id,
      })

      const base = result.obligations ?? []
      obligations = await Promise.all(
        base.map(async (obligation) => {
          if (obligation.status !== "O") {
            return { ...obligation, figures: null }
          }
          try {
            const figures = await computeVatReturnFigures(supabase, orgId, {
              from: obligation.start,
              to: obligation.end,
            })
            return { ...obligation, figures }
          } catch {
            return { ...obligation, figures: null }
          }
        })
      )
    } catch (err) {
      obligationsError =
        err instanceof Error ? err.message : "Could not load HMRC obligations."
    }
  }

  return NextResponse.json(
    {
      configured: config.configured,
      environment: config.environment,
      redirectUri: config.redirectUri,
      vat: {
        vatNumber: organization?.vat_number ?? null,
        vatRegistered: Boolean(organization?.vat_registered),
      },
      connection: connection
        ? {
            vrn: connection.vrn,
            environment: connection.environment,
            connectedAt: connection.connectedAt,
          }
        : null,
      obligations,
      obligationsError,
      submissions: submissions ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
