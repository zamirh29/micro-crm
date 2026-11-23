import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { getConnections } from "@/lib/bank-feed/store"
import { syncConnection } from "@/lib/bank-feed/sync"
import { canEditDocuments } from "@/lib/subscription"

export const dynamic = "force-dynamic"

const schema = z.object({
  connectionId: z.string().uuid().nullable().optional(),
  days: z.number().int().min(1).max(90).default(90),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const pro = await canEditDocuments(auth.supabase, auth.user)
  if (!pro) return jsonError("Bank feed is a Pro feature", 403)

  let body = schema.parse({})
  try {
    const raw = await request.json()
    const parsed = schema.safeParse(raw)
    if (parsed.success) body = parsed.data
  } catch {
    // An empty body means "sync all active connections".
  }

  try {
    const connections = await getConnections(auth.orgId)
    const targets = body.connectionId
      ? connections.filter((connection) => connection.id === body.connectionId)
      : connections.filter(
          (connection) =>
            connection.provider === "truelayer" && connection.status === "active"
        )

    if (targets.length === 0) {
      return jsonError("No active bank connection found", 400)
    }

    let imported = 0
    let posted = 0
    for (const connection of targets) {
      const result = await syncConnection({
        orgId: auth.orgId,
        connectionId: connection.id,
        days: body.days,
      })
      imported += result.imported
      posted += result.posted
    }
    return NextResponse.json({ imported, posted, synced: targets.length })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Bank sync failed", 400)
  }
}
