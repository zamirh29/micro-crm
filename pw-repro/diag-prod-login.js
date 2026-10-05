const path = require("path");
const { chromium } = require("playwright");
const fixtures = require(path.join(__dirname, "impersonation-fixtures"));
const fs = require("fs");

(async () => {
  const s = JSON.parse(fs.readFileSync(fixtures.STATE_PATH, "utf8"));
  const b = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const p = await b.newPage();
  const resp = [];
  p.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/") || u.includes("auth")) {
      resp.push(`${r.status()} ${r.request().method()} ${u.slice(0, 100)}`);
    }
  });
  p.on("console", (m) => {
    if (m.type() === "error") resp.push(`console-error: ${m.text().slice(0, 140)}`);
  });
  await p.goto("https://crm.dtmstechsolutions.co.uk/login", { waitUntil: "domcontentloaded" });
  await p.locator("#email").fill(s.email);
  await p.locator("#password").fill(s.password);
  await p.getByRole("button", { name: /sign in/i }).first().click();
  await p.waitForTimeout(9000);
  console.log("URL:", p.url());
  console.log("text:", (await p.locator("body").innerText()).slice(0, 400).replace(/\n+/g, " | "));
  console.log("requests:\n  " + resp.join("\n  "));
  await b.close();
})().catch((e) => {
  console.error("diag error:", e?.message ?? e);
  process.exit(1);
});