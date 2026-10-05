// TEMPORARY verification for the restore tray + expense/cost reporting.
// Requires a LOCAL prod server with SUPER_ADMIN_EMAILS including
// pwa-test-1301678156@example.com in .env.local.
//
//   node test-restore-and-costs.js
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

async function login(page) {
  await nav(page, "/login");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 45000 }),
    page.getByRole("button", { name: /sign in/i }).first().click(),
  ]);
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) pageErrors.push(`5xx ${r.status()} ${r.url()}`);
  });

  await login(page);

  // These Pro-only surfaces are exercised as a Pro user: promote the admin's
  // subscription for the duration of the run and restore it afterwards.
  const sb = fixtures.getClient();
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
  const originalSub = existingSub
    ? { ...existingSub }
    : null;
  await sb
    .from("subscriptions")
    .update({ plan: "pro", status: "active" })
    .eq("org_id", org);
  check("admin org set to Pro for the run", true, `was ${originalSub?.plan ?? "none"}`);

  // Restore the original subscription state once the run finishes.
  async function restoreSubscription() {
    if (originalSub) {
      await sb
        .from("subscriptions")
        .update({
          plan: originalSub.plan,
          status: originalSub.status,
        })
        .eq("org_id", org);
    }
  }

  section("Restore tray on quotes list");
  const { data: probeContact } = await sb
    .from("contacts")
    .select("id")
    .eq("org_id", org)
    .limit(1)
    .maybeSingle();
  const contactId = probeContact?.id;
  check("admin org has a contact to bill", !!contactId);

  const { data: quote } = await sb
    .from("quotes")
    .insert({
      org_id: org,
      contact_id: contactId,
      number: "Q-999901",
      title: "Restore tray probe",
      status: "draft",
      subtotal: 10000,
      tax_rate: 20,
      tax_amount: 2000,
      total: 12000,
      currency: "GBP",
    })
    .select("*")
    .single();

  check("seeded probe quote", !!quote?.id, quote?.number);

  await sb.from("quote_items").insert({
    quote_id: quote.id,
    description: "Probe line",
    quantity: 1,
    unit_price: 10000,
    total: 10000,
  });

  // Delete through the app so the activity_log payload is written the same way
  // a real user delete is.
  await nav(page, `/dashboard/quotes/${quote.id}`);
  if (process.env.DUMP_HTML) {
    const buttons = await page.$$eval("button", (els) =>
      els.map((e) => (e.textContent || "").trim())
    );
    const links = await page.$$eval("a", (els) =>
      els.map((e) => (e.textContent || "").trim())
    );
    const body = (await page.textContent("body")) ?? "";
    console.log("URL:", page.url());
    console.log("BUTTONS:", JSON.stringify(buttons));
    console.log("LINKS:", JSON.stringify(links));
    console.log("BODY:", body.slice(0, 600));
  }
  // The delete control is a server-action submit, so wait for hydration.
  await page
    .getByRole("button", { name: /^Delete$/ })
    .first()
    .waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent || "").trim() === "Delete"
      );
      const form = btn && btn.closest("form");
      return !!(form && Object.keys(form).some((k) => k.startsWith("__react")));
    },
    undefined,
    { timeout: 30000 }
  );
  await page
    .getByRole("button", { name: /^Delete$/ })
    .first()
    .click();
  await page.waitForURL(/dashboard\/quotes$/, { timeout: 45000 });

  const trayHeading = await page
    .getByText(/recently deleted quote/i)
    .first()
    .isVisible()
    .catch(() => false);
  check("quotes list shows deleted tray", trayHeading);

  const stillGone = await sb
    .from("quotes")
    .select("id")
    .eq("id", quote.id)
    .maybeSingle();
  check("probe quote deleted", !stillGone.data);

  // Expand the tray and restore.
  await page.getByRole("button", { name: /show deleted/i }).first().click();
  await page.waitForTimeout(500);
  const restoreBtn = page.getByRole("button", { name: /^restore$/i }).first();
  check("restore button visible in tray", await restoreBtn.isVisible());

  await restoreBtn.click();
  await page.waitForTimeout(4000);

  const backAgain = await sb.from("quotes").select("*").eq("id", quote.id).maybeSingle();
  check("quote restored via tray", !!backAgain.data, backAgain.data?.number);

  const items = await sb.from("quote_items").select("*").eq("quote_id", quote.id);
  check("restored line item present", (items.data ?? []).length === 1);

  section("Sales Report shows costs + gross profit");
  await nav(page, "/dashboard/reports/customers");
  await page.waitForTimeout(1500);

  const costsCard = await page
    .getByText(/^Costs \(/i)
    .first()
    .isVisible()
    .catch(() => false);
  check("Sales Report shows Costs card", costsCard);

  const profitCard = await page
    .getByText(/^Gross profit \(/i)
    .first()
    .isVisible()
    .catch(() => false);
  check("Sales Report shows Gross profit card", profitCard);

  const costsSection = await page
    .getByText(/^Costs — /i)
    .first()
    .isVisible()
    .catch(() => false);
  check("Sales Report shows cost breakdown section", costsSection);

  section("Month-End Report shows costs + gross profit");
  await nav(page, "/dashboard/reports/month-end");
  await page.waitForTimeout(1500);

  const meCosts = await page
    .getByText(/^Costs — /i)
    .first()
    .isVisible()
    .catch(() => false);
  check("Month-End shows Costs card", meCosts);

  const meProfit = await page.getByText(/^Gross profit$/i).first().isVisible().catch(() => false);
  check("Month-End shows Gross profit card", meProfit);

  const meSection = await page
    .getByText(/^Costs and profit — /i)
    .first()
    .isVisible()
    .catch(() => false);
  check("Month-End shows costs/profit section", meSection);

  section("10-day restore window is enforced");
  // A quote deleted 11 days ago must NOT be offered for restore, and the
  // server action must refuse it even if invoked directly.
  const { data: oldQuote } = await sb
    .from("quotes")
    .insert({
      org_id: org,
      contact_id: contactId,
      number: "Q-999800",
      title: "Outside restore window",
      status: "draft",
      subtotal: 5000,
      tax_rate: 20,
      tax_amount: 1000,
      total: 6000,
      currency: "GBP",
    })
    .select("*")
    .single();

  const elevenDaysAgo = new Date();
  elevenDaysAgo.setDate(elevenDaysAgo.getDate() - 11);
  const { error: delErr } = await sb
    .from("quotes")
    .delete()
    .eq("id", oldQuote.id);
  check("deleted old quote", !delErr, delErr?.message);

  const { error: logErr } = await sb.from("activity_log").insert({
    org_id: org,
    user_id: adminId,
    action: "deleted",
    entity: "quote",
    entity_id: oldQuote.id,
    label: "Quote Q-999800 — Outside restore window",
    payload: {
      row: oldQuote,
      items: [],
    },
    created_at: elevenDaysAgo.toISOString(),
  });
  check("wrote backdated activity log entry", !logErr, logErr?.message);

  await nav(page, "/dashboard/quotes");
  await page.waitForTimeout(1500);
  const oldShown = await page
    .getByText(/Outside restore window/)
    .first()
    .isVisible()
    .catch(() => false);
  check(
    "11-day-old quote is NOT offered for restore",
    oldShown === false
  );

  const { data: oldLog } = await sb
    .from("activity_log")
    .select("id")
    .eq("entity_id", oldQuote.id)
    .eq("action", "deleted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The Activity page is the other user-facing restore surface; the 11-day-old
  // entry must not appear there either. (Server-side enforcement lives in the
  // restoreEntry action, which is only reachable via Next's server-action
  // protocol rather than a plain POST.)
  await nav(page, "/dashboard/activity");
  await page.waitForTimeout(1500);
  const oldOnActivity = await page
    .getByText(/Outside restore window/)
    .first()
    .isVisible()
    .catch(() => false);
  check("11-day-old entry absent from Activity page", oldOnActivity === false);

  // Clean up the backdated log entry.
  if (oldLog?.id) await sb.from("activity_log").delete().eq("id", oldLog.id);

  section("No errors");
  check("no page errors or 5xx", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  // Clean up seeded probe data.
  await sb.from("quote_items").delete().eq("quote_id", quote.id);
  await sb.from("quotes").delete().eq("id", quote.id);
  await browser.close();

  await restoreSubscription();

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failures > 0) {
    console.log("FAILURES:");
    for (const r of results.filter((x) => !x.ok)) console.log(` - ${r.name} ${r.detail}`);
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});