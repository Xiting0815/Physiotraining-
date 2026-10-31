# Physiotraining – SPEC (single source of truth)

Version 1.0 · WP0 · 2026-10-31

This document is binding for all work packages. If code and SPEC disagree, the SPEC wins
(or the SPEC is updated deliberately in the same change). UI language is **German**;
this document is English, UI copy is quoted in German.

---

## 0. Context & goals

- **User:** right-handed compound archer. Left knee: meniscus tear + cartilage damage.
  Surgery probably **January 2027** → current **prehab phase**.
- **Rhythm:** 3 sessions/week, ~40 min each:
  `Aufwärmen → Knie-Block (petrol) → Bogen-/Rücken-Block (orange) → Cool-down`.
  Workouts **A / B / C** rotate (A→B→C→A…), independent of weekday.
- **Equipment:** TheraBand `yellow < red < green < blue`, Blackroll Loop band
  `orange < blue`, mat, chair, step. Optional equipment page from `data/equipment.json`.
- **Principles:** the app only **suggests** (progression, regression, stop); the user always
  **confirms**. Never guilt-tripping. Motivating and visually polished. Fully offline.

## 1. Tech constraints (mandatory)

- Vanilla JS **ES modules**, no build step, **no npm runtime dependencies**.
- **Hash router** (`#/heute` …). **Relative paths only** (`./js/app.js`, `data/x.json` resolved
  via `new URL(..., import.meta.url)`), app is served from GitHub Pages under `/Physiotraining-/`.
- Persistence: `localStorage` single key **`"pt.v1"`**, accessed **only** through `js/store.js`.
- Service worker `sw.js` (stub in WP0, real cache in WP-PWA).
- Pure logic in `js/logic/*` and `js/util/date.js` must run in Node (no DOM, no `window`,
  no `localStorage`); tested with `node --test` (auto-discovers `tests/*.test.js`; `package.json` only sets `"type": "module"` + scripts, no dependencies).
- Custom elements are registered inside their own module (`customElements.define` guarded by
  `if (!customElements.get(...))`); `js/app.js` imports them once.
- No inline event handler attributes (`onclick=`); use `addEventListener` / delegation.

## 2. Folder structure

```
index.html  manifest.webmanifest  sw.js  README.md
icons/                      icon-192.png, icon-512.png, icon.svg (maskable)
css/tokens.css              design tokens (light/dark) – complete in WP0
css/base.css                reset, layout, typography, tab bar
css/components.css          cards, buttons, chips, rings, traffic light, …
js/app.js                   bootstrap: load store+content, register SW, start router
js/router.js                hash router
js/render.js                html`` tagged template + escaping + render()
js/store.js                 the only localStorage access
js/content.js               loads data/*.json
js/types.js                 JSDoc typedefs (no runtime code except `export {}`)
js/logic/traffic-light.js   evaluateSession, finalizeWithNextDay, recommendLevels, taperActive
js/logic/progression.js     nextWorkout, phaseProgress, applyRecommendation, levelOf
js/logic/stats.js           streak, weeklyProgress, trends, personalRecords
js/logic/motivation.js      xpFor, levelFor, evaluateBadges, dailyQuote, opCountdown
js/components/pt-timer.js   <pt-timer>
js/components/pt-figure.js  <pt-figure>
js/components/pt-pain-scale.js <pt-pain-scale>
js/components/charts.js     lineChart, barChart, calendarHeatmap
js/components/celebrate.js  confetti, targetFace
js/views/*.js               one module per screen
js/util/date.js             date helpers (pure)
js/util/audio.js            beep, vibrate, unlock
js/util/export-import.js    downloadBackup, readBackupFile
data/exercises.json workouts.json phases.json poses.json badges.json [equipment.json]
tests/*.test.js             node --test
docs/SPEC.md
```

## 3. Feature list

1. **Heute (Today)** – hero card with next workout (A/B/C, phase, estimated duration),
   big "Training starten" button (or "Training fortsetzen" if `activeSession`), OP countdown
   card with progress ring, weekly goal ring (x/3), streak, XP level bar, daily quote,
   pending recommendations to confirm, pending next-day check-in banner, taper banner.
2. **Session flow** – pre-check → warm-up → knee block → archery block → cool-down →
   post-check → summary (target face, XP, badges, PRs, recommendations). Resumable.
3. **Folgetag (Next-day check-in)** – pain, swelling, stiffness (+ night pain, locking,
   giving way) for the latest session without check-in → finalizes the traffic light.
4. **Plan** – current phase, exit criteria checklist, phase progress, workouts A/B/C with
   their exercises (current level per exercise), list of all phases.
5. **Übungen (Exercise library)** – filter by block / equipment / search; card shows figure
   thumbnail, current level. **Detail:** animated figure, steps, cues, mistakes, knee note,
   all levels (current highlighted), regress/progress links, manual level change (confirm).
6. **Verlauf (History)** – calendar heatmap (traffic colors), pain trend line chart
   (pre/post/next-day), sessions per week bar chart, personal records, session list with detail.
7. **Mehr (Settings & more)** – surgery date, weekly goal, pain thresholds, band order,
   theme (system/light/dark), sound, vibration, export/import JSON backup, reset, link to
   Ausrüstung, about/disclaimer.
8. **Ausrüstung (Equipment)** – optional page rendering `data/equipment.json` if present,
   otherwise renders bands from settings.
9. **Motivation** – OP countdown, streak, weekly ring, XP & archery level titles, badges,
   target-face summary, confetti, PRs, daily quote, gentle reminders (§8).
10. **Offline PWA** – installable, works offline after first load (WP-PWA).

## 4. Screens, routes & flows

