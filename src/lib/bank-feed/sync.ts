import { createAdminClient } from "@/lib/supabase/admin"
import { getBankFeedConfig } from "@/lib/bank-feed/config"
import { uniqueByKey } from "@/lib/bank-feed/dedupe"
import { suggestBankMatch } from "@/lib/bank-feed/matching"
import { postBankTransaction } from "@/lib/bank-feed/posting"
import {
  getConnection,
  getValidAccessToken,
  markSyncResult,
} from "@/lib/bank-feed/store"
import { getTrueLayerTransactions } from "@/lib/bank-feed/truelayer"
import type { BankConnection } from "@/lib/bank-feed/store"
import type { NormalisedBankTransaction } from "@/lib/bank-feed/types"

function dateDaysAgo(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export async function syncConnection(params: {
  orgId: string
  connectionId: string
  days?: number
}): Promise<{ imported: number; posted: number }> {
  const connection = await getConnection(params.orgId, params.connectionId)
  if (!connection) throw new Error("Bank connection not found")
  if (connection.status === "revoked") {
    throw new Error("This bank connection has been revoked")
  }
  if (connection.provider !== "truelayer") {
    return { imported: 0, posted: 0 }
  }

  const config = getBankFeedConfig()
  if (!config.configured) {
    throw new Error("TrueLayer is not configured on this deployment")
  }
  if (!connection.provider_account_id) {
    throw new Error("This bank connection has no account identifier")
  }

  try {
    const accessToken = await getValidAccessToken(connection)
    const raw = await getTrueLayerTransactions(
      accessToken,
      connection.provider_account_id,
      dateDaysAgo(params.days ?? 90),
      new Date().toISOString().slice(0, 10)
    )

    const prepared = await Promise.all(
      raw.map(async (txn) => buildTransactionRow(connection, txn))
    )
    const deduped = uniqueByKey(prepared, (item) => item.key)
    const confidenceByKey = new Map(
      deduped.map((item) => [item.key, item.confidence])
    )
    const rows = deduped.map((item) => item.row)

    const admin = createAdminClient()
    const { data: saved, error } = await admin
      .from("bank_transactions")
      .upsert(rows, {
        onConflict: "org_id,provider,normalised_provider_transaction_id",
      })
      .select(
        "id, normalised_provider_transaction_id, direction, review_status, suggested_invoice_id, category_hint"
      )
    if (error) throw new Error(error.message)

    let posted = 0
    if (connection.posting_mode !== "review") {
      for (const row of saved ?? []) {
        if (row.review_status === "posted" || row.review_status === "ignored") continue
        const confidence = confidenceByKey.get(
          row.normalised_provider_transaction_id as string
        )
        const shouldPost =
          connection.posting_mode === "auto_all" ||
          (connection.posting_mode === "auto_exact" && confidence === "exact")
        if (!shouldPost) continue
        const result = await postBankTransaction({
          orgId: connection.org_id,
          userId: connection.connected_by ?? params.orgId,
          transactionId: row.id,
          action: "post",
          invoiceId: row.suggested_invoice_id,
          category: row.category_hint,
        })
        if (result.status === "posted") posted += 1
      }
    }

    await markSyncResult({
      orgId: connection.org_id,
      connectionId: connection.id,
      count: saved?.length ?? 0,
    })
    return { imported: saved?.length ?? 0, posted }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bank sync failed"
    await markSyncResult({
      orgId: connection.org_id,
      connectionId: connection.id,
      error: message,
    })
    throw err
  }
}

async function buildTransactionRow(
  connection: BankConnection,
  txn: NormalisedBankTransaction
) {
  const admin = createAdminClient()
  const suggestion = await suggestBankMatch(admin, connection.org_id, txn)
  const isTransfer =
    suggestion.isTransfer || txn.direction === "transfer"
  const reviewStatus =
    suggestion.confidence === "exact" || suggestion.confidence === "high"
      ? "suggested"
      : "unreviewed"

  return {
    key: txn.normalisedProviderTransactionId,
    confidence: suggestion.confidence,
    row: {
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      provider_transaction_id: txn.providerTransactionId,
      normalised_provider_transaction_id: txn.normalisedProviderTransactionId,
      booked_at: new Date(txn.bookedAt).toISOString(),
      description: txn.description.slice(0, 1000),
      amount: Math.round(txn.amount * 100) / 100,
      direction: isTransfer ? "transfer" : txn.direction,
      currency: txn.currency,
      balance: txn.balance,
      category_hint: suggestion.categoryHint,
      supplier_hint: suggestion.supplierHint,
      review_status: reviewStatus,
      posting_mode_at_import: connection.posting_mode,
      suggested_invoice_id: suggestion.invoiceId,
      metadata: txn.metadata,
    },
  }
}
