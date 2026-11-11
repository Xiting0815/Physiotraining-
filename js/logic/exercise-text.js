// Layperson exercise texts (v5.3 „verständliche Anleitungen“). PURE – no DOM, no storage.
// Exercise fields: `short` (one line what & why), `setup` (Ausgangsposition: orientation, distances, contact points),
// `steps` (3–4 short action steps; the first three are enough to do the exercise), `feel` („Du spürst …“).
// Legacy `instructions` stay in the data for backward compatibility; the UI reads these helpers.
import { availableEquipment, officeChairOnly, OFFICE_CHAIR_NOTE } from './equipment.js';

/** One-line summary (falls back to the description). */
export const shortFor = (ex) => ex?.short || ex?.description || '';

/** Action steps (falls back to the first four legacy instructions). */
export function stepsFor(ex) {
  if (Array.isArray(ex?.steps) && ex.steps.length) return [...ex.steps];
  return (ex?.instructions || []).slice(0, 4);
}

/** Target sensation („Du spürst …“) or ''. */
export const feelFor = (ex) => ex?.feel || '';

const toAvail = (x) => (x == null ? null : x instanceof Set ? x : availableEquipment(x));

/**
 * Equipment-specific setup lines (§16.3 / §18.1): the band attachment (door anchor text when the anchor is owned,
 * otherwise the knot step of the legacy instructions), the handles line, and – unless `chair: false` – the office
 * chair note.
 * @param {any} ex @param {any} [availOrSettings] settings or Set of available ids (null = no equipment info)
 * @param {{chair?: boolean}} [opts]
 * @returns {string[]}
 */
export function equipmentSetupFor(ex, availOrSettings, { chair = true } = {}) {
  const out = [];
  const a = toAvail(availOrSettings);
  const sbe = ex?.setupByEquipment;
  if (sbe) {
    const knot = (ex.instructions || [])[Math.max(0, ex.setupStep ?? 0)];
    if (a && sbe['door-anchor'] && a.has('door-anchor')) out.push(sbe['door-anchor']);
    else if (knot) out.push(knot);
    if (a && sbe['band-handles'] && a.has('band-handles')) out.push(sbe['band-handles']);
  }
  if (chair && officeChairOnly(ex, a)) out.push(OFFICE_CHAIR_NOTE);
  return out;
}

/** Full Ausgangsposition: equipment lines first, then the exercise's own setup text. */
export function setupFor(ex, availOrSettings, opts) {
  return [...equipmentSetupFor(ex, availOrSettings, opts), ...(ex?.setup ? [ex.setup] : [])];
}

/** First sentence of the setup (prep phase hint in the session). */
export function setupHeadline(ex) {
  const s = String(ex?.setup || '').trim();
  if (!s) return '';
  const m = s.match(/^.+?(?<!\b(?:ca|z|B|ggf|bzw))[.!?](?=\s+[A-ZÄÖÜ„]|$)/);
  return (m ? m[0] : s).trim();
}
