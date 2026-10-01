import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { isSuperAdmin } from "@/lib/admin"

export const IMPERSONATION_COOKIE = "mcrm_impersonation"
export const ADMIN_SESSION_COOKIE = "mcrm_admin_session"

const MAX_AGE_SECONDS = 8 * 60 * 60

export type Impersonation = { userId: string; email: string }

function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
  return createHmac("sha256", `impersonation:${secret}`).digest()
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url")
}

export function impersonationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  }
}

export function buildImpersonationValue(userId: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      email,
      exp: Date.now() + MAX_AGE_SECONDS * 1000,
    })
  ).toString("base64url")
  return `v1.${payload}.${sign(payload)}`
}

function parseImpersonation(value: string | undefined | null): Impersonation | null {
  if (!value) return null
  const parts = value.split(".")
  if (parts.length !== 3 || parts[0] !== "v1") return null
  const [, payload, signature] = parts
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (typeof parsed?.uid !== "string" || typeof parsed?.email !== "string") return null
    if (typeof parsed?.exp !== "number" || parsed.exp < Date.now()) return null
    return { userId: parsed.uid, email: parsed.email }
  } catch {
    return null
  }
}

export async function getImpersonation(): Promise<Impersonation | null> {
  const cookieStore = await cookies()
  return parseImpersonation(cookieStore.get(IMPERSONATION_COOKIE)?.value)
}

export async function clearImpersonationCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(IMPERSONATION_COOKIE)
  cookieStore.delete(ADMIN_SESSION_COOKIE)
}

/**
 * True when the caller may use super-admin-only document powers (paid-unlock,
 * invoice date editing, Pro bypass). Either the session user really is the
 * super admin, or they are impersonating (signed cookie naming this exact
 * session user as the target).
 */
export async function hasSuperAdminPrivilege(user: {
  id: string
  email?: string | null
}): Promise<boolean> {
  if (isSuperAdmin(user.email)) return true
  const imp = await getImpersonation()
  return imp !== null && imp.userId === user.id
}
