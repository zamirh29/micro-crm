// TEMPORARY: one-off diagnostic for why /dashboard/quotes/new has no #title.
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3111";
const EMAIL = "pwa-test-1301678156@example.com";
const PASSWORD = "PwaTest123!";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 300));
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
  console.log("logged in ->", page.url());

  const resp = await page.goto(`${BASE}/dashboard/quotes/new`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  console.log("status:", resp.status(), "url:", page.url());
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  console.log("#title count:", await page.locator("#title").count());
  console.log("input count:", await page.locator("input").count());
  console.log("h1:", JSON.stringify(await page.locator("h1").allInnerTexts()));
  console.log("main text:", (await page.locator("main").innerText().catch(() => "<no main>")).slice(0, 800));
  console.log("body text:", (await page.locator("body").innerText()).slice(0, 800));

  await browser.close();
}

main().catch((e) => {
  console.error("diag error:", e?.message ?? e);
  process.exit(1);
});