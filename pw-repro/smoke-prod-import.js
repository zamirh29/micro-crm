// TEMPORARY read-only production smoke check for the import page.
//   node smoke-prod-import.js
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "https://crm.dtmstechsolutions.co.uk";
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("Set SMOKE_EMAIL / SMOKE_PASSWORD");

  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const failures = [];
  page.on("response", (r) => {
    if (r.status() >= 500) failures.push(`5xx ${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => failures.push(String(e)));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  // Production can be slow to warm up, so wait generously for the redirect.
  await page.waitForURL(/dashboard/, { timeout: 90000 });

  await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 });

  const body = await page.locator("body").innerText();
  const gate = /Import is a Pro feature/.test(body);
  const wizard = /Choose what you are importing/.test(body);
  console.log(gate ? "production: Pro gate shown" : wizard ? "production: wizard shown" : "production: unexpected content");

  await page.goto(`${BASE}/dashboard/invoices`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const invoices = await page.locator("main").innerText();
  const tray = /Recently deleted/i.test(invoices);

  console.log(`sidebar has Import History: ${/Import History/.test(body)}`);
  console.log(`invoices page has recently-deleted tray: ${tray}`);
  console.log(`no 5xx or page errors: ${failures.length === 0}${failures.length ? ` (${failures.slice(0, 3).join(" | ")})` : ""}`);

  await browser.close();
  if (!gate && !wizard) process.exit(1);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error("smoke error:", e?.message ?? e);
  process.exit(1);
});