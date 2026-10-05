// TEMPORARY verification for super-admin document date editing + list edit buttons.
// Requires a LOCAL prod server started with SUPER_ADMIN_EMAILS including
// pwa-test-1301678156@example.com in .env.local.
//
//   node test-document-dates.js
const { chromium } = require("playwright");
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

async function waitForHydration(page, selector, timeout = 25000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!(el && Object.keys(el).some((k) => k.startsWith("__react")));
    },
    selector,
    { timeout }
  );
}

async function waitForSubmitFormHydration(page, buttonName, timeout = 30000) {
  await page
    .getByRole("button", { name: buttonName })
    .first()
    .waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    (name) => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent || "").trim() === name
      );
      const form = btn && btn.closest("form");
      return !!(form && Object.keys(form).some((k) => k.startsWith("__react")));
    },
    buttonName,
    { timeout }
  );
}

async function waitForPath(page, re, timeout = 45000) {
  await page.waitForFunction(
    (src) => new RegExp(src).test(location.pathname),
    re.source,
    { timeout }
  );
  await page.waitForLoadState("load").catch(() => {});
}

async function login(page, email, password) {
  await nav(page, "/login");
  await waitForHydration(page, "#email");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await waitForPath(page, /\/dashboard/, 45000);
}

async function signOut(page) {
  await waitForSubmitFormHydration(page, "Sign Out");
  await page.getByRole("button", { name: "Sign Out" }).first().click();
  await waitForPath(page, /\/login/, 30000);
  await page.waitForTimeout(500);
}

const SENT = "2026-01-15";
const PAID = "2026-02-20";
const QUOTE_SENT = "2025-11-05";
const QUOTE_ACCEPTED = "2025-12-01";

async function seed(orgId) {
  const sb = fixtures.getClient();
  const { data: contact } = await sb
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (!contact) throw new Error("fixture contact missing");

  const stamp = (date) => `${date}T12:00:00.000Z`;

  const { data: paidInv, error: invErr } = await sb
    .from("invoices")
    .insert({
      org_id: orgId,
      contact_id: contact.id,
      number: "INV-900001",
      title: "Dates Paid Invoice",
      description: null,
      status: "paid",
      subtotal: 1000,
      tax_rate: 0,
      tax_amount: 0,
      total: 1000,
      currency: "GBP",
      due_date: "2026-03-01",
      paid_at: stamp(PAID),
      sent_at: stamp(SENT),
      notes: null,
      created_at: "2026-01-01T12:00:00.000Z",
    })
    .select("id")
    .single();
  if (invErr) throw new Error(`invoice insert: ${invErr.message}`);
  await sb.from("invoice_items").insert({
    invoice_id: paidInv.id,
    description: "Seed line",
    quantity: 1,
    unit_price: 1000,
    total: 1000,
  });

  const { data: draftInv, error: draftErr } = await sb
    .from("invoices")
    .insert({
      org_id: orgId,
      contact_id: contact.id,
      number: "INV-900002",
      title: "Dates Draft Invoice",
      description: null,
      status: "draft",
      subtotal: 500,
      tax_rate: 0,
      tax_amount: 0,
      total: 500,
      currency: "GBP",
      due_date: "2026-04-01",
      notes: null,
    })
    .select("id")
    .single();
  if (draftErr) throw new Error(`draft insert: ${draftErr.message}`);
  await sb.from("invoice_items").insert({
    invoice_id: draftInv.id,
    description: "Seed draft line",
    quantity: 1,
    unit_price: 500,
    total: 500,
  });

  const { data: acceptedQte, error: qteErr } = await sb
    .from("quotes")
    .insert({
      org_id: orgId,
      contact_id: contact.id,
      number: "Q-900001",
      title: "Dates Accepted Quote",
      description: null,
      status: "accepted",
      subtotal: 800,
      tax_rate: 0,
      tax_amount: 0,
      total: 800,
      currency: "GBP",
      valid_until: "2026-01-31",
      reminder_sent: false,
      notes: null,
      sent_at: stamp(QUOTE_SENT),
      accepted_at: stamp(QUOTE_ACCEPTED),
      created_at: "2025-11-01T12:00:00.000Z",
    })
    .select("id")
    .single();
  if (qteErr) throw new Error(`quote insert: ${qteErr.message}`);
  await sb.from("quote_items").insert({
    quote_id: acceptedQte.id,
    description: "Seed quote line",
    quantity: 1,
    unit_price: 800,
    total: 800,
  });

  return {
    paidInv: paidInv.id,
    draftInv: draftInv.id,
    acceptedQte: acceptedQte.id,
  };
}

