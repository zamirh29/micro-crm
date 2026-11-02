import { createAdminClient } from "@/lib/supabase/admin"
import { getHmrcConfig, type HmrcEnvironment } from "@/lib/hmrc/config"
import { refreshAccessToken, type HmrcTokens } from "@/lib/hmrc/client"
import { decryptToken, encryptToken } from "@/lib/hmrc/tokens"

export interface HmrcConnection {
  orgId: string
  environment: HmrcEnvironment
  vrn: string
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
  connectedAt: string
}

interface ConnectionRow {
  org_id: string
  environment: HmrcEnvironment
  vrn: string
  access_token: string
  refresh_token: string
  token_expires_at: string
  scope: string
  connected_at: string
}

function hydrate(row: ConnectionRow): HmrcConnection {
  return {
    orgId: row.org_id,
    environment: row.environment,
    vrn: row.vrn,
    accessToken: decryptToken(row.access_token),
    refreshToken: decryptToken(row.refresh_token),
    expiresAt: new Date(row.token_expires_at),
    scope: row.scope,
    connectedAt: row.connected_at,
  }
}

export async function getConnection(orgId: string): Promise<HmrcConnection | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("hmrc_connections")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    // Table missing (migration not applied) should not crash the settings page.
    const missingTable =
      error.code === "PGRST205" ||
      /could not find the table|relation .* does not exist/i.test(error.message)
    if (missingTable) return null
    throw new Error(error.message)
  }

  if (!data) return null
  return hydrate(data as ConnectionRow)
}

export async function saveConnection(params: {
  orgId: string
  vrn: string
  tokens: HmrcTokens
  connectedBy: string
  scope?: string
}): Promise<void> {
  const { orgId, vrn, tokens, connectedBy } = params
  const admin = createAdminClient()
  const config = getHmrcConfig()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const { error } = await admin.from("hmrc_connections").upsert(
    {
      org_id: orgId,
      environment: config.environment,
      vrn,
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      token_expires_at: expiresAt,
      scope: params.scope ?? tokens.scope,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  )

  if (error) throw new Error(error.message)
}

export async function deleteConnection(orgId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("hmrc_connections")
    .delete()
    .eq("org_id", orgId)

  if (error) throw new Error(error.message)
}

/**
 * Returns a usable access token, refreshing it first when it is within a minute
 * of expiry. Refreshed tokens are persisted so the new refresh token is kept.
 */
export async function getValidAccessToken(
  connection: HmrcConnection
): Promise<string> {
  if (connection.expiresAt.getTime() - Date.now() > 60_000) {
    return connection.accessToken
  }

  const tokens = await refreshAccessToken(connection.refreshToken)
  const admin = createAdminClient()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const { error } = await admin
    .from("hmrc_connections")
    .update({
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      token_expires_at: expiresAt,
    })
    .eq("org_id", connection.orgId)

  if (error) throw new Error(error.message)
  return tokens.access_token
}
