// TEMPORARY verification for the super-admin "open account" (impersonation) feature.
// Runs against a LOCAL prod server (npm run start) started with
// SUPER_ADMIN_EMAILS including pwa-test-1301678156@example.com in .env.local.
//
//   node test-impersonation.js
//
// Exits 0 only if every assertion passed.
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

async function settleForm(page, buttonName) {
  await waitForSubmitFormHydration(page, buttonName);
  await page.waitForTimeout(1500);
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
  await settleForm(page, "Sign Out");
  await page.getByRole("button", { name: "Sign Out" }).first().click();
  await waitForPath(page, /\/login/, 30000);
}

async function clickSubmit(page, buttonName, targetRe, label) {
  const trace = [];
  const onReq = (r) => {
    if (r.method() !== "GET") trace.push(`${r.method()} ${r.url().replace(BASE, "")}`);
  };
  page.on("request", onReq);
  await page.getByRole("button", { name: buttonName }).first().click();
  let ok = true;
  try {
    await waitForPath(page, targetRe, 20000);
  } catch {
    ok = false;
  }
  page.off("request", onReq);
  if (!ok) {
    console.log(`  !! ${label}: no navigation after "${buttonName}"`);
    console.log(`     path: ${new URL(page.url()).pathname}`);
    console.log(`     non-GET requests: ${trace.length ? trace.join(", ") : "(none)"}`);
  }
  return ok;
}

async function saveEditForm(page, { buttonName, targetRe, label, fill }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await settleForm(page, buttonName);
    await fill(page);
    if (await clickSubmit(page, buttonName, targetRe, `${label} (attempt ${attempt})`)) {
      return attempt;
    }
    console.log(`     retrying ${label}...`);
  }
  return 0;
}

async function pickFirstCustomer(page, selectLocator) {
  await selectLocator.waitFor({ state: "visible", timeout: 20000 });
  const probe = await selectLocator.evaluate((el) => {
    el.setAttribute("data-probe", "1");
    return "select[data-probe='1']";
  });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return Array.from(el.options).some((o) => o.value !== "");
    },
    probe,
    { timeout: 20000 }
  );
  const value = await selectLocator.evaluate((el) => {
    const opt = Array.from(el.options).find((o) => o.value !== "");
    return opt ? { value: opt.value, label: opt.textContent.trim() } : null;
  });
  if (!value) throw new Error("No customer options available");
  await selectLocator.selectOption(value.value);
  await selectLocator.evaluate((el) => el.removeAttribute("data-probe"));
  return value.label;
}

async function createInvoice(page, title) {
  await nav(page, "/dashboard/invoices/new");
  await page.getByRole("heading", { name: "New Invoice" }).waitFor({ timeout: 30000 });
  await waitForSubmitFormHydration(page, "Create Invoice");
  await pickFirstCustomer(page, page.locator("form select").first());
  await page.locator("#title").fill(title);
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  await page.locator("#due_date").fill(due);
  await page.locator('input[placeholder="Item description"]').first().fill("Imp Test Line");
  await page.locator('input[type="number"]:not([step])').first().fill("1");
  await page.locator('input[step="0.01"]').first().fill("10.00");
  return clickSubmit(page, "Create Invoice", /\/dashboard\/invoices$/, `create ${title}`);
}

async function createQuote(page, title) {
  await nav(page, "/dashboard/quotes/new");
  await page.getByRole("heading", { name: "New Quote" }).waitFor({ timeout: 30000 });
  await waitForSubmitFormHydration(page, "Create Quote");
  await pickFirstCustomer(page, page.locator("#contact_id"));
  await page.locator("#title").fill(title);
  await page.locator('input[placeholder="Description"]').first().fill("Imp Test QTE Line");
  await page.locator('input[placeholder="Qty"]').first().fill("1");
  await page.locator('input[placeholder="Unit Price"]').first().fill("10.00");
  return clickSubmit(page, "Create Quote", /\/dashboard\/quotes$/, `create ${title}`);
}

