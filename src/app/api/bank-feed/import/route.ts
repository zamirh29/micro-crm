import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson } from "@/lib/api-utils"
import { uniqueByKey } from "@/lib/bank-feed/dedupe"
import { parseBankStatement } from "@/lib/bank-feed/import-parser"
import { suggestBankMatch } from "@/lib/bank-feed/matching"
import { ensureFileConnection, logEvent } from "@/lib/bank-feed/store"
import { canEditDocuments } from "@/lib/subscription"

export const dynamic = "force-dynamic"

const schema = z.object({
  fileName: z.string().min(1).max(255),
  content: z.string().min(1).max(10_000_000),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const pro = await canEditDocuments(auth.supabase, auth.user)
  if (!pro) return jsonError("Bank statement import is a Pro feature", 403)

  const parsed = await readJson(request, schema)
  if (!parsed.ok) return parsed.response

  try {
    const statement = parseBankStatement(parsed.data.content, parsed.data.fileName)
    if (statement.rows.length === 0) {
      return jsonError(
        "No transactions were found. Use a CSV with Date, Description and Amount columns or an OFX statement.",
        400
      )
    }

    const connectionId = await ensureFileConnection({
      orgId: auth.orgId,
      userId: auth.user.id,
      provider: statement.provider,
    })
    const admin = createAdminClient()
    const prepared = await Promise.all(
      statement.rows.map(async (txn) => {
        const suggestion = await suggestBankMatch(admin, auth.orgId, txn)
        return {
          org_id: auth.orgId,
          connection_id: connectionId,
          provider: statement.provider,
          provider_transaction_id: txn.providerTransactionId,
          normalised_provider_transaction_id: txn.normalisedProviderTransactionId,
          booked_at: new Date(txn.bookedAt).toISOString(),
          description: txn.description.slice(0, 1000),
          amount: Math.round(txn.amount * 100) / 100,
          direction: txn.direction,
          currency: txn.currency,
          balance: txn.balance,
          category_hint: suggestion.categoryHint ?? txn.categoryHint,
          supplier_hint: suggestion.supplierHint ?? txn.supplierHint,
          review_status:
            suggestion.confidence === "none" ? "unreviewed" : "suggested",
          posting_mode_at_import: "review",
          suggested_invoice_id: suggestion.invoiceId,
          source_file_name: parsed.data.fileName.slice(0, 255),
          metadata: txn.metadata,
        }
      })
    )

    const deduped = uniqueByKey(
      prepared,
      (row) => row.normalised_provider_transaction_id
    )
    const skipped = statement.skipped + (prepared.length - deduped.length)

    const { error } = await admin.from("bank_transactions").upsert(deduped, {
      onConflict: "org_id,provider,normalised_provider_transaction_id",
    })
    if (error) throw new Error(error.message)

    await logEvent({
      orgId: auth.orgId,
      connectionId,
      userId: auth.user.id,
      eventType: "statement_imported",
      details: {
        fileName: parsed.data.fileName,
        provider: statement.provider,
        imported: deduped.length,
        skipped,
      },
    })

    return NextResponse.json({
      imported: deduped.length,
      skipped,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Statement import failed", 400)
  }
}
