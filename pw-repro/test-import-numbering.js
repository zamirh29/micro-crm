// TEMPORARY verification that imported invoice numbers continue year on year.
//
// MicroCRM assigns fresh numbers from a sequence, so this checks the property
// the user depends on: numbering is continuous within a batch AND across
// separate later batches, ascending with historical date, and that the legacy
// per-year source numbers are kept only as references.
//
//   node test-import-numbering.js
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

const HEADERS = ["Invoice Number", "Client Name", "E-mail Address", "Invoice Date", "Description", "Qty", "Unit Price"];

async function build(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoices");
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Continuous legacy numbering across both files: NUM-447..NUM-450. The prefix
// is only there so cleanup can find these rows; created_at holds the historical
// date, not the import time, so it cannot be used to scope the run.
const batch2019 = () =>
  build([
    ["NUM-447", "Numbering Client", "numbering@example.com", "12/02/2019", "Work A", 1, 100],
    ["NUM-448", "Numbering Client", "numbering@example.com", "13/02/2019", "Work B", 1, 200],
  ]);

const batch2020 = () =>
  build([
    ["NUM-449", "Numbering Client", "numbering@example.com", "08/04/2020", "Work C", 1, 300],
    ["NUM-450", "Numbering Client", "numbering@example.com", "09/04/2020", "Work D", 1, 400],
  ]);

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 45000 }),
    page.getByRole("button", { name: /sign in/i }).first().click(),
  ]);
}

