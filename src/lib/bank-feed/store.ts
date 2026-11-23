import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptBankToken, encryptBankToken } from "@/lib/bank-feed/tokens"
import { getBankFeedConfig } from "@/lib/bank-feed/config"
import {
  refreshTrueLayerToken,
  getTrueLayerAccounts,
  type TrueLayerAccount,
  type TrueLayerMe,
} from "@/lib/bank-feed/truelayer"
import type {
  BankTokens,
  BankConnectionRow,
  PostingMode,
  PublicBankConnection,
} from "@/lib/bank-feed/types"

export type BankConnection = BankConnectionRow

function toPublic(row: BankConnectionRow): PublicBankConnection {
  return {
    id: row.id,
    provider: row.provider,
    environment: row.environment,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountMask: row.account_mask,
    sortCode: row.sort_code,
    currency: row.currency,
    status: row.status,
    consentExpiresAt: row.consent_expires_at,
    postingMode: row.posting_mode,
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  }
}

function missingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    /could not find the table|relation .* does not exist/i.test(error.message ?? "")
  )
}

export async function getConnections(orgId: string): Promise<PublicBankConnection[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("bank_connections")
    .select("*")
    .eq("org_id", orgId)
    .order("connected_at", { ascending: false })

  if (error) {
    if (missingTable(error)) return []
    throw new Error(error.message)
  }
  return ((data ?? []) as BankConnectionRow[]).map(toPublic)
}

export async function getConnection(
  orgId: string,
  connectionId: string
): Promise<BankConnection | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    if (missingTable(error)) return null
    throw new Error(error.message)
  }
  return (data as BankConnection | null) ?? null
}

function accountMask(account: TrueLayerAccount): string | null {
  const number = account.account_number?.account_number
  if (!number) return null
  return number.slice(-4)
}

export async function saveTrueLayerConnection(params: {
  orgId: string
  userId: string
  tokens: BankTokens
  me: TrueLayerMe
}): Promise<number> {
  const config = getBankFeedConfig()
  const admin = createAdminClient()
  const { orgId, userId, tokens, me } = params
  const providerConnectionId =
    me.credentials_id ??
    createHash("sha256")
      .update(`${orgId}:${tokens.accessToken}`)
      .digest("hex")
      .slice(0, 32)

  const accounts = await getTrueLayerAccounts(tokens.accessToken)
  if (accounts.length === 0) {
    throw new Error("No bank accounts were returned by TrueLayer")
  }

  const bankName = me.provider?.display_name ?? "Bank account"
  const rows = accounts.map((account) => ({
    org_id: orgId,
    provider: "truelayer",
    environment: config.environment,
    provider_connection_id: providerConnectionId,
    provider_account_id: account.account_id ?? null,
    provider_name: me.provider?.provider_id ?? bankName,
    bank_name: bankName,
    account_name: account.display_name ?? null,
    account_mask: accountMask(account),
    sort_code: account.account_number?.sort_code ?? null,
    currency: account.currency ?? "GBP",
    status: "active",
    consent_expires_at: me.consent_expires_at ?? null,
    posting_mode: "review",
    access_token: encryptBankToken(tokens.accessToken),
    refresh_token: encryptBankToken(tokens.refreshToken),
    token_expires_at: tokens.expiresAt.toISOString(),
    scope: tokens.scope,
    connected_by: userId,
    connected_at: new Date().toISOString(),
    last_error: null,
    revoked_at: null,
  }))

  const { error } = await admin.from("bank_connections").upsert(rows, {
    onConflict: "org_id,provider,provider_connection_id,provider_account_id",
  })
  if (error) throw new Error(error.message)

  await logEvent({
    orgId,
    userId,
    eventType: "connected",
    details: { provider: "truelayer", accounts: rows.length },
  })
  return rows.length
}

