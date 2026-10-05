// TEMPORARY verification that import is Pro-gated on both the page and API.
//   node test-import-gate.js
const path = require("path");
const { chromium } = require("playwright");
const fixtures = require("./impersonation-fixtures");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = "pwa-test-1301678156@example.com";
const ADMIN_PASSWORD = "PwaTest123!";

let failures = 0;
function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

const nav = (page, p) =>
  page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 60000 });

async function main() {
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const sb = fixtures.getClient();

  await nav(page, "/login");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 45000 }),
    page.getByRole("button", { name: /sign in/i }).first().click(),
  ]);

  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  const { data: membership } = await sb
    .from("memberships")
    .select("org_id")
    .eq("user_id", profile.id)
    .single();
  const org = membership.org_id;

  const { data: sub } = await sb
    .from("subscriptions")
    .select("*")
    .eq("org_id", org)
    .maybeSingle();
  const original = sub ? { ...sub } : null;

  try {
    // ---- free plan ----
    if (sub) await sb.from("subscriptions").update({ plan: "free" }).eq("id", sub.id);
    else
      await sb
        .from("subscriptions")
        .insert({ user_id: profile.id, org_id: org, plan: "free", status: "active" });

    await nav(page, "/dashboard/import");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").innerText();
    check("free user sees the Pro gate", /Import is a Pro feature/.test(body));
    check("free user cannot upload", !/Choose what you are importing/.test(body));

    const parseStatus = await page.evaluate(async () => {
      const form = new FormData()
      form.append("kind", "invoice")
      form.append("file", new File(["a,b\n1,2"], "x.csv", { type: "text/csv" }))
      const res = await fetch("/api/import/parse", { method: "POST", body: form })
      return res.status
    });
    check("parse API rejects free users", parseStatus === 403, `status ${parseStatus}`);

    const commitStatus = await page.evaluate(async () => {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "invoice",
          taxRate: 20,
          rows: [
            {
              originalNumber: "GATE-1",
              customerName: "Gate Test",
              documentDate: "2024-01-01",
              items: [{ description: "x", quantity: 1, unitPrice: 100 }],
            },
          ],
        }),
      })
      return res.status
    });
    check("commit API rejects free users", commitStatus === 403, `status ${commitStatus}`);

    const { data: leaked } = await sb
      .from("invoices")
      .select("id, number, original_number")
      .eq("org_id", org)
      .eq("original_number", "GATE-1");
    check("nothing was written", (leaked ?? []).length === 0);
  } finally {
    if (original) {
      await sb
        .from("subscriptions")
        .update({ plan: original.plan, status: original.status })
        .eq("id", original.id);
    } else {
      await sb.from("subscriptions").delete().eq("org_id", org);
    }
    await browser.close();
    console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
    if (failures) process.exit(1);
  }
}

main().catch((e) => {
  console.error("gate test error:", e?.message ?? e);
  process.exit(1);
});