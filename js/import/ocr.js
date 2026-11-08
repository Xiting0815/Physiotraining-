// Offline text recognition (OCR) for screenshots – lazy wrapper around the vendored tesseract.js v5
// (vendor/tesseract/**, see SPEC §13). Nothing here is loaded until the user picks a screenshot.
//
// Assets (≈ 7 MB on first use, then served from Cache Storage "pt-ocr-<version>" by sw.js – they are
// deliberately NOT part of the precache):
//   tesseract.esm.min.js, worker.min.js, tesseract-core-(simd-)lstm.js + .wasm (one variant, chosen by a
//   WebAssembly SIMD probe), lang/deu.traineddata.gz + lang/eng.traineddata.gz (tessdata "best_int", LSTM).
//
// API
//   ocrAssets({simd}) / ocrDownloadBytes({simd}) / assetsCached() / prefetchAssets(onProgress)
//   preprocess(blob) → {canvas|blob, width, height, scale, inverted}
//   recognize(imageBlob, {onProgress, langs, refine}) → {text, lines:[{text, bbox, confidence}], confidence, width, height, regions, ms}
//   The worker is created per call and terminated afterwards (frees ~100 MB WASM memory).
// Pure helpers (`formatMB`, `ocrAssets`, `computeScale`, `flattenLines`, `loadingMessage`) run in Node.

export const OCR_VERSION = '5.1.1';
export const OCR_CACHE = `pt-ocr-${OCR_VERSION}`;
export const OCR_LANGS = 'deu+eng';

const BASE = new URL('../../vendor/tesseract/', import.meta.url);

/** Byte sizes of the vendored files (for the progress bar / "1. Mal ~X MB"). */
const SIZES = {
  'tesseract.esm.min.js': 67129,
  'worker.min.js': 123686,
  'tesseract-core-simd-lstm.js': 124396,
  'tesseract-core-simd-lstm.wasm': 2859709,
  'tesseract-core-lstm.js': 124391,
  'tesseract-core-lstm.wasm': 2859424,
  'lang/deu.traineddata.gz': 1333102,
  'lang/eng.traineddata.gz': 2952873,
};

/**
 * Files one OCR run needs.
 * @param {{simd?: boolean, langs?: string}} [o]
 * @returns {{path: string, bytes: number}[]}
 */
export function ocrAssets({ simd = true, langs = OCR_LANGS } = {}) {
  const core = simd ? 'tesseract-core-simd-lstm' : 'tesseract-core-lstm';
  const files = ['tesseract.esm.min.js', 'worker.min.js', `${core}.js`, `${core}.wasm`,
    ...langs.split('+').map((l) => `lang/${l}.traineddata.gz`)];
  return files.map((path) => ({ path, bytes: SIZES[path] ?? 0 }));
}

export const ocrDownloadBytes = (o) => ocrAssets(o).reduce((s, a) => s + a.bytes, 0);

/** 7_412_345 → "7,4 MB" */
export function formatMB(bytes) {
  const mb = (bytes || 0) / 1e6;
  return `${mb.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

/** German status line for the loader. */
export function loadingMessage({ phase, loaded = 0, total = 0, firstTime = false }) {
  if (phase === 'download') {
    return firstTime
      ? `Texterkennung wird geladen… (1. Mal ca. ${formatMB(total)}, danach offline) – ${formatMB(loaded)}`
      : 'Texterkennung wird geladen…';
  }
  if (phase === 'init') return 'Texterkennung wird gestartet…';
  if (phase === 'prepare') return 'Bild wird vorbereitet…';
  if (phase === 'recognize') return 'Text wird erkannt…';
  return 'Fertig';
}

/** WebAssembly SIMD probe (same bytes as wasm-feature-detect `simd`). */
export function simdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
      2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
}

const assetUrl = (path) => new URL(path, BASE).href;

async function openCache() {
  try { return typeof caches !== 'undefined' ? await caches.open(OCR_CACHE) : null; } catch { return null; }
}

/** true when every asset needed on this device is already in the OCR cache. */
export async function assetsCached({ simd = simdSupported() } = {}) {
  const cache = await openCache();
  if (!cache) return false;
  for (const a of ocrAssets({ simd })) if (!await cache.match(assetUrl(a.path))) return false;
  return true;
}

/**
 * Downloads missing assets into the OCR cache with byte progress (the SW serves them from there).
 * Works without a service worker too (then the browser HTTP cache is used by the second fetch).
 * @param {(p: {phase: 'download', loaded: number, total: number, progress: number, firstTime: boolean, message: string}) => void} [onProgress]
 */
export async function prefetchAssets(onProgress, { simd = simdSupported() } = {}) {
  const cache = await openCache();
  const assets = ocrAssets({ simd });
  const missing = [];
  for (const a of assets) if (!cache || !await cache.match(assetUrl(a.path))) missing.push(a);
  const total = missing.reduce((s, a) => s + a.bytes, 0);
  const firstTime = missing.length > 0;
  let loaded = 0;
  const emit = () => onProgress?.({ phase: 'download', loaded, total, firstTime,
    progress: total ? Math.min(1, loaded / total) : 1, message: loadingMessage({ phase: 'download', loaded, total, firstTime }) });
  emit();
  for (const a of missing) {
    const url = assetUrl(a.path);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Texterkennung konnte nicht geladen werden (${a.path}: ${res.status}). Bitte einmal online öffnen.`);
    const chunks = [];
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        emit();
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      chunks.push(buf);
      loaded += buf.byteLength;
      emit();
    }
    if (cache) {
      const blob = new Blob(chunks, { type: res.headers.get('Content-Type') || contentTypeFor(a.path) });
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }));
    }
  }
  loaded = total;
  emit();
  return { downloaded: total, firstTime };
}

