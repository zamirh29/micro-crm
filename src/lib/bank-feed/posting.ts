import { createAdminClient } from "@/lib/supabase/admin"
import { createExpenseRecord } from "@/lib/expenses"
import { markInvoicePaidRecord } from "@/lib/documents"
import { logEvent } from "@/lib/bank-feed/store"
import type { BankTransactionRow } from "@/lib/bank-feed/types"

export interface PostTransactionResult {
  status: "posted" | "ignored" | "needs_review"
  message: string
}

export async function postBankTransaction(params: {
  orgId: string
  userId: string
  transactionId: string
  action: "post" | "ignore"
  invoiceId?: string | null
  category?: string | null
}): Promise<PostTransactionResult> {
  const admin = createAdminClient()
  const { orgId, userId, transactionId, action } = params

  const { data: txn, error } = await admin
    .from("bank_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!txn) throw new Error("Bank transaction not found")

  const row = txn as BankTransactionRow

  if (action === "ignore") {
    const { error: updateError } = await admin
      .from("bank_transactions")
      .update({ review_status: "ignored" })
      .eq("id", row.id)
      .eq("org_id", orgId)
    if (updateError) throw new Error(updateError.message)
    await logEvent({
      orgId,
      userId,
      connectionId: row.connection_id,
      transactionId: row.id,
      eventType: "ignored",
      details: {},
    })
    return { status: "ignored", message: "Transaction ignored." }
  }

  const invoiceId = params.invoiceId ?? row.suggested_invoice_id
  let linkedInvoiceId: string | null = null
  let linkedExpenseId: string | null = null
  let message = "Transaction posted."

  if (invoiceId) {
    await markInvoicePaidRecord(admin, { userId, id: invoiceId })
    linkedInvoiceId = invoiceId
    message = "Invoice marked as paid."
  } else if (row.direction === "money_out") {
    const expense = await createExpenseRecord(admin, {
      orgId,
      userId,
      input: {
        incurred_on: new Date(row.booked_at).toISOString().slice(0, 10),
        category: params.category ?? row.category_hint ?? "Other",
        description:
          `${row.description}${row.supplier_hint ? ` — ${row.supplier_hint}` : ""}`.slice(
            0,
            500
          ),
        amount: Math.abs(Number(row.amount)),
      },
    })
    linkedExpenseId = expense.id
    message = "Expense created."
  } else {
    const { error: reviewError } = await admin
      .from("bank_transactions")
      .update({ review_status: "needs_review" })
      .eq("id", row.id)
      .eq("org_id", orgId)
    if (reviewError) throw new Error(reviewError.message)
    await logEvent({
      orgId,
      userId,
      connectionId: row.connection_id,
      transactionId: row.id,
      eventType: "needs_review",
      details: { reason: "unallocated_money_in" },
    })
    return {
      status: "needs_review",
      message: "Choose an invoice before posting this receipt.",
    }
  }

  const { error: updateError } = await admin
    .from("bank_transactions")
    .update({
      review_status: "posted",
      linked_invoice_id: linkedInvoiceId,
      linked_expense_id: linkedExpenseId,
      posted_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("org_id", orgId)
  if (updateError) throw new Error(updateError.message)

  await logEvent({
    orgId,
    userId,
    connectionId: row.connection_id,
    transactionId: row.id,
    eventType: "posted",
    details: {
      linkedInvoiceId,
      linkedExpenseId,
      amount: Number(row.amount),
    },
  })

  return { status: "posted", message }
}
