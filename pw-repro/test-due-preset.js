const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3301";
const EMAIL = "ayyaz@4wheelsdirect.co.uk";
const PASSWORD = process.env.AYYAZ_PASSWORD;

let pass = 0
let fail = 0
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? "  [" + detail + "]" : ""}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`) }
}
function localDatePlusN(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`) })

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 45000 });

  await page.goto(`${BASE}/dashboard/invoices/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const preset = page.locator("#due_preset")
  const dateInput = page.locator("#due_date")
  check("preset select shown", await preset.count() === 1)
  check("default preset is 30", (await preset.inputValue()) === "30", await preset.inputValue())
  check("date pre-filled to today+30", (await dateInput.inputValue()) === localDatePlusN(30), await dateInput.inputValue())
  check("date input disabled until custom", await dateInput.isDisabled())

  await preset.selectOption("7")
  check("selecting 7 sets today+7", (await dateInput.inputValue()) === localDatePlusN(7), await dateInput.inputValue())

  await preset.selectOption("14")
  check("selecting 14 sets today+14", (await dateInput.inputValue()) === localDatePlusN(14), await dateInput.inputValue())

  await preset.selectOption("custom")
  check("date input enabled on custom", !(await dateInput.isDisabled()))
  await dateInput.fill(localDatePlusN(5))
  check("manual edit keeps preset custom", (await preset.inputValue()) === "custom")
  check("manual edit applies value", (await dateInput.inputValue()) === localDatePlusN(5), await dateInput.inputValue())

  check("no page errors or 5xx", errors.length === 0, errors.join("; ").slice(0, 200))

  await browser.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1); });