export function contentTypeFor(path) {
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.gz')) return 'application/gzip';
  return 'application/octet-stream';
}

/* ------------------------------------------------------------------ */
/* Image preprocessing                                                 */
/* ------------------------------------------------------------------ */

/**
 * Scale factor for OCR. Normal photos: long edge ≤ 2000 px. Tall phone screenshots (RENPHO lists are
 * ~1080×5000) must not be shrunk by their long edge (text would become unreadable), so the width is
 * capped at 1600 px and the area at 10 MP instead. Small images (width < 700) are upscaled ×2.
 */
export function computeScale(w, h) {
  if (!w || !h) return 1;
  const tall = h / w > 2;
  let s = tall ? Math.min(1, 1600 / w) : Math.min(1, 2000 / Math.max(w, h));
  s = Math.min(s, Math.sqrt(10e6 / (w * h)));
  if (w * s < 700) s = Math.min(2, 1400 / w);
  return s;
}

/**
 * Pure pixel step of `preprocess` (Node-testable). `gray` = luminance 0..255, row-major.
 * - mode "local" (default): polarity-free local contrast – every pixel becomes dark in proportion to how
 *   much it differs from its neighbourhood mean (box ≈ 4 % of the width). White text on coloured headers,
 *   grey labels on white and dark-mode screenshots all end up as dark text on white.
 * - mode "global": contrast stretch (2nd–98th percentile), inverted when the image is mostly dark.
 * @returns {{out: Uint8ClampedArray, inverted: boolean}}
 */
export function enhanceGray(gray, w, h, { mode = 'local' } = {}) {
  const n = w * h;
  const out = new Uint8ClampedArray(n);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const inverted = sum / n < 110;
  if (mode === 'local') {
    const r = Math.max(6, Math.round(w / 50));
    const W = w + 1;
    const integ = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += gray[y * w + x];
        integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + row;
      }
    }
    const gain = 2.2;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
        const m = s / ((y1 - y0) * (x1 - x0));
        out[y * w + x] = 255 - Math.abs(gray[y * w + x] - m) * gain;
      }
    }
    return { out, inverted };
  }
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[gray[i]]++;
  const pct = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * p) return v; } return 255; };
  let lo = pct(0.02);
  let hi = pct(0.98);
  if (hi - lo < 40) { lo = 0; hi = 255; }
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const v = (gray[i] - lo) * k;
    out[i] = inverted ? 255 - v : v;
  }
  return { out, inverted };
}

/**
 * Grayscale + contrast enhancement (see `enhanceGray`) (2nd–98th percentile); dark screenshots are inverted (dark text on light
 * works best for tesseract). Returns a canvas (OffscreenCanvas when available).
 * @param {Blob} blob
 */
