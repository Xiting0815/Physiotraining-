// Google-Drive sync – constants (SPEC §17). No DOM, no storage.
//
// DEFAULT_CLIENT_ID: optional build-time OAuth client id. Leave empty – the user enters their own client id in
// Mehr → Synchronisierung (docs/SYNC_SETUP.md). A value here is only used when settings.sync.clientId is empty.
export const DEFAULT_CLIENT_ID = '';

/** The only scope the app ever asks for: the hidden per-app folder in the user's own Drive. */
export const SYNC_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const SYNC_FILE_NAME = 'physiobogen-sync.json';
/** Google Identity Services – loaded lazily, never precached (sw.js ignores cross-origin requests). */
export const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const SETUP_GUIDE_URL = 'https://github.com/Xiting0815/Physiotraining-/blob/main/docs/SYNC_SETUP.md';

/** „123456-abc.apps.googleusercontent.com“ */
export const CLIENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apps\.googleusercontent\.com$/;
export const isValidClientId = (v) => typeof v === 'string' && CLIENT_ID_RE.test(v.trim());

export const SYNC_FORMAT = 1;
export const REMOTE_ACTIVE_MAX_MS = 12 * 3600e3;   // a running training on another device is shown for ≤ 12 h
export const MAX_FUTURE_SKEW_MS = 5 * 60e3;        // timestamps further in the future are clamped (wrong device clock)
export const DEBOUNCE_MS = 20e3;                   // after store changes
export const SESSION_MIN_GAP_MS = 2 * 60e3;        // during a running training at most every 2 min
export const VISIBLE_THROTTLE_MS = 60e3;           // visibilitychange → visible
export const CONFLICT_RETRIES = 3;                 // read → merge → write, retried on 412 / version change
export const GIS_TIMEOUT_MS = 15e3;
