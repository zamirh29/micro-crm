import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { getHmrcConfig } from "@/lib/hmrc/config"
import { buildAuthorizeUrl } from "@/lib/hmrc/client"
import { createMobileOAuthState } from "@/lib/hmrc/oauth-state"

export const dynamic = "force-dynamic"

/**
 * Returns an HMRC authorize URL for the native app.
 *
 * The app opens it in a browser session with `microcrm://hmrc` as the return
 * URL. The callback recognises the signed state and redirects back there.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const config = getHmrcConfig()
  if (!config.configured) {
    return jsonError(
      "HMRC is not configured yet. Add HMRC_CLIENT_ID, HMRC_CLIENT_SECRET and HMRC_REDIRECT_URI.",
      503
    )
  }

  const url = new URL(request.url)
  const vrn = (url.searchParams.get("vrn") ?? "").replace(/\s+/g, "")
  if (!/^\d{9}$/.test(vrn)) {
    return jsonError("Enter a 9-digit VAT registration number.", 400)
  }

  let state: string
  try {
    state = createMobileOAuthState({
      orgId: auth.orgId,
      userId: auth.user.id,
      vrn,
    })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Could not start the HMRC connection.",
      500
    )
  }

  return NextResponse.json(
    { url: buildAuthorizeUrl(state) },
    { headers: { "Cache-Control": "no-store" } }
  )
}
