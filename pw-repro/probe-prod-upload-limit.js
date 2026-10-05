// TEMPORARY diagnostic: find the real request-body ceiling on the deployed
// parse endpoint. The app allows 10MB per file, so we need to know whether the
// platform rejects anything before that. Uses in-page fetch so it rides the
// existing session, and never commits anything.
//
//   node probe-prod-upload-limit.js
const path = require("path");
const { chromium } = require("playwright");
const fixtures = require("./impersonation-fixtures");

const BASE = process.env.BASE_URL || "https://crm.dtmstechsolutions.co.uk";

const SIZES_MB = [1, 2, 3, 3.5, 4, 4.4, 4.6, 5, 8, 10];

/**
 * Sign in from a clean slate. Production login intermittently bounces back to
 * /login when a stale session cookie is present, so clear cookies first and
 * retry once rather than leaving a confusing timeout.
 */
async function signIn(page, state) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.context().clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#email").fill(state.email);
    await page.locator("#password").fill(state.password);

    const landed = page
      .waitForURL(/dashboard/, { timeout: 45000 })
      .then(() => true)
      .catch(() => false);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    if (await landed) {
      console.log(`signed in (attempt ${attempt})`);
      return;
    }
    console.log(`sign-in attempt ${attempt} bounced back to ${page.url()}`);
  }
  throw new Error("could not sign in to production");
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
  if (originalPlan !== "pro") {
    await sb.from("subscriptions").update({ plan: "pro", status: "active" }).eq("org_id", state.orgId);
  }

  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  try {
    await signIn(page, state);

    for (const mb of SIZES_MB) {
      const outcome = await page.evaluate(async (sizeMb) => {
        const bytes = new Uint8Array(sizeMb * 1024 * 1024);
        // Not valid xlsx, which is fine: we only care whether the platform or the
        // app rejects on size first. Both are useful signals.
        const body = new FormData();
        body.append("kind", "invoice");
        body.append("files", new File([bytes], "probe.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));

        const started = performance.now();
        try {
          const res = await fetch("/api/import/parse", { method: "POST", body });
          const text = (await res.text()).slice(0, 180);
          return { status: res.status, ms: Math.round(performance.now() - started), text };
        } catch (e) {
          return { status: 0, ms: Math.round(performance.now() - started), text: String(e) };
        }
      }, mb);

      const verdict =
        outcome.status === 413 ? "PLATFORM REJECT (413)" :
        outcome.status === 400 ? "app rejected (400)" :
        outcome.status === 0 ? "NETWORK/OTHER" :
        outcome.status >= 500 ? "server error" : "reached app";
      console.log(
        `${String(mb).padStart(5)} MB -> HTTP ${outcome.status}  ${verdict}  ${outcome.ms}ms  ${outcome.text.replace(/\s+/g, " ").slice(0, 110)}`
      );
    }
  } finally {
    await browser.close();
    if (originalPlan !== "pro") {
      await sb.from("subscriptions").update({ plan: originalPlan, status: "active" }).eq("org_id", state.orgId);
      console.log(`restored plan to ${originalPlan}`);
    }
  }
}

main().catch((e) => {
  console.error("probe error:", e?.message ?? e);
  process.exit(1);
});