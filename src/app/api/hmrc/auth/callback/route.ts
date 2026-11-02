import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { exchangeAuthorizationCode } from "@/lib/hmrc/client"
import { saveConnection } from "@/lib/hmrc/store"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "hmrc_oauth_state"

interface StateCookie {
  state: string
  orgId: string
  userId: string
  vrn: string
}

function settingsRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/dashboard/integrations/hmrc", request.url)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (error) {
    return settingsRedirect(request, {
      error: url.searchParams.get("error_description") ?? error,
    })
  }

  if (!code || !state) {
    return settingsRedirect(request, { error: "HMRC did not return an authorisation code." })
  }

  const cookieStore = await cookies()
  const raw = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)

  if (!raw) {
    return settingsRedirect(request, {
      error: "The connection attempt expired. Please try again.",
    })
  }

  let saved: StateCookie
  try {
    saved = JSON.parse(raw) as StateCookie
  } catch {
    return settingsRedirect(request, { error: "Invalid connection state." })
  }

  if (saved.state !== state) {
    return settingsRedirect(request, { error: "Connection state mismatch." })
  }

  try {
    const tokens = await exchangeAuthorizationCode(code)
    await saveConnection({
      orgId: saved.orgId,
      vrn: saved.vrn,
      tokens,
      connectedBy: saved.userId,
    })

    const admin = createAdminClient()
    await admin
      .from("organizations")
      .update({ vat_number: saved.vrn, vat_registered: true })
      .eq("id", saved.orgId)

    return settingsRedirect(request, { connected: "1" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect to HMRC."
    return settingsRedirect(request, { error: message })
  }
}
