import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson } from "@/lib/api-utils"
import { getConnections, revokeConnection, updatePostingMode } from "@/lib/bank-feed/store"
import { canEditDocuments } from "@/lib/subscription"

export const dynamic = "force-dynamic"

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("posting_mode"),
    connectionId: z.string().uuid(),
    postingMode: z.enum(["review", "auto_exact", "auto_all"]),
  }),
  z.object({
    action: z.literal("revoke"),
    connectionId: z.string().uuid(),
  }),
])

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ connections: await getConnections(auth.orgId) })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not load connections", 400)
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const pro = await canEditDocuments(auth.supabase, auth.user)
  if (!pro) return jsonError("Bank feed is a Pro feature", 403)

  const parsed = await readJson(request, updateSchema)
  if (!parsed.ok) return parsed.response

  try {
    if (parsed.data.action === "posting_mode") {
      await updatePostingMode({
        orgId: auth.orgId,
        connectionId: parsed.data.connectionId,
        postingMode: parsed.data.postingMode,
      })
    } else {
      await revokeConnection({
        orgId: auth.orgId,
        connectionId: parsed.data.connectionId,
        userId: auth.user.id,
      })
    }
    return NextResponse.json({ ok: true, connections: await getConnections(auth.orgId) })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not update connection", 400)
  }
}
