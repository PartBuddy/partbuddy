#!/usr/bin/env node
// Builds every PartBuddy brand asset from one source of truth (docs/brand.md):
//   tools/brand/geometry.mjs          mark construction (master grid and pixel-snapped sizes)
//   packages/design-tokens/tokens.css brand colours (--cs-brand-*)
//   assets/brand/source/*.json        text outlines made by tools/brand/outline-text.py
// Output: SVG files, PNG icons, ICO files, the social preview, the overview sheet and the click
// dummy's favicons. Rasters
// are rendered with the Chromium build of the click dummy's Playwright dependency.
//
// Usage: node tools/brand/build.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buddyPath, iconGeometry, master, partPath, round, scaled, tilePath } from './geometry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'assets', 'brand');

// ---------------------------------------------------------------------------------------------
// Colours come from the design tokens so the brand and the UI cannot drift apart.
const tokens = readFileSync(join(root, 'packages', 'design-tokens', 'src', 'tokens.css'), 'utf8');
function token(name) {
  const match = tokens.match(new RegExp(`--cs-${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'));
  if (!match) throw new Error(`token --cs-${name} missing in tokens.css`);
  return match[1];
}
const colour = {
  ink: token('brand-ink'),
  paper: token('brand-paper'),
  accent: token('brand-accent'),
  accentOnInk: token('brand-accent-on-ink'),
  canvas: token('color-canvas'),
  grid: token('color-surface-sunken'),
  muted: token('color-text-muted'),
  border: token('color-border'),
  borderStrong: token('color-border-strong'),
};

const text = {
  ...JSON.parse(readFileSync(join(out, 'source', 'wordmark.json'), 'utf8')),
  ...JSON.parse(readFileSync(join(out, 'source', 'text-regular.json'), 'utf8')),
  ...JSON.parse(readFileSync(join(out, 'source', 'text-medium.json'), 'utf8')),
};

// ---------------------------------------------------------------------------------------------
// Variants: which colour each element takes.
const variants = {
  colour: { part: colour.ink, buddy: colour.accent, text: colour.ink },
  inverse: { part: colour.paper, buddy: colour.accentOnInk, text: colour.paper },
  'mono-dark': { part: colour.ink, buddy: colour.ink, text: colour.ink },
  'mono-light': { part: colour.paper, buddy: colour.paper, text: colour.paper },
};

const svg = (width, height, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}" role="img" aria-label="${title}">\n` +
  `  <title>${title}</title>\n${body}</svg>\n`;

const markBody = (g, v, indent = '  ') =>
  `${indent}<path fill="${v.part}" d="${partPath(g)}"/>\n${indent}<path fill="${v.buddy}" d="${buddyPath(g)}"/>\n`;

// Text placed so that its ink starts at x and its baseline sits at y, scaled to a cap height.
function textBody(item, x, baseline, capHeight, fill, indent = '  ') {
  const s = capHeight / item.capHeight;
  const tx = x - item.bbox[0] * s;
  return `${indent}<path fill="${fill}" transform="translate(${round(tx)} ${round(baseline)}) scale(${Number(s.toPrecision(6))})" d="${item.d}"/>\n`;
}
const textWidth = (item, capHeight) => ((item.bbox[2] - item.bbox[0]) * capHeight) / item.capHeight;

// Horizontal lockup on the master grid (units): mark 32 × 40, cap height 20, baseline 30,
// distance mark → wordmark 10 units (half the cap height).
const lockup = { cap: 20, baseline: 30, space: 10 };
function lockupSvg(v, title) {
  const g = scaled(1);
  const x = master.width + lockup.space;
  const width = x + textWidth(text.wordmark, lockup.cap);
  return svg(width, master.height, markBody(g, v) + textBody(text.wordmark, x, lockup.baseline, lockup.cap, v.text), title);
}

function wordmarkSvg(fill, title) {
  const cap = 20;
  const s = cap / text.wordmark.capHeight;
  const top = -text.wordmark.bbox[1] * s;
  const bottom = text.wordmark.bbox[3] * s;
  return svg(textWidth(text.wordmark, cap), top + bottom, textBody(text.wordmark, 0, top, cap, fill), title);
}

function markSvg(v, title) {
  return svg(master.width, master.height, markBody(scaled(1), v), title);
}

// App icon: graphite tile with the white part and the blue companion.
function iconSvg(size) {
  const g = iconGeometry(size);
  const body =
    `  <path fill="${colour.ink}" d="${tilePath(size, g.radius)}"/>\n` +
    markBody(g, { part: colour.paper, buddy: colour.accentOnInk });
  return svg(size, size, body, 'PartBuddy');
}

// Social preview for GitHub (1280 × 640): calm canvas, construction grid, lockup and tagline.
function socialSvg() {
  const W = 1280;
  const H = 640;
  const step = 32;
  let grid = '';
  for (let x = step; x < W; x += step) grid += `M${x} 0V${H}`;
  for (let y = step; y < H; y += step) grid += `M0 ${y}H${W}`;
  const u = 3; // px per master unit for the lockup
  const left = 128;
  const top = 200;
  const g = scaled(u, left, top);
  const textX = left + (master.width + lockup.space) * u;
  // Construction view of the mark on the right: the part as an outline, the companion solid,
  // centre lines through the clearance gap.
  const bx = 880;
  const by = 160;
  const big = scaled(8, bx, by);
  const gx = bx + big.wall + big.gap / 2;
  const gy = by + big.notch + big.gap / 2;
  const body =
    `  <rect width="${W}" height="${H}" fill="${colour.canvas}"/>\n` +
    `  <path d="${grid}" stroke="${colour.grid}" stroke-width="1" fill="none"/>\n` +
    `  <path d="${partPath(big)}" fill="${colour.paper}" stroke="${colour.border}" stroke-width="2"/>\n` +
    `  <path d="${buddyPath(big)}" fill="${colour.accent}"/>\n` +
    `  <path d="M${bx - 32} ${gy}H${bx + big.width + 32}M${gx} ${by - 32}V${by + big.height + 32}" stroke="${colour.borderStrong}" stroke-width="1.5" stroke-dasharray="16 4 2 4" fill="none"/>\n` +
    markBody(g, variants.colour) +
    textBody(text.wordmark, textX, top + lockup.baseline * u, lockup.cap * u, colour.ink) +
    textBody(text.tagline, left, 384, 20, colour.muted) +
    textBody(text.meta, left, 424, 14, colour.muted);
  return svg(W, H, body, 'PartBuddy');
}

// ---------------------------------------------------------------------------------------------
// Write SVGs.
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const files = {};
for (const [name, v] of Object.entries(variants)) {
  const suffix = name === 'colour' ? '' : `-${name}`;
  files[`svg/mark${suffix}.svg`] = markSvg(v, 'PartBuddy');
  files[`svg/logo${suffix}.svg`] = lockupSvg(v, 'PartBuddy');
}
files['svg/wordmark.svg'] = wordmarkSvg(colour.ink, 'PartBuddy');
files['svg/wordmark-light.svg'] = wordmarkSvg(colour.paper, 'PartBuddy');
const iconSizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
for (const size of [16, 20, 24, 32, 48, 256]) files[`svg/app-icon-${size}.svg`] = iconSvg(size);
files['favicon/favicon.svg'] = iconSvg(16);
files['social/social-preview.svg'] = socialSvg();
for (const [path, content] of Object.entries(files)) write(join(out, path), content);

// ---------------------------------------------------------------------------------------------
// Render rasters with Playwright's Chromium.
const require = createRequire(join(root, 'prototypes', 'clickdummy', 'package.json'));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(markup, width, height, transparent = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">` +
      markup.replace(/<svg ([^>]*)width="[^"]*" height="[^"]*"/, `<svg $1width="${width}" height="${height}"`) +
      `</body></html>`,
  );
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
}

const png = {};
for (const size of iconSizes) {
  png[size] = await render(iconSvg(size), size, size);
  write(join(out, 'icon', 'png', `partbuddy-${size}.png`), png[size]);
}

// ICO with PNG-compressed entries (supported since Windows Vista).
function ico(sizes) {
  const images = sizes.map((s) => png[s]);
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}
write(join(out, 'icon', 'partbuddy.ico'), ico([16, 20, 24, 32, 40, 48, 64, 96, 256]));
write(join(out, 'favicon', 'favicon.ico'), ico([16, 32, 48]));
// The click dummy serves the same favicons from its public folder.
const publicDir = join(root, 'prototypes', 'clickdummy', 'public');
write(join(publicDir, 'favicon.svg'), files['favicon/favicon.svg']);
write(join(publicDir, 'favicon.ico'), ico([16, 32, 48]));
write(join(out, 'social', 'social-preview.png'), await render(socialSvg(), 1280, 640, false));

// Overview sheet for the brand guide: every variant on its intended background, plus the icon
// sizes at 1:1 and enlarged 3× without smoothing to show the pixel snapping.
const cell = (bg, inner, label) =>
  `<figure style="margin:0;box-sizing:border-box;overflow:hidden;background:${bg};border:1px solid ${colour.border};border-radius:8px;padding:32px;display:flex;flex-direction:column;gap:16px;justify-content:center;align-items:flex-start;min-height:120px">${inner}<figcaption style="font:12px 'Segoe UI',sans-serif;color:${bg === colour.ink ? '#a9b0b9' : colour.muted}">${label}</figcaption></figure>`;
const img = (markup, h) => `<img alt="" style="height:${h}px" src="data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}">`;
const pngImg = (size, scale) =>
  `<img alt="" width="${size * scale}" height="${size * scale}" style="image-rendering:pixelated" src="data:image/png;base64,${png[size].toString('base64')}">`;
const sheet =
  `<div style="width:1440px;padding:48px;box-sizing:border-box;background:${colour.canvas};display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">` +
  cell(colour.paper, img(files['svg/logo.svg'], 72), 'logo.svg — colour on light') +
  cell(colour.ink, img(files['svg/logo-inverse.svg'], 72), 'logo-inverse.svg — on graphite') +
  cell(colour.paper, img(files['svg/logo-mono-dark.svg'], 72), 'logo-mono-dark.svg — one colour') +
  cell(colour.ink, img(files['svg/logo-mono-light.svg'], 72), 'logo-mono-light.svg — one colour, reversed') +
  cell(
    colour.paper,
    `<div style="display:flex;gap:16px;align-items:flex-end">${[256, 64, 48, 32, 24, 20, 16].map((s) => pngImg(s, 1)).join('')}</div>`,
    'App icon PNG at 256, 64, 48, 32, 24, 20 and 16 px (1:1)',
  ) +
  cell(
    colour.paper,
    `<div style="display:flex;gap:24px;align-items:flex-end">${[48, 32, 24, 20, 16].map((s) => pngImg(s, 3)).join('')}</div>`,
    'Pixel-snapped small sizes, enlarged 3× — the clearance gap stays one full pixel',
  ) +
  `</div>`;
await page.setViewportSize({ width: 1440, height: 400 });
await page.setContent(`<!doctype html><html><body style="margin:0">${sheet}</body></html>`);
const sheetHeight = await page.evaluate(() => document.body.scrollHeight);
await page.setViewportSize({ width: 1440, height: sheetHeight });
write(join(root, 'docs', 'brand', 'overview.png'), await page.screenshot({ fullPage: true }));

await browser.close();
console.log(`Wrote ${Object.keys(files).length} SVG files, ${iconSizes.length} PNG icons, 2 ICO files, social preview and overview.`);
