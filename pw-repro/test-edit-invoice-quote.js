// TEMPORARY verification script for commit b2d8fd7 (invoice/quote editing, Pro-gated).
// Runs against the DEPLOYED site https://crm.dtmstechsolutions.co.uk
// Flips the test org's subscription plan in the DB via the service-role key and
// restores it (free) at the end.
//
//   node test-edit-invoice-quote.js
//
// Exits 0 only if every assertion passed.
const { chromium } = require("playwright");
const db = require("./db");

const BASE = "https://crm.dtmstechsolutions.co.uk";
const EMAIL = "pwa-test-1301678156@example.com";
const PASSWORD = "PwaTest123!";

const INV_TITLE = "Edit Test INV";
const INV_TITLE_NEW = "Edit Test INV CHANGED";
const QTE_TITLE = "Edit Test QTE";
const QTE_TITLE_NEW = "Edit Test QTE CHANGED";
const NEW_UNIT_PRICE = "25.50";
const OLD_UNIT_PRICE_DISPLAY = "10.00";

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

/**
 * The login page and the invoice/quote forms are client components. Clicking their
 * submit buttons before React hydrates triggers a NATIVE form submit (full page
 * reload, state lost), so every such interaction must wait for hydration first.
 */
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

/**
 * Wait until the <form> that OWNS the named submit button is hydrated. The app
 * layout renders a sign-out <form> before the page form, so `document.querySelector
 * ("form")` is the wrong element to poll.
 */
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

/**
 * React attaches `__reactProps$*` to a host node as it hydrates that node, which can
 * be a moment before the delegated event handlers that back the form's onSubmit are
 * live. Clicking in that window is a no-op, so give the client tree a beat to commit
 * and make callers retry.
 */
async function settleForm(page, buttonName) {
  await waitForSubmitFormHydration(page, buttonName);
  await page.waitForTimeout(1500);
}

async function login(page) {
  await nav(page, "/login");
  await waitForHydration(page, "#email");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await waitForPath(page, /\/dashboard/, 45000);
}

/**
 * Wait for location.pathname to match. `page.waitForURL()` can hang on the soft
 * (client-side) navigations that Next's `redirect()` performs from a server action,
 * so poll location.pathname instead.
 */
async function waitForPath(page, re, timeout = 45000) {
  await page.waitForFunction(
    (src) => new RegExp(src).test(location.pathname),
    re.source,
    { timeout }
  );
  await page.waitForLoadState("load").catch(() => {});
}

/** Read the "Total" figure out of a detail page's Summary card (dt/dd pair). */
async function readSummaryTotal(page) {
  return page.evaluate(() => {
    const dt = Array.from(document.querySelectorAll("dt")).find(
      (d) => (d.textContent || "").trim() === "Total"
    );
    return dt && dt.nextElementSibling
      ? (dt.nextElementSibling.textContent || "").trim()
      : null;
  });
}

const gbp = (pence) => `£${(pence / 100).toFixed(2)}`;

/** Click a submit button, tracing the request + label so failures are diagnosable. */
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

/**
 * Fill the edit form and save, retrying to absorb the React hydration race described
 * on settleForm(). Returns the number of attempts used.
 */
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

/** Pick the first real option in a <select> and return its label. */
async function pickFirstCustomer(selectLocator) {
  await selectLocator.waitFor({ state: "visible", timeout: 20000 });
  // CustomerSelect fetches customers client-side; wait for a non-placeholder option.
  await page0.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return Array.from(el.options).some((o) => o.value !== "");
    },
    await selectLocator.evaluate((el) => {
      el.setAttribute("data-probe", "1");
      return "select[data-probe='1']";
    }),
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

let page0 = null;

async function createInvoice() {
  await nav(page0, "/dashboard/invoices/new");
  await page0.getByRole("heading", { name: "New Invoice" }).waitFor({ timeout: 30000 });
  await waitForSubmitFormHydration(page0, "Create Invoice");
  const customer = await pickFirstCustomer(page0.locator("form select").first());
  await page0.locator("#title").fill(INV_TITLE);
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  await page0.locator("#due_date").fill(due);
  await page0.locator('input[placeholder="Item description"]').first().fill("Edit Test Line");
  await page0.locator('input[type="number"]:not([step])').first().fill("1");
  await page0.locator('input[step="0.01"]').first().fill(OLD_UNIT_PRICE_DISPLAY);
  await clickSubmit(page0, "Create Invoice", /\/dashboard\/invoices$/, "create invoice");
  return customer;
}

