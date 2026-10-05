// TEMPORARY: captures the real app screens used by the public /guide page.
// Writes PNGs straight into public/guide. Requires the demo fixtures to be
// seeded (node seed-guide-demo.js seed) and a local prod server on :3111.
//
//   node capture-guide-shots.js
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { getClient } = require("./db");

// Table rows only link on the document number, so resolve ids from the DB
// rather than guessing at what the table text looks like.
async function fixtureIds() {
  const sb = getClient();
  const pick = async (table, column, value) => {
    const { data, error } = await sb
      .from(table)
      .select("id")
      .eq(column, value)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`fixture not found: ${table} "${value}"`);
    return data.id;
  };
  const [contact, quote, invoice] = await Promise.all([
    pick("contacts", "last_name", "Nightingale"),
    pick("quotes", "title", "Shopfront signage package"),
    pick("invoices", "title", "Annual support retainer"),
  ]);
  return { contact, quote, invoice };
}

const BASE = process.env.BASE_URL || "http://localhost:3111";
const EMAIL = "pwa-test-1301678156@example.com";
const PASSWORD = "PwaTest123!";
const OUT = path.join(__dirname, "..", "public", "guide");

async function shot(page, name, opts = {}) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(350);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage !== false });
  console.log(`captured ${name}.png`);
}

// A throwaway invoice sheet in the shape the importer expects: one row per
// line item, with the customer's own number repeated on each line.
async function buildSampleSheet() {
  const { Workbook } = require(path.join(
    __dirname,
    "..",
    "node_modules",
    "exceljs"
  ));
  const wb = new Workbook();
  const ws = wb.addWorksheet("Invoices");
  ws.addRow([
    "Invoice Number",
    "Customer",
    "Company",
    "Email",
    "Title",
    "Invoice Date",
    "Due Date",
    "Paid Date",
    "Status",
    "Description",
    "Quantity",
    "Unit Price",
    "VAT Rate",
  ]);
  const rows = [
    ["INV-1042", "Gary Whitmore", "Whitmore Joinery", "gary@whitmorejoinery.example", "Kitchen install", "12/01/2024", "11/02/2024", "05/02/2024", "paid", "Kitchen fitting, supply and fit", "1", "2450.00", "20"],
    ["INV-1042", "Gary Whitmore", "Whitmore Joinery", "gary@whitmorejoinery.example", "Kitchen install", "12/01/2024", "11/02/2024", "05/02/2024", "paid", "Appliance installation", "1", "320.00", "20"],
    ["INV-1043", "Nadia Rahman", "Rahman & Co", "nadia@rahmanco.example", "Shopfront repaint", "19/01/2024", "", "", "sent", "Exterior repaint, two days", "2", "480.00", "20"],
    ["INV-1044", "Owen Pritchard", "", "owen.pritchard@example.com", "Fence repair", "02/02/2024", "16/02/2024", "", "overdue", "Fence repair and repaint", "1", "1150.00", "20"],
  ];
  for (const r of rows) ws.addRow(r);
  const file = path.join(OUT, "_sample-import.xlsx");
  await wb.xlsx.writeFile(file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = await fixtureIds();

  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e)));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });

  // 1. Dashboard overview
  await shot(page, "dashboard");

  // 2. Customers list
  await page.goto(`${BASE}/dashboard/contacts`, { waitUntil: "domcontentloaded" });
  await shot(page, "customers");

  // 3. New customer form
  await page.goto(`${BASE}/dashboard/contacts/new`, { waitUntil: "domcontentloaded" });
  await shot(page, "customer-new");

  // 4. Customer detail
  await page.goto(`${BASE}/dashboard/contacts/${ids.contact}`, { waitUntil: "domcontentloaded" });
  await shot(page, "customer-detail");

  // 5. Quotes list
  await page.goto(`${BASE}/dashboard/quotes`, { waitUntil: "domcontentloaded" });
  await shot(page, "quotes");

  // 6. New quote form, with a line item so the items table is visible
  await page.goto(`${BASE}/dashboard/quotes/new`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator("#title").fill("Website redesign proposal");
  await page.locator("#description").fill("Five-page site with online booking links.");
  await page.getByRole("button", { name: /add item/i }).click();
  const desc = page.getByPlaceholder("Description");
  const qty = page.getByPlaceholder("Qty");
  const price = page.getByPlaceholder("Unit Price");
  await desc.nth(0).fill("Design and wireframes");
  await qty.nth(0).fill("1");
  await price.nth(0).fill("1450.00");
  await page.getByRole("button", { name: /add item/i }).click();
  await desc.nth(1).fill("Build and CMS setup");
  await qty.nth(1).fill("1");
  await price.nth(1).fill("2100.00");
  await shot(page, "quote-new");

  // 7. Quote detail with actions
  await page.goto(`${BASE}/dashboard/quotes/${ids.quote}`, { waitUntil: "domcontentloaded" });
  await shot(page, "quote-detail");

  // 8. Invoices list
  await page.goto(`${BASE}/dashboard/invoices`, { waitUntil: "domcontentloaded" });
  await shot(page, "invoices");

  // 9. Invoice detail (overdue one, shows the status actions)
  await page.goto(`${BASE}/dashboard/invoices/${ids.invoice}`, { waitUntil: "domcontentloaded" });
  await shot(page, "invoice-detail");

  // 10. Reminders
  await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "domcontentloaded" });
  await shot(page, "reminders");

  // 11. Expenses
  await page.goto(`${BASE}/dashboard/expenses`, { waitUntil: "domcontentloaded" });
  await shot(page, "expenses");

  // 12. Sales report
  await page.goto(`${BASE}/dashboard/reports/customers`, { waitUntil: "domcontentloaded" });
  await shot(page, "sales-report");

  // 13. Tax report
  await page.goto(`${BASE}/dashboard/tax`, { waitUntil: "domcontentloaded" });
  await shot(page, "tax-report");

  // 14. Month-end report
  await page.goto(`${BASE}/dashboard/reports/month-end`, { waitUntil: "domcontentloaded" });
  await shot(page, "month-end-report");

  // 15. Activity log
  await page.goto(`${BASE}/dashboard/activity`, { waitUntil: "domcontentloaded" });
  await shot(page, "activity");

  // 16. Settings
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "domcontentloaded" });
  await shot(page, "settings");

  // 17. Billing
  await page.goto(`${BASE}/dashboard/billing`, { waitUntil: "domcontentloaded" });
  await shot(page, "billing");

  // 18. Import wizard, step 1
  await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded" });
  await shot(page, "import-step1");

  // 19/20. Import wizard after uploading a small sample sheet: the review
  // step shows auto-detected columns and per-document validation.
  const sample = await buildSampleSheet();
  await page.locator('input[type="file"]').setInputFiles(sample);
  await page.getByText("3. Review before importing").waitFor({ timeout: 60000 });
  await shot(page, "import-step3-review");

  await browser.close();
  if (problems.length) {
    console.log(`page errors: ${problems.slice(0, 3).join(" | ")}`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error("capture error:", e?.message ?? e);
  process.exit(1);
});