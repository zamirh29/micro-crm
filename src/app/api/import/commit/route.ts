import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { readJson, jsonError } from "@/lib/api-utils"
import { canEditDocuments } from "@/lib/subscription"
import { commitImport, type ImportRowInput } from "@/lib/import/commit"

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dates must be YYYY-MM-DD")
  .nullish()

const rowSchema = z.object({
  rowNumber: z.number().int().nonnegative().optional(),
  sourceFile: z.string().max(255).optional(),
  originalNumber: z.string().max(120).default(""),
  customerName: z.string().max(200).default(""),
  customerEmail: z.string().max(200).default(""),
  customerCompany: z.string().max(200).default(""),
  title: z.string().max(300).default(""),
  documentDate: dateField,
  sentDate: dateField,
  dueDate: dateField,
  paidDate: dateField,
  acceptedDate: dateField,
  validUntil: dateField,
  status: z.string().max(30).nullish(),
  notes: z.string().max(5000).default(""),
  currency: z.string().max(10).default("GBP"),
  items: z
    .array(
      z.object({
        description: z.string().max(500).default(""),
        quantity: z.number().finite().default(1),
        unitPrice: z.number().finite().default(0),
      })
    )
    .min(1, "Each document needs at least one line item"),
})

const commitSchema = z.object({
  kind: z.enum(["invoice", "quote"]),
  taxRate: z.number().min(0).max(100).default(20),
  rows: z.array(rowSchema).min(1, "Nothing to import").max(2000),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const allowed = await canEditDocuments(auth.supabase, auth.user)
  if (!allowed) {
    return jsonError(
      "Importing historical invoices and quotes is a Pro feature",
      403
    )
  }

  const body = await readJson(request, commitSchema)
  if (!body.ok) return body.response

  const outcome = await commitImport(auth.supabase, {
    orgId: auth.orgId,
    userId: auth.user.id,
    kind: body.data.kind,
    rows: body.data.rows as ImportRowInput[],
    taxRate: body.data.taxRate,
  })

  return NextResponse.json(outcome)
}