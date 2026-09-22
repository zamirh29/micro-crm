/**
 * One-time Stripe setup script for MicroCRM.
 *
 * Creates the Pro product + recurring £8/month price and prints the IDs
 * and webhook signing secret you need for your .env.local file.
 *
 * The Stripe secret key is read from the STRIPE_SECRET_KEY env var or
 * prompted interactively. It is NEVER hardcoded in this file.
 *
 * Usage:
 *   1. Add to .env.local (git-ignored):
 *        STRIPE_SECRET_KEY=sk_test_...  or  sk_live_...
 *   2. Run:
 *        node scripts/setup-stripe.mjs
 *
 * The key is also picked up from the STRIPE_SECRET_KEY env var if set.
 * It is NEVER hardcoded in this file.
 * After running, copy the printed values into .env.local:
 *   STRIPE_PRO_PRICE_ID=price_...
 *   STRIPE_SECRET_KEY=sk_...           (test key for local dev)
 *   STRIPE_WEBHOOK_SECRET=whsec_...    (from webhook setup below)
 */

import Stripe from "stripe"
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

// ---------------------------------------------------------------------------
// Load KEY=VALUE pairs from .env.local into process.env (only if not already
// set). This lets you put STRIPE_SECRET_KEY=sk_... in .env.local (git-ignored)
// and never have to paste it into a prompt.
// ---------------------------------------------------------------------------
function loadDotEnvLocal() {
  const envPath = resolve(".env.local")
  if (!existsSync(envPath)) return

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eq = trimmed.indexOf("=")
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()

    // Strip surrounding quotes (single or double).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnvLocal()

// ---------------------------------------------------------------------------
// Key resolution: .env.local > env var > prompt (not echoed).
// ---------------------------------------------------------------------------
async function getSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY

  const rl = readline.createInterface({ input, output })
  const answer = await rl.question(
    "Paste your Stripe SECRET key (sk_test_... or sk_live_...): "
  )
  rl.close()
  return answer.trim()
}

const secretKey = await getSecretKey()

if (!secretKey || !/(^sk_(test|live)_)/.test(secretKey)) {
  console.error("Invalid Stripe secret key. Expected sk_test_... or sk_live_...")
  process.exit(1)
}

const stripe = new Stripe(secretKey)

console.log("Creating Pro product and price...\n")

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------
const product = await stripe.products.create({
  name: "Pro",
  description:
    "Unlimited leads & invoices, unlimited quotes, automated reminders, custom branding, email templates, priority support.",
})

// ---------------------------------------------------------------------------
// Recurring price: £8/month (amount in pennies)
// ---------------------------------------------------------------------------
const price = await stripe.prices.create({
  product: product.id,
  unit_amount: 800, // £8.00
  currency: "gbp",
  recurring: { interval: "month" },
})

console.log("Created product:  Pro")
console.log(`Product ID:      ${product.id}\n`)
console.log(`PRICE FOR .env.local:`)
console.log(`STRIPE_PRO_PRICE_ID=${price.id}\n`)

// ---------------------------------------------------------------------------
// Webhook guidance (cannot be created programmatically without the webhook
// secret; the signing secret is only shown in the Dashboard).
// ---------------------------------------------------------------------------
console.log("NEXT STEPS — Webhook (in Stripe Dashboard -> Developers -> Webhooks):")
console.log("  1. Add endpoint (test or live).")
console.log("  2. URL: https://crm.dtmstechsolutions.co.uk/api/webhooks/stripe")
console.log("  3. Events: checkout.session.completed,")
console.log("             customer.subscription.updated,")
console.log("             customer.subscription.deleted,")
console.log("             invoice.payment_failed")
console.log("  4. Copy the signing secret (whsec_...) into .env.local as")
console.log("     STRIPE_WEBHOOK_SECRET=whsec_...\n")

console.log("Set in .env.local:")
console.log(`STRIPE_SECRET_KEY=${secretKey}`)
console.log("  (use sk_test_... for local dev, sk_live_... for production)")

console.log("\nDone. To run this locally you will also need the stripe package,")
console.log("which is already a dependency of this project.")