| Route | View module | Tab | Title |
|---|---|---|---|
| `#/heute` (default, also `#/` and unknown) | `views/today.js` | Heute | „Heute“ |
| `#/plan` | `views/plan.js` | Plan | „Plan“ |
| `#/uebungen` | `views/exercises.js` | Übungen | „Übungen“ |
| `#/uebung/:id` | `views/exercise-detail.js` | Übungen | exercise name |
| `#/session` | `views/session.js` | – (tab bar hidden) | „Training“ |
| `#/folgetag` | `views/next-day.js` | Heute | „Folgetag-Check“ |
| `#/verlauf` | `views/history.js` | Verlauf | „Verlauf“ |
| `#/mehr` | `views/settings.js` | Mehr | „Mehr“ |
| `#/ausruestung` | `views/equipment.js` | Mehr | „Ausrüstung“ |

Query strings are allowed: `#/uebungen?block=knee`, `#/verlauf?session=<id>`.

**Tab bar** (bottom, fixed, safe-area aware): Heute · Plan · Übungen · Verlauf · Mehr, each with
inline SVG icon + label, `aria-current="page"` on active tab. Hidden on `#/session`
(`body.is-session`).

### 4.1 View module contract

```js
// js/views/<name>.js
/** @param {HTMLElement} root  @param {ViewContext} ctx  @returns {void|(() => void)|Promise<…>} */
export async function render(root, ctx) { … return cleanup; }
export const title = 'Heute';          // static fallback title (string)
```
`ViewContext = { params, query, store, content, navigate }`
- `params`: route params (`{id}`), `query`: plain object of query params.
- `store`: the store module namespace (§7.3), `content`: result of `loadContent()`.
- `navigate(path)`: sets `location.hash`.
- Views render into `root` (replace content) and may return a cleanup function (unsubscribe,
  stop timers). The router calls cleanup before rendering the next route.
- Views re-render themselves on store changes if needed via `store.subscribe`.

### 4.2 Session flow (detail)

1. **Start** (Heute → „Training starten“): `activeSession` created from
   `nextWorkout()` with all planned items/levels; taper applied if `taperActive`.
2. **Vor dem Training (pre-check):** Schmerz jetzt (0–10 pain scale), Schwellung
   (`0 keine / 1 leicht / 2 deutlich`), mechanische Symptome (Blockieren, Wegknicken),
   Nachtschmerz (ja/nein), Schwellung seit > 48 h (ja/nein).
   If any **stop & consult** condition is already present → show stop card
   „Heute lieber pausieren und Rücksprache halten“ with option to do only the archery block
   or end; user decides.
3. **Exercise screens** (one per exercise, sections in order warmup → knee → archery → cooldown;
   section header colored: knee = petrol, archery = orange, warmup/cooldown = neutral):
   figure, level label, sets×reps/hold/seconds, band chip, tempo, cues (collapsed steps),
   `<pt-timer>` (hold / timed / rest), set checkboxes (big 56–64px buttons), per-exercise
   „Schmerz während“ scale (knee block mandatory, others optional), archery exercises ask
   **RPE 1–10** instead, „Überspringen“, „Scharfer Schmerz“ flag, back/next.
   After each completed set → rest timer auto-starts (level.rest seconds).
4. **Nach dem Training (post-check):** Schmerz jetzt, Schwellung, RPE gesamt (1–10), Notiz.
5. **Summary:** provisional traffic light (symbol + text), target face with arrows & score,
   XP gained + level bar, new badges, new PRs, recommendations (each: Übernehmen / Später).
   Confetti if traffic ≠ red/stop. Session moved from `state.activeSession` into `sessions[]`,
   `state.nextWorkoutId` advanced.
6. **Next day** (≥ 12 h after session end, or from the next calendar day): Heute shows banner
   „Wie geht's dem Knie heute?“ → `#/folgetag` → `finalizeWithNextDay` → final traffic
   light + updated recommendations.

## 5. Training logic

### 5.1 Traffic light (per session, and per knee exercise)

Inputs: `painDuring` (per exercise, max across knee exercises), `post.pain` (after),
`pre.pain` (= **baseline**), swelling, `nextDay`, flags. Thresholds from
`settings.painThresholds` = `{ greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 }`.

| Light | Rule (exact) | Action |
|---|---|---|
| 🟢 **green** „Grün – passt“ | pain during ≤ 2 **and** after ≤ 2, **no swelling** (post.swelling = 0 and not increased), next-day pain ≤ baseline + 1 | after **2 consecutive greens** for that exercise → suggest **progress** one level |
| 🟡 **yellow** „Gelb – halten“ | pain during or after 3–5, **or** next-day pain baseline +1 < x ≤ baseline +2 (i.e. +1..+2 above baseline where +1 alone is still green — see note) | **hold** current level |
| 🔴 **red** „Rot – zurück“ | pain > 5, **sharp pain**, **new swelling** (post.swelling > pre.swelling), next-day > baseline + 2 **or not recovered** (nextDay.swelling > 0 or stiffness ≥ 2), **locking / giving way** | **regress** one level (or reduce volume 30–50 % if already at level 0) |
| ⛔ **stop** „Stopp – ärztlich abklären“ | **2 reds in a row** (final lights of the last two sessions), **swelling > 48 h**, **locking**, **night pain** | stop knee training, consult doctor/physio; show card, user decides |

Note on the next-day boundary: next-day pain ≤ baseline + 1 → green-compatible;
baseline + 2 → yellow; > baseline + 2 → red. (So "+1..+2" in the yellow rule is effectively +2;
implementations must use: `d = nextDay.pain - baseline; d <= 1 green, d <= 2 yellow, else red`.)

- Light = worst of all applicable criteria (`green < yellow < red < stop`).
- **Provisional** light: computed at session end without next-day data.
- **Final** light: computed by `finalizeWithNextDay` (can only stay or get worse, except
  `stop` triggered by locking is kept).
- Locking appears in red **and** stop: locking/giving way in the session → red; locking
  reported (pre, post-session or next day) → stop & consult suggestion. Giving way alone → red.
- Per-exercise light uses that exercise's `painDuring`/`sharpPain` plus session-level
  after/swelling/next-day criteria.
