// Read-only structural analysis of the invoice-form exports. Confirms whether
// the fixed-cell layout is consistent enough to parse, and whether line items
// actually reconcile to the stated subtotal, before any mapping is chosen.
const path = require("path");
const fs = require("fs");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));

const DIR = process.argv[2] || "C:\\Users\\Zamir Hussain\\Documents\\Spreadsheets";

function safeText(cell) {
  try {
    const v = cell.value;
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? "").join("");
      if ("result" in v) return v.result === null || v.result === undefined ? "" : String(v.result);
      if ("formula" in v || "sharedFormula" in v) return "";
      if (v.text !== undefined) return String(v.text ?? "");
      if (v.hyperlink !== undefined) return String(v.hyperlink ?? "");
      return "";
    }
    return String(v);
  } catch {
    return "";
  }
}

const num = (v) => {
  const n = parseFloat(String(v).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => /\.xlsx$/i.test(f)).sort();
  const rows = [];

  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, f));
    const ws = wb.worksheets[0];
    if (!ws) {
      rows.push({ f, error: "no sheet" });
      continue;
    }

    const g = (addr) => safeText(ws.getCell(addr));
    const date = g("F2");
    const number = g("F3");
    const client = g("B11");
    const subtotal = num(g("G27"));
    const vat = g("G28");
    const delivery = num(g("G29"));
    const total = num(g("G30"));
    const paid = num(g("G31"));
    const due = num(g("G32"));
    const notes = g("A29");

    // Line items: description in column A, amount in column G, between the
    // "Description" header and the totals block.
    const items = [];
    for (let r = 18; r <= 26; r++) {
      const desc = String(ws.getCell(`A${r}`).value ?? "").trim();
      if (!desc) continue;
      const amt = num(g(`G${r}`));
      items.push({ r, desc, amt });
    }

    const itemSum = items.reduce((s, i) => s + (i.amt ?? 0), 0);

    rows.push({
      f,
      sheets: wb.worksheets.length,
      sheetName: ws.name,
      rowCount: ws.rowCount,
      colCount: ws.columnCount,
      number,
      date,
      client,
      subtotal,
      vat,
      total,
      paid,
      due,
      delivery,
      notes,
      items,
      itemSum,
      reconciles: subtotal !== null && Math.abs(itemSum - subtotal) < 0.01,
      itemWithAmount: items.filter((i) => i.amt !== null).length,
      itemWithoutAmount: items.filter((i) => i.amt === null).length,
    });
  }

  console.log(`files analysed: ${rows.length}\n`);
  console.log("file".padEnd(62) + "inv#".padEnd(9) + "date".padEnd(13) + "items".padEnd(7) + "subtotal".padEnd(11) + "itemSum".padEnd(11) + "VAT");
  console.log("-".repeat(140));
  for (const r of rows) {
    if (r.error) {
      console.log(`${r.f.slice(0, 60).padEnd(62)}ERROR ${r.error}`);
      continue;
    }
    console.log(
      r.f.slice(0, 60).padEnd(62) +
        String(r.number ?? "-").padEnd(9) +
        String(r.date ?? "-").padEnd(13) +
        String(r.items.length).padEnd(7) +
        String(r.subtotal ?? "-").padEnd(11) +
        String(r.itemSum.toFixed(2)).padEnd(11) +
        `"${r.vat}"`
    );
  }

  // Structural consistency
  console.log("\n--- structure ---");
  const shape = new Set(rows.map((r) => `${r.sheetName}|${r.rowCount}rows|${r.colCount}cols`));
  console.log(`distinct sheet shapes: ${[...shape].join("  ")}`);

  const allReconcile = rows.filter((r) => r.reconciles !== false).length;
  console.log(`files where line items sum to subtotal: ${allReconcile}/${rows.length}`);

  const noAmount = rows.filter((r) => r.itemWithoutAmount > 0);
  console.log(`files with a description row carrying no amount: ${noAmount.length}`);
  for (const r of noAmount.slice(0, 6)) {
    const bad = r.items.filter((i) => i.amt === null).map((i) => `r${i.r}:"${i.desc.slice(0, 40)}"`);
    console.log(`   ${r.f.slice(0, 50)} -> ${bad.join(", ")}`);
  }

  const clients = new Map();
  for (const r of rows) clients.set(r.client || "(blank)", (clients.get(r.client || "(blank)") || 0) + 1);
  console.log(`\ndistinct client names in B11: ${clients.size}`);
  for (const [k, v] of [...clients].slice(0, 12)) console.log(`   ${v}x ${k}`);

  const nums = rows.map((r) => Number(r.number)).filter(Number.isFinite);
  console.log(`\ninvoice number range: ${Math.min(...nums)} .. ${Math.max(...nums)} (${nums.length} numbers)`);
  console.log(`numbers unique: ${new Set(nums).size === nums.length}`);
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  console.log(`date range: ${dates[0]} .. ${dates[dates.length - 1]}`);

  const vatValues = new Set(rows.map((r) => String(r.vat)));
  console.log(`distinct VAT cell values: ${[...vatValues].map((v) => `"${v}"`).join(", ")}`);

  const paidValues = new Set(rows.map((r) => r.paid));
  console.log(`distinct PAID values: ${[...paidValues].map((v) => `"${v}"`).join(", ")}`);

  console.log("\n--- full line items for the first file ---");
  for (const i of rows[0].items) console.log(`   r${i.r}: ${i.desc.slice(0, 70)}  -> ${i.amt ?? "(no amount)"}`);
  console.log(`   subtotal ${rows[0].subtotal} / sum ${rows[0].itemSum.toFixed(2)} / total ${rows[0].total} / due ${rows[0].due}`);
})().catch((e) => {
  console.error("analysis error:", e?.message ?? e);
  process.exit(1);
});