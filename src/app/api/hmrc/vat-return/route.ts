import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { errorFromThrown, jsonError, readJson } from "@/lib/api-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import { submitVatReturn } from "@/lib/hmrc/client"
import { getConnection, getValidAccessToken } from "@/lib/hmrc/store"
import { computeVatReturnFigures, toHmrcPayload } from "@/lib/hmrc/vat"

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const submitSchema = z.object({
  periodKey: z.string().min(1).max(12),
  from: z.string().regex(DATE_RE, "from must be YYYY-MM-DD"),
  to: z.string().regex(DATE_RE, "to must be YYYY-MM-DD"),
  finalised: z.boolean().optional().default(true),
})

function validateRange(from: string, to: string) {
  if (from > to) return "from must be on or before to"
  return null
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const periodKey = url.searchParams.get("periodKey")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  if (!periodKey) return jsonError("periodKey is required", 400)
  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    return jsonError("from and to must be YYYY-MM-DD", 400)
  }
  const rangeError = validateRange(from, to)
  if (rangeError) return jsonError(rangeError, 400)

  try {
    const figures = await computeVatReturnFigures(auth.supabase, auth.orgId, {
      from,
      to,
    })
    return NextResponse.json({
      periodKey,
      from,
      to,
      figures,
      payload: toHmrcPayload(periodKey, figures, false),
    })
  } catch (err) {
    return errorFromThrown(err)
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const parsed = await readJson(request, submitSchema)
  if (!parsed.ok) return parsed.response

  const { periodKey, from, to, finalised } = parsed.data
  const rangeError = validateRange(from, to)
  if (rangeError) return jsonError(rangeError, 400)

  try {
    const connection = await getConnection(auth.orgId)
    if (!connection) {
      return jsonError("HMRC is not connected for this organization", 404)
    }

    const figures = await computeVatReturnFigures(auth.supabase, auth.orgId, {
      from,
      to,
    })
    const payload = toHmrcPayload(periodKey, figures, finalised)

    const accessToken = await getValidAccessToken(connection)
    const receipt = await submitVatReturn({
      accessToken,
      vrn: connection.vrn,
      payload,
      request,
      userId: auth.user.id,
    })

    const admin = createAdminClient()
    const { error } = await admin.from("hmrc_vat_submissions").upsert(
      {
        org_id: auth.orgId,
        vrn: connection.vrn,
        period_key: periodKey,
        period_from: from,
        period_to: to,
        payload,
        receipt,
        submitted_by: auth.user.id,
      },
      { onConflict: "org_id,period_key" }
    )

    if (error) {
      // The return was accepted by HMRC; surface the audit failure but keep the
      // receipt so the user can see it was submitted.
      return NextResponse.json(
        {
          submitted: true,
          receipt,
          warning: `Submitted to HMRC but the local audit record failed: ${error.message}`,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({ submitted: true, receipt, figures })
  } catch (err) {
    return errorFromThrown(err)
  }
}
