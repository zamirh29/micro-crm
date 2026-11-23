import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson } from "@/lib/api-utils"
import { postBankTransaction } from "@/lib/bank-feed/posting"
import type { BankTransactionRow, PublicBankTransaction } from "@/lib/bank-feed/types"
import { canEditDocuments } from "@/lib/subscription"

export const dynamic = "force-dynamic"

const actionSchema = z.object({
  transactionId: z.string().uuid(),
  action: z.enum(["post", "ignore"]),
  invoiceId: z.string().uuid().nullish(),
  category: z.string().max(120).nullish(),
})

function toPublic(row: BankTransactionRow): PublicBankTransaction {
  return {
    id: row.id,
    connectionId: row.connection_id,
    provider: row.provider,
    bookedAt: row.booked_at,
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    currency: row.currency,
    balance: row.balance === null ? null : Number(row.balance),
    categoryHint: row.category_hint,
    supplierHint: row.supplier_hint,
    reviewStatus: row.review_status,
    suggestedInvoiceId: row.suggested_invoice_id,
    linkedInvoiceId: row.linked_invoice_id,
    linkedExpenseId: row.linked_expense_id,
    postedAt: row.posted_at,
    sourceFileName: row.source_file_name,
  }
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const connectionId = url.searchParams.get("connectionId")
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000)

  const admin = createAdminClient()
  let query = admin
    .from("bank_transactions")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("booked_at", { ascending: false })
    .limit(limit)
  if (status && status !== "all") query = query.eq("review_status", status)
  if (connectionId) query = query.eq("connection_id", connectionId)

  const { data, error } = await query
  if (error) return jsonError(error.message, 400)
  return NextResponse.json({
    transactions: ((data ?? []) as BankTransactionRow[]).map(toPublic),
  })
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const pro = await canEditDocuments(auth.supabase, auth.user)
  if (!pro) return jsonError("Bank feed is a Pro feature", 403)

  const parsed = await readJson(request, actionSchema)
  if (!parsed.ok) return parsed.response

  try {
    const result = await postBankTransaction({
      orgId: auth.orgId,
      userId: auth.user.id,
      transactionId: parsed.data.transactionId,
      action: parsed.data.action,
      invoiceId: parsed.data.invoiceId,
      category: parsed.data.category,
    })
    return NextResponse.json(result)
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not update transaction", 400)
  }
}
