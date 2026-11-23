import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { getBankFeedConfig } from "@/lib/bank-feed/config"
import { canEditDocuments } from "@/lib/subscription"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const pro = await canEditDocuments(auth.supabase, auth.user)
  const config = getBankFeedConfig()
  return NextResponse.json({
    pro,
    configured: config.configured,
    environment: config.environment,
    country: "GB",
  })
}
