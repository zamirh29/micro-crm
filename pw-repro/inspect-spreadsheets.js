// Read-only inspection of a folder of exported spreadsheets. Prints headers,
// the first few rows and per-sheet stats so a column mapping can be chosen
// without touching the source files.
const path = require("path");
const fs = require("fs");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));

/**
 * ExcelJS's cell.text blows up on some formula cells whose result is null, so
 * pull the display value defensively instead.
 */
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

const DIR = process.argv[2] || "C:\\Users\\Zamir Hussain\\Documents\\Spreadsheets";
const LIMIT = Number(process.argv[3] || 3);

async function inspect(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out = { name: path.basename(file), sheets: [] };

  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(safeText(cell)));
      if (rows.length < LIMIT) rows.push({ rn, values });
    });

    out.sheets.push({
      name: ws.name,
      rowCount: ws.rowCount,
      columnCount: ws.columnCount,
      sample: rows,
    });
  });

  return out;
}

(async () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /\.(xlsx|xlsm|csv)$/i.test(f))
    .map((f) => path.join(DIR, f))
    .sort();

  console.log(`found ${files.length} files in ${DIR}\n`);

  // Compare the first two files fully: same layout means they share a mapping.
  const parsed = [];
  for (const f of files.slice(0, 4)) parsed.push(await inspect(f));

  for (const p of parsed) {
    console.log("=".repeat(70));
    console.log(p.name);
    for (const s of p.sheets) {
      console.log(`  sheet "${s.name}"  rows=${s.rowCount} cols=${s.columnCount}`);
      for (const r of s.sample) {
        console.log(`    r${r.rn}: ${JSON.stringify(r.values)}`);
      }
      if (s.sample.length < LIMIT) console.log("    (no more rows)");
      console.log("");
    }
  }

  // Header signatures across every file, to confirm they can share one mapping.
  console.log("=".repeat(70));
  console.log("HEADER SIGNATURE PER FILE");
  const sigs = new Map();
  for (const f of files) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(f);
      const ws = wb.worksheets[0];
      const hdr = [];
      if (ws) {
        const row = ws.getRow(1);
        row.eachCell({ includeEmpty: false }, (c) => hdr.push(safeText(c).trim().toLowerCase()));
      }
      const sig = hdr.join("|");
      if (!sigs.has(sig)) sigs.set(sig, []);
      sigs.get(sig).push(path.basename(f));
    } catch (e) {
      console.log(`  ERROR ${path.basename(f)}: ${e.message}`);
    }
  }
  let i = 0;
  for (const [sig, list] of sigs) {
    console.log(`\n  layout ${++i}: ${list.length} file(s)`);
    console.log(`    headers: ${sig.replace(/\|/g, ", ")}`);
    if (list.length <= 5) list.forEach((n) => console.log(`      - ${n}`));
    else {
      console.log(`      e.g. ${list[0]}`);
      console.log(`          ${list[list.length - 1]}`);
    }
  }
})().catch((e) => {
  console.error("inspect error:", e?.message ?? e);
  process.exit(1);
});