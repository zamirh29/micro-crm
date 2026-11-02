import { randomBytes } from "crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { getHmrcConfig } from "@/lib/hmrc/config"
import { buildAuthorizeUrl } from "@/lib/hmrc/client"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "hmrc_oauth_state"

function settingsError(request: Request, message: string): NextResponse {
  const url = new URL("/dashboard/integrations/hmrc", request.url)
  url.searchParams.set("error", message)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const config = getHmrcConfig()
  if (!config.configured) {
    return settingsError(
      request,
      "HMRC is not configured yet. Add HMRC_CLIENT_ID, HMRC_CLIENT_SECRET and HMRC_REDIRECT_URI."
    )
  }

  const url = new URL(request.url)
  const vrn = (url.searchParams.get("vrn") ?? "").replace(/\s+/g, "")
  if (!/^\d{9}$/.test(vrn)) {
    return settingsError(request, "Enter a 9-digit VAT registration number.")
  }

  const state = randomBytes(24).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set(
    STATE_COOKIE,
    JSON.stringify({
      state,
      orgId: auth.orgId,
      userId: auth.user.id,
      vrn,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    }
  )

  return NextResponse.redirect(buildAuthorizeUrl(state))
}
