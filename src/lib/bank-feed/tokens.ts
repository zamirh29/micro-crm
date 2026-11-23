import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto"

/**
 * Bank provider tokens are long-lived credentials for a user's financial data,
 * so they are encrypted before they reach Postgres. Set
 * BANK_FEED_ENCRYPTION_KEY to 64 hex characters or a base64-encoded 32-byte key.
 */
const VERSION = "bank-v1"

function encryptionKey(): Buffer {
  const configured = process.env.BANK_FEED_ENCRYPTION_KEY
  if (configured) {
    if (/^[0-9a-fA-F]{64}$/.test(configured)) {
      return Buffer.from(configured, "hex")
    }
    const decoded = Buffer.from(configured, "base64")
    if (decoded.length === 32) return decoded
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!fallback) {
    throw new Error(
      "BANK_FEED_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set"
    )
  }
  return createHash("sha256").update(`bank-feed:${fallback}`).digest()
}

export function encryptBankToken(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".")
}

export function decryptBankToken(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".")
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported bank token format")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
