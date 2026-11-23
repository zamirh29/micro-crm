import { randomBytes } from "crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { getBankFeedConfig, BANK_FEED_PAGE_PATH } from "@/lib/bank-feed/config"
import { buildTrueLayerAuthUrl } from "@/lib/bank-feed/truelayer"
import { canEditDocuments } from "@/lib/subscription"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "bank_feed_oauth_state"

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const pro = await canEditDocuments(auth.supabase, auth.user)
  if (!pro) {
    return NextResponse.redirect(
      new URL(`${BANK_FEED_PAGE_PATH}?error=Bank%20feed%20is%20a%20Pro%20feature`, request.url)
    )
  }

  const config = getBankFeedConfig()
  if (!config.configured) {
    return NextResponse.redirect(
      new URL(
        `${BANK_FEED_PAGE_PATH}?error=TrueLayer%20is%20not%20configured%20yet`,
        request.url
      )
    )
  }

  const state = randomBytes(24).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set(
    STATE_COOKIE,
    JSON.stringify({
      state,
      orgId: auth.orgId,
      userId: auth.user.id,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    }
  )

  return NextResponse.redirect(buildTrueLayerAuthUrl(state))
}
