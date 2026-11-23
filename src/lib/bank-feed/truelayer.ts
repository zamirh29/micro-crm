import { createHash } from "crypto"
import { getBankFeedConfig } from "@/lib/bank-feed/config"
import type { BankTokens, NormalisedBankTransaction } from "@/lib/bank-feed/types"

interface TrueLayerTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type?: string
}

export interface TrueLayerMe {
  credentials_id?: string
  consent_expires_at?: string
  provider?: {
    display_name?: string
    provider_id?: string
    logo_url?: string
  }
  scopes?: string[]
}

export interface TrueLayerAccount {
  account_id?: string
  display_name?: string
  currency?: string
  account_number?: {
    account_number?: string
    sort_code?: string
  }
}

interface TrueLayerTransaction {
  transaction_id?: string
  normalised_provider_transaction_id?: string
  provider_transaction_id?: string
  timestamp?: string
  booked_at?: string
  description?: string
  merchant_name?: string
  amount?: number | string
  currency?: string
  transaction_type?: string
  balance?: number | string
  meta?: Record<string, unknown>
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`TrueLayer request failed (${response.status}): ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error("TrueLayer returned an invalid JSON response")
  }
}

export function buildTrueLayerAuthUrl(state: string): string {
  const config = getBankFeedConfig()
  const url = new URL(config.authUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("scope", config.scope)
  url.searchParams.set("state", state)
  url.searchParams.set("country", "gb")
  // TrueLayer requires at least one provider to be selected. Sandbox uses the
  // dedicated mock provider; live uses all UK Open Banking and OAuth banks.
  url.searchParams.set(
    "providers",
    config.environment === "sandbox"
      ? "uk-cs-mock"
      : "uk-ob-all uk-oauth-all"
  )
  return url.toString()
}

async function requestToken(body: Record<string, string>): Promise<BankTokens> {
  const config = getBankFeedConfig()
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...body,
  })
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  })
  const data = await readJson<TrueLayerTokenResponse>(response)
  if (!data.access_token) {
    throw new Error("TrueLayer did not return an access token")
  }
  if (!data.refresh_token) {
    throw new Error(
      "TrueLayer did not return a refresh token. Check that offline_access is enabled."
    )
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? getBankFeedConfig().scope,
  }
}

export function exchangeTrueLayerCode(code: string): Promise<BankTokens> {
  const config = getBankFeedConfig()
  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  })
}

export function refreshTrueLayerToken(refreshToken: string): Promise<BankTokens> {
  return requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
}

async function dataRequest<T>(path: string, accessToken: string): Promise<T> {
  const config = getBankFeedConfig()
  const response = await fetch(`${config.apiBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  return readJson<T>(response)
}

export function getTrueLayerMe(accessToken: string): Promise<TrueLayerMe> {
  return dataRequest<TrueLayerMe>("/me", accessToken)
}

export async function getTrueLayerAccounts(
  accessToken: string
): Promise<TrueLayerAccount[]> {
  const data = await dataRequest<{ results?: TrueLayerAccount[] }>(
    "/accounts",
    accessToken
  )
  return data.results ?? []
}

export async function getTrueLayerTransactions(
  accessToken: string,
  accountId: string,
  from: string,
  to: string
): Promise<NormalisedBankTransaction[]> {
  const params = new URLSearchParams({ from, to })
  const data = await dataRequest<{
    results?: TrueLayerTransaction[]
    transactions?: TrueLayerTransaction[]
  }>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?${params.toString()}`,
    accessToken
  )
  const rows = data.results ?? data.transactions ?? []
  return rows.map((row) => normaliseTrueLayerTransaction(accountId, row))
}

export function normaliseTrueLayerTransaction(
  accountId: string,
  row: TrueLayerTransaction
): NormalisedBankTransaction {
  const rawId =
    row.normalised_provider_transaction_id ??
    row.provider_transaction_id ??
    row.transaction_id ??
    hashId(
      [
        accountId,
        row.timestamp ?? row.booked_at ?? "",
        row.description ?? "",
        String(row.amount ?? ""),
      ].join("|")
    )

  const numericAmount = Math.abs(Number(row.amount ?? 0))
  const type = (row.transaction_type ?? "").toLowerCase()
  let direction: NormalisedBankTransaction["direction"] = "money_out"
  let signedAmount = -numericAmount
  if (type.includes("transfer")) {
    direction = "transfer"
  } else if (type.includes("credit") || Number(row.amount) > 0) {
    direction = "money_in"
    signedAmount = numericAmount
  } else if (type.includes("debit")) {
    direction = "money_out"
    signedAmount = -numericAmount
  }

  const description = [row.merchant_name, row.description]
    .filter(Boolean)
    .join(" ")
    .trim() || "Bank transaction"

  return {
    providerTransactionId: row.transaction_id ?? rawId,
    normalisedProviderTransactionId: rawId,
    bookedAt: row.timestamp ?? row.booked_at ?? new Date().toISOString(),
    description,
    amount: signedAmount,
    direction,
    currency: row.currency ?? "GBP",
    balance: row.balance === undefined ? null : Number(row.balance),
    categoryHint: null,
    supplierHint: row.merchant_name ?? null,
    metadata: {
      transactionType: row.transaction_type ?? null,
      accountId,
      ...(row.meta ?? {}),
    },
  }
}
