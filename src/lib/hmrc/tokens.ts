import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto"

/**
 * HMRC OAuth tokens are long-lived credentials for a business's tax account,
 * so they are encrypted before being written to Postgres.
 *
 * Set HMRC_TOKEN_ENCRYPTION_KEY to a 32-byte value (64 hex chars or base64).
 * If it is missing we derive a key from the service role key so local/dev
 * setups keep working — production deployments should set the real key.
 */

const VERSION = "v1"

function encryptionKey(): Buffer {
  const configured = process.env.HMRC_TOKEN_ENCRYPTION_KEY
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
      "HMRC_TOKEN_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set"
    )
  }
  return createHash("sha256").update(`hmrc:${fallback}`).digest()
}

export function encryptToken(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    "."
  )
}

export function decryptToken(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".")
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported token format")
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
