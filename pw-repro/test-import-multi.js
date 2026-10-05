// TEMPORARY verification for multi-file historical import.
// Requires a LOCAL prod server (npm run build && npm start) and the test
// account from db.js to be Pro (this script flips it and restores it).
//
//   node test-import-multi.js
const path = require("path");
const { chromium } = require("playwright");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));
const fixtures = require("./impersonation-fixtures");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = "pwa-test-1301678156@example.com";
const ADMIN_PASSWORD = "PwaTest123!";

const results = [];
let failures = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures++;
  results.push({ ok, name, detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  return ok;
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

const nav = (page, p) =>
  page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 60000 });

async function login(page) {
  await nav(page, "/login");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 45000 }),
    page.getByRole("button", { name: /sign in/i }).first().click(),
  ]);
}

const HEADERS = [
  "Invoice Number",
  "Client Name",
  "E-mail Address",
  "Invoice Date",
  "Description",
  "Qty",
  "Unit Price",
  "Payment Status",
];

async function build(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoices");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Three files loaded in one go:
 *  - MULTI-001 deliberately repeats across the two years, so a naive
 *    concatenation would merge their line items into one invoice.
 *  - The third file has a different header layout, so it must be mapped apart.
 */
async function fixtures2019() {
  return build([
    HEADERS,
    ["MULTI-001", "Multi File Client", "multi-file@example.com", "04/03/2019", "Brake discs", 2, 45.5, "Paid"],
    ["MULTI-001", "Multi File Client", "multi-file@example.com", "04/03/2019", "Brake pads", 1, 22.0, "Paid"],
    ["MULTI-002", "Multi File Client", "multi-file@example.com", "19/07/2019", "Tyres", 4, 62.25, "Paid"],
  ]);
}

async function fixtures2020() {
  return build([
    HEADERS,
    ["MULTI-001", "Multi File Client", "multi-file@example.com", "08/01/2020", "Wheel alignment", 1, 80.0, "Unpaid"],
    ["MULTI-050", "Multi File Client", "multi-file@example.com", "30/09/2020", "Suspension", 1, 410.0, "Unpaid"],
  ]);
}

/**
 * Note: a bare "Issued" column is a documented alias for sent date, not the
 * document date, so this fixture uses "Date Issued" for the date it wants
 * auto-detected while keeping the layout deliberately different.
 */
async function fixtures2021() {
  return build([
    ["Ref", "Date Issued", "Billed To", "Details", "Amount"],
    ["MULTI-900", "15/02/2021", "Multi File Client", "Mobile fitting", 125.0],
  ]);
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) pageErrors.push(`5xx ${r.status()} ${r.url()}`);
  });

  const sb = fixtures.getClient();

  await login(page);

  const { data: adminProfile } = await sb
    .from("profiles")
    .select("id")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  const { data: membership } = await sb
    .from("memberships")
    .select("org_id")
    .eq("user_id", adminProfile.id)
    .single();
  const org = membership.org_id;

  const { data: existingSub } = await sb
    .from("subscriptions")
    .select("*")
    .eq("org_id", org)
    .maybeSingle();
  const originalSub = existingSub ? { ...existingSub } : null;
  await sb.from("subscriptions").update({ plan: "pro", status: "active" }).eq("org_id", org);

  async function restoreSubscription() {
    if (originalSub) {
      await sb.from("subscriptions").update({
        plan: originalSub.plan,
        status: originalSub.status,
      }).eq("id", originalSub.id);
    } else {
      await sb.from("subscriptions").delete().eq("org_id", org);
    }
  }

  const { data: seeded, error: seedError } = await sb
    .from("contacts")
    .insert({
      org_id: org,
      first_name: "Multi",
      last_name: "File Client",
      email: "multi-file@example.com",
      status: "client",
    })
    .select("id")
    .single();
  if (seedError) throw seedError;

  async function cleanup() {
    const { data: invoices } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", org)
      .like("original_number", "MULTI-%");
    const ids = (invoices ?? []).map((i) => i.id);
    if (ids.length) {
      await sb.from("invoice_items").delete().in("invoice_id", ids);
      await sb.from("invoices").delete().in("id", ids);
    }
    await sb.from("contacts").delete().eq("id", seeded.id);
    await restoreSubscription();
  }

  try {
    section("Import page");
    await nav(page, "/dashboard/import");
    await page.waitForSelector("text=Choose what you are importing", { timeout: 30000 });

    const files = [
      { name: "2019-invoices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await fixtures2019() },
      { name: "2020-invoices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await fixtures2020() },
      { name: "2021-odd-headers.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await fixtures2021() },
    ];

    section("Multi-file upload");
    await page.setInputFiles('input[data-import-input="files"]', files);
    await page.waitForSelector("text=Review before importing", { timeout: 45000 });
    check("review screen appears after one multi-file upload", true);

    const summary = await page.locator("p", { hasText: /ready/ }).first().innerText();
    check("3 files reported as loaded", /3 files/.test(summary), summary);
    check("5 documents ready", /5 invoices ready/.test(summary), summary);

    const filesPanel = await page.locator("text=Files").first().isVisible();
    check("per-file breakdown shown", filesPanel);

    const fileList = await page.locator("ul", { hasText: "2019-invoices.xlsx" }).first().innerText();
    check("2019 file listed with 2 ready", /2019-invoices/.test(fileList) && /2 ready/.test(fileList), fileList.split("\n").join(" | "));
    check("2021 file listed with 1 ready", /2021-odd-headers/.test(fileList) && /1 ready/.test(fileList));

    section("Repeated original numbers stay separate");
    const tableText = await page.locator("table").innerText();
    const multiOneRows = (tableText.match(/MULTI-001/g) ?? []).length;
    check("MULTI-001 appears as 2 rows, not one merged 3-line document", multiOneRows === 2, `${multiOneRows} rows`);

    const dupWarning = await page
      .locator("text=/used by more than one document/")
      .first()
      .isVisible();
    check("repeated original numbers are called out", dupWarning);

    const dupCopy = await page
      .locator("text=/used by more than one document/")
      .first()
      .locator("..")
      .innerText();
    check(
      "differing dates are treated as separate documents, not skipped",
      /look like real separate documents/.test(dupCopy),
      dupCopy.replace(/\n/g, " | ")
    );

    section("Differing header layouts get separate mappings");
    const mappingBlocks = await page.locator("h3", { hasText: "Column mapping" }).count();
    check("two column-mapping blocks (two header layouts)", mappingBlocks === 2, `${mappingBlocks} blocks`);

    const sharedNote = await page.locator("text=share this column layout").first().isVisible();
    check("shared-layout files report being mapped together", sharedNote);

    section("Totals across every file");
    const footer = await page.locator("text=invoices totalling").first().innerText();
    check("footer counts all 5 documents", /5 invoices totalling/.test(footer), footer);

    // The parenthetical gross figure must agree with the currency figure; it
    // previously mixed pence and pounds and printed a 100x-too-large number.
    const footerMatch = footer.match(/£([\d,]+\.\d{2})\s+\(([\d.]+) including VAT\)/);
    check(
      "footer gross figure matches the currency figure",
      footerMatch && Number(footerMatch[1].replace(/,/g, "")) === Number(footerMatch[2]),
      footer
    );

    section("Commit");
    await page.getByRole("button", { name: /^Import \d+ invoices$/ }).click();
    await page.waitForSelector("text=Import complete", { timeout: 60000 });
    check("import completed", true);

    const doneText = await page.locator("text=Import complete").first().locator("..").innerText();
    check("5 invoices created", /Created 5 invoices/.test(doneText), doneText.split("\n").join(" | "));

    section("Database verification");
    const { data: created } = await sb
      .from("invoices")
      .select("id, original_number, number, total, status, due_date, contact_id")
      .eq("org_id", org)
      .like("original_number", "MULTI-%")
      .order("original_number");

    const byRef = {};
    for (const inv of created ?? []) byRef[inv.original_number] = inv;

    check("all 5 documents created across the three files", (created ?? []).length === 5, `${(created ?? []).length}`);

    const multiOne = (created ?? []).filter((i) => i.original_number === "MULTI-001");
    check("MULTI-001 exists twice", multiOne.length === 2, `${multiOne.length}`);

    const { data: items2019, error: itemsError } = await sb
      .from("invoice_items")
      .select("id, description, quantity, unit_price, invoice_id")
      .in(
        "invoice_id",
        multiOne.map((i) => i.id)
      );
    if (itemsError) throw itemsError;

    const perDoc = {};
    for (const line of items2019 ?? []) {
      perDoc[line.invoice_id] = (perDoc[line.invoice_id] ?? 0) + 1;
    }
    const lineCounts = Object.values(perDoc).sort();
    check(
      "the two MULTI-001 invoices kept separate line counts (2 and 1)",
      JSON.stringify(lineCounts) === JSON.stringify([1, 2]),
      JSON.stringify(lineCounts)
    );

    const sortedNums = (created ?? []).map((i) => Number(i.number.replace("INV-", ""))).sort((a, b) => a - b);
    check(
      "generated numbers are contiguous across all three files",
      sortedNums.every((n, i) => i === 0 || n === sortedNums[i - 1] + 1),
      sortedNums.join(",")
    );

    check("all documents linked to the seeded customer", (created ?? []).every((i) => i.contact_id === seeded.id));

    const statuses = (created ?? []).map((i) => i.status);
    check(
      "historical statuses resolved (paid before 2020, rest sent/overdue)",
      statuses.filter((s) => ["paid", "sent", "overdue"].includes(s)).length === 5,
      statuses.join(",")
    );
  } finally {
    await cleanup();
    console.log("\n--- Cleanup ---");
    const { data: leftover } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", org)
      .like("original_number", "MULTI-%");
    check("all test invoices removed", (leftover ?? []).length === 0, `${(leftover ?? []).length} left`);

    const { data: subAfter } = await sb.from("subscriptions").select("plan, status").eq("org_id", org).maybeSingle();
    check(
      "subscription restored",
      originalSub ? subAfter?.plan === originalSub.plan : !subAfter,
      originalSub ? `${originalSub.plan} -> ${subAfter?.plan}` : "was none"
    );

    check("no page errors or 5xx responses", pageErrors.length === 0, pageErrors.join(" | "));

    await browser.close();
  }

  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});