import { getHmrcConfig } from "@/lib/hmrc/config"
import { fraudPreventionHeaders } from "@/lib/hmrc/fraud-prevention"

export interface HmrcTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
}

export interface VatObligation {
  periodKey: string
  start: string
  end: string
  due: string
  status: "O" | "F"
  received?: string
}

export interface VatReturnPayload {
  periodKey: string
  vatDueSales: number
  vatDueAcquisitions: number
  totalVatDue: number
  vatReclaimedCurrPeriod: number
  netVatDue: number
  totalValueSalesExVAT: number
  totalValuePurchasesExVAT: number
  totalValueGoodsSuppliedExVAT: number
  totalAcquisitionsExVAT: number
  finalised: boolean
}

const VAT_ACCEPT = "application/vnd.hmrc.1.0+json"

function basicAuth(): string {
  const { clientId, clientSecret } = getHmrcConfig()
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
}

function requireConfigured() {
  const config = getHmrcConfig()
  if (!config.configured) {
    throw new Error(
      "HMRC is not configured. Set HMRC_CLIENT_ID, HMRC_CLIENT_SECRET and HMRC_REDIRECT_URI."
    )
  }
  return config
}

export function buildAuthorizeUrl(state: string): string {
  const config = requireConfigured()
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
  })
  return `${config.authorizeUrl}?${params.toString()}`
}

export async function exchangeAuthorizationCode(code: string): Promise<HmrcTokens> {
  const config = requireConfigured()
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  })

  const json = (await response.json()) as HmrcTokens & {
    error?: string
    error_description?: string
  }

  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? json.error ?? "Could not exchange the HMRC authorisation code"
    )
  }

  return json
}

export async function refreshAccessToken(refreshToken: string): Promise<HmrcTokens> {
  const config = requireConfigured()
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  })

  const json = (await response.json()) as HmrcTokens & {
    error?: string
    error_description?: string
  }

  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? json.error ?? "Could not refresh the HMRC access token"
    )
  }

  return json
}

interface HmrcRequestOptions {
  method?: "GET" | "POST"
  body?: unknown
  request: Request
  userId: string
}

async function hmrcFetch<T>(
  path: string,
  accessToken: string,
  options: HmrcRequestOptions
): Promise<T> {
  const config = getHmrcConfig()
  const response = await fetch(`${config.apiBase}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: VAT_ACCEPT,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...fraudPreventionHeaders(options.request, { userId: options.userId }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  })

  const text = await response.text()
  const json = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message =
      (json && (json.message ?? json.error_description ?? json.error)) ||
      `HMRC returned ${response.status}`
    throw new Error(message)
  }

  return json as T
}

export async function getVatObligations(params: {
  accessToken: string
  vrn: string
  from: string
  to: string
  status?: "O" | "F"
  request: Request
  userId: string
}): Promise<{ obligations: VatObligation[] }> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    ...(params.status ? { status: params.status } : {}),
  })
  return hmrcFetch(
    `/organisations/vat/${params.vrn}/obligations?${query.toString()}`,
    params.accessToken,
    { request: params.request, userId: params.userId }
  )
}

export async function getVatReturn(params: {
  accessToken: string
  vrn: string
  periodKey: string
  request: Request
  userId: string
}): Promise<VatReturnPayload> {
  return hmrcFetch(
    `/organisations/vat/${params.vrn}/returns/${encodeURIComponent(params.periodKey)}`,
    params.accessToken,
    { request: params.request, userId: params.userId }
  )
}

export async function submitVatReturn(params: {
  accessToken: string
  vrn: string
  payload: VatReturnPayload
  request: Request
  userId: string
}): Promise<{ processingDate: string; formBundleNumber: string; paymentIndicator?: string }> {
  return hmrcFetch(
    `/organisations/vat/${params.vrn}/returns`,
    params.accessToken,
    {
      method: "POST",
      body: params.payload,
      request: params.request,
      userId: params.userId,
    }
  )
}
