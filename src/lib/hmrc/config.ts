export type HmrcEnvironment = "sandbox" | "production"

export interface HmrcConfig {
  environment: HmrcEnvironment
  apiBase: string
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  configured: boolean
}

/**
 * HMRC endpoints. Sandbox and production are separate hosts, so everything
 * reads from the same config to make switching environments a one-line change.
 */
export function getHmrcConfig(): HmrcConfig {
  const environment: HmrcEnvironment =
    process.env.HMRC_ENVIRONMENT === "production" ? "production" : "sandbox"

  const apiBase =
    environment === "production"
      ? "https://api.service.hmrc.gov.uk"
      : "https://test-api.service.hmrc.gov.uk"

  const authorizeHost =
    environment === "production"
      ? "https://www.tax.service.gov.uk"
      : "https://test-www.tax.service.gov.uk"

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "")

  const clientId = process.env.HMRC_CLIENT_ID ?? ""
  const clientSecret = process.env.HMRC_CLIENT_SECRET ?? ""
  const redirectUri =
    process.env.HMRC_REDIRECT_URI ??
    (appUrl ? `${appUrl.replace(/\/$/, "")}/api/hmrc/auth/callback` : "")

  return {
    environment,
    apiBase,
    authorizeUrl: `${authorizeHost}/oauth/authorize`,
    tokenUrl: `${apiBase}/oauth/token`,
    clientId,
    clientSecret,
    redirectUri,
    scope: "read:vat write:vat",
    configured: Boolean(clientId && clientSecret && redirectUri),
  }
}

export const HMRC_VAT_API = "/organisations/vat"