- **Archery block is RPE-driven** (knee rules still apply for stop conditions only):
  RPE ≤ 6 in 2 consecutive sessions → suggest progress; 7–8 → hold; ≥ 9 → regress.
- Warm-up / cool-down: no progression logic.
- **The app only suggests.** Recommendations have `status: "pending"` until the user
  taps „Übernehmen“ (→ `accepted`, level changed via `applyRecommendation`) or „Verwerfen“
  (→ `dismissed`).

### 5.2 Taper

`taperActive(surgeryDate, today)` is `true` when `1 ≤ daysUntil(surgeryDate) ≤ 7`.
While active: **reduce volume 30–40 %** (sets × 0.65, rounded, min 1; holds/reps unchanged),
**no progress recommendations, no new exercises** (exercises not yet done in any previous
session are skipped/hidden). Banner: „OP-Woche: weniger Umfang, gleiche Qualität.“
On/after surgery date: Heute shows „Alles Gute für die OP!“ and training start is still
possible but not suggested.

### 5.3 Workout rotation & phases

- `phase.workouts = {A, B, C}` → workout ids. `state.nextWorkoutId` holds the **workout id**.
  After a finished session: A→B→C→A within the current phase.
- Phase progression is never automatic: `phaseProgress` reports exit-criteria status; user
  ticks exit criteria in Plan and confirms „Nächste Phase starten“.
- Levels: `state.exerciseLevels[exerciseId]` = **0-based index** into `exercise.levels`.
  Missing → `0`. Never exceeds `levels.length-1`. Progress beyond last level → suggest
  `exercise.progressTo` (new exercise at level 0); regress below 0 → `exercise.regressTo`.
- `phaseMin`: exercise only appears in workouts / suggestions for phases with
  `order ≥ phase(phaseMin).order`.

## 6. Data model

All ids are lowercase kebab-case ASCII. Dates: day = `"YYYY-MM-DD"` (local), timestamps =
ISO 8601 strings (`new Date().toISOString()`).

### 6.1 `data/exercises.json`

```json
{
  "version": 1,
  "exercises": [ Exercise, … ]
}
```

**Exercise**

| field | type | notes |
|---|---|---|
| `id` | string | kebab-case, unique |
| `name` | string | German |
| `category` | string | free tag: `"kraft"`, `"mobilitaet"`, `"stabilitaet"`, `"dehnung"`, `"kardio"`, `"haltung"` |
| `block` | `"knee"\|"archery"\|"warmup"\|"cooldown"` | |
| `equipment` | string[] | ids: `theraband`, `loop`, `mat`, `chair`, `step`, `wall`, `door`, `none` |
| `type` | `"reps"\|"hold"\|"timed"` | reps = count reps; hold = isometric seconds per rep; timed = continuous seconds |
| `side` | `"both"\|"left"\|"right"\|"alternate"\|"perSide"` | `perSide` = sets done for each side (doubles work), `left` = operated knee only |
| `instructions` | string[] | ordered steps |
| `cues` | string[] | short coaching cues |
| `mistakes` | string[] | common errors |
| `kneeNote` | string | knee-specific safety note (may be `""`) |
| `levels` | Level[] | ≥ 1, ordered easy → hard |
| `regressTo` | string\|null | exercise id |
| `progressTo` | string\|null | exercise id |
| `phaseMin` | string | phase id |
| `figure` | Figure | see below |

**Level** `{ label, sets, reps?, hold?, seconds?, tempo?, band?, rest }`
- `label`: string, e.g. `"Stufe 1"` or descriptive „ohne Band“.
- `sets`: integer. Exactly one of `reps` (type reps or hold: reps per set),
  `hold` (seconds per rep, for type `hold`, combined with `reps`), `seconds` (type timed).
  Type `hold` uses **both** `reps` and `hold` (e.g. 5 × 10 s).
- `tempo`: string `"ecc-pause-con"` seconds, e.g. `"3-1-1"`, or `null`.
- `band`: band id or `null`: `"yellow" | "red" | "green" | "blue" | "loop-orange" | "loop-blue"`.
- `rest`: seconds between sets.

**Figure** `{ poses: string[], props: string[], band: {from, to} | null, mirror: boolean }`
- `poses`: ≥ 1 pose ids from `data/poses.json` (keyframes; animation ping-pongs through them).
- `props`: subset of `chair | wall | door | mat | step`.
- `band.from`: named point (`handL handR elbowL elbowR footL footR kneeL kneeR hip neck`);
  `band.to`: named point **or** anchor `{ "x": number, "y": number }` in figure coordinates
  **or** prop anchor string `"door" | "chair" | "wall" | "step"`.
- `mirror`: draw mirrored (e.g. to show the left side).

Example:

```json
{
  "id": "quad-set",
  "name": "Quadrizeps anspannen (Quad Set)",
  "category": "kraft",
  "block": "knee",
  "equipment": ["mat"],
  "type": "hold",
  "side": "left",
  "instructions": ["Rückenlage, Beine lang.", "Kleines Handtuch unter das linke Knie.", "Kniekehle ins Handtuch drücken, Oberschenkel fest anspannen.", "Halten, dann locker lassen."],
  "cues": ["Kniescheibe zieht nach oben", "Zehen zu dir"],
  "mistakes": ["Luft anhalten", "Gesäß hebt ab"],
  "kneeNote": "Schmerzfrei bis leicht (≤ 2/10). Kein Durchdrücken mit Gewalt.",
  "levels": [
    { "label": "Stufe 1", "sets": 2, "reps": 10, "hold": 5, "tempo": null, "band": null, "rest": 30 },
    { "label": "Stufe 2", "sets": 3, "reps": 10, "hold": 10, "tempo": null, "band": null, "rest": 30 }
  ],
  "regressTo": null,
  "progressTo": "straight-leg-raise",
  "phaseMin": "p1-basis",
  "figure": { "poses": ["lying-supine", "lying-supine-quad"], "props": ["mat"], "band": null, "mirror": false }
}
```