async function fillDate(page, selector, value) {
  await page.locator(selector).fill(value);
}

async function saveEditForm(page, buttonName, targetRe, label) {
  await waitForSubmitFormHydration(page, buttonName);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: buttonName }).first().click();
  try {
    await waitForPath(page, targetRe, 30000);
    return true;
  } catch {
    console.log(`  !! ${label}: no navigation (path: ${new URL(page.url()).pathname})`);
    return false;
  }
}

async function main() {
  section("0. Fixture + seeded documents");
  const fx = await fixtures.up();
  const ids = await seed(fx.orgId);
  console.log(`fixture: ${fx.email} org=${fx.orgId}`);
  console.log(`seeded: ${JSON.stringify(ids)}`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();

  const badResponses = [];
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) badResponses.push(`${r.status()} ${r.url()}`);
  });

  try {
    section("1. Fixture user (free plan) sees no edit controls");
    await login(page, fx.email, fx.password);
    await nav(page, "/dashboard/invoices");
    check(
      "free-plan invoice list has NO edit buttons",
      (await page.locator('a[aria-label^="Edit invoice"]').count()) === 0,
      `count=${await page.locator('a[aria-label^="Edit invoice"]').count()}`
    );
    await nav(page, "/dashboard/quotes");
    check(
      "free-plan quote list has NO edit buttons",
      (await page.locator('a[aria-label^="Edit quote"]').count()) === 0
    );
    await nav(page, `/dashboard/invoices/${ids.paidInv}/edit`);
    check(
      "free-plan edit page blocked by ProGate",
      await page
        .getByRole("heading", { name: /Pro feature/i })
        .first()
        .isVisible()
        .catch(() => false)
    );

    await signOut(page);

    section("2. Super admin opens the account (impersonation)");
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.getByRole("link", { name: "Admin" }).click();
    await waitForPath(page, /\/dashboard\/admin/, 30000);
    const row = page.getByRole("row").filter({ hasText: fx.email });
    await row.getByRole("button", { name: "Open account" }).click();
    await page
      .getByText("account as super admin")
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
    check("impersonation banner visible", true);

    section("3. Invoices list exposes per-row Edit (incl. paid rows)");
    await nav(page, "/dashboard/invoices");
    const paidRowBtn = page.locator('a[aria-label="Edit invoice INV-900001"]');
    check(
      "PAID invoice row has an Edit button",
      (await paidRowBtn.count()) === 1,
      `count=${await paidRowBtn.count()}`
    );
    check(
      "DRAFT invoice row has an Edit button",
      (await page.locator('a[aria-label="Edit invoice INV-900002"]').count()) === 1
    );

    section("4. Paid invoice: detail shows Edit, form exposes three dates");
    await nav(page, `/dashboard/invoices/${ids.paidInv}`);
    check(
      "paid invoice detail shows Edit link (not locked)",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 1
    );
    check(
      "detail shows the Sent date row",
      (await page.locator("body").innerText()).includes("Sent")
    );

    await nav(page, `/dashboard/invoices/${ids.paidInv}/edit`);
    await waitForPath(page, /\/dashboard\/invoices\/[0-9a-f-]+\/edit$/, 30000);
    check(
      "edit form exposes invoice_date",
      (await page.locator("#invoice_date").count()) === 1
    );
    check(
      "edit form exposes sent_date",
      (await page.locator("#sent_date").count()) === 1
    );
    check(
      "edit form exposes paid_date",
      (await page.locator("#paid_date").count()) === 1
    );
    check(
      "sent_date prefilled from record",
      (await page.locator("#sent_date").inputValue()) === SENT,
      await page.locator("#sent_date").inputValue()
    );
    check(
      "paid_date prefilled from record",
      (await page.locator("#paid_date").inputValue()) === PAID,
      await page.locator("#paid_date").inputValue()
    );

    await fillDate(page, "#invoice_date", "2025-12-01");
    await fillDate(page, "#sent_date", "2026-01-18");
    await fillDate(page, "#paid_date", "2026-02-25");
    await saveEditForm(page, "Save changes", /\/dashboard\/invoices\/[0-9a-f-]+$/, "invoice dates");

    {
      const sb = fixtures.getClient();
      const { data } = await sb
        .from("invoices")
        .select("created_at, sent_at, paid_at")
        .eq("id", ids.paidInv)
        .single();
      check(
        "invoice created_at updated",
        String(data?.created_at).startsWith("2025-12-01"),
        data?.created_at
      );
      check(
        "invoice sent_at updated",
        String(data?.sent_at).startsWith("2026-01-18"),
        data?.sent_at
      );
      check(
        "invoice paid_at updated",
        String(data?.paid_at).startsWith("2026-02-25"),
        data?.paid_at
      );
    }

    section("5. Clearing the paid date works");
    await nav(page, `/dashboard/invoices/${ids.paidInv}/edit`);
    await fillDate(page, "#paid_date", "");
    await saveEditForm(page, "Save changes", /\/dashboard\/invoices\/[0-9a-f-]+$/, "clear paid");
    {
      const sb = fixtures.getClient();
      const { data } = await sb
        .from("invoices")
        .select("paid_at")
        .eq("id", ids.paidInv)
        .single();
      check("invoice paid_at cleared", data?.paid_at === null, String(data?.paid_at));
    }

    section("6. Quotes: list Edit, form dates, persistence");
    await nav(page, "/dashboard/quotes");
    check(
      "accepted quote row has an Edit button",
      (await page.locator('a[aria-label="Edit quote Q-900001"]').count()) === 1
    );
    await page.locator('a[aria-label="Edit quote Q-900001"]').click();
    await waitForPath(page, /\/dashboard\/quotes\/[0-9a-f-]+\/edit$/, 30000);
    check(
      "quote form exposes quote_date",
      (await page.locator("#quote_date").count()) === 1
    );
    check(
      "quote form exposes sent_date",
      (await page.locator("#sent_date").count()) === 1
    );
    check(
      "quote form exposes accepted_date",
      (await page.locator("#accepted_date").count()) === 1
    );
    check(
      "quote sent_date prefilled",
      (await page.locator("#sent_date").inputValue()) === QUOTE_SENT,
      await page.locator("#sent_date").inputValue()
    );
    check(
      "quote accepted_date prefilled",
      (await page.locator("#accepted_date").inputValue()) === QUOTE_ACCEPTED,
      await page.locator("#accepted_date").inputValue()
    );

    await fillDate(page, "#sent_date", "2025-11-09");
    await fillDate(page, "#accepted_date", "2025-12-08");
    await saveEditForm(
      page,
      "Save changes",
      /\/dashboard\/quotes\/[0-9a-f-]+$/,
      "quote dates"
    );

    {
      const sb = fixtures.getClient();
      const { data } = await sb
        .from("quotes")
        .select("sent_at, accepted_at")
        .eq("id", ids.acceptedQte)
        .single();
      check(
        "quote sent_at updated",
        String(data?.sent_at).startsWith("2025-11-09"),
        data?.sent_at
      );
      check(
        "quote accepted_at updated",
        String(data?.accepted_at).startsWith("2025-12-08"),
        data?.accepted_at
      );
    }

    section("7. Hygiene");
    check("no 5xx responses", badResponses.length === 0, badResponses.join(" | "));
    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));

    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} assertions passed`);
    if (failures > 0) {
      console.log("FAILED:");
      for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name} ${r.detail}`);
    }
  } finally {
    await browser.close();
    await fixtures.down();
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("test error:", err?.message ?? err);
  try {
    await fixtures.down();
  } catch {}
  process.exit(1);
});