/** Returns a usable access token, persisting refreshed tokens for every account. */
export async function getValidAccessToken(
  connection: BankConnection
): Promise<string> {
  if (!connection.access_token || !connection.refresh_token) {
    throw new Error("This bank connection no longer has access tokens")
  }
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0
  if (expiresAt - Date.now() > 60_000) {
    return decryptBankToken(connection.access_token)
  }

  const tokens = await refreshTrueLayerToken(
    decryptBankToken(connection.refresh_token)
  )
  const admin = createAdminClient()
  const patch = {
    access_token: encryptBankToken(tokens.accessToken),
    refresh_token: encryptBankToken(tokens.refreshToken),
    token_expires_at: tokens.expiresAt.toISOString(),
    scope: tokens.scope,
    status: "active",
    last_error: null,
  }

  let query = admin
    .from("bank_connections")
    .update(patch)
    .eq("org_id", connection.org_id)
    .eq("provider", connection.provider)
  if (connection.provider_connection_id) {
    query = query.eq(
      "provider_connection_id",
      connection.provider_connection_id
    )
  } else {
    query = query.eq("id", connection.id)
  }

  const { error } = await query
  if (error) throw new Error(error.message)
  return tokens.accessToken
}

export async function updatePostingMode(params: {
  orgId: string
  connectionId: string
  postingMode: PostingMode
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("bank_connections")
    .update({ posting_mode: params.postingMode })
    .eq("id", params.connectionId)
    .eq("org_id", params.orgId)
  if (error) throw new Error(error.message)

  await logEvent({
    orgId: params.orgId,
    connectionId: params.connectionId,
    eventType: "posting_mode_changed",
    details: { postingMode: params.postingMode },
  })
}

export async function revokeConnection(params: {
  orgId: string
  connectionId: string
  userId: string
}): Promise<void> {
  const admin = createAdminClient()
  const target = await getConnection(params.orgId, params.connectionId)
  if (!target) throw new Error("Bank connection not found")

  let query = admin
    .from("bank_connections")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      access_token: null,
      refresh_token: null,
      last_error: null,
    })
    .eq("org_id", params.orgId)
  if (target.provider_connection_id) {
    query = query
      .eq("provider", target.provider)
      .eq("provider_connection_id", target.provider_connection_id)
  } else {
    query = query.eq("id", params.connectionId)
  }

  const { error } = await query
  if (error) throw new Error(error.message)

  await logEvent({
    orgId: params.orgId,
    connectionId: params.connectionId,
    userId: params.userId,
    eventType: "revoked",
    details: {},
  })
}

export async function markSyncResult(params: {
  connectionId: string
  orgId: string
  error?: string | null
  count?: number
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("bank_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: params.error ?? null,
      status: params.error ? "error" : "active",
    })
    .eq("id", params.connectionId)
    .eq("org_id", params.orgId)
  if (error) throw new Error(error.message)

  if (params.error) {
    await logEvent({
      orgId: params.orgId,
      connectionId: params.connectionId,
      eventType: "sync_failed",
      details: { error: params.error.slice(0, 500) },
    })
  } else {
    await logEvent({
      orgId: params.orgId,
      connectionId: params.connectionId,
      eventType: "synced",
      details: { createdOrUpdated: params.count ?? 0 },
    })
  }
}

export async function ensureFileConnection(params: {
  orgId: string
  userId: string
  provider: "csv" | "ofx"
}): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("bank_connections")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("provider", params.provider)
    .eq("provider_account_id", "file-import")
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data, error } = await admin
    .from("bank_connections")
    .insert({
      org_id: params.orgId,
      provider: params.provider,
      environment: "file",
      provider_connection_id: `${params.orgId}-${params.provider}`,
      provider_account_id: "file-import",
      bank_name: params.provider === "csv" ? "CSV statement" : "OFX statement",
      account_name: "Imported statement",
      currency: "GBP",
      status: "active",
      posting_mode: "review",
      connected_by: params.userId,
      last_synced_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function logEvent(params: {
  orgId: string
  connectionId?: string
  transactionId?: string
  userId?: string
  eventType: string
  details: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("bank_feed_events").insert({
    org_id: params.orgId,
    connection_id: params.connectionId ?? null,
    transaction_id: params.transactionId ?? null,
    created_by: params.userId ?? null,
    event_type: params.eventType,
    details: params.details,
  })
  // The event log must never block a connection or sync if the audit table is
  // not available yet.
  if (error) console.error("Bank feed event log failed", error.message)
}
