// Google Drive v3 REST client for the sync file in the hidden appDataFolder (SPEC §17.2).
// Plain fetch, no Google library. `fetch` and the token getter are injected (tests mock them).
import { DRIVE_API, DRIVE_UPLOAD, SYNC_FILE_NAME } from './config.js';

export class DriveError extends Error {
  /** @param {string} message @param {{code: 'auth'|'conflict'|'offline'|'http'|'format', status?: number}} o */
  constructor(message, { code, status } = { code: 'http' }) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{fetch?: typeof fetch, getToken: () => string|null}} o
 */
export function createDrive({ fetch: f = globalThis.fetch?.bind(globalThis), getToken }) {
  /** Server time of the last response (ms) – for the clock-skew correction. */
  let lastServerDate = null;

  async function req(url, { method = 'GET', headers = {}, body } = {}) {
    const token = getToken();
    if (!token) throw new DriveError('Nicht bei Google angemeldet.', { code: 'auth' });
    let res;
    try {
      res = await f(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
    } catch (e) {
      throw new DriveError('Keine Verbindung zu Google Drive.', { code: 'offline' });
    }
    const date = res.headers?.get?.('Date');
    if (date && Number.isFinite(Date.parse(date))) lastServerDate = Date.parse(date);
    if (res.status === 401) throw new DriveError('Google-Anmeldung abgelaufen.', { code: 'auth', status: 401 });
    if (res.status === 412) throw new DriveError('Die Sync-Datei wurde gleichzeitig geändert.', { code: 'conflict', status: 412 });
    if (res.status === 403) {
      let reason = '';
      try { reason = (await res.json())?.error?.errors?.[0]?.reason || ''; } catch { /* ignore */ }
      if (/rateLimit|userRateLimit/i.test(reason)) throw new DriveError('Google Drive ist gerade überlastet – später erneut.', { code: 'http', status: 403 });
      throw new DriveError('Kein Zugriff auf Google Drive (Berechtigung fehlt).', { code: 'auth', status: 403 });
    }
    if (!res.ok) throw new DriveError(`Google Drive antwortet mit Fehler ${res.status}.`, { code: 'http', status: res.status });
    return res;
  }

  /** All sync files (normally one), oldest first. @returns {Promise<{id: string, version?: string, modifiedTime?: string}[]>} */
  async function listFiles() {
    const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
    const res = await req(`${DRIVE_API}/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id%2Cversion%2CmodifiedTime)&pageSize=10`);
    const json = await res.json();
    return Array.isArray(json?.files) ? json.files : [];
  }

  /** @returns {Promise<{id: string, version?: string, modifiedTime?: string}>} */
  async function meta(id) {
    const res = await req(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id%2Cversion%2CmodifiedTime`);
    return res.json();
  }

  /** @returns {Promise<{json: any, etag: string|null}>} */
  async function download(id) {
    const res = await req(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    const etag = res.headers?.get?.('ETag') || null;
    let json;
    try { json = JSON.parse(await res.text()); } catch { throw new DriveError('Die Sync-Datei in Google Drive ist beschädigt.', { code: 'format' }); }
    return { json, etag };
  }

  /** files.create (multipart) in appDataFolder. */
  async function create(content) {
    const boundary = `pt-${Math.random().toString(36).slice(2)}`;
    const metaPart = JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`
      + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n--${boundary}--`;
    const res = await req(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id%2Cversion`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    return res.json();
  }

  /** files.update (media upload); If-Match makes a concurrent write fail with 412. */
  async function update(id, content, { ifMatch } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (ifMatch) headers['If-Match'] = ifMatch;
    const res = await req(`${DRIVE_UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id%2Cversion`, {
      method: 'PATCH', headers, body: JSON.stringify(content),
    });
    return res.json();
  }

  async function remove(id) {
    await req(`${DRIVE_API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  return { listFiles, meta, download, create, update, remove, serverDate: () => lastServerDate };
}