async function importFile(page, name, buffer) {
  await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Choose what you are importing", { timeout: 30000 });
  await page.setInputFiles('input[data-import-input="files"]', [
    {
      name,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    },
  ]);
  await page.waitForSelector("text=Review before importing", { timeout: 45000 });
  await page.getByRole("button", { name: /^Import \d+ invoices$/ }).click();
  await page.waitForSelector("text=Import complete", { timeout: 60000 });
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
  await login(page);

  const { data: profile } = await sb.from("profiles").select("id").eq("email", ADMIN_EMAIL).maybeSingle();
  const { data: membership } = await sb.from("memberships").select("org_id").eq("user_id", profile.id).single();
  const org = membership.org_id;

  const { data: existingSub } = await sb.from("subscriptions").select("*").eq("org_id", org).maybeSingle();
  const originalSub = existingSub ? { ...existingSub } : null;
  await sb.from("subscriptions").update({ plan: "pro", status: "active" }).eq("org_id", org);

  // Self-heal: a previous crashed run must not block this one, because re-importing
  // an existing original number is correctly rejected.
  async function purgeRun() {
    const { data: stale } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", org)
      .like("original_number", "NUM-%");
    if ((stale ?? []).length) {
      await sb.from("invoice_items").delete().in("invoice_id", stale.map((i) => i.id));
      await sb.from("invoices").delete().in("id", stale.map((i) => i.id));
      console.log(`purged ${stale.length} leftover invoice(s) from an earlier run`);
    }
    // An orphaned contact with the same email would win findContact and make
    // the run link to the wrong customer, so clear those too. This must run
    // before seeding, or it deletes the contact created below.
    const { data: staleContacts } = await sb
      .from("contacts")
      .select("id")
      .eq("org_id", org)
      .eq("email", "numbering@example.com");
    if ((staleContacts ?? []).length) {
      await sb.from("contacts").delete().in("id", staleContacts.map((c) => c.id));
      console.log(`purged ${staleContacts.length} leftover contact(s)`);
    }
  }
  await purgeRun();

  const { data: seeded } = await sb
    .from("contacts")
    .insert({ org_id: org, first_name: "Numbering", last_name: "Client", email: "numbering@example.com", status: "client" })
    .select("id")
    .single();

  const readRun = async () => {
    const { data } = await sb
      .from("invoices")
      .select("id, number, original_number, created_at, contact_id")
      .eq("org_id", org)
      .like("original_number", "NUM-%")
      .order("created_at");
    return data ?? [];
  };

  const { data: maxRow } = await sb
    .from("invoices")
    .select("number")
    .eq("org_id", org)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startFrom = maxRow?.number ? Number(maxRow.number.replace("INV-", "")) + 1 : 100001;
  console.log(`sequence continues from INV-${startFrom}\n`);

  try {
    console.log("--- Batch 1: 2019 invoices ---");
    await importFile(page, "2019.xlsx", await batch2019());
    let run = await readRun();
    check("2 invoices created in batch 1", run.length === 2, `${run.length}`);

    console.log("\n--- Batch 2: 2020 invoices, separate later import ---");
    await importFile(page, "2020.xlsx", await batch2020());
    run = await readRun();
    check("4 invoices total across both batches", run.length === 4, `${run.length}`);

    console.log("\n--- Continuity ---");
    const nums = run.map((i) => Number(i.number.replace("INV-", ""))).sort((a, b) => a - b);
    check(
      "numbers are continuous with no restart or gap",
      nums.every((n, i) => n === startFrom + i),
      nums.join(",")
    );
    check(
      "batch 2 continued straight after batch 1",
      nums[2] === nums[1] + 1 && nums[3] === nums[2] + 1,
      nums.join(",")
    );

    const byDate = [...run].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const dateNums = byDate.map((i) => Number(i.number.replace("INV-", "")));
    check(
      "numbers ascend with historical date across both years",
      dateNums.every((n, i) => i === 0 || n > dateNums[i - 1]),
      dateNums.join(",")
    );
    check(
      "2019 documents numbered before 2020 documents",
      new Date(byDate[0].created_at).getUTCFullYear() === 2019 &&
        new Date(byDate[3].created_at).getUTCFullYear() === 2020,
      byDate.map((d) => `${String(d.created_at).slice(0, 10)}=${d.number}`).join(" ")
    );

    console.log("\n--- Legacy numbers are references, not invoice numbers ---");
    const refs = run.map((i) => i.original_number).sort();
    check(
      "all four legacy numbers retained as references",
      JSON.stringify(refs) === JSON.stringify(["NUM-447", "NUM-448", "NUM-449", "NUM-450"]),
      refs.join(",")
    );
    check(
      "no invoice reused a legacy number as its own number",
      run.every((i) => Number(i.number.replace("INV-", "")) >= startFrom),
      run.map((i) => i.number).join(",")
    );
    const contactIds = new Set(run.map((i) => i.contact_id));
    check(
      "all four documents share the one matched customer",
      contactIds.size === 1 && contactIds.has(seeded.id),
      `${contactIds.size} contact(s)`
    );

    console.log("\n--- Re-importing the same year is blocked ---");
    await importFile(page, "2019-again.xlsx", await batch2019());
    const afterRepeat = await readRun();
    check("no extra invoices created on re-import", afterRepeat.length === 4, `${afterRepeat.length}`);
    const repeatPanel = await page.locator("text=already exists").first().isVisible();
    check("re-import reported as already existing", repeatPanel);
  } finally {
    const { data: created } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", org)
      .like("original_number", "NUM-%");
    const ids = (created ?? []).map((i) => i.id);
    if (ids.length) {
      await sb.from("invoice_items").delete().in("invoice_id", ids);
      await sb.from("invoices").delete().in("id", ids);
    }
    await sb.from("contacts").delete().eq("id", seeded.id);

    const { data: leftover } = await sb.from("invoices").select("id").eq("org_id", org).like("original_number", "NUM-%");
    check("all test invoices removed", (leftover ?? []).length === 0, `${(leftover ?? []).length} left`);

    if (originalSub) {
      await sb.from("subscriptions").update({ plan: originalSub.plan, status: originalSub.status }).eq("id", originalSub.id);
    } else {
      await sb.from("subscriptions").delete().eq("org_id", org);
    }
    check("no page errors or 5xx responses", pageErrors.length === 0, pageErrors.join(" | "));

    await browser.close();
  }

  console.log(`\n${failures === 0 ? "all numbering checks passed" : `${failures} failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});