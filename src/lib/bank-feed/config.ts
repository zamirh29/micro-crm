import type { BankFeedEnvironment } from "@/lib/bank-feed/types"

export interface BankFeedConfig {
  environment: Exclude<BankFeedEnvironment, "file">
  authUrl: string
  tokenUrl: string
  apiBase: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  configured: boolean
}

/**
 * TrueLayer Data API v1 endpoints. Sandbox and production use separate hosts,
 * so everything reads from here to make switching environments a one-line
 * change in Vercel.
 */
export function getBankFeedConfig(): BankFeedConfig {
  const environment: Exclude<BankFeedEnvironment, "file"> =
    process.env.TRUELAYER_ENVIRONMENT === "production" ? "production" : "sandbox"

  const authUrl =
    environment === "production"
      ? "https://auth.truelayer.com"
      : "https://auth.truelayer-sandbox.com"
  const apiBase =
    environment === "production"
      ? "https://api.truelayer.com/data/v1"
      : "https://api.truelayer-sandbox.com/data/v1"

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "")

  const clientId = process.env.TRUELAYER_CLIENT_ID ?? ""
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET ?? ""
  const redirectUri =
    process.env.TRUELAYER_REDIRECT_URI ??
    (appUrl
      ? `${appUrl.replace(/\/$/, "")}/api/bank-feed/callback/truelayer`
      : "")

  return {
    environment,
    authUrl,
    tokenUrl: `${authUrl}/connect/token`,
    apiBase,
    clientId,
    clientSecret,
    redirectUri,
    scope: "info accounts balance transactions offline_access",
    configured: Boolean(clientId && clientSecret && redirectUri),
  }
}

export const BANK_FEED_CONNECT_PATH = "/api/bank-feed/connect"
export const BANK_FEED_PAGE_PATH = "/dashboard/bank-feed"
