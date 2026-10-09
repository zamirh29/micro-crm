// TEMPORARY verification that printed invoice forms import correctly.
//
// The historical spreadsheets are not tables: they are laid-out forms with a
// banner, floating labels and a free-text work block. The parser rewrites them
// into a table first, and this checks the properties that matter afterwards -
// original number and date kept, line items reconciling to the form's own
// SUBTOTAL, unbillable narrative preserved as notes rather than lost, and the
// customer collapsing to one contact across the two spellings of its name.
//
//   node test-import-form.js
const path = require("path");
const { chromium } = require("playwright");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));
const fixtures = require("./impersonation-fixtures");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = "pwa-test-1301678156@example.com";
const ADMIN_PASSWORD = "PwaTest123!";

const NBSP = "\u00a0";
const CLIENT_NBSP = `Form${NBSP}Test Client`;
const CLIENT_PLAIN = "Form Test Client";

let failures = 0;
function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

/** Merge `from..to` and repeat the value across the span, matching how the
 *  real forms are written so the parser sees the same merged-cell shape. */
function span(ws, row, from, to, value) {
  ws.getCell(row, from).value = value;
  for (let c = from + 1; c <= to; c++) ws.getCell(row, c).value = value;
  if (to > from) ws.mergeCells(row, from, row, to);
}

/**
 * Reproduce the printed form layout: banner, DATE:/INVOICE#: header, the
 * BILL TO / Vehicle Info. block, a Description/Total line-item block, then the
 * SUBTOTAL / Vat / DELIVERY / TOTAL / PAID / TOTAL DUE ladder.
 *
 * `lines` is a list of [description, amount] pairs; a null amount is narrative
 * the form could not bill for.
 */
