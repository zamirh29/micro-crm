import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { errorFromThrown, jsonError } from "@/lib/api-utils"
import { getVatObligations } from "@/lib/hmrc/client"
import { getConnection, getValidAccessToken } from "@/lib/hmrc/store"

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now)
  from.setFullYear(from.getFullYear() - 1)
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const range = defaultRange()
  const from = url.searchParams.get("from") ?? range.from
  const to = url.searchParams.get("to") ?? range.to
  const statusParam = url.searchParams.get("status")

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return jsonError("Dates must be YYYY-MM-DD", 400)
  }
  if (statusParam && statusParam !== "O" && statusParam !== "F") {
    return jsonError("status must be O (open) or F (fulfilled)", 400)
  }

  try {
    const connection = await getConnection(auth.orgId)
    if (!connection) {
      return jsonError("HMRC is not connected for this organization", 404)
    }

    const accessToken = await getValidAccessToken(connection)
    const result = await getVatObligations({
      accessToken,
      vrn: connection.vrn,
      from,
      to,
      status: statusParam === "O" || statusParam === "F" ? statusParam : undefined,
      request,
      userId: auth.user.id,
    })

    return NextResponse.json({
      environment: connection.environment,
      vrn: connection.vrn,
      obligations: result.obligations ?? [],
    })
  } catch (err) {
    return errorFromThrown(err)
  }
}
