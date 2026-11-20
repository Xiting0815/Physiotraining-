// Screenshot helper: renders tools/pose-editor.html?exercises=1&ids=… and saves a PNG.
// Usage: node tools/shot-figures.mjs <out.png> id1,id2,…   (needs the global playwright module + Chromium)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ids] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 8600 + Math.floor(Math.random() * 300);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1150, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/tools/pose-editor.html?exercises=1&ids=${ids}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out, fullPage: true });
  if (errors.length) console.error(errors.join('\n'));
  console.log('saved', out);
} finally { await browser.close(); server.kill(); }
