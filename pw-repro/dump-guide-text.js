// TEMPORARY: dumps the visible text of each guide screenshot target so the
// copy can be verified against the real UI without eyeballing the PNGs.
//   node dump-guide-text.js
const { chromium } = require("playwright");
const { getClient } = require("./db");

const BASE = process.env.BASE_URL || "http://localhost:3111";
const EMAIL = "pwa-test-1301678156@example.com";
const PASSWORD = "PwaTest123!";

async function fixtureIds() {
  const sb = getClient();
  const pick = async (t, c, v) => {
    const { data, error } = await sb.from(t).select("id").eq(c, v).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`missing ${t} ${v}`);
    return data.id;
  };
  return {
    contact: await pick("contacts", "last_name", "Nightingale"),
    quote: await pick("quotes", "title", "Shopfront signage package"),
    invoice: await pick("invoices", "title", "Annual support retainer"),
  };
}

const PAGES = [
  ["dashboard", "/dashboard"],
  ["customers", "/dashboard/contacts"],
  ["customer-new", "/dashboard/contacts/new"],
  ["customer-detail", "@contact"],
  ["quotes", "/dashboard/quotes"],
  ["quote-new", "/dashboard/quotes/new"],
  ["quote-detail", "@quote"],
  ["invoices", "/dashboard/invoices"],
  ["invoice-detail", "@invoice"],
  ["reminders", "/dashboard/reminders"],
  ["expenses", "/dashboard/expenses"],
  ["sales-report", "/dashboard/reports/customers"],
  ["tax-report", "/dashboard/tax"],
  ["month-end-report", "/dashboard/reports/month-end"],
  ["activity", "/dashboard/activity"],
  ["settings", "/dashboard/settings"],
  ["billing", "/dashboard/billing"],
  ["import-step1", "/dashboard/import"],
];

async function main() {
  const ids = await fixtureIds();
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });

  for (const [name, target] of PAGES) {
    const url = target.replace(/^@/, "");
    const resolved =
      target === "@contact"
        ? `/dashboard/contacts/${ids.contact}`
        : target === "@quote"
          ? `/dashboard/quotes/${ids.quote}`
          : target === "@invoice"
            ? `/dashboard/invoices/${ids.invoice}`
            : url;
    await page.goto(`${BASE}${resolved}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const text = await page.locator("main").innerText();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    console.log(`\n========== ${name} (${resolved}) ==========`);
    console.log(lines.join(" | "));
  }

  await browser.close();
}

main().catch((e) => {
  console.error("dump error:", e?.message ?? e);
  process.exit(1);
});