import { createHmac, timingSafeEqual } from "crypto"
import { getHmrcConfig } from "@/lib/hmrc/config"

/**
 * Stateless OAuth state for the mobile app.
 *
 * The web flow stores the pending connection in an HttpOnly cookie, which a
 * native app cannot receive. Instead the mobile API signs the pending values
 * into the `state` parameter itself, so the callback can verify and use them
 * without a database row or a shared cookie.
 *
 * The state is short-lived because it travels through HMRC's authorisation
 * screen; ten minutes is enough for a user to sign in to Government Gateway.
 */
export interface MobileOAuthState {
  orgId: string
  userId: string
  vrn: string
  mode: "mobile"
  issuedAt: number
}

export const MOBILE_STATE_MAX_AGE_MS = 10 * 60 * 1000

function secret(): string {
  // A dedicated secret lets the signing key rotate independently of the HMRC
  // client secret. Falling back keeps existing deployments working.
  if (process.env.HMRC_STATE_SECRET) return process.env.HMRC_STATE_SECRET

  const { clientSecret, configured } = getHmrcConfig()
  if (!configured || !clientSecret) {
    throw new Error("HMRC is not configured")
  }
  return clientSecret
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url")
}

function signature(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url")
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function createMobileOAuthState(input: {
  orgId: string
  userId: string
  vrn: string
}): string {
  const payload: MobileOAuthState = {
    orgId: input.orgId,
    userId: input.userId,
    vrn: input.vrn,
    mode: "mobile",
    issuedAt: Date.now(),
  }

  const body = base64url(JSON.stringify(payload))
  return `${body}.${signature(body)}`
}

export function verifyMobileOAuthState(state: string): MobileOAuthState | null {
  const [body, supplied] = state.split(".")
  if (!body || !supplied) return null

  let expected: string
  try {
    expected = signature(body)
  } catch {
    return null
  }
  if (!constantTimeEqual(supplied, expected)) return null

  let payload: MobileOAuthState
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MobileOAuthState
  } catch {
    return null
  }

  if (payload.mode !== "mobile") return null
  if (!payload.orgId || !payload.userId || !payload.vrn) return null
  if (typeof payload.issuedAt !== "number") return null
  if (Date.now() - payload.issuedAt > MOBILE_STATE_MAX_AGE_MS) return null

  return payload
}
