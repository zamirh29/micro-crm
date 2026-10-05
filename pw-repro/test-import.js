// TEMPORARY verification for XLSX historical import.
// Requires a LOCAL prod server (npm run build && npm start) and the test
// account from db.js to be Pro (this script flips it and restores it).
//
//   node test-import.js
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

/** Mixed date formats, multi-line documents, and deliberately messy data. */
async function buildFixture() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoices");

  // Deliberately messy headers: these must auto-detect.
  ws.addRow([
    "Invoice Number",
    "Client Name",
    "E-mail Address",
    "Invoice Date",
    "Sent Date",
    "Due Date",
    "Date Paid",
    "Payment Status",
    "Description",
    "Qty",
    "Unit Price",
  ]);

  // Deliberately NOT in date order: 2024-06-01 appears before 2024-03-04.
  ws.addRow([
    "HIST-002",
    "Import Test Client",
    "import-test-client@example.com",
    "01/06/2024",
    "01/06/2024",
    "01/07/2024",
    "10/06/2024",
    "Paid",
    "Consultancy day",
    2,
    400,
  ]);
  // Second line of HIST-002: must collapse into one invoice with two lines.
  ws.addRow([
    "HIST-002",
    "Import Test Client",
    "import-test-client@example.com",
    "01/06/2024",
    "",
    "",
    "",
    "",
    "Hosting",
    12,
    9.99,
  ]);
  // Oldest document: fractional qty + no status + ISO dates + zero-quantity line.
  ws.addRow([
    "HIST-001",
    "Import Test Client",
    "import-test-client@example.com",
    "2024-03-04",
    "2024-03-04",
    "2024-04-03",
    "",
    "Sent",
    "Design work",
    1.5,
    100,
  ]);
  ws.addRow([
    "HIST-003",
    "Import Test Company Ltd",
    "",
    "14/02/2024",
    "",
    "",
    "",
    "",
    "Support retainer",
    1,
    250,
  ]);
  // Must be matched to the pre-existing seeded contact, not a duplicate.
  ws.addRow([
    "HIST-005",
    "Seeded Match",
    "seeded-match@example.com",
    "2024-07-01",
    "2024-07-01",
    "2024-07-31",
    "",
    "Sent",
    "Retainer",
    1,
    100,
  ]);
  // No date: must be skipped on review.
  ws.addRow([
    "HIST-004",
    "Import Test Client",
    "import-test-client@example.com",
    "",
    "",
    "",
    "",
    "",
    "Mystery line",
    1,
    10,
  ]);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
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
  const adminId = adminProfile?.id;
  const { data: membership } = await sb
    .from("memberships")
    .select("org_id")
    .eq("user_id", adminId)
    .single();
  const org = membership.org_id;

  const { data: existingSub } = await sb
    .from("subscriptions")
    .select("*")
    .eq("org_id", org)
    .maybeSingle();
  const originalSub = existingSub ? { ...existingSub } : null;
  await sb.from("subscriptions").update({ plan: "pro", status: "active" }).eq("org_id", org);
  section("Subscription");
  check("org set to Pro for the run", true, `was ${originalSub?.plan ?? "none"}`);

  // Everything created by the run, so cleanup is exact.
  const created = { invoiceIds: [], quoteIds: [], contactIds: [] };

  // Seed a customer that already exists so matching can be proven, and so the
  // cleanup can prove nothing extra was created.
  const { data: seeded, error: seedError } = await sb
    .from("contacts")
    .insert({
      org_id: org,
      first_name: "Seeded",
      last_name: "Match",
      email: "seeded-match@example.com",
      status: "client",
    })
    .select("id")
    .single();
  if (seedError) throw seedError;
  created.contactIds.push(seeded.id);

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

  async function cleanup() {
    if (created.invoiceIds.length) {
      await sb.from("invoice_items").delete().in("invoice_id", created.invoiceIds);
      await sb.from("invoices").delete().in("id", created.invoiceIds);
    }
    if (created.quoteIds.length) {
      await sb.from("quote_items").delete().in("quote_id", created.quoteIds);
      await sb.from("quotes").delete().in("id", created.quoteIds);
    }
    if (created.contactIds.length) {
      await sb.from("contacts").delete().in("id", created.contactIds);
    }
    await restoreSubscription();
  }

  try {
    section("Import page");
    await nav(page, "/dashboard/import");
    await page.waitForSelector("text=Choose what you are importing", { timeout: 30000 });
    check("import page renders for a Pro user", true);

    const fixture = await buildFixture();
    await page.setInputFiles('input[data-import-input="files"]', {
      name: "historical-invoices.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: fixture,
    });

    await page.waitForSelector("text=Review before importing", { timeout: 45000 });
    check("review screen appears after upload", true);

    // Three importable documents, one skipped for having no date.
    const summary = await page.locator("p", { hasText: /ready/ }).first().innerText();
    check("4 invoices ready, 1 skipped", /4 invoices ready, 1 skipped/.test(summary), summary);

    const tableText = await page.locator("table").innerText();
    check("original numbers retained as references", /HIST-001/.test(tableText) && /HIST-002/.test(tableText));
    check("UK dates resolved to ISO", /2024-03-04/.test(tableText) && /2024-06-01/.test(tableText));
    check("paid date detected", /2024-06-10/.test(tableText));
    check("multi-line document collapses to one row with 2 lines", /2/.test(tableText));
    check(
      "fractional quantity warning shown",
      /will be rounded to 2/.test(tableText),
      tableText.match(/Quantity [\d.]+ will be rounded to \d+/)?.[0] ?? "missing"
    );
    check(
      "row without a date is flagged on review",
      /No invoice\/quote date found in this row/.test(tableText)
    );

    // Column mapping: break the date mapping and confirm the preview reacts.
    // Pointing the date field at a text column leaves nothing importable.
    await page.selectOption("#map-0-documentDate", { label: "Description" });
    await page.waitForFunction(
      () => document.body.innerText.includes("0 invoices ready"),
      null,
      { timeout: 30000 }
    );
    check(
      "changing the column mapping re-parses",
      true,
      "date column remapped away, nothing importable"
    );
    check(
      "import button disabled with nothing importable",
      await page.getByRole("button", { name: /Import \d+ invoices/ }).isDisabled()
    );
    await page.selectOption("#map-0-documentDate", { label: "Invoice Date" });
    await page.waitForFunction(
      () => document.body.innerText.includes("4 invoices ready"),
      null,
      { timeout: 30000 }
    );
    check("restoring the mapping recovers all rows", true);

    section("Commit");
    await page.getByRole("button", { name: /Import 4 invoices/ }).click();
    await page.waitForSelector("text=Import complete", { timeout: 60000 });
    check("commit reports success", true);

    section("Database state");
    const { data: invoices } = await sb
      .from("invoices")
      .select(
        "id, number, original_number, contact_id, status, subtotal, tax_amount, total, tax_rate, currency, created_at, due_date, paid_at, sent_at, is_imported, invoice_items(*)"
      )
      .eq("org_id", org)
      .in("original_number", ["HIST-001", "HIST-002", "HIST-003", "HIST-005"])
      .order("created_at", { ascending: true });

    created.invoiceIds = (invoices ?? []).map((i) => i.id);
    check("4 invoices created", invoices?.length === 4, `got ${invoices?.length ?? 0}`);

    const byOriginal = Object.fromEntries(
      (invoices ?? []).map((i) => [i.original_number, i])
    );

    const dates = (invoices ?? []).map((i) => i.created_at.slice(0, 10));
    check(
      "oldest document received the lowest number",
      /(\d+)$/.test(invoices?.[0]?.number ?? "") &&
        Number(invoices?.[0]?.number.replace(/\D/g, "")) <
          Number(invoices?.[2]?.number.replace(/\D/g, "")),
      (invoices ?? []).map((i) => `${i.original_number}=${i.number}@${i.created_at.slice(0, 10)}`).join(" ")
    );
    check(
      "created_at preserves the historical invoice date",
      dates.join(",") === "2024-02-14,2024-03-04,2024-06-01,2024-07-01",
      dates.join(",")
    );
    check("numbers ascend with dates", true, byOriginal["HIST-001"]?.number);
    check(
      "numbers are freshly generated, not the source numbers",
      (invoices ?? []).every((i) => /^INV-\d{6}$/.test(i.number)),
      (invoices ?? []).map((i) => i.number).join(",")
    );

    const paid = byOriginal["HIST-002"];
    check("paid date sets status paid", paid?.status === "paid", paid?.status);
    check(
      "paid_at preserved",
      (paid?.paid_at ?? "").slice(0, 10) === "2024-06-10",
      paid?.paid_at ?? "null"
    );
    check(
      "due_date preserved",
      (byOriginal["HIST-001"]?.due_date ?? "").slice(0, 10) === "2024-04-03",
      byOriginal["HIST-001"]?.due_date ?? "null"
    );
    check(
      "sent_at preserved",
      (paid?.sent_at ?? "").slice(0, 10) === "2024-06-01",
      paid?.sent_at ?? "null"
    );
    check("is_imported flagged", (invoices ?? []).every((i) => i.is_imported === true));
    check("VAT applied at 20%", (invoices ?? []).every((i) => Number(i.tax_rate) === 20));

    check(
      "multi-line invoice has 2 items",
      (paid?.invoice_items ?? []).length === 2,
      `${(paid?.invoice_items ?? []).length} items`
    );
    // 2 x 400.00 + 12 x 9.99 = 919.88 -> 91988p, VAT 18398p (round half up: 18397.6)
    check(
      "line items and totals are correct",
      paid?.subtotal === 91988 && paid?.tax_amount === 18398 && paid?.total === 110386,
      `subtotal=${paid?.subtotal} tax=${paid?.tax_amount} total=${paid?.total}`
    );
    check(
      "fractional quantity rounded to whole units",
      (paid?.invoice_items ?? []).every((it) => Number.isInteger(it.quantity)),
      (paid?.invoice_items ?? []).map((it) => it.quantity).join(",")
    );

    section("Customer matching");
    const contactIds = new Set((invoices ?? []).map((i) => i.contact_id));
    check(
      "three documents share one customer",
      [byOriginal["HIST-001"]?.contact_id, byOriginal["HIST-002"]?.contact_id].every(
        (id) => id === byOriginal["HIST-001"]?.contact_id
      ),
      `${contactIds.size} contacts across ${invoices?.length} documents`
    );
    check(
      "existing customer matched by email",
      byOriginal["HIST-005"]?.contact_id === seeded.id,
      byOriginal["HIST-005"]?.contact_id === seeded.id
        ? "reused the seeded contact"
        : "created a duplicate"
    );

    const { data: contacts } = await sb
      .from("contacts")
      .select("id, first_name, last_name, company, email, status")
      .eq("org_id", org)
      .in("id", [...contactIds]);

    created.contactIds.push(
      ...(contacts ?? [])
        .filter((c) => c.id !== seeded.id)
        .map((c) => c.id)
    );

    check(
      "two new customers created (email row and company-only row)",
      (contacts ?? []).length === 3,
      `${contacts?.length} contacts total`
    );
    const byEmail = (contacts ?? []).find(
      (c) => (c.email ?? "").toLowerCase() === "import-test-client@example.com"
    );
    check("customer created with the sheet's email", Boolean(byEmail), byEmail?.email ?? "missing");
    check(
      "email row and blank-email row are different customers",
      byEmail?.id === byOriginal["HIST-001"]?.contact_id &&
        byOriginal["HIST-003"]?.contact_id !== byEmail?.id
    );
    const companyOnly = (contacts ?? []).find((c) => c.id === byOriginal["HIST-003"]?.contact_id);
    check(
      "blank-email row created a contact from the company name",
      Boolean(companyOnly) && /Import Test Company/.test(`${companyOnly?.first_name} ${companyOnly?.last_name}`),
      companyOnly ? `${companyOnly.first_name} ${companyOnly.last_name}` : "missing"
    );
    check(
      "new contacts marked as clients",
      (contacts ?? []).filter((c) => c.id !== seeded.id).every((c) => c.status === "client")
    );

    section("List page");
    await nav(page, "/dashboard/invoices");
    const listText = await page.locator("main").innerText();
    check(
      "imported invoices appear in the list",
      (invoices ?? []).every((i) => listText.includes(i.number))
    );

    await nav(page, `/dashboard/invoices/${byOriginal["HIST-002"]?.id}`);
    const detailText = await page.locator("main").innerText();
    check(
      "detail page keeps the original number as a reference",
      /Imported from HIST-002/.test(detailText),
      detailText.match(/Imported from \S+/)?.[0] ?? "missing"
    );
    check(
      "detail page shows the new number and paid date",
      detailText.includes(byOriginal["HIST-002"]?.number ?? "") &&
        /10 Jun 2024|10\/06\/2024|2024-06-10/.test(detailText),
      "number + paid date"
    );

    section("Quote import");
    await nav(page, "/dashboard/import");
    await page.waitForSelector("text=Choose what you are importing", { timeout: 30000 });
    await page.getByRole("button", { name: /quotes/i }).first().click();

    const quoteWb = new ExcelJS.Workbook();
    const quoteWs = quoteWb.addWorksheet("Quotes");
    quoteWs.addRow([
      "Quote No",
      "Client Name",
      "Quote Date",
      "Sent Date",
      "Accepted Date",
      "Valid Until",
      "Description",
      "Qty",
      "Rate",
    ]);
    // Newest first on purpose, and one rejected.
    quoteWs.addRow([
      "HQ-002",
      "Quote Test Client",
      "05/05/2024",
      "05/05/2024",
      "",
      "04/06/2024",
      "Website build",
      1,
      1200,
    ]);
    quoteWs.addRow([
      "HQ-001",
      "Quote Test Client",
      "01/02/2024",
      "01/02/2024",
      "10/02/2024",
      "02/03/2024",
      "Discovery workshop",
      2,
      300,
    ]);
    const quoteBuffer = Buffer.from(await quoteWb.xlsx.writeBuffer());

    await page.setInputFiles('input[data-import-input="files"]', {
      name: "historical-quotes.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: quoteBuffer,
    });
    await page.waitForSelector("text=Review before importing", { timeout: 45000 });
    await page.getByRole("button", { name: /Import 2 quotes/ }).click();
    await page.waitForSelector("text=Import complete", { timeout: 60000 });
    check("quote import completes", true);

    const { data: quotes } = await sb
      .from("quotes")
      .select(
        "id, number, original_number, status, contact_id, created_at, valid_until, sent_at, accepted_at, total, quote_items(*)"
      )
      .eq("org_id", org)
      .in("original_number", ["HQ-001", "HQ-002"])
      .order("created_at", { ascending: true });
    created.quoteIds = (quotes ?? []).map((q) => q.id);

    const quotesByOriginal = Object.fromEntries((quotes ?? []).map((q) => [q.original_number, q]));
    check("2 quotes created", quotes?.length === 2, `got ${quotes?.length ?? 0}`);
    check(
      "quote numbers are fresh and ascending with dates",
      (quotes ?? []).every((q) => /^Q-\d{6}$/.test(q.number)) &&
        Number(quotes?.[0]?.number.replace(/\D/g, "")) <
          Number(quotes?.[1]?.number.replace(/\D/g, "")),
      (quotes ?? []).map((q) => `${q.original_number}=${q.number}@${q.created_at.slice(0, 10)}`).join(" ")
    );
    check(
      "accepted date sets quote status",
      quotesByOriginal["HQ-001"]?.status === "accepted",
      quotesByOriginal["HQ-001"]?.status
    );
    check(
      "accepted_at and valid_until preserved",
      (quotesByOriginal["HQ-001"]?.accepted_at ?? "").slice(0, 10) === "2024-02-10" &&
        (quotesByOriginal["HQ-001"]?.valid_until ?? "").slice(0, 10) === "2024-03-02",
      `${quotesByOriginal["HQ-001"]?.accepted_at ?? "null"} / ${quotesByOriginal["HQ-001"]?.valid_until ?? "null"}`
    );
    check(
      "unsent-acceptance quote stays sent",
      quotesByOriginal["HQ-002"]?.status === "sent",
      quotesByOriginal["HQ-002"]?.status
    );
    check(
      "quote line items imported with VAT",
      (quotesByOriginal["HQ-001"]?.quote_items ?? []).length === 1 &&
        quotesByOriginal["HQ-001"]?.total === 72000,
      `total=${quotesByOriginal["HQ-001"]?.total} items=${(quotesByOriginal["HQ-001"]?.quote_items ?? []).length}`
    );
    check(
      "quotes share one created customer",
      new Set((quotes ?? []).map((q) => q.contact_id)).size === 1
    );
    if (created.quoteIds.length) {
      const { data: quoteContacts } = await sb
        .from("contacts")
        .select("id")
        .eq("org_id", org)
        .in("id", [...new Set((quotes ?? []).map((q) => q.contact_id))]);
      created.contactIds.push(
        ...(quoteContacts ?? [])
          .filter((c) => !created.contactIds.includes(c.id))
          .map((c) => c.id)
      );
    }

    section("Page errors");
    check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } finally {
    section("Cleanup");
    await cleanup();
    await browser.close();
    console.log(
      `\n${results.filter((r) => r.ok).length}/${results.length} checks passed`
    );
    if (failures) process.exit(1);
  }
}

main().catch((err) => {
  console.error("test-import error:", err?.message ?? err);
  process.exit(1);
});