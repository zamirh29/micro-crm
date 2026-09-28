/**
 * MicroCRM brand asset generator.
 *
 * Sources of truth: the SVG templates below (also written to brand/*.svg so they
 * can be edited in Figma / a text editor and re-rendered).
 *
 * Run from anywhere with `sharp` resolvable from the current directory:
 *   npm i --no-save sharp
 *   node brand/generate.js
 */
const { createRequire } = require("module");
const path = require("path");
const fs = require("fs");

const req = createRequire(path.join(process.cwd(), "package.json"));
const sharp = req("sharp");

const ROOT = path.resolve(__dirname, "..");
const SIZE = 1024;
const BRAND = "#4F46E5";
const ACCENT = "#FBBF24"; // amber highlight on the tallest bar
const RADIUS = 224; // rounded tile corner radius on the 1024 canvas (~22%)

/* Ascending chart mark: three rounded bars, bottom aligned at y=740 */
const BAR_W = 110;
const BAR_RX = 55;
const BARS = [
  { x: 277, y: 540, h: 200 },
  { x: 457, y: 420, h: 320 },
  { x: 637, y: 280, h: 460 },
];
const MARK_SCALE = 0.85; // keeps the mark inside the Android adaptive safe zone

function defs(id) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#818CF8"/>
      <stop offset="0.45" stop-color="#4F46E5"/>
      <stop offset="1" stop-color="#4338CA"/>
    </linearGradient>
    <linearGradient id="gloss-${id}" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.32"/>
      <stop offset="0.42" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.14"/>
    </linearGradient>`;
}

function mark(fg, accent = fg) {
  return BARS.map(
    (b, i) =>
      `<rect x="${b.x}" y="${b.y}" width="${BAR_W}" height="${b.h}" rx="${BAR_RX}" fill="${
        i === BARS.length - 1 ? accent : fg
      }"/>`
  ).join("\n  ");
}

function markGroup(inner, scale) {
  const off = (SIZE - SIZE * scale) / 2;
  return `<g transform="translate(${off} ${off}) scale(${scale})">${inner}</g>`;
}

const TILES = {
  "logo-tile.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>${defs("bg")}</defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#gloss-bg)"/>
  ${mark("#FFFFFF", ACCENT)}
</svg>`,
  "logo-rounded.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>${defs("bg")}</defs>
  <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="url(#bg)"/>
  ${mark("#FFFFFF", ACCENT)}
</svg>`,
  "logo-mark.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  ${mark("#FFFFFF", ACCENT)}
</svg>`,
};

async function render(svg, file, size) {
  await sharp(Buffer.from(svg), { density: 300 * (size / SIZE) })
    .resize(size, size, { fit: "fill" })
    .png()
    .toFile(file);
  console.log("wrote", path.relative(ROOT, file), `${size}x${size}`);
}

async function faviconIco(pngPath, icoPath) {
  const png = await fs.promises.readFile(pngPath);
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  header.writeUInt8(48, 6); // width
  header.writeUInt8(48, 7); // height
  header.writeUInt8(0, 8); // palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bpp
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // offset
  await fs.promises.writeFile(icoPath, Buffer.concat([header, png]));
  console.log("wrote", path.relative(ROOT, icoPath));
}

async function main() {
  for (const [name, svg] of Object.entries(TILES)) {
    await fs.promises.writeFile(path.join(__dirname, name), svg + "\n");
    console.log("wrote", path.relative(ROOT, path.join(__dirname, name)));
  }

  const tile = TILES["logo-tile.svg"];
  const rounded = TILES["logo-rounded.svg"];
  const markSvg = TILES["logo-mark.svg"];
  const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${markGroup(mark("#FFFFFF", ACCENT), MARK_SCALE)}</svg>`;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>${defs("bg")}</defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#gloss-bg)"/>
</svg>`;

  const P = (...p) => path.join(ROOT, ...p);

  // Web app (PWA)
  await render(rounded, P("public", "icons", "icon-192.png"), 192);
  await render(rounded, P("public", "icons", "icon-512.png"), 512);
  await render(tile, P("public", "icons", "icon-maskable-512.png"), 512);
  await render(tile, P("public", "icons", "apple-touch-icon.png"), 180);
  await render(rounded, P("public", "favicon-48.png"), 48);
  await faviconIco(P("public", "favicon-48.png"), P("public", "favicon.ico"));
  await fs.promises.unlink(P("public", "favicon-48.png")).catch(() => {});

  // Mobile app (Expo)
  const images = P("mobile", "assets", "images");
  await render(tile, path.join(images, "icon.png"), 1024);
  await render(fg, path.join(images, "android-icon-foreground.png"), 1024);
  await render(bg, path.join(images, "android-icon-background.png"), 1024);
  await render(fg, path.join(images, "android-icon-monochrome.png"), 1024);
  await render(markSvg, path.join(images, "splash-icon.png"), 1024);
  await render(rounded, path.join(images, "favicon.png"), 48);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
