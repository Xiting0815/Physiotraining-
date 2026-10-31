// Backup export/import. See docs/SPEC.md §7.6.
import { exportData, importData } from '../store.js';
import { todayISO } from './date.js';

export function downloadBackup() {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `physio-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** @param {File} file @returns {Promise<void>} */
export async function readBackupFile(file) {
  const text = await file.text();
  importData(text);
}
