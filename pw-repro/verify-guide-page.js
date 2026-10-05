// TEMPORARY: screenshots the public /guide page logged out and reports errors.
const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3113";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console: " + m.text().slice(0, 200));
  });

  const resp = await page.goto(`${BASE}/guide`, { waitUntil: "networkidle", timeout: 60000 });
  console.log("status:", resp.status(), "url:", page.url());
  console.log("h1:", JSON.stringify(await page.locator("h1").allInnerTexts()));
  console.log("sections:", await page.locator("main section[id]").count());
  console.log("figures:", await page.locator("figure").count());
  console.log("images:", await page.locator("figure img").count());

  // Scroll the whole page so every lazy-loaded screenshot is actually fetched
  // before checking for broken images.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const imgReport = await page
    .locator("figure img")
    .evaluateAll((els) =>
      els.map((e) => ({
        src: (e.currentSrc || e.src).split("url=")[1]?.split("&")[0] || e.src,
        ok: e.complete && e.naturalWidth > 0,
        w: e.naturalWidth,
      }))
    );
  console.log("loaded ok:", imgReport.filter((i) => i.ok).length, "/", imgReport.length);
  console.log(
    "still broken:",
    imgReport.filter((i) => !i.ok).map((i) => i.src)
  );

  // Anchor nav links resolve to real section ids.
  const bad = [];
  for (const a of await page.locator('nav[aria-label="Tour sections"] a').all()) {
    const href = await a.getAttribute("href");
    if (!href || !(await page.locator(href).count())) bad.push(href);
  }
  console.log("broken anchors:", bad.length ? bad : "none");

  await page.screenshot({ path: path.join(__dirname, "..", "pw-repro", "guide-page.png"), fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, "..", "pw-repro", "guide-page-scrolled.png"), fullPage: false });

  console.log("problems:", problems.length ? problems.slice(0, 5) : "none");
  await browser.close();
}

main().catch((e) => {
  console.error("verify error:", e?.message ?? e);
  process.exit(1);
});