async function buildForm({ number, date, client, reg, make, model, colour, lines, subtotal }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Table 1");

  span(ws, 1, 1, 7, "INVOICE");
  span(ws, 2, 1, 5, "DATE:");
  span(ws, 2, 6, 7, date);
  span(ws, 3, 1, 5, "INVOICE#:");
  span(ws, 3, 6, 7, number);
  span(ws, 4, 1, 5, "Client #:");
  ws.getCell(5, 1).value = "      Specialist body work repairs";

  span(ws, 6, 1, 3, "BILL TO");
  span(ws, 6, 4, 7, "Vehicle Info.");

  ws.getCell(7, 1).value = "Name";
  span(ws, 7, 2, 3, client);
  span(ws, 7, 4, 4, "Make");
  span(ws, 7, 5, 7, make);

  ws.getCell(8, 1).value = "Address";
  span(ws, 8, 4, 4, "Model");
  span(ws, 8, 5, 7, model);

  ws.getCell(9, 1).value = "City, Postcode";
  span(ws, 9, 4, 4, "Colour");
  span(ws, 9, 5, 7, colour);

  ws.getCell(10, 1).value = "Phone";
  ws.getCell(10, 4).value = "Year";

  ws.getCell(11, 1).value = "Email";
  span(ws, 11, 4, 4, "Registration");
  span(ws, 11, 5, 7, reg);

  span(ws, 12, 1, 6, "Description");
  ws.getCell(12, 7).value = "Total";

  let row = 13;
  for (const [text, amount] of lines) {
    span(ws, row, 1, 6, text);
    if (amount !== null) ws.getCell(row, 7).value = amount;
    row++;
  }

  span(ws, row, 5, 6, "SUBTOTAL");
  ws.getCell(row, 7).value = subtotal;
  span(ws, row + 1, 5, 6, "Vat");
  ws.getCell(row + 1, 7).value = "-";
  span(ws, row + 2, 1, 4, "NOTES:");
  span(ws, row + 2, 5, 6, "DELIVERY");
  ws.getCell(row + 2, 7).value = "-";
  span(ws, row + 3, 5, 6, "TOTAL");
  ws.getCell(row + 3, 7).value = subtotal;
  span(ws, row + 4, 5, 6, "PAID");
  ws.getCell(row + 4, 7).value = 0;
  span(ws, row + 5, 5, 6, "TOTAL DUE");
  ws.getCell(row + 5, 7).value = subtotal;
  span(ws, row + 6, 1, 7, "THANK YOU FOR YOUR BUSINESS!");

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// File 1: unbilled narrative sitting above two priced lines. The heading has
// detail under it, so it is worth keeping as a note.
const formMulti = () =>
  buildForm({
    number: "900901",
    date: new Date(Date.UTC(2019, 3, 5)),
    client: CLIENT_NBSP,
    reg: "AB12CDE",
    make: "Ford",
    model: "Transit",
    colour: "white",
    lines: [
      ["Work carried out:", null],
      ["Front panel repair", null],
      ["Paint blend", null],
      ["Parts", 100.5],
      ["Labour", 250],
    ],
    subtotal: 350.5,
  });

// File 2: the heading itself carries the price, so the narrative under it has
// to become the line description rather than a separate note.
const formAbsorbed = () =>
  buildForm({
    number: "900902",
    date: new Date(Date.UTC(2019, 3, 6)),
    client: CLIENT_PLAIN,
    reg: "XY99ZWA",
    make: "Ford",
    model: "E-Transit",
    colour: "White",
    lines: [
      ["Work carried out:", 600],
      ["Replaced timing belt, water pump and fuel line", null],
    ],
    subtotal: 600,
  });

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 45000 }),
    page.getByRole("button", { name: /sign in/i }).first().click(),
  ]);
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

  // Self-heal: a previous crashed run must not make this one report duplicates.
  async function purgeRun() {
    const { data: stale } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", org)
      .like("original_number", "9009%");
    if ((stale ?? []).length) {
      await sb.from("invoice_items").delete().in("invoice_id", stale.map((i) => i.id));
      await sb.from("invoices").delete().in("id", stale.map((i) => i.id));
    }
    const { data: staleContacts } = await sb
      .from("contacts")
      .select("id")
      .eq("org_id", org)
      .in("first_name", ["Form", `Form${NBSP}`]);
    if ((staleContacts ?? []).length) {
      await sb.from("contacts").delete().in("id", staleContacts.map((c) => c.id));
    }
  }
  await purgeRun();

  try {
    await page.goto(`${BASE}/dashboard/import`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("text=Choose what you are importing", { timeout: 30000 });

    await page.setInputFiles('input[data-import-input="files"]', [
      {
        name: "Invoice 900901 (Form) - Transit - AB12CDE - 05 Apr 2019.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: await formMulti(),
      },
      {
        name: "Invoice 900902 (Form) - E-Transit - XY99ZWA - 06 Apr 2019.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: await formAbsorbed(),
      },
    ]);

    await page.waitForSelector("text=Review before importing", { timeout: 45000 });
    check("both printed forms reach the review screen", true);

    const summary = await page.locator("p", { hasText: /ready/ }).first().innerText();
    check("review reports 2 invoices", /2 invoices ready/.test(summary), summary);

    const tableText = await page.locator("table").innerText();
    check("original numbers preserved", /900901/.test(tableText) && /900902/.test(tableText));
    check("original dates preserved", /2019-04-05/.test(tableText) && /2019-04-06/.test(tableText));

    // The forms carry no VAT, so the wizard's 20% default would invent tax on
    // every line. The review screen is where that has to be corrected.
    await page.locator("#tax-rate").first().fill("0");
    await page.locator("#mark-paid").first().check();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /^Import \d+ invoices$/ }).click();
    await page.waitForSelector("text=Import complete", { timeout: 60000 });
    check("import completes", true);

    const { data: created } = await sb
      .from("invoices")
      .select("id, number, original_number, contact_id, title, status, paid_at, due_date, subtotal, tax_rate, tax_amount, total, notes, invoice_items(*)")
      .eq("org_id", org)
      .like("original_number", "9009%");
    const byNumber = Object.fromEntries((created ?? []).map((i) => [i.original_number, i]));

    check("both invoices created", (created ?? []).length === 2, `${(created ?? []).length}`);
    check(
      "vehicle used as the title",
      byNumber["900901"]?.title === "AB12CDE Ford Transit" &&
        byNumber["900902"]?.title === "XY99ZWA Ford E-Transit",
      `${JSON.stringify(byNumber["900901"]?.title)} / ${JSON.stringify(byNumber["900902"]?.title)}`
    );
    check("no 20% VAT invented", (created ?? []).every((i) => i.tax_rate === 0 && i.tax_amount === 0),
      (created ?? []).map((i) => `rate=${i.tax_rate} tax=${i.tax_amount}`).join(" "));

    const multi = byNumber["900901"];
    check("900901 subtotal is the form's own figure", multi?.subtotal === 35050, `subtotal=${multi?.subtotal}`);
    check("900901 total equals subtotal (no VAT)", multi?.total === 35050, `total=${multi?.total}`);
    check("900901 has both priced lines", (multi?.invoice_items ?? []).length === 2,
      (multi?.invoice_items ?? []).map((i) => `${i.description}=${i.total}`).join(", "));
    check(
      "900901 narrative preserved as notes",
      multi?.notes === "Vehicle: white\nWork carried out:\nFront panel repair\nPaint blend",
      JSON.stringify(multi?.notes)
    );

    const absorbed = byNumber["900902"];
    check("900902 subtotal is the form's own figure", absorbed?.subtotal === 60000, `subtotal=${absorbed?.subtotal}`);
    check("900902 has one line", (absorbed?.invoice_items ?? []).length === 1);
    check(
      "900902 heading adopted the work beneath it",
      absorbed?.invoice_items?.[0]?.description ===
        "Replaced timing belt, water pump and fuel line",
      JSON.stringify(absorbed?.invoice_items?.[0]?.description)
    );
    check("900902 heading is not repeated in notes", absorbed?.notes === "Vehicle: White",
      JSON.stringify(absorbed?.notes));

    // "Mark every document as paid" stamps the payment date with each
    // document's own date, so a paid form reads as paid rather than overdue.
    check("both imported as paid",
      (created ?? []).every((i) => i.status === "paid"),
      (created ?? []).map((i) => i.status).join(","));
    check("payment date follows the invoice date",
      byNumber["900901"]?.paid_at?.startsWith("2019-04-05") === true &&
        byNumber["900902"]?.paid_at?.startsWith("2019-04-06") === true,
      `${byNumber["900901"]?.paid_at} / ${byNumber["900902"]?.paid_at}`);
    check("due date follows the invoice date when marked paid",
      byNumber["900901"]?.due_date?.startsWith("2019-04-05") === true &&
        byNumber["900902"]?.due_date?.startsWith("2019-04-06") === true,
      `${byNumber["900901"]?.due_date} / ${byNumber["900902"]?.due_date}`);

    const { data: contacts } = await sb
      .from("contacts")
      .select("id, first_name, last_name, email")
      .eq("org_id", org)
      .in("first_name", ["Form", `Form${NBSP}`]);
    check("one contact across both name spellings", (contacts ?? []).length === 1,
      `${(contacts ?? []).length}`);
    const contact = (contacts ?? [])[0];
    check("non-breaking space stripped from stored name",
      contact && !contact.first_name.includes(NBSP) && !contact.last_name.includes(NBSP),
      contact ? `${JSON.stringify(contact.first_name)}/${JSON.stringify(contact.last_name)}` : "none");
    check("contact splits as Form / Test Client",
      contact?.first_name === "Form" && contact?.last_name === "Test Client",
      contact ? `${contact.first_name}|${contact.last_name}` : "none");
    check("both invoices share that one contact",
      (created ?? []).every((i) => i.contact_id === contact?.id),
      (created ?? []).map((i) => `${i.original_number}->${i.contact_id}`).join(", "));

    check("each invoice has its own generated number",
      (created ?? []).every((i) => i.number && i.number !== i.original_number),
      (created ?? []).map((i) => `${i.original_number}->${i.number}`).join(", "));
  } finally {
    await purgeRun();

    const { data: leftover } = await sb.from("invoices").select("id").eq("org_id", org).like("original_number", "9009%");
    check("no documents left behind", (leftover ?? []).length === 0, `${(leftover ?? []).length}`);

    if (originalSub) {
      await sb.from("subscriptions").update({ plan: originalSub.plan, status: originalSub.status }).eq("id", originalSub.id);
    } else {
      await sb.from("subscriptions").delete().eq("org_id", org);
    }
    check("no page errors or 5xx responses", pageErrors.length === 0, pageErrors.join(" | "));

    await browser.close();
  }

  console.log(`\n${failures === 0 ? "all printed-form checks passed" : `${failures} failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});
