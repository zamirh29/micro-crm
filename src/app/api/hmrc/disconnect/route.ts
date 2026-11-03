import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { errorFromThrown } from "@/lib/api-utils"
import { deleteConnection } from "@/lib/hmrc/store"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  try {
    await deleteConnection(auth.orgId)
  } catch (err) {
    return errorFromThrown(err)
  }

  return NextResponse.json({ ok: true })
}