async function createQuote() {
  await nav(page0, "/dashboard/quotes/new");
  await page0.getByRole("heading", { name: "New Quote" }).waitFor({ timeout: 30000 });
  await waitForSubmitFormHydration(page0, "Create Quote");
  const customer = await pickFirstCustomer(page0.locator("#contact_id"));
  await page0.locator("#title").fill(QTE_TITLE);
  await page0.locator('input[placeholder="Description"]').first().fill("Edit Test QTE Line");
  await page0.locator('input[placeholder="Qty"]').first().fill("1");
  await page0.locator('input[placeholder="Unit Price"]').first().fill(OLD_UNIT_PRICE_DISPLAY);
  await clickSubmit(page0, "Create Quote", /\/dashboard\/quotes$/, "create quote");
  return customer;
}

async function main() {
  const st0 = await db.state();
  const origPlan = st0.subscriptions[0]?.plan ?? "free";
  const origStatus = st0.subscriptions[0]?.status ?? "active";
  console.log(
    `orig subscription: plan=${origPlan} status=${origStatus}; ` +
      `invoices=${st0.invoices.length} quotes=${st0.quotes.length}`
  );

  // Always start from a known-free state.
  await db.setSubscription("free", "active");

  // Remove leftovers from any previous run so re-runs stay under the free
  // 20-documents-per-month limit and the id lookups are unambiguous.
  const stale = await db.findDocs(INV_TITLE, QTE_TITLE);
  for (const d of stale.invoices) await db.deleteDoc("invoice", d.id);
  for (const d of stale.quotes) await db.deleteDoc("quote", d.id);
  console.log(
    `pre-clean removed: ${stale.invoices.length} invoice(s), ${stale.quotes.length} quote(s)`
  );

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  page0 = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  page0.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page0.on("pageerror", (e) => pageErrors.push(String(e)));
  page0.on("response", (r) => {
    if (r.status() >= 500) badResponses.push(`${r.status()} ${r.url()}`);
  });

  let invoiceId = null;
  let quoteId = null;
  let invOrigStatus = null;

  try {
    // ---------------------------------------------------------------- 1. login
    section("1. Login");
    await login(page0);
    check("logs in and lands on /dashboard", /\/dashboard/.test(page0.url()), page0.url());

    // ------------------------------------------- 2. create invoice + quote
    section("2. Create test invoice + quote via UI");
    const invCustomer = await createInvoice();
    const qteCustomer = await createQuote();
    console.log(`invoice customer: ${invCustomer} | quote customer: ${qteCustomer}`);

    const found = await db.findDocs(INV_TITLE, QTE_TITLE);
    const inv = found.invoices.find((i) => i.title === INV_TITLE);
    const qte = found.quotes.find((q) => q.title === QTE_TITLE);
    invoiceId = inv?.id ?? null;
    quoteId = qte?.id ?? null;
    invOrigStatus = inv?.status ?? null;
    check("test invoice created", Boolean(invoiceId), invoiceId ?? "not found");
    check("test quote created", Boolean(quoteId), quoteId ?? "not found");
    if (!invoiceId || !quoteId) throw new Error("setup failed, cannot continue");

    // ------------------------------------------ 3. FREE-state assertions
    section("3. Free plan: gated");
    for (const [label, kind, id] of [
      ["invoice", "invoices", invoiceId],
      ["quote", "quotes", quoteId],
    ]) {
      const detailUrl = `${BASE}/dashboard/${kind}/${id}`;
      const editUrl = `${detailUrl}/edit`;

      await nav(page0, `/dashboard/${kind}/${id}`);
      const upgrade = page0
        .getByRole("link", { name: "Upgrade to edit" })
        .first();
      check(
        `${label} detail (free) shows "Upgrade to edit"`,
        await upgrade.isVisible().catch(() => false)
      );
      check(
        `${label} detail (free) "Upgrade to edit" href -> /dashboard/billing`,
        ((await upgrade.getAttribute("href").catch(() => null)) ?? "").includes(
          "/dashboard/billing"
        )
      );
      check(
        `${label} detail (free) has NO /edit link`,
        (await page0.locator(`a[href$="/dashboard/${kind}/${id}/edit"]`).count()) === 0
      );

      await nav(page0, `/dashboard/${kind}/${id}/edit`);
      const body = await page0.locator("body").innerText();
      check(
        `${label} /edit (free) shows Pro upgrade card`,
        /Pro feature/i.test(body) || /Upgrade to Pro/i.test(body),
        body.match(/Editing \w+ is a Pro feature/)?.[0] ?? body.slice(0, 80)
      );
      check(
        `${label} /edit (free) has no editable title input`,
        (await page0.locator("#title").count()) === 0
      );
      check(
        `${label} /edit (free) has no Save changes button`,
        (await page0.getByRole("button", { name: "Save changes" }).count()) === 0
      );
      void editUrl;
      void detailUrl;
    }

    // ------------------------------------------------- 4. flip to Pro
    section("4. Flip subscription to Pro");
    const flipped = await db.setSubscription("pro", "active");
    console.log(`subscription -> ${JSON.stringify(flipped)}`);

    // ----------------------------------------- 5a. Pro: edit the INVOICE
    section("5a. Pro plan: edit invoice");
    await nav(page0, `/dashboard/invoices/${invoiceId}`);
    const invEditLink = page0.locator(`a[href="/dashboard/invoices/${invoiceId}/edit"]`);
    check("invoice detail (pro) shows Edit link", (await invEditLink.count()) === 1);
    check(
      "invoice detail (pro) no longer shows 'Upgrade to edit'",
      (await page0.getByRole("link", { name: "Upgrade to edit" }).count()) === 0
    );
    await invEditLink.click();
    await waitForPath(page0, new RegExp(`/dashboard/invoices/${invoiceId}/edit`), 30000);
    check(
      "invoice edit page loads (pro)",
      /\/edit$/.test(page0.url()),
      page0.url()
    );
    check(
      "invoice edit form prefilled with title",
      (await page0.locator("#title").inputValue()) === INV_TITLE,
      await page0.locator("#title").inputValue()
    );
    const prefilledPrice = await page0
      .locator('input[step="0.01"]')
      .first()
      .inputValue();
    check(
      "invoice edit form prefilled with first item unit price",
      Number(prefilledPrice) === 10,
      prefilledPrice
    );
    const prefilledDesc = await page0
      .locator('input[placeholder="Item description"]')
      .first()
      .inputValue();
    check(
      "invoice edit form prefilled with line item description",
      prefilledDesc === "Edit Test Line",
      prefilledDesc
    );
    await waitForSubmitFormHydration(page0, "Save changes");

    const invAttempts = await saveEditForm(page0, {
      buttonName: "Save changes",
      targetRe: new RegExp(`/dashboard/invoices/${invoiceId}$`),
      label: "save invoice",
      fill: async (p) => {
        await p.locator("#title").fill(INV_TITLE_NEW);
        await p.locator('input[step="0.01"]').first().fill(NEW_UNIT_PRICE);
      },
    });
    check("invoice save navigates to detail page", invAttempts > 0, page0.url());
    console.log(`  (invoice save took ${invAttempts} attempt(s))`);
    const invDetailText = await page0.locator("body").innerText();
    check("invoice save lands on detail page", /\/invoices\/[0-9a-f-]+$/.test(page0.url()), page0.url());
    check("invoice detail shows new title", invDetailText.includes(INV_TITLE_NEW));
    const invDb = await db.getInvoice(invoiceId);
    check(
      "DB: invoice title persisted",
      invDb.title === INV_TITLE_NEW,
      invDb.title
    );
    check(
      "DB: invoice unit price persisted as 2550p",
      Number(invDb.invoice_items?.[0]?.unit_price) === 2550,
      String(invDb.invoice_items?.[0]?.unit_price)
    );
    check(
      "DB: invoice total recalculated from items + tax",
      Number(invDb.total) ===
        Number(invDb.subtotal) +
          Math.round(Number(invDb.subtotal) * (Number(invDb.tax_rate) / 100)) &&
        Number(invDb.total) === 2550,
      `total=${invDb.total} subtotal=${invDb.subtotal} tax_rate=${invDb.tax_rate}`
    );
    const invShownTotal = await readSummaryTotal(page0);
    check(
      "invoice detail shows new total",
      invShownTotal === gbp(2550),
      `showing ${invShownTotal}, expected ${gbp(2550)} (tax ${invDb.tax_rate}%)`
    );

    // ------------------------------------------- 5b. Pro: edit the QUOTE
    section("5b. Pro plan: edit quote");
    await nav(page0, `/dashboard/quotes/${quoteId}`);
    const qteEditLink = page0.locator(`a[href="/dashboard/quotes/${quoteId}/edit"]`);
    check("quote detail (pro) shows Edit link", (await qteEditLink.count()) === 1);
    check(
      "quote detail (pro) no longer shows 'Upgrade to edit'",
      (await page0.getByRole("link", { name: "Upgrade to edit" }).count()) === 0
    );
    await qteEditLink.click();
    await waitForPath(page0, new RegExp(`/dashboard/quotes/${quoteId}/edit`), 30000);
    check(
      "quote edit page loads (pro)",
      /\/edit$/.test(page0.url()),
      page0.url()
    );
    check(
      "quote edit form prefilled with title",
      (await page0.locator("#title").inputValue()) === QTE_TITLE,
      await page0.locator("#title").inputValue()
    );
    const qPrice = await page0.locator('input[placeholder="Unit Price"]').first().inputValue();
    check("quote edit form prefilled with unit price", Number(qPrice) === 10, qPrice);
    await waitForSubmitFormHydration(page0, "Save changes");

    const qteAttempts = await saveEditForm(page0, {
      buttonName: "Save changes",
      targetRe: new RegExp(`/dashboard/quotes/${quoteId}$`),
      label: "save quote",
      fill: async (p) => {
        await p.locator("#title").fill(QTE_TITLE_NEW);
        await p.locator('input[placeholder="Unit Price"]').first().fill(NEW_UNIT_PRICE);
      },
    });
    check("quote save navigates to detail page", qteAttempts > 0, page0.url());
    console.log(`  (quote save took ${qteAttempts} attempt(s))`);
    const qteDetailText = await page0.locator("body").innerText();
    check("quote save lands on detail page", /\/quotes\/[0-9a-f-]+$/.test(page0.url()), page0.url());
    check("quote detail shows new title", qteDetailText.includes(QTE_TITLE_NEW));
    const qteDb = await db.getQuote(quoteId);
    check("DB: quote title persisted", qteDb.title === QTE_TITLE_NEW, qteDb.title);
    check(
      "DB: quote unit price persisted as 2550p",
      Number(qteDb.quote_items?.[0]?.unit_price) === 2550,
      String(qteDb.quote_items?.[0]?.unit_price)
    );
    // Quotes default to 20% VAT (quote-form.tsx: `quote?.tax_rate ?? 20`), so the
    // expected total is 2550 + 20% = 3060, not 2550.
    const qteExpected = 2550 + Math.round(2550 * (Number(qteDb.tax_rate) / 100));
    check(
      "DB: quote total recalculated from items + tax",
      Number(qteDb.total) === qteExpected && Number(qteDb.subtotal) === 2550,
      `total=${qteDb.total} subtotal=${qteDb.subtotal} tax_rate=${qteDb.tax_rate} expected=${qteExpected}`
    );
    const qteShownTotal = await readSummaryTotal(page0);
    check(
      "quote detail shows new total",
      qteShownTotal === gbp(qteExpected),
      `showing ${qteShownTotal}, expected ${gbp(qteExpected)} (tax ${qteDb.tax_rate}%)`
    );

    // ------------------------------------------------ 6. paid-invoice lock
    section("6. Paid invoice lock");
    await db.setInvoiceStatus(invoiceId, "paid");
    await nav(page0, `/dashboard/invoices/${invoiceId}/edit`);
    const paidBody = await page0.locator("body").innerText();
    check(
      "paid invoice /edit shows 'Paid invoices cannot be edited'",
      paidBody.includes("Paid invoices cannot be edited"),
      paidBody.slice(0, 120).replace(/\n/g, " | ")
    );
    check(
      "paid invoice /edit shows the 'cannot be edited' card",
      paidBody.includes("This invoice cannot be edited")
    );
    check(
      "paid invoice /edit does NOT show the form",
      (await page0.locator("#title").count()) === 0 &&
        (await page0.getByRole("button", { name: "Save changes" }).count()) === 0
    );
    // restore
    if (invOrigStatus) await db.setInvoiceStatus(invoiceId, invOrigStatus);
    const restored = await db.getInvoice(invoiceId);
    check(
      "invoice status restored",
      restored.status === invOrigStatus,
      `${restored.status} (was ${invOrigStatus})`
    );

    // ------------------------------------------------- 7. back to free
    section("7. Restore subscription to free");
    const back = await db.setSubscription("free", "active");
    console.log(`subscription -> ${JSON.stringify(back)}`);
    await nav(page0, `/dashboard/invoices/${invoiceId}`);
    check(
      "invoice detail (free again) shows 'Upgrade to edit'",
      await page0
        .getByRole("link", { name: "Upgrade to edit" })
        .first()
        .isVisible()
        .catch(() => false)
    );
    check(
      "invoice detail (free again) has no /edit link",
      (await page0.locator(`a[href$="/dashboard/invoices/${invoiceId}/edit"]`).count()) === 0
    );
    await nav(page0, `/dashboard/quotes/${quoteId}`);
    check(
      "quote detail (free again) shows 'Upgrade to edit'",
      await page0
        .getByRole("link", { name: "Upgrade to edit" })
        .first()
        .isVisible()
        .catch(() => false)
    );
    await nav(page0, `/dashboard/invoices/${invoiceId}/edit`);
    check(
      "invoice /edit (free again) shows Pro upgrade card",
      /Upgrade to Pro/i.test(await page0.locator("body").innerText())
    );
    await nav(page0, `/dashboard/quotes/${quoteId}/edit`);
    check(
      "quote /edit (free again) shows Pro upgrade card",
      /Upgrade to Pro/i.test(await page0.locator("body").innerText())
    );

    // ------------------------------------------------------ 8. clean up
    section("8. Clean up test documents");
    for (const [kind, id] of [
      ["invoice", invoiceId],
      ["quote", quoteId],
    ]) {
      const path = kind === "invoice" ? `/dashboard/invoices/${id}` : `/dashboard/quotes/${id}`;
      const listRe =
        kind === "invoice" ? /\/dashboard\/invoices$/ : /\/dashboard\/quotes$/;
      await nav(page0, path);
      const del = page0.getByRole("button", { name: "Delete" }).first();
      if ((await del.count()) > 0) {
        const ok = await clickSubmit(page0, "Delete", listRe, `delete ${kind}`);
        check(`${kind} deleted via UI Delete button`, ok, page0.url());
      } else {
        const rows = await db.deleteDoc(kind, id);
        check(`${kind} deleted via service key fallback`, (rows ?? []).length === 1);
      }
    }
    const leftover = await db.findDocs(INV_TITLE_NEW, QTE_TITLE_NEW);
    const leftoverAll = await db.findDocs(INV_TITLE, QTE_TITLE);
    check(
      "no test documents left in DB",
      leftover.invoices.length === 0 &&
        leftover.quotes.length === 0 &&
        leftoverAll.invoices.length === 0 &&
        leftoverAll.quotes.length === 0,
      JSON.stringify({
        changed: {
          i: leftover.invoices.length,
          q: leftover.quotes.length,
        },
        orig: { i: leftoverAll.invoices.length, q: leftoverAll.quotes.length },
      })
    );

    // ------------------------------------------------- 9. server health
    section("9. Runtime health");
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
    // Final safety net: always leave the org on the original plan.
    try {
      await db.setSubscription("free", "active");
      console.log(`\nsafety: subscription forced to free/active (orig was ${origPlan}/${origStatus})`);
    } catch (e) {
      console.log(`safety restore FAILED: ${e?.message}`);
      failures++;
    }
    if (invoiceId && invOrigStatus) {
      try {
        await db.setInvoiceStatus(invoiceId, invOrigStatus);
      } catch {}
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=========== ${passed}/${results.length} assertions passed ===========`);
  if (failures) {
    console.log("FAILURES:");
    for (const r of results.filter((x) => !x.ok)) console.log(` - ${r.name} ${r.detail}`);
  }
  process.exit(failures ? 1 : 0);
}

main();
