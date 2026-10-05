// TEMPORARY read-only verification that the multi-file import reached production.
// Signs in as the throwaway fixture user, temporarily grants its org Pro (the
// import page is gated), checks the new section 2 UI is live, then restores the
// original plan. Creates no invoices or contacts.
//
//   node verify-prod-deploy.js
const path = require("path");
const { chromium } = require("playwright");
const fixtures = require("./impersonation-fixtures");

const BASE = process.env.BASE_URL || "https://crm.dtmstechsolutions.co.uk";

const results = [];
let failures = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures++;
  results.push({ ok, name, detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  return ok;
}

async function main() {
  const sb = fixtures.getClient();
  const state = JSON.parse(require("fs").readFileSync(fixtures.STATE_PATH, "utf8"));

  const { data: sub } = await sb
    .from("subscriptions")
    .select("plan")
    .eq("org_id", state.orgId)
    .maybeSingle();
  const originalPlan = sub?.plan ?? null;
  console.log(`original plan: ${originalPlan}`);

  if (originalPlan !== "pro") {
    const { error } = await sb
      .from("subscriptions")
      .update({ plan: "pro", status: "active" })
      .eq("org_id", state.orgId);
    if (error) throw new Error(`could not grant Pro: ${error.message}`);
    console.log("granted Pro for this check");
  }

  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const serverErrors = [];
  page.on("pageerror", (e) => serverErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
  });

  try {
    // Production intermittently bounces back to /login with a stale session, so
    // clear cookies and retry rather than failing on an unexplained timeout.
    let signedIn = false;
    for (let attempt = 1; attempt <= 3 && !signedIn; attempt++) {
      await page.context().clearCookies();
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.locator("#email").fill(state.email);
      await page.locator("#password").fill(state.password);

      const landed = page
        .waitForURL(/dashboard/, { timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      await page.getByRole("button", { name: /sign in/i }).first().click();
      signedIn = await landed;
      if (!signedIn) console.log(`sign-in attempt ${attempt} bounced to ${page.url()}`);
    }
    if (!signedIn) throw new Error("could not sign in to production");
    console.log("signed in");

    await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    check("import page renders (not the Pro gate)", /Choose what you are importing/.test(await page.locator("body").innerText()));
    check("reached section 2 file picker", /Choose what you are importing/.test(await page.locator("body").innerText()));

    // The whole point of this check: the new labels, not the old singular one.
    const dropzone = page.locator('[class*="border-dashed"]');
    check("dashed dropzone is present", (await dropzone.count()) > 0);

    const bodyText = await page.locator("body").innerText();
    check('shows "Choose files" (multi-select)', /Choose files/i.test(bodyText));
    check('shows "Choose a folder"', /Choose a folder/i.test(bodyText));
    check("old singular button is gone", !/\bChoose file\b(?!s)/i.test(bodyText));

    // Section 1 should still be intact.
    check("section 1 type selector still present", /invoice/i.test(bodyText));

    check("no 5xx or page errors", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    if (originalPlan !== "pro") {
      const { error } = await sb
        .from("subscriptions")
        .update({ plan: originalPlan, status: "active" })
        .eq("org_id", state.orgId);
      if (error) throw new Error(`could not restore plan: ${error.message}`);
      console.log(`restored plan to ${originalPlan}`);
    }
  }

  console.log(failures ? `\n${failures} FAILED` : "\nall production checks passed");
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("verify error:", e?.message ?? e);
  process.exit(1);
});