### 6.2 `data/workouts.json`

```json
{ "version": 1, "workouts": [ Workout, … ] }
```
**Workout** `{ id, name, phaseId, durationMin, warmup: Item[], blocks: Block[], cooldown: Item[] }`
- **Block** `{ id: "knee"|"archery", title, items: Item[] }` (order = display order).
- **Item** `{ exerciseId, note? }` — `note` optional string shown under the exercise.

```json
{
  "id": "p1-a", "name": "Training A", "phaseId": "p1-basis", "durationMin": 40,
  "warmup": [{ "exerciseId": "heel-slides" }],
  "blocks": [
    { "id": "knee", "title": "Knie", "items": [{ "exerciseId": "quad-set", "note": "Linkes Bein" }] },
    { "id": "archery", "title": "Bogen & Rücken", "items": [{ "exerciseId": "band-pull-apart" }] }
  ],
  "cooldown": [{ "exerciseId": "breathing-reset" }]
}
```

### 6.3 `data/phases.json`

```json
{ "version": 1, "phases": [ Phase, … ] }
```
**Phase** `{ id, name, order, description, exitCriteria: string[], workouts: {A, B, C} }`

```json
{ "id": "p1-basis", "name": "Phase 1 – Basis", "order": 1,
  "description": "Reizarm aktivieren, Kontrolle und Routine aufbauen.",
  "exitCriteria": ["2 Wochen überwiegend grün", "Quad Set 3×10×10 s schmerzfrei"],
  "workouts": { "A": "p1-a", "B": "p1-b", "C": "p1-c" } }
```

### 6.4 `data/poses.json` (figure model)

```json
{
  "version": 1,
  "segments": { "trunk": 50, "thigh": 42, "shin": 42, "upperArm": 30, "forearm": 28, "head": 10, "foot": 10 },
  "poses": { "<poseId>": Pose, … }
}
```
**Pose** `{ view, ground, root, trunk, hipL, hipR, kneeL, kneeR, shoulderL, shoulderR, elbowL, elbowR }`
- `view`: `"side" | "front"`. Side view: figure **faces right** (+x).
- `ground`: `"standing" | "lying" | "sitting"` (hint for floor/prop drawing).
- `root`: `{ x, y }` = **hip joint** in a 200 × 200 viewBox; floor line at `y = 185`.
- Angles in **degrees**:
  - `trunk`: hip→neck direction, measured from **straight up**; + = lean forward (toward +x).
    Lying supine ≈ `-90` (head to the left), prone ≈ `90`.
  - `hipL/hipR`: thigh direction (hip→knee) measured from **straight down**; + = forward (+x).
    Front view: + = abduction (outward).
  - `kneeL/kneeR`: **flexion relative to thigh**, 0 = straight, + = shin rotates backward.
  - `shoulderL/shoulderR`: upper-arm direction measured from **straight down**; + = forward
    (180 = overhead). Front view: + = abduction.
  - `elbowL/elbowR`: **flexion relative to upper arm**, 0 = straight, + = forearm forward/up.
- Named points computed by `pt-figure`: `hip, neck, head, shoulderL/R (= neck), elbowL/R, handL/R,
  kneeL/R, footL/R`.
- Left limbs drawn slightly darker/behind in side view; the **left knee** (operated) is
  highlighted with the accent ring when the exercise `side` is `left`.

```json
"stand": { "view": "side", "ground": "standing", "root": { "x": 100, "y": 101 },
  "trunk": 0, "hipL": 0, "hipR": 0, "kneeL": 0, "kneeR": 0,
  "shoulderL": 0, "shoulderR": 0, "elbowL": 10, "elbowR": 10 }
```

### 6.5 `data/badges.json`

```json
{ "version": 1, "badges": [ Badge, … ] }
```
**Badge** `{ id, name, description, icon, rule: { type, n? } }`
`icon`: one emoji or short glyph. Rule types (implemented in `motivation.evaluateBadges`):

| rule.type | meaning |
|---|---|
| `sessionsCount` (`n`) | ≥ n completed sessions (`first-session` n=1, 10, 25, 50) |
| `weekSessions` (`n`) | ≥ n sessions within one ISO week |
| `totalHoldSeconds` (`n`) | cumulative hold seconds of done sets ≥ n (300 = 5 min) |
| `phaseCompleted` | user advanced to a next phase at least once |
| `greenWeek` | ISO week with ≥ `weeklyGoal` sessions, all final lights green |
| `personalRecord` | any personal record set |
| `comeback` (`n` days) | session after a pause of ≥ n days (default 10) |

Required badges: `first-session`, `week-3`, `sessions-10`, `sessions-25`, `sessions-50`,
`hold-5min`, `phase-done`, `green-week`, `personal-record`, `comeback`.

### 6.6 `data/equipment.json` (optional, owned by another agent – do not edit)

A recommended-equipment / shopping list. May be missing → `loadContent()` returns `equipment: null`.
Current shape (render defensively, every field optional except `items[].id/name`):

```json
{ "updated": "2026-10", "note": "…",
  "items": [ { "id": "tueranker-griffe", "name": "Türanker + Bandgriffe (Set)", "priority": "muss",
               "priceEur": "8–15", "why": "…", "enables": ["Rudern stehend/sitzend", "…"], "tips": "…" } ] }
```
Equipment view: list items grouped/sorted by `priority` (`muss` first), show `name`, `priceEur`,
`why`, `enables[]` as chips, `tips` collapsed; `note` as footer. Also show the user's owned bands
from `settings.bands`. Accept a bare array or `{ equipment: [] }` too.

### 6.7 User data – localStorage `"pt.v1"`

