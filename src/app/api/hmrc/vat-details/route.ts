import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { readJson } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

const schema = z.object({
  vatNumber: z.string().max(30).optional().default(""),
  vatRegistered: z.boolean().optional().default(false),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const body = await readJson(request, schema)
  if (!body.ok) return body.response

  const vatNumber = body.data.vatNumber.replace(/\s+/g, "")
  const vatRegistered = body.data.vatRegistered

  if (vatRegistered && vatNumber && !/^\d{9}$/.test(vatNumber)) {
    return NextResponse.json(
      { error: "VAT number must be 9 digits." },
      { status: 400 }
    )
  }

  const { error } = await auth.supabase
    .from("organizations")
    .update({
      vat_number: vatNumber || null,
      vat_registered: vatRegistered,
    })
    .eq("id", auth.orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    vat: { vatNumber: vatNumber || null, vatRegistered },
  })
}
