import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { isProUser } from "@/lib/pro"

const updateSchema = z.object({
  enabled: z.boolean().optional(),
})

async function requirePro(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth

  if (!(await isProUser(auth.supabase, auth.user.id))) {
    return {
      ok: false as const,
      response: jsonError("Automated report emails are a Pro feature", 403),
    }
  }

  return auth
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePro(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsed = await readJson(request, updateSchema)
  if (!parsed.ok) return parsed.response

  try {
    let enabled = parsed.data.enabled
    if (enabled === undefined) {
      const { data: current } = await auth.supabase
        .from("report_subscriptions")
        .select("enabled")
        .eq("id", id)
        .eq("org_id", auth.orgId)
        .maybeSingle()

      if (!current) return jsonError("Report subscription not found", 404)
      enabled = !current.enabled
    }

    const { data: subscription, error } = await auth.supabase
      .from("report_subscriptions")
      .update({ enabled })
      .eq("id", id)
      .eq("org_id", auth.orgId)
      .select("*")
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!subscription) return jsonError("Report subscription not found", 404)

    return NextResponse.json({ subscription })
  } catch (err) {
    return errorFromThrown(err)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePro(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const { error } = await auth.supabase
    .from("report_subscriptions")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId)

  if (error) return jsonError(error.message, 400)

  return NextResponse.json({ success: true })
}