async function findInvoiceByTitle(orgId, title) {
  const sb = fixtures.getClient();
  const { data } = await sb
    .from("invoices")
    .select("id, title, status")
    .eq("org_id", orgId)
    .eq("title", title)
    .maybeSingle();
  return data;
}

async function findQuoteByTitle(orgId, title) {
  const sb = fixtures.getClient();
  const { data } = await sb
    .from("quotes")
    .select("id, title, status")
    .eq("org_id", orgId)
    .eq("title", title)
    .maybeSingle();
  return data;
}

const DRAFT_TITLE = "Imp Draft INV";
const DRAFT_TITLE_NEW = "Imp Draft INV CHANGED";
const PAID_TITLE = "Imp Paid INV";
const PAID_TITLE_NEW = "Imp Paid INV CHANGED";
const QTE_TITLE = "Imp QTE";
const QTE_TITLE_NEW = "Imp QTE CHANGED";

async function main() {
  section("0. Create fixture account");
  const fx = await fixtures.up();
  console.log(`fixture: ${fx.email} org=${fx.orgId}`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) badResponses.push(`${r.status()} ${r.url()}`);
  });

  try {
    // ------------------------------------------------ 1. fixture user baseline
    section("1. Fixture user (free plan): gates still apply");
    await login(page, fx.email, fx.password);
    check("fixture lands on /dashboard", /\/dashboard/.test(page.url()), page.url());
    check(
      "fixture sidebar has NO Admin link",
      (await page.getByRole("link", { name: "Admin" }).count()) === 0
    );
    check(
      "fixture header shows fixture email",
      await page.locator("header").getByText(fx.email).isVisible().catch(() => false)
    );

    await createInvoice(page, DRAFT_TITLE);
    await createQuote(page, QTE_TITLE);
    await createInvoice(page, PAID_TITLE);
    const draft = await findInvoiceByTitle(fx.orgId, DRAFT_TITLE);
    const paid = await findInvoiceByTitle(fx.orgId, PAID_TITLE);
    const quote = await findQuoteByTitle(fx.orgId, QTE_TITLE);
    check("draft invoice created", Boolean(draft), draft?.id ?? "missing");
    check("paid invoice created", Boolean(paid), paid?.id ?? "missing");
    check("quote created", Boolean(quote), quote?.id ?? "missing");
    if (!draft || !paid || !quote) throw new Error("fixture setup failed");

    {
      const sb = fixtures.getClient();
      await sb.from("invoices").update({ status: "paid" }).eq("id", paid.id);
      const { data: flipped } = await sb
        .from("invoices")
        .select("status")
        .eq("id", paid.id)
        .single();
      check("invoice flipped to paid", flipped?.status === "paid", flipped?.status);
    }

    await nav(page, `/dashboard/invoices/${draft.id}`);
    check(
      "free draft invoice: shows 'Upgrade to edit'",
      await page
        .getByRole("link", { name: "Upgrade to edit" })
        .first()
        .isVisible()
        .catch(() => false)
    );
    check(
      "free draft invoice: no Edit link",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 0
    );

    await nav(page, `/dashboard/invoices/${paid.id}`);
    check(
      "free paid invoice: plan gate wins ('Upgrade to edit')",
      await page
        .getByRole("link", { name: "Upgrade to edit" })
        .first()
        .isVisible()
        .catch(() => false)
    );
    check(
      "free paid invoice: no Edit link",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 0
    );

    await nav(page, `/dashboard/invoices/${draft.id}/edit`);
    check(
      "free invoice /edit: Pro gate card",
      /Upgrade to Pro|Pro feature/i.test(await page.locator("body").innerText())
    );

    // Pro + paid reaches the paid-lock state (plan gate passes first).
    {
      const sb = fixtures.getClient();
      await sb
        .from("subscriptions")
        .update({ plan: "pro", status: "active" })
        .eq("user_id", fx.userId)
        .eq("org_id", fx.orgId);
    }
    await nav(page, `/dashboard/invoices/${paid.id}`);
    check(
      "pro paid invoice: shows 'Paid — locked'",
      await page
        .getByRole("link", { name: "Paid — locked" })
        .first()
        .isVisible()
        .catch(() => false)
    );
    check(
      "pro paid invoice: no Edit link",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 0
    );
    await nav(page, `/dashboard/invoices/${draft.id}`);
    check(
      "pro draft invoice: Edit link",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 1
    );
    {
      const sb = fixtures.getClient();
      await sb
        .from("subscriptions")
        .update({ plan: "free", status: "active" })
        .eq("user_id", fx.userId)
        .eq("org_id", fx.orgId);
    }

    await signOut(page);
    check("fixture signed out", /\/login/.test(page.url()), page.url());

    // ------------------------------------------- 2. super admin opens the account
    section("2. Super admin opens the fixture account");
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    check("admin lands on /dashboard", /\/dashboard/.test(page.url()), page.url());
    const adminLink = page.getByRole("link", { name: "Admin" });
    check("admin sidebar shows Admin link", (await adminLink.count()) === 1);
    await adminLink.click();
    await waitForPath(page, /\/dashboard\/admin/, 30000);
    check("admin page loads", /\/dashboard\/admin/.test(page.url()), page.url());

    const fixtureRow = page
      .getByRole("row")
      .filter({ hasText: fx.email });
    const openBtn = fixtureRow.getByRole("button", { name: "Open account" });
    check("fixture row has 'Open account' button", (await openBtn.count()) === 1);

    const ownRow = page
      .getByRole("row")
      .filter({ hasText: ADMIN_EMAIL });
    check(
      "own row has NO 'Open account' button",
      (await ownRow.getByRole("button", { name: "Open account" }).count()) === 0
    );

    await openBtn.click();
    await page
      .getByText("account as super admin")
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
    check(
      "lands on /dashboard after Open account",
      /\/dashboard$/.test(new URL(page.url()).pathname),
      page.url()
    );
    check(
      "impersonation banner shows fixture email",
      (await page.locator("body").innerText()).includes(fx.email)
    );
    check(
      "header now shows fixture email",
      await page.locator("header").getByText(fx.email).isVisible().catch(() => false)
    );
    check(
      "sidebar has NO Admin link while impersonating",
      (await page.getByRole("link", { name: "Admin" }).count()) === 0
    );

    // -------------------------------------------- 3. edit as the opened account
    section("3. Edit invoices/quotes inside the opened account");

    // draft invoice
    await nav(page, `/dashboard/invoices/${draft.id}`);
    check(
      "impersonated draft invoice: Edit link (no upgrade gate)",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 1
    );
    check(
      "impersonated draft invoice: no 'Upgrade to edit'",
      (await page.getByRole("link", { name: "Upgrade to edit" }).count()) === 0
    );
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await waitForPath(page, new RegExp(`/dashboard/invoices/${draft.id}/edit`), 30000);
    check(
      "draft invoice edit form loads",
      (await page.locator("#title").inputValue()) === DRAFT_TITLE,
      await page.locator("#title").inputValue()
    );
    check(
      "invoice date field visible (super-admin power)",
      (await page.locator("#invoice_date").count()) === 1
    );
    const draftAttempts = await saveEditForm(page, {
      buttonName: "Save changes",
      targetRe: new RegExp(`/dashboard/invoices/${draft.id}$`),
      label: "save draft invoice",
      fill: async (p) => {
        await p.locator("#title").fill(DRAFT_TITLE_NEW);
      },
    });
    check("draft invoice saved", draftAttempts > 0, page.url());
    const draftDb = await findInvoiceByTitle(fx.orgId, DRAFT_TITLE_NEW);
    check("DB: draft invoice title persisted", Boolean(draftDb), draftDb?.title);

    // paid invoice (paid-lock bypass)
    await nav(page, `/dashboard/invoices/${paid.id}`);
    check(
      "impersonated paid invoice: Edit link (paid unlocked)",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 1
    );
    check(
      "impersonated paid invoice: no 'Paid — locked'",
      (await page.getByRole("link", { name: "Paid — locked" }).count()) === 0
    );
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await waitForPath(page, new RegExp(`/dashboard/invoices/${paid.id}/edit`), 30000);
    check(
      "paid invoice edit form loads (no locked card)",
      (await page.locator("#title").count()) === 1,
      page.url()
    );
    const paidAttempts = await saveEditForm(page, {
      buttonName: "Save changes",
      targetRe: new RegExp(`/dashboard/invoices/${paid.id}$`),
      label: "save paid invoice",
      fill: async (p) => {
        await p.locator("#title").fill(PAID_TITLE_NEW);
      },
    });
    check("paid invoice saved", paidAttempts > 0, page.url());
    const paidDb = await findInvoiceByTitle(fx.orgId, PAID_TITLE_NEW);
    check("DB: paid invoice title persisted", Boolean(paidDb), paidDb?.title);

    // quote
    await nav(page, `/dashboard/quotes/${quote.id}`);
    check(
      "impersonated quote: Edit link",
      (await page.getByRole("link", { name: "Edit", exact: true }).count()) === 1
    );
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await waitForPath(page, new RegExp(`/dashboard/quotes/${quote.id}/edit`), 30000);
    check(
      "quote edit form loads",
      (await page.locator("#title").inputValue()) === QTE_TITLE,
      await page.locator("#title").inputValue()
    );
    const qteAttempts = await saveEditForm(page, {
      buttonName: "Save changes",
      targetRe: new RegExp(`/dashboard/quotes/${quote.id}$`),
      label: "save quote",
      fill: async (p) => {
        await p.locator("#title").fill(QTE_TITLE_NEW);
      },
    });
    check("quote saved", qteAttempts > 0, page.url());
    const qteDb = await findQuoteByTitle(fx.orgId, QTE_TITLE_NEW);
    check("DB: quote title persisted", Boolean(qteDb), qteDb?.title);

    // -------------------------------------------------------- 4. exit
    section("4. Exit back to the super admin account");
    const exitBtn = page.getByRole("button", { name: "Exit to my account" });
    check("banner Exit button visible", (await exitBtn.count()) === 1);
    await exitBtn.click();
    await page
      .getByText("account as super admin")
      .first()
      .waitFor({ state: "detached", timeout: 30000 })
      .catch(() => {});
    check(
      "banner gone after exit",
      (await page.getByText("account as super admin").count()) === 0
    );
    check(
      "header restored to admin email",
      await page.locator("header").getByText(ADMIN_EMAIL).isVisible().catch(() => false),
      page.url()
    );
    await nav(page, "/dashboard/admin");
    check(
      "admin can still open the Admin page after exit",
      (await page.getByRole("row").filter({ hasText: fx.email }).count()) === 1
    );

    // -------------------------------------------------------- 5. health
    section("5. Runtime health");
    check("no 5xx responses", badResponses.length === 0, badResponses.join(", "));
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
    if (consoleErrors.length) {
      console.log(`note: ${consoleErrors.length} console error(s):`);
      for (const e of consoleErrors.slice(0, 5)) console.log(`   ${e}`);
    }
  } catch (err) {
    failures++;
    console.log(`\nTHREW: ${err?.message ?? err}`);
    console.log(err?.stack?.split("\n").slice(0, 6).join("\n") ?? "");
  } finally {
    section("6. Cleanup");
    try {
      const cleaned = await fixtures.down();
      check(
        "fixture account removed",
        Boolean(cleaned?.cleaned?.userIds?.length),
        JSON.stringify(cleaned?.cleaned ?? {})
      );
    } catch (e) {
      console.log(`cleanup FAILED: ${e?.message}`);
      failures++;
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=========== ${passed}/${results.length} assertions passed ===========`);
  if (failures) {
    console.log("FAILURES:");
    for (const r of results.filter((r) => !r.ok)) console.log(` - ${r.name} ${r.detail}`);
  }
  process.exit(failures ? 1 : 0);
}

main();
