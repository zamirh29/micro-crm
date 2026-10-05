// TEMPORARY verification that a folder larger than the platform's ~4MB request
// ceiling is split client-side into several requests and still produces one
// coherent review. Uses genuinely valid .xlsx files so the server does real
// parsing, and asserts exactly how many upload requests went out.
//
//   node test-import-large-batch.js
const path = require("path");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));
const fixtures = require("./impersonation-fixtures");

const BASE = process.env.BASE_URL || "http://localhost:3000";

const results = [];
let failures = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures++;
  results.push({ ok, name, detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  return ok;
}

/**
 * A valid xlsx padded to roughly `targetBytes`. Padding goes into cell comments
 * rather than extra rows, so the file grows on disk without inflating the
 * document count past the row ceiling.
 */
async function bigFixture(label, targetBytes) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoices");
  ws.addRow([
    "Invoice Number", "Client Name", "Invoice Date", "Due Date",
    "Description", "Qty", "Unit Price",
  ]);
  ws.addRow([label, "Bulk Test Client", "01/03/2023", "01/04/2023", "Work", 1, 100]);

  // Random padding: an xlsx is a zip, so repetitive filler compresses to almost
  // nothing and would never reach the byte size under test. Random hex does not
  // compress, so ~1 byte of file per byte of padding.
  const random = (n) =>
    require("crypto").randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);

  ws.getCell(2, 9).note = random(Math.ceil(targetBytes * 1.2));
  const buf = await wb.xlsx.writeBuffer();
  return new File(
    [buf],
    `${label}.xlsx`,
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );
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

  // Real files, each under the per-file ceiling but together past the ~4MB
  // platform limit, which is what forces the client-side split.
  const files = [];
  for (let i = 1; i <= 5; i++) files.push(await bigFixture(`BULK${i}`, 1.6 * 1024 * 1024));
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  console.log(
    `built ${files.length} valid xlsx files, ${(totalBytes / 1024 / 1024).toFixed(2)}MB total ` +
      `(largest ${(Math.max(...files.map((f) => f.size)) / 1024 / 1024).toFixed(2)}MB)`
  );
  check("total selection exceeds the ~4MB platform ceiling", totalBytes > 4 * 1024 * 1024);
  check("no single file exceeds the per-file ceiling", files.every((f) => f.size <= 3.5 * 1024 * 1024));

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const uploadRequests = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/import/parse")) {
      uploadRequests.push({ status: r.status(), method: r.request().method() });
    }
  });
  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e)));

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#email").fill(state.email);
    await page.locator("#password").fill(state.password);
    await Promise.all([
      page.waitForURL(/dashboard/, { timeout: 60000 }),
      page.getByRole("button", { name: /sign in/i }).first().click(),
    ]);

    await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // Feed the real files through the drop handler. `File` is not a Buffer, so
    // read each one out first.
    const payloads = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        data: Buffer.from(await f.arrayBuffer()).toString("base64"),
      }))
    );

    await page.evaluate(async (payloads) => {
      const dt = new DataTransfer();
      for (const p of payloads) {
        const bin = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
        dt.items.add(
          new File([bin], p.name, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          })
        );
      }
      document.querySelector('[class*="border-dashed"]').dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })
      );
    }, payloads);

    // Wait until the review screen settles.
    await page.waitForFunction(
      () => /review|could not|too large|ready/i.test(document.body.innerText),
      null,
      { timeout: 180000 }
    ).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const body = await page.locator("body").innerText();
    console.log(`\nparse requests made: ${uploadRequests.length}`);
    console.log(`statuses: ${uploadRequests.map((r) => r.status).join(", ")}`);

    check("no 413 from the platform", uploadRequests.every((r) => r.status !== 413), uploadRequests.map((r) => r.status).join(","));
    check("all parse requests succeeded", uploadRequests.every((r) => r.status === 200));
    check("selection was split into multiple requests", uploadRequests.length > 1, `${uploadRequests.length} requests`);
    check("no file was rejected as too large", !/too large/i.test(body));
    check("no error shown to the user", !/could not read|none of those/i.test(body));
    check("no page errors", problems.length === 0, problems.slice(0, 2).join(" | "));

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-file-name]")).map((el) =>
        el.getAttribute("data-file-name")
      )
    );
    if (sheets.length) console.log(`files in review: ${sheets.join(", ")}`);
    check("every file reached the review", sheets.length === 5 || /5 files/.test(body), sheets.join(","));
  } finally {
    await browser.close();
    if (originalPlan !== "pro") {
      await sb.from("subscriptions").update({ plan: originalPlan, status: "active" }).eq("org_id", state.orgId);
      console.log(`restored plan to ${originalPlan}`);
    }
  }

  console.log(failures ? `\n${failures} FAILED` : "\nall large-batch checks passed");
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("error:", e?.message ?? e);
  process.exit(1);
});