export async function preprocess(blob, { mode = 'local' } = {}) {
  const bmp = await createImageBitmap(blob);
  const scale = computeScale(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
  const { out, inverted } = enhanceGray(gray, w, h, { mode });
  for (let i = 0, j = 0; j < out.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = out[j]; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return { canvas, width: w, height: h, scale, inverted };
}

/**
 * A region (original-image px) of the source bitmap, upscaled ×2 and contrast-stretched globally – a second
 * opinion for the row re-read (the full-page local filter can swallow a small decimal point).
 */
function regionCanvas(bmp, b, { up = 2, mode = 'global' } = {}) {
  const x = Math.max(0, Math.round(b.x0));
  const y = Math.max(0, Math.round(b.y0));
  const w = Math.max(1, Math.min(bmp.width - x, Math.round(b.x1 - b.x0)));
  const h = Math.max(1, Math.min(bmp.height - y, Math.round(b.y1 - b.y0)));
  const m = 16;
  const W = Math.round(w * up) + 2 * m;
  const H = Math.round(h * up) + 2 * m;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, x, y, w, h, m, m, W - 2 * m, H - 2 * m);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const gray = new Uint8Array(W * H);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
  const { out } = enhanceGray(gray, W, H, { mode });
  for (let i = 0, j = 0; j < out.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = out[j]; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function canvasToBlob(canvas) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

/* ------------------------------------------------------------------ */
/* Recognition                                                         */
/* ------------------------------------------------------------------ */

/** tesseract.js v5 result → flat line list (bbox in original-image pixels). */
export function flattenLines(data, scale = 1) {
  const out = [];
  const pushLine = (l) => {
    const text = String(l.text || '').replace(/\s+$/, '');
    if (!text.trim()) return;
    const b = l.bbox || {};
    out.push({
      text,
      bbox: { x0: Math.round((b.x0 ?? 0) / scale), y0: Math.round((b.y0 ?? 0) / scale), x1: Math.round((b.x1 ?? 0) / scale), y1: Math.round((b.y1 ?? 0) / scale) },
      confidence: Math.round(l.confidence ?? 0),
    });
  };
  if (Array.isArray(data?.blocks) && data.blocks.length) {
    for (const bl of data.blocks) for (const p of bl.paragraphs || []) for (const l of p.lines || []) pushLine(l);
  } else if (Array.isArray(data?.lines)) {
    data.lines.forEach(pushLine);
  }
  return out;
}

/**
 * Runs OCR on one image (fully offline once the assets are cached).
 * @param {Blob} imageBlob
 * @param {{onProgress?: (p: {phase: string, progress: number, message: string, loaded?: number, total?: number, firstTime?: boolean}) => void,
 *   langs?: string, psm?: string, mode?: 'local'|'global', refine?: (r: any) => {key: string, bbox: any}[]}} [opts]
 * `refine(result) → [{key, bbox}]` (original-image px) re-reads those regions as text blocks → `result.regions`.
 * @returns {Promise<{text: string, lines: {text: string, bbox: {x0:number,y0:number,x1:number,y1:number}, confidence: number}[], confidence: number,
 *   width: number, height: number, regions: {key: string, text: string, confidence: number}[], ms: number}>}
 */
export async function recognize(imageBlob, { onProgress, langs = OCR_LANGS, psm = '4', mode = 'local', refine } = {}) {
  const t0 = Date.now();
  const simd = simdSupported();
  await prefetchAssets(onProgress, { simd });
  onProgress?.({ phase: 'prepare', progress: 0, message: loadingMessage({ phase: 'prepare' }) });
  const pre = await preprocess(imageBlob, { mode });
  const png = await canvasToBlob(pre.canvas);

  onProgress?.({ phase: 'init', progress: 0, message: loadingMessage({ phase: 'init' }) });
  const { default: Tesseract } = await import(assetUrl('tesseract.esm.min.js'));
  const core = simd ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js';
  const worker = await Tesseract.createWorker(langs, 1 /* OEM.LSTM_ONLY */, {
    workerPath: assetUrl('worker.min.js'),
    corePath: assetUrl(core),
    langPath: assetUrl('lang').replace(/\/$/, ''),
    workerBlobURL: false, // a real URL so the core finds its .wasm next to it and the SW controls it
    cacheMethod: 'none', // the SW cache already holds the traineddata
    gzip: true,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ phase: 'recognize', progress: m.progress ?? 0, message: loadingMessage({ phase: 'recognize' }) });
      } else {
        onProgress?.({ phase: 'init', progress: m.progress ?? 0, message: loadingMessage({ phase: 'init' }) });
      }
    },
    errorHandler: (e) => console.warn('OCR', e),
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: String(psm) });
    const { data } = await worker.recognize(png, {}, { text: true, blocks: true });
    const lines = flattenLines(data, pre.scale);
    const result = { text: data.text || lines.map((l) => l.text).join('\n'), lines, confidence: Math.round(data.confidence ?? 0),
      width: Math.round(pre.width / pre.scale), height: Math.round(pre.height / pre.scale), regions: [], ms: 0 };
    // optional second pass: re-read single rows (e.g. a value the page layout analysis dropped)
    const wanted = typeof refine === 'function' ? (refine(result) || []).slice(0, 12) : [];
    if (wanted.length) {
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      const bmp = await createImageBitmap(imageBlob);
      try {
        for (const r of wanted) {
          const crop = regionCanvas(bmp, r.bbox);
          const { data: rd } = await worker.recognize(await canvasToBlob(crop), {}, { text: true });
          result.regions.push({ key: r.key, text: rd.text || '', confidence: Math.round(rd.confidence ?? 0) });
        }
      } finally { bmp.close?.(); }
    }
    onProgress?.({ phase: 'done', progress: 1, message: loadingMessage({ phase: 'done' }) });
    result.ms = Date.now() - t0;
    return result;
  } finally {
    try { await worker.terminate(); } catch { /* already gone */ }
  }
}
