"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getConnection, getValidAccessToken, deleteConnection } from "@/lib/hmrc/store"
import { submitVatReturn } from "@/lib/hmrc/client"
import { computeVatReturnFigures, toHmrcPayload } from "@/lib/hmrc/vat"

const PAGE = "/dashboard/integrations/hmrc"

async function context() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect("/login")
  return { supabase, user, orgId: membership.org_id as string }
}

function back(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString()
  redirect(`${PAGE}?${query}`)
}

export async function disconnectHmrc() {
  const { orgId } = await context()
  await deleteConnection(orgId)
  revalidatePath(PAGE)
  back({ disconnected: "1" })
}

export async function saveVatDetails(formData: FormData) {
  const { supabase, orgId } = await context()

  const vatNumber = String(formData.get("vat_number") ?? "").replace(/\s+/g, "")
  const vatRegistered = formData.get("vat_registered") === "on"

  if (vatRegistered && vatNumber && !/^\d{9}$/.test(vatNumber)) {
    back({ error: "VAT number must be 9 digits." })
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      vat_number: vatNumber || null,
      vat_registered: vatRegistered,
    })
    .eq("id", orgId)

  if (error) back({ error: error.message })

  revalidatePath(PAGE)
  revalidatePath("/dashboard/settings")
  back({ saved: "vat" })
}

export async function submitVatReturnAction(formData: FormData) {
  const { supabase, user, orgId } = await context()

  const periodKey = String(formData.get("period_key") ?? "")
  const from = String(formData.get("from") ?? "")
  const to = String(formData.get("to") ?? "")

  if (!periodKey || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    back({ error: "Invalid VAT period." })
  }

  const connection = await getConnection(orgId)
  if (!connection) back({ error: "HMRC is not connected." })

  try {
    const figures = await computeVatReturnFigures(supabase, orgId, { from, to })
    const payload = toHmrcPayload(periodKey, figures, true)
    const accessToken = await getValidAccessToken(connection)
    const receipt = await submitVatReturn({
      accessToken,
      vrn: connection.vrn,
      payload,
      request: new Request(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${PAGE}`),
      userId: user.id,
    })

    const admin = createAdminClient()
    await admin.from("hmrc_vat_submissions").upsert(
      {
        org_id: orgId,
        vrn: connection.vrn,
        period_key: periodKey,
        period_from: from,
        period_to: to,
        payload,
        receipt,
        submitted_by: user.id,
      },
      { onConflict: "org_id,period_key" }
    )

    revalidatePath(PAGE)
    back({
      submitted: "1",
      bundle: String(receipt.formBundleNumber ?? ""),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "HMRC submission failed."
    back({ error: message })
  }
}
