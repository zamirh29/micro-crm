import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { syncSubscriberToSubscription } from "@/lib/revenuecat"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  try {
    const result = await syncSubscriberToSubscription(
      createAdminClient(),
      auth.user.id
    )
    return NextResponse.json({ synced: true, ...result })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to sync subscription"
    return jsonError(message, 500)
  }
}
