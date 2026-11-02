import { createHash } from "crypto"

/**
 * HMRC Fraud Prevention Headers.
 *
 * Every HMRC API call must carry these headers. HMRC validates their presence
 * and format, and rejects requests without them in production.
 *
 * Values are percent-encoded and then base64 encoded where HMRC requires it.
 * Where the browser can supply better data (screen size, local IPs) the caller
 * can pass it in; otherwise safe server-side defaults are used.
 *
 * See: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
 */

export interface BrowserTelemetry {
  screens?: string
  windowSize?: string
  timezone?: string
  userAgent?: string
  localIps?: string[]
  localIpsTimestamp?: string
}

function encode(value: string): string {
  return Buffer.from(encodeURIComponent(value), "utf8").toString("base64")
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function uuidFromHash(hash: string): string {
  const h = hash.padEnd(32, "0")
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `a${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-")
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  const candidate = forwarded?.split(",")[0]?.trim()
  if (candidate && candidate !== "::1" && candidate !== "127.0.0.1") {
    return candidate
  }
  return null
}

export function fraudPreventionHeaders(
  request: Request,
  options: { userId: string; vendorVersion?: string; telemetry?: BrowserTelemetry }
): Record<string, string> {
  const telemetry = options.telemetry ?? {}
  const userAgent = telemetry.userAgent ?? request.headers.get("user-agent") ?? ""
  const ip = clientIp(request)
  const hash = sha256(`${ip ?? "unknown"}|${userAgent}`)

  const headers: Record<string, string> = {
    "gov-client-connection-method": "WEB_APP_VIA_SERVER",
    "gov-client-device-id": uuidFromHash(hash),
    "gov-client-user-ids": encode(sha256(options.userId)),
    "gov-client-timezone": encode(telemetry.timezone ?? "UTC"),
    "gov-client-screens": encode(telemetry.screens ?? "1920x1080x24"),
    "gov-client-window-size": encode(telemetry.windowSize ?? "1920x1080"),
    "gov-client-browser-js-user-agent": encode(userAgent),
    "gov-client-local-ips": encode(
      (telemetry.localIps?.length ? telemetry.localIps : ["127.0.0.1"]).join(",")
    ),
    "gov-client-local-ips-timestamp": encode(
      telemetry.localIpsTimestamp ?? new Date().toISOString()
    ),
    "gov-vendor-version": encode(
      options.vendorVersion ?? `microcrm_${process.env.npm_package_version ?? "1.0.0"}`
    ),
  }

  if (ip) headers["gov-client-public-ip"] = ip

  const port = request.headers.get("x-forwarded-port")
  if (port) headers["gov-client-public-port"] = port

  return headers
}
