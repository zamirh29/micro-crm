"use server"

import { createAdminClient } from "@/lib/supabase/admin"

export type AccountCheckResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "unknown" }
  | { status: "error"; message: string }

const PAGE_SIZE = 100
const MAX_PAGES = 25

/**
 * Checks whether a Supabase auth user exists for the given email.
 *
 * Uses the admin list-users endpoint so no email is sent and no reset
 * token is created, which keeps the subsequent recovery email working.
 *
 * Returns "unknown" when existence cannot be determined within the page
 * budget; callers should fail open and send the email anyway.
 */
export async function accountExists(
  rawEmail: string
): Promise<AccountCheckResult> {
  const email = rawEmail.trim().toLowerCase()

  if (!email) {
    return { status: "error", message: "Enter your email address." }
  }

  try {
    const admin = createAdminClient()

    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      })

      if (error) return { status: "unknown" }

      const users = data?.users ?? []
      if (users.some((user) => (user.email ?? "").toLowerCase() === email)) {
        return { status: "ok" }
      }

      if (users.length < PAGE_SIZE || page * PAGE_SIZE >= data.total) {
        return { status: "not_found" }
      }
    }

    return { status: "unknown" }
  } catch {
    return { status: "unknown" }
  }
}