```jsonc
{
  "schemaVersion": 1,
  "settings": {
    "surgeryDate": "2027-01-15",          // "YYYY-MM-DD" | null
    "prehabStart": "2026-10-31",          // set on first load; base for OP countdown ring
    "weeklyGoal": 3,
    "painThresholds": { "greenMax": 2, "yellowMax": 5, "greenStreakToProgress": 2 },
    "bands": [                             // ordered weakest → strongest
      { "id": "yellow", "label": "Gelb", "kind": "theraband", "color": "#F2D43D" },
      { "id": "red", "label": "Rot", "kind": "theraband", "color": "#D9443B" },
      { "id": "green", "label": "Grün", "kind": "theraband", "color": "#3BA55C" },
      { "id": "blue", "label": "Blau", "kind": "theraband", "color": "#2F6FD6" },
      { "id": "loop-orange", "label": "Loop Orange", "kind": "loop", "color": "#F08A24" },
      { "id": "loop-blue", "label": "Loop Blau", "kind": "loop", "color": "#2456B8" }
    ],
    "theme": "system",                     // "system" | "light" | "dark"
    "sound": true,
    "vibration": true,
    "operatedSide": "left"
  },
  "state": {
    "phaseId": "p1-basis",
    "nextWorkoutId": "p1-a",
    "exerciseLevels": { "quad-set": 1 },   // 0-based level index
    "exitCriteriaDone": { "p1-basis": [0] },// indices of ticked exit criteria
    "activeSession": null,                 // Session with status "active" + cursor, or null
    "xp": 340,
    "badges": { "first-session": "2026-10-31T17:20:00.000Z" },  // id → earned at
    "records": { "longestHold": {…}, "mostReps": {…}, "strongestBand": {…} }, // see stats.personalRecords
    "phaseHistory": [{ "phaseId": "p1-basis", "startedAt": "2026-10-31" }],
    "lastSeenQuoteDay": null
  },
  "sessions": [ Session, … ]               // completed sessions, oldest first
}
```

**Session**

```jsonc
{
  "id": "s-20261031-1715-ab12",            // "s-" + yyyymmdd-hhmm + "-" + 4 random
  "workoutId": "p1-a", "phaseId": "p1-basis",
  "status": "done",                        // "active" | "done" | "aborted"
  "startedAt": "2026-10-31T16:35:00.000Z", "endedAt": "2026-10-31T17:15:00.000Z",
  "taper": false,
  "pre":  { "pain": 1, "swelling": 0, "mechanical": { "locking": false, "givingWay": false },
            "nightPain": false, "swellingOver48h": false },
  "exercises": [
    { "exerciseId": "quad-set", "section": "knee", "level": 1,
      "painDuring": 1, "sharpPain": false, "rpe": null, "skipped": false,
      "sets": [ { "done": true, "reps": 10, "hold": 10, "band": null, "at": "2026-10-31T16:42:00.000Z" } ] }
  ],
  "post": { "pain": 1, "swelling": 0, "rpe": 6, "note": "" },
  "nextDay": null,                         // or { "pain": 1, "swelling": 0, "stiffness": 0, "nightPain": false,
                                           //      "locking": false, "givingWay": false, "at": ISO }
  "traffic": { "provisional": "green", "final": null, "reasons": ["…"] },
  "recommendations": [ Recommendation, … ],
  "xpEarned": 120,
  "score": { "points": 172, "max": 190 }
}
```
- `section`: `"warmup" | "knee" | "archery" | "cooldown"`.
- `swelling`: `0` keine · `1` leicht · `2` deutlich. `stiffness`: `0` keine · `1` leicht · `2` deutlich.
- `pain`, `painDuring`: 0–10 integers. `rpe`: 1–10 or `null`.
- Active session additionally has `cursor: { index: number, set: number, step: "pre"|"exercise"|"post"|"summary" }`
  where `index` points into `exercises[]` (planned list, created at start with `sets: []`).

**Recommendation**

```json
{ "exerciseId": "quad-set", "action": "progress", "fromLevel": 1, "toLevel": 2,
  "toExerciseId": null, "reason": "2× grün in Folge", "status": "pending" }
```
`action`: `"progress" | "hold" | "regress" | "reduce" | "consult"`. `hold` recommendations are
informational (not shown as pending). `consult` has `exerciseId: null`.
`status`: `"pending" | "accepted" | "dismissed"`.

### 6.8 Migrations

`store.js` keeps `SCHEMA_VERSION = 1` and `migrations = { [fromVersion]: (data) => data }`.
On load: parse → if missing/corrupt → defaults; run migrations while `data.schemaVersion < SCHEMA_VERSION`;
deep-merge with defaults (missing keys filled). Any schema change **must** bump the version and add
a migration.

## 7. Module contracts (exports)

All signatures are binding. JSDoc types live in `js/types.js`.

### 7.1 `js/render.js`
- `html(strings, ...values) → SafeHtml` — tagged template; values escaped (`& < > " '`),
  arrays flattened/joined, `null/undefined/false` → `""`, nested `SafeHtml` inserted raw.
- `raw(string) → SafeHtml` — trusted markup (e.g. inline SVG constants).
- `escape(string) → string`.
- `render(root, tpl)` — sets `root.innerHTML = String(tpl)`.
- `SafeHtml` has `.toString()` and `.__html`.

### 7.2 `js/router.js`
- `routes` — array `{ pattern: "/uebung/:id", view: "exercise-detail", tab: "uebungen", hideTabs?: true }`.
- `matchRoute(hash) → { route, params, query }` (pure; unknown → `/heute`).
- `startRouter({ root, ctx, onRoute? })` — listens to `hashchange`, lazy-imports
  `./views/<view>.js`, calls cleanup of previous view, calls `render(root, ctx)`, updates
  tab bar `aria-current`, `document.title = "<title> · Physio"`, toggles `body.is-session`,
  scrolls to top, moves focus to `<main>`.
- `navigate(path)` — `location.hash = '#' + path`.

