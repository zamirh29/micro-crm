import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { BANK_FEED_PAGE_PATH } from "@/lib/bank-feed/config"
import {
  exchangeTrueLayerCode,
  getTrueLayerMe,
} from "@/lib/bank-feed/truelayer"
import { saveTrueLayerConnection } from "@/lib/bank-feed/store"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "bank_feed_oauth_state"

interface StateCookie {
  state: string
  orgId: string
  userId: string
}

function redirectWith(request: Request, params: Record<string, string>) {
  const url = new URL(BANK_FEED_PAGE_PATH, request.url)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const providerError = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (providerError) {
    return redirectWith(request, {
      error: url.searchParams.get("error_description") ?? providerError,
    })
  }
  if (!code || !state) {
    return redirectWith(request, {
      error: "TrueLayer did not return an authorisation code.",
    })
  }

  const cookieStore = await cookies()
  const raw = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)
  if (!raw) {
    return redirectWith(request, {
      error: "The bank connection attempt expired. Please try again.",
    })
  }

  let saved: StateCookie
  try {
    saved = JSON.parse(raw) as StateCookie
  } catch {
    return redirectWith(request, { error: "Invalid bank connection state." })
  }
  if (saved.state !== state) {
    return redirectWith(request, { error: "Bank connection state mismatch." })
  }

  try {
    const tokens = await exchangeTrueLayerCode(code)
    const me = await getTrueLayerMe(tokens.accessToken)
    const accountCount = await saveTrueLayerConnection({
      orgId: saved.orgId,
      userId: saved.userId,
      tokens,
      me,
    })
    return redirectWith(request, {
      connected: "1",
      accounts: String(accountCount),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect bank account."
    return redirectWith(request, { error: message })
  }
}
