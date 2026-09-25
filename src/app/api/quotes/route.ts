import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { createQuoteRecord } from "@/lib/documents"

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Line item description is required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit_price: z.number().nonnegative("Unit price cannot be negative"),
})

const createSchema = z.object({
  contact_id: z.string().min(1, "Customer is required"),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().nullish(),
  tax_rate: z.number().min(0).max(100).default(0),
  notes: z.string().nullish(),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "valid_until must be YYYY-MM-DD")
    .nullish(),
  currency: z.string().length(3).default("GBP"),
  items: z.array(lineItemSchema).min(1, "At least one line item is required"),
})

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const contactId = url.searchParams.get("contact_id")
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)

  let query = auth.supabase
    .from("quotes")
    .select("*, contacts(first_name, last_name, company, email)")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status) query = query.eq("status", status)
  if (contactId) query = query.eq("contact_id", contactId)

  const { data: quotes, error } = await query
  if (error) return jsonError(error.message, 400)

  return NextResponse.json({ quotes: quotes ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const parsed = await readJson(request, createSchema)
  if (!parsed.ok) return parsed.response

  try {
    const quote = await createQuoteRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      input: parsed.data,
    })
    return NextResponse.json({ quote }, { status: 201 })
  } catch (err) {
    return errorFromThrown(err)
  }
}