### 7.3 `js/store.js`
- `STORAGE_KEY = "pt.v1"`, `SCHEMA_VERSION`, `defaults()` (fresh object), `migrate(data)`.
- `load() → Data` (reads + migrates, caches in memory), `save(data?)` (writes cache or given),
- `get() → Data` (current in-memory data, loads if needed),
- `update(fn)` — `fn(draft)` mutates a structured clone **or** returns a new object; result saved
  and subscribers notified; returns new data.
- `subscribe(fn) → unsubscribe` — `fn(data)` after every `update`/`importData`/`reset`.
- `getSettings() → Settings`, `getState() → State`, `getSessions() → Session[]`.
- `exportData() → string` (pretty JSON incl. `exportedAt`), `importData(jsonString | object)` —
  validates `schemaVersion` & shape, migrates, replaces, throws `Error` with German message on failure.
- `reset()` — back to defaults.
- `_setStorage(storageLike)` — test hook (Node: in-memory fallback is used automatically when
  `localStorage` is unavailable).

### 7.4 `js/content.js`
- `loadContent({ force? }) → Promise<Content>` — fetches `data/{exercises,workouts,phases,poses,badges}.json`
  in parallel (relative to module URL), plus optional `equipment.json` (→ `null` on 404/parse error).
  Cached after first call. Returns `{ exercises: Exercise[], workouts: Workout[], phases: Phase[],
  poses: PosesFile, badges: Badge[], equipment: any|null }` (arrays unwrapped from `{version, …}`).
- `getContent() → Content|null` (sync, after load).
- `getExercise(id)`, `getWorkout(id)`, `getPhase(id)` → item or `undefined` (sync, after load).
- `getPose(id) → Pose|undefined`.

### 7.5 Components

**`<pt-timer>`** (`js/components/pt-timer.js`)
- Attributes: `mode="rest|hold|set"`, `seconds` (rest/hold duration or timed seconds),
  `reps` (hold: number of hold reps; set: target reps), `tempo` (set mode, `"3-1-1"`),
  `rest-between` (hold mode: seconds between hold reps, default 3), `autostart`.
- Methods: `start()`, `pause()`, `reset()`; property `running` (bool), `remaining` (s).
- Events (bubbling, `CustomEvent`): `tick` `{remaining, elapsed, rep}`, `rep` `{rep, total}`,
  `done` `{elapsed}`.
- Renders 72px+ tabular-nums countdown, big start/pause button, progress ring; uses `audio.beep`
  at last 3 s and done, `audio.vibrate` on done. Uses timestamps (not interval counting) so it
  stays correct when the tab is throttled; keeps screen awake via Wake Lock API if available.

**`<pt-figure>`** (`js/components/pt-figure.js`)
- Attributes: `exercise-id` (looks up `figure` via `content.getExercise`) **or** `poses`
  (JSON array of pose ids or pose objects), `props` (JSON array), `band` (JSON), `tempo`
  (`"3-1-1"` → ms per transition; default 2-0-2), `mirror` (boolean attr), `static`
  (no animation; thumbnail), `size` (px, default fills width).
- Renders parametric SVG stick figure (§6.4), props, band line (`stroke` = band color from
  settings), interpolates angles between keyframes with `requestAnimationFrame`.
- `prefers-reduced-motion: reduce` or `static` with ≥ 2 poses → start and end pose side by side
  with an arrow between.
- Exports also `computePoints(pose, segments) → {hip, neck, head, elbowL, …}` (pure) and
  `interpolatePose(a, b, t) → Pose` (pure) for tests.

**`<pt-pain-scale>`** (`js/components/pt-pain-scale.js`)
- Attributes: `value` (0–10 or empty), `label`, `min` (default 0), `max` (default 10),
  `kind="pain|rpe"` (rpe: 1–10, neutral colors).
- 11 buttons (≥ 48 px, wraps to 2 rows on narrow screens), colored by thresholds
  (≤2 green, 3–5 yellow, >5 red), `role="radiogroup"`, keyboard arrows.
- Property `value` (number|null). Event `change` `{ value }` (bubbling).

**`charts.js`** — all return an `SVGSVGElement` (and append it to `container` if given), responsive
via `viewBox`, colors from CSS tokens:
- `lineChart(container, data, opts?)` — `data = { series: [{ name, color?, points: [{x: "YYYY-MM-DD", y}] }], yMax? }`.
- `barChart(container, data, opts?)` — `data = [{ label, value, color?, goal? }]`.
- `calendarHeatmap(container, data, opts?)` — `data = [{ date: "YYYY-MM-DD", value, traffic? }]`,
  `opts = { weeks: 16 }`; cells colored by traffic (green/yellow/red/stop) else value intensity.

**`celebrate.js`**
- `confetti(opts?) → Promise<void>` — canvas overlay, ~1.5 s, gold/petrol/orange; resolves
  immediately (no-op) under `prefers-reduced-motion`.
- `targetFace(results, opts?) → SVGSVGElement` — `results = [{ score: 0..10, label? }]`;
  WA-style face (gold 10/9, red 8/7, blue 6/5, black 4/3, white 2/1); each result = one arrow at
  a deterministic position in its ring; shows total `points / max` (`max = results.length * 10`).
- `scoreForSet({ done, skipped, painDuring, sharpPain }) → number`:
  done & pain ≤ greenMax → **10**; done & pain ≤ yellowMax → **7**; done & pain > yellowMax or
  sharpPain → **4**; skipped / not done → **1**.

### 7.6 Utilities
- `util/date.js` (pure): `todayISO(now?)`, `toISODate(date)`, `parseISODate(str) → Date`,
  `addDays(iso, n)`, `daysBetween(aIso, bIso)` (b − a in whole days), `isoWeekKey(iso) → "2026-W44"`,
  `startOfIsoWeek(iso)`, `formatDE(iso, {weekday?})` → „Sa., 31.10.2026“, `formatDuration(sec)` → „1:05“.
- `util/audio.js`: `unlock()` (call on first user gesture; creates/resumes AudioContext),
  `beep(kind = "tick" | "done" | "start")`, `vibrate(pattern)`; both respect
  `store.getSettings().sound / .vibration` and fail silently.
