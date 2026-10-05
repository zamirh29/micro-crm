// TEMPORARY verification that the section-2 dropzone actually accepts files.
// setInputFiles covers the picker path; this exercises the onDrop handler via a
// synthetic DragEvent, which is the interaction the request was about.
//
//   node test-import-drop.js
const path = require("path");
const { chromium } = require("playwright");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));
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

async function build() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoices");
  ws.addRow(["Invoice Number", "Client Name", "E-mail Address", "Invoice Date", "Description", "Qty", "Unit Price"]);
  ws.addRow(["DROP-001", "Drop Test Client", "drop-test@example.com", "05/04/2019", "Dropped line", 1, 30]);
  ws.addRow(["DROP-002", "Drop Test Client", "drop-test@example.com", "06/04/2019", "Dropped line", 2, 15]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) pageErrors.push(`5xx ${r.status()} ${r.url()}`);
  });

  const sb = fixtures.getClient();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 45000 }),
    page.getByRole("button", { name: /sign in/i }).first().click(),
  ]);

  const { data: profile } = await sb.from("profiles").select("id").eq("email", ADMIN_EMAIL).maybeSingle();
  const { data: membership } = await sb.from("memberships").select("org_id").eq("user_id", profile.id).single();
  const org = membership.org_id;

  const { data: existingSub } = await sb.from("subscriptions").select("*").eq("org_id", org).maybeSingle();
  const originalSub = existingSub ? { ...existingSub } : null;
  await sb.from("subscriptions").update({ plan: "pro", status: "active" }).eq("org_id", org);

  try {
    await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("text=Choose what you are importing", { timeout: 30000 });

    const dropzone = page.locator("text=Drop .xlsx or .xlsm or .csv files here");
    check("dropzone is present on section 2", await dropzone.isVisible());
    check(
      "dropzone advertises folder support",
      await page.locator("text=/or a folder/").first().isVisible()
    );
    check("folder picker offered", await page.getByRole("button", { name: /Choose a folder/i }).isVisible());

    const b64 = (await build()).toString("base64");

    const dropFile = (selector) =>
      page.evaluate(
        ([payload, target]) => {
          const bin = atob(payload);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

          const dt = new DataTransfer();
          dt.items.add(
            new File([bytes], "dropped-invoices.xlsx", {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })
          );

          const el = target === "body" ? document.body : document.querySelector(target);
          el.dispatchEvent(
            new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })
          );
        },
        [b64, selector]
      );

    // The reported symptom: dropping a file anywhere but the dropzone made the
    // browser navigate to it and open a new tab, losing the page.
    const urlBefore = page.url();
    await dropFile("body");
    await page.waitForTimeout(1500);
    check("dropping outside the dropzone does not navigate away", page.url() === urlBefore, page.url());
    check("still on the import page after a stray file drop", /dashboard\/import/.test(page.url()));
    check(
      "a stray drop does not start an import",
      await page.locator("text=Choose what you are importing").isVisible()
    );

    await dropFile('[class*="border-dashed"]');

    await page.waitForSelector("text=Review before importing", { timeout: 45000 });
    check("dropping a file advances to the review screen", true);

    const summary = await page.locator("p", { hasText: /ready/ }).first().innerText();
    check("dropped file parsed into 2 invoices", /2 invoices ready/.test(summary), summary);

    const tableText = await page.locator("table").innerText();
    check("dropped rows carry their original numbers", /DROP-001/.test(tableText) && /DROP-002/.test(tableText));
  } finally {
    const { data: invoices } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", org)
      .like("original_number", "DROP-%");
    if ((invoices ?? []).length) {
      await sb.from("invoice_items").delete().in("invoice_id", invoices.map((i) => i.id));
      await sb.from("invoices").delete().in("id", invoices.map((i) => i.id));
    }
    const { data: leftover } = await sb.from("invoices").select("id").eq("org_id", org).like("original_number", "DROP-%");
    check("no documents created by this test", (leftover ?? []).length === 0);

    if (originalSub) {
      await sb.from("subscriptions").update({ plan: originalSub.plan, status: originalSub.status }).eq("id", originalSub.id);
    } else {
      await sb.from("subscriptions").delete().eq("org_id", org);
    }
    check("no page errors or 5xx responses", pageErrors.length === 0, pageErrors.join(" | "));

    await browser.close();
  }

  console.log(`\n${failures === 0 ? "all drop checks passed" : `${failures} failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});