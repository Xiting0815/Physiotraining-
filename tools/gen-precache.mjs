#!/usr/bin/env node
// Keeps the service-worker precache list in sync with the repository.
//   node tools/gen-precache.mjs          rewrite PRECACHE + CACHE_VERSION in sw.js
//   node tools/gen-precache.mjs --check  exit 1 if sw.js is out of date (for CI / QA)
//
// vendor/tesseract/** (offline OCR, ~7 MB) is deliberately NOT precached: sw.js caches it lazily in its own
// cache on first use (SPEC §13). EXCLUDE keeps it out even if a scanned dir ever contains vendor files.
//
// Scans index.html, manifest.webmanifest, css/**, js/**, data/*.json and icons/* and writes the
// sorted, relative list between the `// <precache>` markers in sw.js. CACHE_VERSION becomes a
// short content hash of all listed files, so every content change installs a new SW version
// (→ "Update verfügbar" toast) and old caches are cleaned up.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swPath = path.join(root, 'sw.js');

const ROOT_FILES = ['index.html', 'manifest.webmanifest'];
const DIRS = [
  { dir: 'css', ext: /\.css$/ },
  { dir: 'js', ext: /\.(m?js)$/ },
  { dir: 'data', ext: /\.json$/ },
  { dir: 'icons', ext: /\.(png|svg|ico|webp)$/ },
];

/** Never precached (lazy runtime cache in sw.js). */
export const EXCLUDE = [/^vendor\//, /(^|\/)tesseract\//];

async function walk(rel, ext) {
  let entries;
  try { entries = await readdir(path.join(root, rel), { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...await walk(p, ext));
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

export async function collectFiles() {
  const files = [];
  for (const f of ROOT_FILES) {
    try { await readFile(path.join(root, f)); files.push(f); } catch { /* missing */ }
  }
  for (const { dir, ext } of DIRS) files.push(...await walk(dir, ext));
  return files.filter((f) => !EXCLUDE.some((re) => re.test(f))).sort((a, b) => a.localeCompare(b, 'en'));
}

export async function contentHash(files) {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f + '\0');
    h.update(await readFile(path.join(root, f)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 10);
}

export function rewrite(sw, files, version) {
  const list = `const PRECACHE = [\n${files.map((f) => `  '${f}',`).join('\n')}\n];`;
  const versionLine = `const CACHE_VERSION = '${version}';`;
  const replaceBlock = (src, tag, body) => {
    const re = new RegExp(`(// <${tag}>\\n)[\\s\\S]*?(\\n// </${tag}>)`);
    if (!re.test(src)) throw new Error(`Marker // <${tag}> … // </${tag}> fehlt in sw.js`);
    return src.replace(re, `$1${body}$2`);
  };
  return replaceBlock(replaceBlock(sw, 'precache', list), 'precache-version', versionLine);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = await collectFiles();
  const version = await contentHash(files);
  const sw = await readFile(swPath, 'utf8');
  const next = rewrite(sw, files, version);
  if (process.argv.includes('--check')) {
    if (next !== sw) {
      console.error('sw.js precache list is out of date – run: node tools/gen-precache.mjs');
      process.exit(1);
    }
    console.log(`sw.js up to date (${files.length} files, version ${version})`);
  } else {
    if (next !== sw) await writeFile(swPath, next);
    console.log(`sw.js: ${files.length} files precached, CACHE_VERSION ${version}${next === sw ? ' (unchanged)' : ''}`);
  }
}