- `util/export-import.js`: `downloadBackup()` (Blob → `physio-backup-YYYY-MM-DD.json`),
  `readBackupFile(file) → Promise<void>` (reads + `store.importData`).

### 7.7 Logic (pure; no DOM/storage; all inputs explicit)

`js/logic/traffic-light.js`
- `LIGHTS = ["green", "yellow", "red", "stop"]`, `worst(a, b)`.
- `evaluateSession(session, settings, history = []) → { traffic, reasons: string[], perExercise: {[exerciseId]: light} }`
  — provisional light. `history` = previous completed sessions (oldest first) for "2 reds in a row".
- `finalizeWithNextDay(session, nextDay, settings, history = []) → { traffic, reasons, perExercise }`.
- `recommendLevels(session, history, state, content, settings, { today }) → Recommendation[]`
  — per knee exercise via traffic light & green streak, per archery exercise via RPE; respects taper.
- `taperActive(surgeryDate, today) → boolean`.
- `applyTaper(level) → Level` (sets × 0.65 rounded, min 1).

`js/logic/progression.js`
- `levelOf(state, exerciseId, exercise?) → number` (clamped).
- `nextWorkout(state, phases, workouts) → Workout` (by `state.nextWorkoutId`, fallback phase A).
- `advanceWorkout(state, phase) → workoutId` (A→B→C→A).
- `buildSessionPlan(workout, state, content, { taper, today, history }) → Session` (status active).
- `applyRecommendation(state, rec) → state` (new object).
- `phaseProgress(state, phase, sessions) → { phaseId, sessionsInPhase, greenRatio, criteriaDone, criteriaTotal, ready: boolean }`.

`js/logic/stats.js`
- `streak(sessions, weeklyGoal, today) → { weeks, currentWeekCount }` — consecutive ISO weeks meeting
  the goal, counting back from last week; current week adds +1 once met (never breaks it while running).
- `weeklyProgress(sessions, weeklyGoal, today) → { done, goal, ratio }`.
- `trends(sessions, { days = 42 }) → { pre: Point[], post: Point[], nextDay: Point[], perWeek: [{week, count}] }`.
- `personalRecords(sessions, settings) → { longestHold: {seconds, exerciseId, date}|null, mostReps: {reps, exerciseId, date}|null, strongestBand: {band, exerciseId, date}|null }`
  (band strength by order in `settings.bands`).
- `newRecords(prev, next) → string[]` keys that improved.
- `totalHoldSeconds(sessions) → number`.

`js/logic/motivation.js`
- `XP = { perSet: 10, cleanSetBonus: 5, sessionBonus: 50, nextDayCheckIn: 20, badge: 25 }`.
- `xpFor(session, settings) → number` (done sets × perSet + clean sets (pain ≤ greenMax) × bonus + session bonus).
- `LEVELS` (archery titles, min XP): `Novize 0`, `Lehrling 150`, `Bogenträger 400`, `Schütze 800`,
  `Jäger 1400`, `Scharfschütze 2200`, `Meisterschütze 3200`, `Bogenmeister 4500`, `Robin Hood 6000`.
- `levelFor(xp) → { index, title, min, next: number|null, progress: 0..1 }`.
- `evaluateBadges(data, badgeDefs, { today }) → string[]` newly earned badge ids (not yet in `state.badges`).
- `dailyQuote(today) → string` — deterministic by date from built-in German list (own wording).
- `opCountdown(settings, today) → { daysLeft: number|null, progress: 0..1 }` — progress from `prehabStart` to `surgeryDate`.
- `reminderText(sessions, weeklyGoal, today) → string|null` — gentle copy.

### 7.8 Conventions established in WP0

- Component modules use `const Base = globalThis.HTMLElement ?? class {}` and guard
  `customElements.define`, so their **pure helper exports** (`computePoints`, `interpolatePose`,
  `poseSvg`, `painClass`, `scoreForSet`) can be imported in Node tests.
- `content.js` also exports `_setContent(content)` and `store.js` `_setStorage(storage)` as test hooks.
- `store.update(fn)` gives `fn` a **deep clone**; mutate it (or return a new object). Never mutate
  `store.get()` directly.
- Views get `ctx.query` as a plain object (`{ block: "knee" }`), not `URLSearchParams`.
- `tests/data.test.js` validates all `data/*.json` against §6 – WP-Content / WP-Figure must keep it green.
- `tests/scaffold.test.js` covers render/router/store/date basics.
- All logic stubs are marked `// TODO(WP-…)`; already-final implementations in WP0:
  `taperActive`, `applyTaper`, `worst`, `levelOf`, `nextWorkout`, `advanceWorkout`, `xpFor`, `levelFor`,
  `dailyQuote`, `opCountdown`, `weeklyProgress`, `totalHoldSeconds`, `scoreForSet`, all of `util/date.js`.

## 8. Motivation spec

- **OP countdown card:** „Fit für die OP – noch **N** Tage“ + circular progress ring
  (prehab start → surgery date), subtitle „Jede Einheit zählt.“ No date → card invites
  „OP-Termin eintragen“ (link to Mehr). Last 7 days → taper copy. After date → „Alles Gute!“.
- **Weekly goal ring:** `done/3`, ring fills; complete → gold ring + „Wochenziel erreicht 🎯“.
- **Streak:** weeks in a row meeting the goal: „🔥 4 Wochen in Folge“. A missed week resets
  silently (no shaming); copy: „Neuer Anlauf – diese Woche zählt.“
- **XP:** +10 per completed set, +5 per clean set (pain ≤ 2), +50 per finished session,
  +20 next-day check-in, +25 per badge. Level bar with archery title (`LEVELS`).
- **Badges:** first session, 3-session week, 10/25/50 sessions, 5 min total hold time, phase
  completed, green week, personal record, comeback after pause. New badge → modal/toast with
  icon + confetti. Badge grid in Verlauf/Mehr (locked badges greyed with hint).
