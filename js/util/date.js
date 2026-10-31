// Pure date helpers (local time, "YYYY-MM-DD"). See docs/SPEC.md §7.6.

const pad = (n) => String(n).padStart(2, '0');

/** @param {Date} date @returns {string} */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** @param {Date} [now] */
export function todayISO(now = new Date()) {
  return toISODate(now);
}

/** @param {string} iso "YYYY-MM-DD" (or full ISO timestamp → its local date) @returns {Date} local midnight */
export function parseISODate(iso) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const t = new Date(iso);
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** @param {string} iso @param {number} n */
export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b − a). */
export function daysBetween(aIso, bIso) {
  const a = parseISODate(aIso);
  const b = parseISODate(bIso);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/** Monday of the ISO week. */
export function startOfIsoWeek(iso) {
  const d = parseISODate(iso);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

/** @returns {string} e.g. "2026-W44" */
export function isoWeekKey(iso) {
  const d = parseISODate(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

/** @param {string} iso @param {{weekday?: boolean}} [opts] → "Sa., 31.10.2026" */
export function formatDE(iso, { weekday = true } = {}) {
  const d = parseISODate(iso);
  const s = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  return weekday ? `${WD[d.getDay()]}, ${s}` : s;
}

/** @param {number} sec → "1:05" */
export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
