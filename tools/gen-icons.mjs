#!/usr/bin/env node
// Renders the PWA icons from icons/icon.svg with Playwright (dev-only tool; not part of the app).
//   node tools/gen-icons.mjs
// Produces:
//   icons/icon-maskable.svg      full-bleed variant, artwork inside the 80 % safe zone
//   icons/icon-192.png, icon-512.png            (purpose "any", transparent rounded corners)
//   icons/icon-maskable-192.png, icon-maskable-512.png  (purpose "maskable")
//   icons/apple-touch-icon.png   180×180, full-bleed (iOS rounds it itself)
// Requires Playwright with Chromium available (local or global install: `npm i -g playwright`).
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'icons');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through to global */ }
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}

const svg = await readFile(path.join(iconsDir, 'icon.svg'), 'utf8');

// Maskable: square background, artwork scaled into the safe zone (circle r = 40 % of size).
const maskable = svg
  .replace(/rx="112"/g, 'rx="0"')
  .replace('<g id="art">', '<g id="art" transform="translate(256 256) scale(0.84) translate(-272 -240)">');
await writeFile(path.join(iconsDir, 'icon-maskable.svg'), maskable);

const targets = [
  { file: 'icon-192.png', src: svg, size: 192, transparent: true },
  { file: 'icon-512.png', src: svg, size: 512, transparent: true },
  { file: 'icon-maskable-192.png', src: maskable, size: 192 },
  { file: 'icon-maskable-512.png', src: maskable, size: 512 },
  { file: 'apple-touch-icon.png', src: maskable, size: 180 },
];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    const markup = t.src.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `);
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${markup}</body></html>`);
    await page.screenshot({ path: path.join(iconsDir, t.file), omitBackground: !!t.transparent, clip: { x: 0, y: 0, width: t.size, height: t.size } });
    await page.close();
    console.log('wrote icons/' + t.file);
  }
} finally {
  await browser.close();
}