- **Session summary as target face:** each completed or planned set = one arrow; clean sets hit
  gold; painful sets land in outer rings; skipped sets in the white ring; score `points/max`
  (`scoreForSet`). Headline by ratio: ≥ 90 % „Volltreffer!“, ≥ 70 % „Starke Gruppe!“,
  else „Jeder Pfeil bringt dich weiter.“
- **Confetti** on session end (not red/stop), badge, level up, weekly goal; respects
  `prefers-reduced-motion`.
- **Personal records:** longest hold, most reps (single set), strongest band → „Neuer Rekord!“ chip.
- **Daily quote:** short, archery/discipline themed, own wording, e.g.
  „Ein ruhiger Atem trifft besser als ein starker Arm.“, „Der Pfeil fliegt dahin, wohin die
  Routine zeigt.“, „Heute sauber, morgen stark.“, „Spannung halten, Kontrolle behalten.“
- **Reminders** (in-app only, never guilt-tripping): e.g. „Lust auf eine kurze Einheit?
  Dein Knie freut sich über Bewegung.“, „Noch 1 Einheit bis zum Wochenziel – ganz entspannt.“
  Never: „Du hast versagt“, red error colors, counters of missed days.

## 9. Visual design spec

**Tokens** (`css/tokens.css`, CSS custom properties on `:root`; dark via
`@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])` and `:root[data-theme="dark"]`):

| token | light | dark |
|---|---|---|
| `--bg` | `#F6F7F9` | `#0F1216` |
| `--surface` | `#FFFFFF` | `#1A1F26` |
| `--surface-2` | `#EEF1F4` | `#232A33` |
| `--text` | `#14181F` | `#E8ECF1` |
| `--muted` | `#5B6573` | `#9AA4B2` |
| `--border` | `#E1E5EA` | `#2C343E` |
| `--primary` (petrol, knee) | `#0E7C86` | `#3FC1C9` |
| `--accent` (archery orange) | `#E07A1F` | `#F2A04E` |
| `--green` | `#1F8A4C` | `#4CC38A` |
| `--yellow` | `#B7791F` | `#F2C94C` |
| `--red` | `#C0392B` | `#FF6B5E` |
| `--gold` (target) | `#D4A72C` | `#D4A72C` |

Plus: `--on-primary`, `--on-accent`, `--primary-soft`, `--accent-soft`, `--grad-hero`
(subtle petrol gradient), `--grad-accent`, `--radius: 16px`, `--radius-sm: 10px`,
`--shadow-1/2`, spacing `--s-1..--s-8` (4px scale), font `--font` (system stack),
`--fs-*`, `--fs-timer: clamp(72px, 22vw, 112px)`, `--tap: 48px`, `--tap-session: 60px`,
`--tabbar-h: 64px`, `--safe-*` (env(safe-area-inset-*)), target ring colors `--ring-*`,
section colors `--block-knee` (= primary), `--block-archery` (= accent), `--block-neutral`.

**Look:** modern, polished. Hero cards with subtle gradients, 16 px radius, soft shadows,
system font stack, generous whitespace, tabular nums for all numbers, timer ≥ 72 px.
Touch targets ≥ 48 px, in session 56–64 px. Bottom tab bar with inline SVG icons (stroke
icons, 24 px, `currentColor`), safe-area insets. **Traffic light always symbol + text**
(●/▲/■ shapes or ✓/!/✕ + „Grün/Gelb/Rot/Stopp“), never color alone. Contrast WCAG AA.
Theme: `settings.theme` → `<html data-theme="light|dark">` (system = no attribute).
Motion: 150–250 ms ease-out; disable non-essential motion for reduced-motion users.

## 10. Work packages (parallel)

| WP | Scope | Files (owner) |
|---|---|---|
| **WP-Design** | full `base.css` + `components.css` (cards, buttons, chips, rings, traffic badge, tab bar, forms, modal/toast, session layout), `<pt-pain-scale>`, tab bar icons in `index.html`, app icons | `css/*`, `js/components/pt-pain-scale.js`, `icons/*` |
| **WP-Timer+audio** | `<pt-timer>`, `audio.js`, wake lock | `js/components/pt-timer.js`, `js/util/audio.js` |
| **WP-Figure+poses** | `<pt-figure>`, all poses in `poses.json`, `figure` blocks validated against exercises | `js/components/pt-figure.js`, `data/poses.json` |
| **WP-Content** | complete `exercises.json` (all exercises, levels, German texts), `workouts.json` (A/B/C per phase), `phases.json` (3 prehab phases), `badges.json` | `data/*.json` (not equipment/poses) |
| **WP-Logic+tests** | all `js/logic/*`, `js/util/date.js`, `celebrate.scoreForSet` rules, tests | `js/logic/*`, `js/util/date.js`, `tests/*` |
| **WP-Session-flow** | `views/session.js`, `views/next-day.js`, `celebrate.js` (confetti, target face), summary | those files |
| **WP-Views** | `today`, `plan`, `exercises`, `exercise-detail`, `history`, `settings`, `equipment`, `charts.js`, `export-import.js` | those files |
| **WP-PWA** | `sw.js` (cache-first app shell + data, versioned cache, relative scope), manifest, icons, install hint, update toast | `sw.js`, `manifest.webmanifest`, registration in `app.js` |
| **WP-QA** | Playwright smoke (all routes, no console errors, full session flow, offline reload), a11y checks, mobile viewport screenshots, `node --test` green | `tests/*`, fixes |

Rules for all WPs: keep exported signatures from §7; add, don't rename; touch only your files
(+ docs/SPEC.md when a contract must change – note it at the top of the change); no
dependencies; German UI copy; relative paths.

## 11. Disclaimer copy

„Diese App ersetzt keine ärztliche oder physiotherapeutische Beratung. Bei starken
Schmerzen, Blockieren, zunehmender Schwellung oder Nachtschmerz: Training stoppen und
Rücksprache halten.“
