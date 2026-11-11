# Physiotraining – SPEC (single source of truth)

Version 5.0 · 2026-11-08 (5.0: §16 „v5 – Ausrüstung steuert den Plan“ – owned equipment filters/upgrades exercises, sling trainer, rowing only with the rowing machine. Where §16 and earlier sections disagree, §16 wins.)
Version 3.1 · 2026-11-08 (3.1: §14 „v3.1 – Fokus Training“ – imports (§13), health diary (§12.7) and weight goal / calorie target (parts of §12.6, §12.8, §12.11, §12.12) **removed**. Where §14 and earlier sections disagree, §14 wins.)
Version 2.0 · 2026-11-07 (2.0: §12 „v2 – Rudern, Kurztraining, eigene Workouts, Gesundheit & Abnehmen“ incl. OP-Termin 2027-01-05, Krücken-Vorbereitung, Post-OP-Phase p4. Where §12 and §0–§11 disagree, §12 wins.)
Version 1.1 · 2026-10-31 (1.1: integration/QA – documented deviations from WP0 in §3, §4.2, §6.4, §6.7, §7.4, §7.5, §8)

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
js/logic/duration.js        v2 duration estimates, 30-min fit (§12.3)
js/logic/cardio.js          v2 rowing phases, display values, totals (§12.4)
js/logic/custom-workouts.js v2 user workouts (§12.5)
js/logic/energy.js          session kcal estimate (§12.6, §14)
js/logic/schedule.js        v2 phase timing, post-op gate (§12.9, §12.10)
js/logic/insights.js        weekly report, load vs. pain, OP readiness (§12.11, §14)
js/components/pt-timer.js   <pt-timer>
js/components/pt-figure.js  <pt-figure>
js/components/pt-pain-scale.js <pt-pain-scale>
js/components/charts.js     lineChart, barChart, calendarHeatmap
js/components/celebrate.js  confetti, targetFace
js/views/*.js               one module per screen
js/util/date.js             date helpers (pure)
js/util/audio.js            beep, vibrate, unlock
js/util/export-import.js    downloadBackup, readBackupFile
data/exercises.json workouts.json phases.json poses.json badges.json [equipment.json] [quotes.json]
tests/*.test.js             node --test
tools/gen-precache.mjs      writes PRECACHE + CACHE_VERSION into sw.js (--check verifies)
tools/gen-poses.mjs         generates data/poses.json; tools/pose-editor.html previews poses
tools/gen-icons.mjs         renders icons/*.png from icons/icon.svg (Playwright, dev only)
docs/SPEC.md
```

## 3. Feature list

1. **Heute (Today)** – first-run welcome card (only while no session exists and not hidden:
   OP-Termin date input, band order „Passt so“ / „Anpassen“, safety note „ersetzt keine
   ärztliche Beratung“, „Erstes Training starten“; replaces hero/OP card/reminder until the first
   session), hero card with next workout (A/B/C, phase, estimated duration),
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
   theme (system/light/dark), font size (`fontScale`), default rest between sets
   (`restDefault`), sound, vibration, export/import JSON backup, reset, link to
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
   After each completed set → rest timer auto-starts (`settings.restDefault` seconds if set,
   else `level.rest`; levels with `rest: 0` never rest). Pre-check options when not all green:
   „Wie geplant“, „Leichtere Varianten“ (`session.mode = "light"`, knee entries one level lower
   or ~40 % fewer sets, `entry.lighter`), „Nur Oberkörper“ (`session.mode = "upper"`).
   Long-press on a set check opens „Satz anpassen“ (reps/hold/seconds/band → `entry.override`).
   Leaving mid-session sets `pausedAt`; time paused is excluded from the duration (`pausedMs`).
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
| `equipment` | string[] | ids: `theraband`, `loop`, `mat`, `chair`, `step`, `wall`, `door`, `none` (v5: + optional ids, §16.1) |
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
- **Extensions (additive, implemented):** optional pose keys `ankleL/R`, `headTilt`, `twist`,
  `reachL/R`, length multipliers `thighLenL…forearmLenR`, `props` per pose, and
  `camera: "top"` (front view seen from above, e.g. prone Y/T/W on a mat). Pose ids are
  descriptive kebab-case (`stand`, `sit-chair`, `supine`, `prone-t`, `side-plank-elevated`, …;
  182 poses). `data/poses.json` is **generated** by `node tools/gen-poses.mjs "$PWD"`
  (grounds every pose: root heights from floor/mat/seat/step via `computePoints`); edit the
  generator, not the JSON. `tools/pose-editor.html` previews poses; open requests live in
  `docs/POSE_REQUESTS.md`.
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

### 6.6 `data/equipment.json` (optional; v5: item ids/`equipment[]` follow §16.1)

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
    "operatedSide": "left",
    "restDefault": null,                   // seconds between sets | null → level.rest
    "fontScale": 1,                        // 1 | 1.125 | 1.25 → <html> font-size
    "ownedEquipment": [],                  // equipment ids ticked on Ausrüstung
    "lastBackupAt": null                   // ISO timestamp of the last export
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
    "lastSeenQuoteDay": null,
    "welcomeDone": false,                  // first-run welcome card hidden
    "bandsConfirmed": false,               // band order confirmed in the welcome card
    "nextDayReminder": null                // { sessionId, dueAt, text } set by finishSession
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
  "score": { "points": 172, "max": 190 },
  // additive fields written by the session flow:
  "mode": "light",                         // only set by the pre-check choice: "light" | "upper"
  "pausedMs": 0,                           // time spent paused (excluded from duration)
  "celebration": { "xpBefore": 0, "xpAfter": 120, "badges": [], "records": [], "shown": true }
}
```
Per exercise entry (additive): `plannedSets` (after taper/lighter), `override`
(`{reps?, hold?, seconds?, band?}` from „Satz anpassen“), `lighter` (bool). Done sets of timed
exercises log `seconds` instead of `reps/hold`. Active sessions may carry `pausedAt`.
New keys are filled from `defaults()` by the deep merge in `migrate()` (no schema bump needed
because they are purely additive with defaults).
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
  poses: PosesFile, badges: Badge[], equipment: any|null, quotes: string[] }` (arrays unwrapped
  from `{version, …}`). `data/quotes.json` (`{version, quotes: string[]}`) is optional like
  equipment; `quotes: []` → `motivation.QUOTES` fallback in `dailyQuote`.
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
- **Extras (additive):** attributes `sets` / `set-rest` (hold mode: repeat the holds for n sets
  with rest between, defaults 1 / 30); methods `skip()` (end current phase) and
  `adjust(deltaSeconds)` (±15 s buttons in rest mode); props `rep`, `phase`; `rep` event detail
  also has `{set, sets}`. Set mode with `seconds` and no tempo = one timed work phase
  (exercise type `timed`). Light DOM, styleable via `--pt-timer-color`, `--pt-timer-rest-color`,
  `--pt-timer-size`.
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
- **XP:** +2 per completed set, +1 per clean set (pain ≤ 2), +20 per finished session,
  +10 next-day check-in, +15 per badge (`XP` in `motivation.js`). A typical session (35–50
  sets) yields ~130–180 XP. Level bar with archery title (`LEVELS`): Novize 0, Lehrling 400,
  Bogenträger 1000, Schütze 1900, Jäger 3000, Scharfschütze 4400, Meisterschütze 6200,
  Bogenmeister 8800, Robin Hood 12000 – at 3 sessions/week a new title every 1–2 weeks early
  on, slower later; Robin Hood after ~75 sessions (~6 months).
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

---

## 12. v2 – Rudern, Kurztraining, eigene Workouts, Gesundheit & Abnehmen

Package V2-A (data + pure logic + tests) is done; UI packages build on the contracts below. All logic is pure
(`node --test`, `tests/logic-v2.test.js`). German UI copy. Everything in this section is **additive**:
no exported signature from §7 was removed or renamed.

### 12.1 New context

- **Surgery:** suggested date **2027-01-05** (microfracture, left knee), then **6 weeks non-weight-bearing**
  (crutches). From 2026-11-07 ≈ 8.5 weeks of prehab.
- **Rowing machine** (MERACH, magnetic, display: time, distance, SPM, watts, kcal, maybe pulse). Doctor/physio
  cleared **full rowing before surgery**, but the pain traffic light applies to rowing too. Rowing is **forbidden
  after surgery** during the non-weight-bearing phase (`postOpAllowed: false`).
- **Goals:** lose weight (target + date), strength sessions **≤ 30 min**, rowing as **separate** cardio sessions
  15–20 min, **3× rowing per week** until surgery (`settings.cardioGoalPerWeek = 3`), 3× strength per week stays,
  ~15-min **Kurztraining**, **own workouts**, daily **health log** (manual copy from Samsung Health), calorie estimates.
- Conservative limits from §5 stay (no further medical instructions before surgery).

### 12.2 Data model additions

**Settings** (defaults in `store.defaults()`, filled into old data by `migrate()` deep merge – **no schema bump**,
`SCHEMA_VERSION` stays 1 because everything is additive):

```jsonc
"cardioGoalPerWeek": 3,
"surgeryDateSuggested": "2027-01-05",   // pre-fill only (welcome card / Mehr); NEVER copied into surgeryDate automatically
"profile": { "heightCm": null, "birthYear": null, "sex": null /* "m"|"w"|"d" */, "activityLevel": "light" /* sedentary|light|moderate|active */ },
"weightGoal": null                       // { targetKg, targetDate "YYYY-MM-DD", startKg, startDate }
```

**State:**

```jsonc
"customWorkouts": [],        // CustomWorkout[] (§12.5)
"healthLog": [],             // HealthEntry[] sorted by date, one per date (§12.7)
"exerciseToggles": {},       // exerciseId → false (user disabled, any phase) | true (enabled despite postOpAllowed=false)
"postOpClearance": null,     // { confirmedAt ISO, note } – user confirms doctor/physio clearance → unlocks p4
"postOpEndClearance": null   // { confirmedAt ISO, note } – doctor's release ends p4 before 6 weeks
```

**Session** (additive): `kind` (`"strength"|"short"|"cardio"|"custom"`, missing = strength),
`rowing: RowingLog|null` (cardio only; `null` until entered), `postOp: true` (session built in a post-op phase),
optional `energy: {kcal, method}` if the UI wants to store the estimate. Pre/post/next-day checks may carry
`redness` and `fever` booleans (asked in post-op phases).
`RowingLog = { durationSec?, distanceM?, avgSpm?, avgWatt?, kcalDisplay?, avgHr?, maxHr? }` (all optional numbers).
Exercise entries can have `section: "cardio"` and `trimmed: true` (sets cut by the time budget).

**Exercise** (additive fields): `block` may be `"cardio"`; `postOpAllowed?: boolean` (missing = true),
`postOpNote?: string`; rowing levels may carry `intensity` (`easy|moderate|vigorous`), `targetSpm [lo,hi]`,
`targetRpe [lo,hi]`, `restActive` (rest = easy rowing), `phases [{label, seconds, intensity}]` (technique drill).
New equipment id `rowing-machine`.

**Workout** (additive): `kind` (`strength|short|cardio`, content never uses `custom`), `maxSets` (set cap per
item; `item.maxSets` wins), `maxMinutes` (time budget: strength 30, short 15, cardio 20), `description`.
`durationMin` = `estimateWorkoutMinutes` at level 0 (kept in sync by a test). Blocks: strength/short
`["knee","archery"]` (≥ 3 / ≥ 2 items), cardio `["cardio"]`; short workouts have no cool-down.
`data/workouts.json` `version: 2`.

**Phase** (additive): `kind: "prehab"|"postop"` (missing = prehab), `plannedWeeks`, `short` (Kurztraining id),
`cardio` (rowing workout ids), post-op only: `clearanceNote`, `gaitNote`, `redFlagNote`, `endNote`.

### 12.3 Duration & the 30-minute rule — `js/logic/duration.js`

- `estimateExerciseSeconds(entry, exercise, settings) → seconds`: `sets × work + (sets−1) × rest + setup`.
  work: reps × tempo-sum (`"3-1-2"` = 6 s; no tempo 3 s/rep) · hold: reps × hold + (reps−1) × 3 s · timed: seconds.
  `perSide` → work × 2 + 5 s switch. rest = `settings.restDefault` (if set and level.rest > 0) else level.rest.
  setup 20 s (0 for block `cardio`). `entry` = session entry or `{level, plannedSets?, override?}`.
- `estimateWorkoutSeconds / estimateWorkoutMinutes(workoutOrPlan, content, state, settings)` – a workout
  (levels from `state.exerciseLevels`, caps from `maxSets`, phaseMin filter as buildSessionPlan) or a session plan
  (`{exercises}`; skipped entries = 0). Minutes rounded up. Use this for every „ca. N Min“ label (Heute, Plan, builder).
- `cappedSets(levelSets, item, workout)`, `fitPlanToMinutes(plan, content, settings, maxMinutes = 30)` (in place:
  removes one set at a time from the main-block entry with the most sets, ties → longest; never < 1 set, never
  removes exercises, warm-up/cool-down last; marks `trimmed: true`), `tempoSeconds`, `workoutItems`,
  constants `SETUP_SEC=20`, `SIDE_SWITCH_SEC=5`, `MAX_SESSION_MIN=30`.
- **How ≤ 30 min is guaranteed:** strength workouts were shortened to 1 warm-up + 4–5 knee + 4 archery + 1
  cool-down with `maxSets: 2` (warm-up/cool-down items `maxSets: 1`); at level 0 every strength workout estimates
  24–29 min without trimming. Higher levels raise reps/holds/bands; `buildSessionPlan` then calls
  `fitPlanToMinutes(plan, …, workout.maxMinutes)` so plans stay ≤ 30 min (≤ 15 for short) even at max levels
  (tested for every workout). The session UI should show `plannedSets` as usual (a small hint „gekürzt für 30 Min“
  on `trimmed` entries is welcome). Progression semantics are unchanged (levels still progress; volume is capped).

### 12.4 Rowing (cardio) — content, flow, `js/logic/cardio.js`

Exercises (block `cardio`, type `timed`, side both, `postOpAllowed: false`, technique instructions + knee note):
`row-technique-warmup` (2 min: arms → arms+body → half slide → full stroke), `row-steady` (12/13/14/15 min,
RPE 4–5, SPM 18–22), `row-intervals` (phaseMin p2; 6×/7×/8× (1 min zügig / 1 min locker), 6× (90 s / 60 s),
RPE 6–7, SPM 22–26, `restActive`), `row-endurance` (phaseMin p3; 13/14/15 min), `row-cooldown` (2 min).
Knee note (all): cleared for full rowing, but traffic light applies; bend the knee only as far as pain-free (do
not roll fully forward if needed); stop at pain > 5/10, sharp pain, locking or giving way; no rowing after surgery.
Technique: legs – body – arms, recovery reversed, controlled catch (shins ~vertical, never „crash“ into flexion).

Workouts (`kind: "cardio"`, warm-up `row-technique-warmup`, block `cardio`, cool-down `row-cooldown`, 15–20 min):
p1 `p1-row` „Rudern – Grundlage“; p2 `p2-row`, `p2-row-intervals` „Rudern – Intervalle“; p3 `p3-row`,
`p3-row-intervals`, `p3-row-endurance` „Rudern – Ausdauer“; p4 none.

**Session flow (cardio):** pre-check (same as §4.2) → guided rowing timer → enter display values → post-check →
summary with kcal.
- Timer phases: `rowingPhases(plan, content) → [{exerciseId, entryIndex, label, seconds, intensity, kind:
  'work'|'rest', targetSpm, targetRpe, set, sets}]` (drills from `level.phases`; intervals alternate work and
  „Locker rudern“). `rowingPlannedSeconds(plan, content)`. Show intensity (`INTENSITY_LABELS`), SPM/RPE targets, and
  a persistent „Stopp bei Schmerz > 5 / Blockieren“ hint. Mark each entry's set(s) done with `{done, seconds}`.
  Ask „Knieschmerz beim Rudern“ (0–10) on the main `cardio` entry (`painDuring`, mandatory like knee entries) –
  it now counts for the traffic light (§12.10); optional `rpe` on that entry (else `post.rpe` is used).
- Display values form → `validateRowing(input) → {ok, value: RowingLog, errors}` (ranges `ROWING_RANGES`, comma
  decimals ok, empty fields dropped) → `session.rowing = value`. Default `durationSec` = elapsed timer seconds.
  Show `pacePer500(rowing)` („2:30 /500 m“).
- `rowingTotals(sessions) → {sessions, distanceM, durationSec, kcalDisplay}`, `rowingRecords(sessions)`,
  `cardioMainLabel(workout, content, state)` (level label for cards).
- Recommendations: `recommendLevels` now also handles section `cardio`: knee light red/stop → regress, yellow →
  hold; else RPE (entry `rpe`, fallback `post.rpe`) ≥ 9 regress, 7–8 hold, ≤ 6 with green in 2 consecutive rowing
  sessions at that level → progress.
- **Rotation:** cardio/short/custom sessions must **not** advance A/B/C. `nextWorkout` ignores non-strength ids.
  ⚠ `views/session-helpers.js finishSession` currently calls `advanceWorkout({...state, nextWorkoutId: s.workoutId}, phase)`,
  which resets to A for non-rotation ids → UI agent must replace it with
  **`rotationAfter(state, phase, s.workoutId)`** (progression.js). Also: `xpFor` already handles cardio; for cardio
  sessions `sessionScore` (target face) is optional – show distance/time/kcal instead.

### 12.5 Custom workouts — `js/logic/custom-workouts.js`

`CustomWorkout = {id "cw-…", name (≤ 60), kind:"custom", createdAt, updatedAt, warmup: Item[], blocks:
[{id:"knee", title, items}, {id:"archery", title, items}], cooldown: Item[]}` (blocks always both, in this order;
`CUSTOM_BLOCKS` gives default titles; items `{exerciseId, note?}`; max 20 items).

- `createCustomWorkout(state, input, content, {now, settings}) → {state, workout, warnings}` (throws German Error)
- `updateCustomWorkout(state, id, input, content, {now, settings}) → {state, workout, warnings}` (keeps id/createdAt)
- `deleteCustomWorkout(state, id) → state`, `duplicateAsCustom(state, workoutId, content, opts)` („Kopie von …“)
- `validateCustomWorkout(custom, content, state, settings) → {ok, errors[], warnings[], estimatedMin}` —
  errors: no name, no exercise, unknown id, rowing exercise (→ „als eigene Rudereinheit“), > 20 items;
  **warnings** (allowed): phaseMin above current phase, knee/archery exercise in the other block, exercise
  blocked/disabled in the current phase, duplicates, estimate > 30 min.
- `toWorkout(custom, state)` → Workout (`kind: "custom"`, `phaseId = state.phaseId`, `maxMinutes: 30`),
  `normalizeCustom`, `newCustomId`, `mergeCustomWorkouts(cur, inc)` (by id, newer `updatedAt` wins).
- **`getWorkout(id, content, state)`** (progression.js, re-exported here; also `content.getAnyWorkout(id, state)`)
  finds content workouts first, then custom ones. Session start for any workout:
  `buildSessionPlan(getWorkout(id, content, state), state, content, {taper, history, settings})`.
  For custom workouts phaseMin is **not** filtered (warning only); post-op blocks and user toggles still apply.

### 12.6 Energy & weight — `js/logic/energy.js` (always labelled „Schätzung“)

> **v3.1 (§14):** only `sessionKcal` (now `sessionKcal(session, weightKg, content?)`), `sessionDurationSec`,
> `rpeFactor`, `MET`, `bodyWeightKg(settings)` remain. BMR/TDEE/BMI, `currentWeight`, `weightTrend`,
> `goalProgress`, `calorieTarget`, `kcalByDay` were removed.

- `bmr(profile, kg, today)` Mifflin–St Jeor (`10·kg + 6.25·cm − 5·age + s`, s = +5 m / −161 w / −78 d), `tdee`
  (× `ACTIVITY_FACTORS` sedentary 1.2, light 1.375, moderate 1.55, active 1.725), `bmi`, `ageFrom`.
- `sessionKcal(session, profile, latestWeightKg, content?) → {kcal, method: 'display'|'watt'|'met', met, label}`:
  rowing: display kcal if entered > watt formula **kcal/h = 4·W + 300** (Concept2-style) > MET (moderate 4.8,
  vigorous 7.0 when the level is vigorous or RPE ≥ 7) × kg × h. Strength/short/custom: MET =
  2.8·kneeShare + 3.5·(1 − kneeShare), × RPE factor (≤ 3: 0.85, 4–6: 1, 7–8: 1.15, ≥ 9: 1.25), × kg × active h
  (ended − started − pausedMs). Default weight 80 kg. `sessionDurationSec`, `kcalByDay(sessions, profile, log, content, dayOf)`.
- `currentWeight(log, today)` = mean of the last 7 days (fallback latest), `weightTrend(log, today, 21)` (least
  squares, ≥ 4 points → `{kgPerWeek, …}`).
- `goalProgress(log, goal, today, profile?) → {currentKg, startKg, targetKg, lostKg, remainingKg, ratio, daysLeft,
  requiredKgPerWeek, trendKgPerWeek, onTrack, projectedDate, reached, warnings[]}` — warnings when required
  > 0.75 kg/week, target BMI < 18.5, date passed. `projectedDate` from the 21-day trend.
- `calorieTarget(profile, log, goal, today) → {kcal, tdee, deficit, floorApplied, label}`: deficit =
  required rate × 7700 / 7 clamped to **500–750 kcal** (0 if no goal/reached), floor **1500 m / 1200 w / 1350 d**.
  Requires a complete profile (else `null` → UI asks for Profil).

### 12.7 Health log — `js/logic/health.js` — **removed in v3.1 (§14)**

`HealthEntry = {date, weightKg?, bodyFatPct?, waistCm?, steps?, activeMin?, restingHr?, avgTrainingHr?, sleepH?,
note?, source: "samsung-health-manual"}`; ranges/labels/units in `HEALTH_FIELDS`.
`validateEntry`, `upsertEntry(log, entry, {replace}) → new log` (one per date, merges fields, `null` removes a
field, throws German Error), `removeEntry`, `entryFor`, `latest(log, field, today?)`, `series(log, field, days,
today)` (→ `lineChart` points), `meanOf`, `weeklyAverages(log, {weeks, today})`, `logStreak(log, today)`,
`longestLogStreak`, `mergeLogs(cur, inc)` (by date, current values win, gaps filled).
XP: `motivation.healthLogXp(prevLog, date)` = 5 for the first entry of a date (call before upserting).

### 12.8 Motivation

> **v3.1 (§14):** `XP.healthLog`, `healthLogXp` and the badges `minus-2kg`, `minus-5kg`, `goal-reached`, `log-7`
> (rule types `weightLost`, `weightGoalReached`, `healthLogStreak`) were removed.

- `XP` gains `cardioBase: 20, cardioPerMin: 2, cardioMaxMin: 20, healthLog: 5`; `xpFor(session)` returns
  `cardioXp` for rowing (20 + 2 × min(minutes, 20) → 15–20 min ≈ 50–60 XP, comparable to a 30-min strength
  session ≈ 70–80 XP + 10 next-day). 3 strength + 3 rowing + 7 logs per week ≈ 430–470 XP → Robin Hood after
  ~26–28 weeks (test). `rowedMinutes(session)`.
- New badges (`data/badges.json`) and rule types in `badgeRuleMet(rule, data, {today})`:
  `first-row` „Erste Ruderfahrt“ (`cardioCount` 1), `row-10km` / `row-50km` (`rowingDistance` 10000/50000 m),
  `first-custom` „Erstes eigenes Workout“ (`customWorkout`), `minus-2kg` / `minus-5kg` (`weightLost`: start =
  weightGoal.startKg or first logged weight vs 7-day mean), `goal-reached` „Ziel erreicht“ (`weightGoalReached`),
  `log-7` „7 Tage Tagebuch“ (`healthLogStreak` 7). Evaluate badges also after health-log saves and custom-workout
  creation (`evaluateBadges(data, content.badges, {today})`).
- `weekSessions` and `greenWeek` badges count strength sessions only; `sessionsCount` counts all.
- Stats (`stats.js`): `isCardioSession`, `strengthSessions`, `cardioSessions`; `weeklyProgress` and `streak`
  count **strength-type** sessions (strength/short/custom); `streak(sessions, goal, today, {cardio: true})` for
  rowing; `cardioProgress(sessions, cardioGoal, today) → {done, goal, ratio, minutes, distanceM}`;
  `trends().perWeek[]` gains `cardio` count; `sameDayLoadHint(sessions, today, startingKind?)` → German hint when
  rowing and strength fall on the same day (show before starting the second one and on the summary).

### 12.9 Phase timing — `js/logic/schedule.js`

Phase changes stay **criteria-based and user-confirmed**; the app only shows a time recommendation.
`plannedWeeks`: p1 3, p2 3, p3 2.5 (taper = last 7 days, from 2026-12-29), p4 6.
`phaseSchedule(phases, surgeryDate, {prehabStart}) → [{phaseId, kind, start, end, days}]` plans backwards from
surgery: with 2027-01-05 → p1 (prehabStart …) – 2026-11-27, p2 2026-11-28 – 12-18, p3 12-19 – 2027-01-04,
p4 2027-01-05 – 02-15. `scheduleHint(phases, settings, state, today) → {expectedPhaseId, status:
'none'|'onTrack'|'ahead'|'behind', daysLeftInPhase, text}` (Plan + Heute). `taperStart(date)`,
`suggestedSurgeryDate(settings)` (= `surgeryDateSuggested` only while `surgeryDate` is null → pre-fill the date
input in the welcome card and Mehr; the user must confirm), constants `DEFAULT_SURGERY_DATE`, `POSTOP_DAYS = 42`.

### 12.10 Crutch preparation & post-op phase p4

**Prehab additions** (all inside the 30-min frame, in every phase's A/B/C): `chair-dip` „Stütz-Dips am Stuhl“,
`band-triceps-extension` „Trizeps-Strecken mit Band“, `seated-press-up` „Abstützen im Sitz (Krücken-Stütz)“
(lat/shoulder depression), `right-leg-sit-to-stand` (healthy right leg), `single-leg-stance-reach` (left-leg
control) plus existing `single-leg-stance`, `quad-set`, `tke`, `straight-leg-raise`, `dead-bug`, `pallof-press`.
Strength block titles: „Knie & Beine“, „Bogen, Rücken & Stütz“.

**Phase `p4-entlastung`** (order 4, `kind: "postop"`, 6 weeks, workouts `p4-a/b/c`, `p4-short`, no cardio).
Exercises (from typical microfracture protocols, weeks 0–6): ankle pumps, quad sets, straight-leg raise (only
without extension lag / with locked brace as instructed), **patellar mobilisation** (`patella-mobilization`, new),
heel slides / flexion only within the permitted range (often 0–90° progressing, depends on lesion site femur vs.
patella), side-lying hip abduction, **glute sets** (`glute-set`, new), healthy right leg (`right-leg-band-press`,
new, lying), upper body / archery / trunk seated or lying (rows, pull-aparts, SPT seated, triceps, crutch support
with left foot off the floor, prone Y-T-W, dead bug with left leg resting). Gait training with crutches = hint
only (`phase.gaitNote`). Every p4 knee item carries „Nur nach Freigabe durch Arzt/Physio – deren Protokoll hat
Vorrang.“ Sources: Northwestern Medicine microfracture protocol
(https://www.nm.org/-/media/northwestern/resources/care-areas/orthopaedics/nmh-sports-medicine-protocols/knee/northwestern-medicine-microfracture-on-wb-surface.pdf),
Lahey distal femoral/tibial microfracture protocol (https://lahey.org/-/media/files/lhmc/orthopedics/knee/lhmc-distal-femoral-and-proximal-tibial-microfracture.pdf),
OSMS microfracture femoral condyle (https://osmsgb.s3.amazonaws.com/wp-content/uploads/2022/06/09104502/OSMSPT.MicrofractureFemCondyle.pdf),
Sports Health review 2021 (https://pmc.ncbi.nlm.nih.gov/articles/PMC8167347). Protocols are surgeon-specific.

- **Blocked after surgery** (`postOpAllowed: false`): all rowing, every standing/loaded-left exercise
  (sit-to-stand, mini-squat, step-up, lateral-step-down, wall-sit, tke, calf-raise, single-leg-stance(-reach),
  lateral-band-walk, standing hip abd/ext, right-leg-sit-to-stand), bridges, resisted seated knee ext/curl,
  bow-arm-push, side-plank, wall-slide, chair-dip, standing stretches, clamshell. Exercises with `postOpNote`
  („im Sitzen ausführen …“) stay allowed – show the note in post-op sessions.
- `exerciseAvailable(exercise, phase, state)` (progression.js): `exerciseToggles[id] === false` → off anywhere;
  in postop phases `postOpAllowed === false` → only if `exerciseToggles[id] === true`. `buildSessionPlan` applies it.
  UI: per-exercise switch („Für mich freigegeben / deaktiviert“) in exercise detail and on the p4 plan, with a
  confirm for enabling blocked ones („nur wenn dein Team es erlaubt“).
- **Unlock:** `postOpStatus(settings, state, today) → {surgeryPassed (today > surgeryDate), cleared, unlocked,
  daysSince, week, daysLeft, ended, reasons[], message}`; `canEnterPhase(phase, settings, state, today) →
  {ok, reasons}` – p4 needs surgery date passed **and** `state.postOpClearance` (`clearance(note, now)` builds it;
  UI: „Freigabe durch Arzt/Physio bestätigen“ + optional note). Phase change itself stays the Plan's
  „Nächste Phase starten“. **End:** 42 days or `postOpEndClearance` → `message` „Entlastungsphase geschafft –
  Reha-Phase mit Physio planen.“ (no further phase yet).
- **Traffic light in post-op sessions** (`session.postOp`, set by buildSessionPlan): redness, fever, pain > 5
  (pre/during/post/next day) or **any new swelling** → `stop` with reason „Entlastungsphase: bitte Arzt kontaktieren – …“
  and a `consult` recommendation. Pre-/post-check UI in p4 must also ask „Rötung/Überwärmung“ and „Fieber“
  (`redness`, `fever`) and show `phase.redFlagNote`.
- Taper (§5.2) only concerns prehab; rowing remains available up to the surgery day.

### 12.11 Insights — `js/logic/insights.js` (no physio export)

> **v3.1 (§14):** `weeklyReport` no longer returns `weight`, `health`, `logDays`; `sleepVsPain`, `stepsVsPain`,
> `dailyPain`, `weightInsight` (and §13.7 `bodyCompositionInsight`) were removed. UI moved to `#/auswertung`.

- `weeklyReport(data, content, today, {weekOf?}) → {weekStart, weekEnd, strength {done, goal}, cardio {done, goal,
  minutes, distanceM}, lights {green,yellow,red,stop}, avgPrePain, avgNextDayPain, prevAvgNextDayPain, load,
  prevLoad, kcal, weight {startKg, endKg, deltaKg}, health {sleepH?, steps?, restingHr?, activeMin?}, logDays,
  highlights[], notes[]}` (notes include same-day rowing+strength).
- `sessionLoad(session)` = session-RPE (post.rpe default 5 × active minutes); `loadVsPain(sessions, {today, days=56})
  → {points[{date, load, nextDayPain, kind}], r, n, text, weekly[{weekStart, load, avgNextDayPain}]}`.
- `sleepVsPain(log, sessions, {today, days=90})` (sleep on wake-up date d vs knee pain on d) and
  `stepsVsPain` (steps on d vs pain on d+1) → `{pairs, r, n, text}`. `dailyPain(sessions)` (next-day check-in pain
  wins, else pre-session pain). `pearson(xs, ys)` → null below **`MIN_POINTS = 8`** pairs;
  `correlationText` is cautious (leichte/mäßige/deutliche **Tendenz**, „keinen Beweis für Ursache und Wirkung“).
- `opReadiness(data, content, today) → {score 0–100, label, parts {criteria 30, strength 25, swellingFree 25,
  regularity 20}, tips[]}` (labels: ≥ 80 „Sehr gut vorbereitet“, ≥ 60 „Auf gutem Weg“, ≥ 40 „Im Aufbau“, else
  „Am Anfang“; heuristic, not a medical assessment – say so in the UI).
- `weightInsight(log, today) → {currentKg, kgPerWeek, n, text}`.

### 12.12 UI expectations (for the UI packages)

> **v3.1 (§14):** Gewicht-Ziel card, Tagebuch card and `#/gesundheit` are gone; see §14.3.

- **Heute** cards (in this order after hero): next strength workout (A/B/C, `estimateWorkoutMinutes`),
  **Kurztraining** card („Nur 15 Minuten?“ → `phase.short`), **Rudern** card (cardio ring `cardioProgress` x/3,
  workout picker from `phase.cardio`, level label, `sameDayLoadHint`), **Gewicht-Ziel** card (`goalProgress`:
  ring = ratio, current 7-day weight, „noch X kg“, on-track text, warnings, `calorieTarget` „ca. N kcal/Tag
  (Schätzung)“; no goal → CTA „Ziel festlegen“), **Tagebuch** card (today's entry yes/no, streak, quick add),
  schedule hint (`scheduleHint`), post-op cards in p4 (`postOpStatus`: week x/6, red-flag note, end message).
  Welcome card pre-fills the OP date with `suggestedSurgeryDate(settings)` (user confirms).
- **Routes (proposal):** `#/eigene` (list of custom workouts: start, edit, duplicate, delete), `#/eigene/neu` and
  `#/eigene/:id` (builder: name, warm-up/knee/archery/cool-down lists, add from library with filters, reorder,
  live „ca. N Min“, warnings from `validateCustomWorkout`), `#/gesundheit` (health log form for a date with all
  `HEALTH_FIELDS`, list, charts via `series`/`weeklyAverages`, weight goal, insights: weekly report,
  `loadVsPain`, `sleepVsPain`, `stepsVsPain`, `opReadiness`), `#/profil` (or a section in Mehr: profile,
  weight goal, cardioGoalPerWeek, exercise toggles). Session start for any workout: `#/session?workout=<id>`.
- **Session flow cardio** = pre-check → rowing guided timer (`rowingPhases`) → display values (`validateRowing`)
  → post-check → summary with kcal (`sessionKcal`, method label) + XP + badges; next-day check-in as usual.
- Plan: show phase schedule, short + rowing workouts per phase, p4 locked state with `canEnterPhase` reasons.
- Verlauf: cardio sessions in the list/heatmap (icon), rowing totals, per-week bars with strength + rowing.
- `sw.js` precache must be regenerated (`node tools/gen-precache.mjs`) for the new logic modules.

## 13. v3 – Import & Körperzusammensetzung — **REMOVED in v3.1 (see §14)**

> Kept for history only. None of the modules, routes, manifest entries or service-worker handlers described in this
> section exist any more (`js/import/*`, `js/views/import.js`, `js/views/health.js`, `vendor/tesseract/`,
> `#/import`, `share_target`). Stored health-log entries of v3 users stay untouched in `localStorage` (§14.4).

New context: user ≈ 102 kg, BMI ≈ 32, **RENPHO body-composition scale** (BIA), **Samsung Galaxy S25 Ultra with
Samsung Health**. Goal: lose fat while **preserving muscle** before the knee surgery on 2027-01-05. Typing ~20 scale
values per day is unrealistic → import from a RENPHO screenshot (OCR, other package) or the Samsung Health data
export. Everything is **additive**; `SCHEMA_VERSION` stays 1, old entries stay valid unchanged.

### 13.1 Health entry model (extends §12.7)

`HealthEntry` (all fields optional except `date`/`source`):

| group | fields (unit) |
|---|---|
| Körper | `weightKg`, `bmi`, `bodyFatPct` (%), `bodyFatKg`, `subcutFatPct` (%), `visceralFat` (scale index), `musclePct` (%), `muscleKg`, `skeletalMusclePct` (%), `skeletalMuscleKg`, `bonePct` (%), `boneKg`, `fatFreeKg`, `metabolicAge` (J.), `bmrKcal` (kcal), `waterPct` (%), `waterKg`, `proteinPct` (%), `proteinKg`, `waistCm` |
| Aktivität | `steps`, `activeMin` |
| Herz & Schlaf | `restingHr`, `avgTrainingHr`, `sleepH` |

plus `note`, **`measuredAt`** (ISO date-time of the latest underlying measurement, optional) and
**`sources`** `{[field]: "manual"|"renpho-ocr"|"samsung-export"|"csv"}` (only for fields present). The legacy
entry-level `source` stays (`"samsung-health-manual"` default; imports set `"samsung-export"`, `"renpho-ocr"`, …).

`HEALTH_FIELDS[k] = {label, unit, min, max, step, group, digits?, int?, comp?}` — `group` ∈ `HEALTH_GROUPS =
["Körper", "Aktivität", "Herz & Schlaf"]`, `comp: true` = body-composition field (collapsible
„Körperzusammensetzung“ in the form, list `BODY_COMP_FIELDS`), `int: true` = stored rounded to an integer
(steps, activeMin, HR, metabolicAge, bmrKcal), others rounded to 2 decimals (`roundField(k, n)`). Ranges are
generous (e.g. visceralFat 1–60, bmrKcal 800–4000, muscleKg 10–150, skeletalMuscleKg 5–100, boneKg 0.5–10).
`validateEntry` keeps a parseable `measuredAt` and valid `sources` (unknown values / fields not in the entry are
dropped); `upsertEntry` merges `sources` (a `null` field also removes its source); `mergeLogs` keeps the source of
the value that wins. `SOURCE_LABELS = {manual: "Manuell", "renpho-ocr": "RENPHO", "samsung-export": "Samsung", csv: "CSV"}`.
`manualSources(prevEntry, entry)` (used by the form): unchanged values keep their source, changed/new ones become
`"manual"`; the form keeps `measuredAt` only if nothing was changed by hand.

### 13.2 Folder `js/import/` (pure modules, no storage access)

| file | owner | purpose |
|---|---|---|
| `common.js` | health/import package | `normalizeNumber`, `previewImport`, `applyImport` (§13.3) |
| `zip.js` | health/import package | minimal ZIP reader (§13.4) |
| `samsung.js` | health/import package | Samsung Health export parser (§13.5) |
| `ocr.js`, `renpho.js` | OCR package | RENPHO screenshot OCR → entries (same entry shape, `sources[k] = "renpho-ocr"`) |

The import view (`#/import`, other package) calls the parsers, shows `previewImport`, lets the user pick
merge/overwrite and then `store.update((d) => { d.state = applyImport(d.state, entries, {mode, today}).state; })`.

### 13.3 Import contract — `js/import/common.js`

```js
normalizeNumber(v, {integer = false} = {}) → number | null
// "102,10" → 102.1 · "1.234,5" → 1234.5 · "1,234.5" → 1234.5 · " 25,3 % " → 25.3 · "1 958 kcal" → 1958 · "−1,5" → -1.5
// both separators: the last one is the decimal mark; one separator used several times = thousands;
// {integer: true}: a single separator followed by exactly 3 digits = thousands ("8.214" → 8214, else 8.214)

previewImport(state, incomingEntries) → {
  rows: [{date, field, old, new, status: "new"|"changed"|"same"|"conflict"}],   // sorted by date, HEALTH_FIELDS order, then "note"
  counts: {new, changed, same, conflict, days, newDays, invalid},
  invalid: [{date, errors}]                                                    // entries failing validateEntry (skipped)
}

applyImport(state, incomingEntries, {mode: "merge"|"overwrite" = "merge", today?}) → {state, added, updated, skipped, xp}
```

- `state` = `data.state` (uses `state.healthLog`); returns a **new** state object, input untouched.
- Incoming entry shape = `HealthEntry` (§13.1) with `sources` set for every field (and `measuredAt` when known);
  values may be numbers or locale strings (validated with `validateEntry`).
- Field status (per date & field): `new` = the existing entry has no value (or no entry for the date);
  `same` = equal after rounding; `changed` = different and the incoming `measuredAt` is **newer** than the existing
  entry's `measuredAt`; `conflict` = different otherwise (existing entry has no `measuredAt` – e.g. manual – or is
  newer/equal, or incoming has none).
- **merge:** writes `new` + `changed` (fill empty fields, newer `measuredAt` wins per field); conflicts keep the
  existing value. **overwrite:** writes `new` + `changed` + `conflict` (incoming wins; fields absent from the import
  are kept). Written fields take the incoming source; the entry's `measuredAt` becomes the incoming one when an
  existing value was replaced (or when both have one and the incoming is newer).
- `added` = dates created, `updated` = existing dates changed, `skipped` = incoming entries that changed nothing
  + invalid ones.
- **XP:** bulk imports earn **no** XP, except the normal daily rule: `+XP.healthLog` (5) when `today` is passed and
  the import creates the entry for `today` (added to `state.xp`, returned as `xp`). Badges: callers may run
  `evaluateBadges` afterwards as after a manual save.

### 13.4 ZIP reader — `js/import/zip.js`

`isZip(src) → Promise<boolean>`, `listEntries(blob|ArrayBuffer|Uint8Array) → Promise<[{name, dir, method, size,
compressedSize, crc32, offset, blob}]>` (EOCD search over the last 64 KB, central directory, UTF-8 names),
`readBytes(entry)`, `readText(entry)` (UTF-8, BOM removed). Methods 0 (stored) and 8 (deflate via
`DecompressionStream('deflate-raw')`); only the needed byte ranges are read (`Blob.slice`). No ZIP64 /
encryption (German `Error`). CRC is not verified. Tests build ZIPs with Node's `zlib` at test time.

### 13.5 Samsung Health export — `js/import/samsung.js`

Export in the app: Samsung Health → Einstellungen → **„Persönliche Daten herunterladen“** → folder
`samsunghealth_<user>_<YYYYMMDDhhmmss>/` (zip it on the phone or pick single CSVs).

`parseSamsungExport(fileOrBlob, {name?}) → Promise<{entries, summary, warnings}>` (ZIP or a single CSV);
`parseSamsungTexts([{name, text}])` is the synchronous core (tests). `summary = {files: [{name, type, rows, used}],
days, fields[], fieldCounts{}, range: {from, to}|null, apps[] (pkg_names other than Samsung Health, e.g. RENPHO
via Health Connect), heightCm}`; `warnings[]` German. Entries: one per local date, `source: "samsung-export"`,
`sources[k] = "samsung-export"`, `measuredAt` = latest record time of that day (UTC ISO).

**Format (verified against real exports 2020–2026 in public repositories):**
- One CSV per type, name `com.samsung.health.<type>.<ts>.csv` or `com.samsung.shealth.<type>.<ts>.csv`; plus
  `jsons/` and `files/` (ignored). Line 1 = metadata (`com.samsung.health.weight,6311013,12`), line 2 = header,
  rows usually end with a trailing comma; UTF-8 with BOM. Some headers are namespaced
  (`com.samsung.health.sleep.start_time`) → everything up to the last `.` is stripped. Unknown columns are ignored.
- `start_time` / `end_time` = **UTC** `YYYY-MM-DD HH:MM:SS.mmm`; `time_offset` (`UTC+0100`) → local date.
  Without offset the device time zone is used; ISO strings with their own offset keep their date.
- Daily files use `day_time` = epoch ms of the local day at 00:00 UTC (or a date string).
- Excel-mangled dates (`2/3/2024 11:25:47 AM`, `1.68636E+12`) are skipped with a warning.

**Mapping / aggregation:**
- `weight` (and a possible `body_composition` file): columns `weight→weightKg`, `body_fat→bodyFatPct`,
  `body_fat_mass→bodyFatKg`, `skeletal_muscle→skeletalMusclePct` (verified: = mass/weight·100),
  `skeletal_muscle_mass→skeletalMuscleKg`, `muscle_mass→muscleKg`, `fat_free_mass→fatFreeKg`,
  `basal_metabolic_rate→bmrKcal`, `total_body_water→waterKg` (kg), `vfa_level→visceralFat`; `height` →
  `summary.heightCm`; `fat_free` (%) ignored. **Last value per field and local day** (a later weight-only
  measurement replaces the weight, body-fat values of the morning stay). Duplicate `datauuid`s are dropped,
  implausible values (outside `HEALTH_FIELDS` ranges) ignored with a warning.
- `step_daily_trend`: `count` per `day_time`; rows with `source_type = -2` are Samsung's merged total of all
  devices → max of those; else max over the per-device rows (phone `0`, watch e.g. `106`).
  Fallback `activity.day_summary.step_count`.
- `activity.day_summary`: `active_time` (ms) → `activeMin`.
- `sleep`: every record's `end_time - start_time`, assigned to the **local wake-up date**, overlapping records
  (phone + watch) merged, then summed (naps included) → `sleepH`.
- `tracker.heart_rate`: hourly bins, `heart_rate` = bin mean → `restingHr` = **lowest bin mean of the local day**
  (30–140 bpm).
- `exercise`: `mean_heart_rate`, weighted by `duration` → `avgTrainingHr`.

**Uncertainty (documented on purpose):** Samsung publishes no data dictionary; column sets change between app
versions. Not observed in real exports (accepted if they appear): a separate `body_composition` file, columns
`bmi`, `bone_mass`, `metabolic_age`, `visceral_fat(_level)`, `body_water` (%), `subcutaneous_fat`, `protein`.
Whether RENPHO data synced via Health Connect appears in `com.samsung.health.weight` (and with which `pkg_name`;
fixtures assume `com.renpho.health`) is unverified. `restingHr` is a proxy (no explicit resting value in the
export); exercise column names follow the namespaced pattern but were not verified. Fixtures:
`tests/fixtures/samsung/` (headers copied from real exports, values invented).

### 13.6 Energy — BMR choice (`js/logic/energy.js`)

`bmrInfo(profile, log, today, weightKg?) → {kcal, method: "mean"|"scale"|"formula"|null, scaleKcal, scaleDate,
formulaKcal, label: "Schätzung"}`: scale BMR = latest `bmrKcal` with date ≤ today and ≤ **14 days** old
(`SCALE_BMR_MAX_AGE_DAYS`); formula = Mifflin–St Jeor (`bmr`, weight default `currentWeight`). Both → rounded
mean, else whichever exists. `tdee(profile, kg, today, log?)` uses `bmrInfo` when a log is passed (without a log:
v2 behaviour). `calorieTarget` uses it and returns `bmr: bmrInfo(...)` additionally. `BMR_METHOD_LABELS` for the UI.

### 13.7 Insight — `bodyCompositionInsight(log, today)` (`js/logic/insights.js`)

Windows of 2 and 4 weeks ending today; per window the mean of the **last 7 days** vs. the mean of the **first 7
days** for `weightKg`, `fatKg` (`bodyFatKg` or weight·%), `bodyFatPct`, `muscleKg`, `skeletalMuscleKg` (kg or
weight·%), `visceralFat`. Classification on the 4-week window if it has start/end fat values, else 2 weeks;
muscle = skeletal muscle (fallback muscle mass); tolerance ±0.5 kg (`COMP_TOLERANCE`):
`recomp` „Fett verloren, Muskeln aufgebaut“, `fat-lost-muscle-kept` „Fett verloren, Muskeln gehalten“,
`fat-and-muscle-lost` „Fett und Muskeln verloren“, `fat-lost` (no muscle data), `muscle-lost` „Muskelmasse
gesunken“, `fat-gained`, `stable`, `insufficient`. Returns `{status, label, text, tips[], caution, basis: 2|4|null,
windows[{weeks, from, to, start, end, delta}], latest}`. `caution` (`BIA_CAUTION`): consumer BIA scales fluctuate
with hydration/food/training by 1–2 kg – compare trends over weeks, measure at the same time of day (morning,
fasted, after the toilet, barefoot). Tips: muscle loss → keep strength training, enough protein, moderate deficit;
weight loss > 1 kg/week → warning.

### 13.8 UI (`js/views/health.js`)

- Tagebuch: prominent **„Importieren“** button (→ `#/import`) in the hero; form groups Körper (weight, body fat,
  waist) · collapsible **„Körperzusammensetzung“** (`BODY_COMP_FIELDS`) · Aktivität · Herz & Schlaf; source badges
  („RENPHO“, „Samsung“) next to field labels and in the entry list (chips limited to the main values + „+N Werte“).
- Diagramme: additional cards Körperfett (%), Skelettmuskelmasse (kg), Viszeralfett (fitted y-axis,
  `yMin: 'auto'`), hidden while the log has no such value.
- Auswertung: card „Körperzusammensetzung“ (status chip, deltas, tips, BIA caution) with **Grundumsatz**
  (used / scale / formula, method, date).
- Regenerate the precache after adding the import modules: `node tools/gen-precache.mjs`.

## 14. v3.1 – Fokus Training: Importe, Tagebuch und Abnehm-Ziel entfernt

Decision (2026-11-08): the app focuses on **training only**. Weight and health data are tracked in **Samsung
Health**; PhysioBogen no longer duplicates them. `APP_VERSION` 3.1.0, `SCHEMA_VERSION` stays 1.

### 14.1 Removed

- **Imports (§13):** `js/import/*` (ocr, renpho, samsung, zip, common), `js/views/import.js`, `vendor/tesseract/`,
  route `#/import`, manifest `share_target`, the sw.js share-target POST handler and the OCR runtime cache, the
  import tests and fixtures. `tools/gen-precache.mjs` no longer needs a vendor exclusion.
- **Gesundheits-Tagebuch (§12.7):** `js/views/health.js`, `js/logic/health.js`, route `#/gesundheit`, Heute diary
  tile, Mehr links, health-log XP, badges `log-7`, `minus-2kg`, `minus-5kg`, `goal-reached`.
- **Abnehm-Ziel & Kalorienziel (§12.6):** weight-goal UI, Heute weight-goal card, `goalProgress`, `calorieTarget`,
  `bmrInfo`/BMR/TDEE/BMI, `weightInsight`, `bodyCompositionInsight`, `sleepVsPain`, `stepsVsPain`.

### 14.2 Kept / changed

- Training (knee, archery, rowing), Kurztraining, eigene Workouts, schedule to the OP on 2027-01-05, p4 Entlastung,
  traffic light, Verlauf, XP/levels and all other badges.
- **kcal per session** (`sessionKcal(session, weightKg, content?)`): body weight comes from
  `settings.profile.weightKg` (`bodyWeightKg(settings)`, default 80 kg), edited in `#/profil` („Trainingsziele“,
  field „Körpergewicht (für Kalorienschätzung)“, 30–300 kg or empty). `#/profil` also keeps the cardio goal per
  week; height, birth year, sex and activity level are no longer asked for.
- **Insights** (training only): `opReadiness` (unchanged parts criteria 30 / strength 25 / swellingFree 25 /
  regularity 20 – it never used health-log data), `weeklyReport` (without weight/health parts; kcal use
  `settings.profile.weightKg`), `loadVsPain`.
- `evaluateBadges` only evaluates ids present in `data/badges.json`; stored ids of removed badges stay in
  `state.badges`, are never shown (Verlauf iterates the definitions, Heute filters unknown ids) and never crash.

### 14.3 UI

- New view `js/views/insights.js`, route **`#/auswertung`** (title „Auswertung“, tab Verlauf; back → Verlauf):
  OP-Bereitschaft (prehab phases only), Wochenbericht with week navigation, „Trainingslast ↔ Knie am Folgetag“
  (correlation + weekly load bars). `?focus=bereitschaft|bericht|last` scrolls to the card.
- Reachable from **Heute** (OP-Bereitschaft card → `#/auswertung?focus=bereitschaft`, Monday Wochenbericht teaser →
  `?focus=bericht`), **Verlauf** (link card below the stats) and **Mehr** (list item).
- Old links `#/gesundheit…` and `#/import…` match no route and fall back to Heute.

### 14.4 Data & migration

- Stored `state.healthLog` and `settings.weightGoal` are **not deleted** – left untouched and unused; backup
  export/import still round-trips them (`mergeBackups`: legacy log merged by date via `mergeLegacyLog`, current
  values win; weightGoal current wins; nothing is added when neither side has them).
- `store.defaults()` no longer creates `healthLog` / `weightGoal`; `profile` default is `{weightKg: null}`.
- `store.migrate` → `prefillWeight(data)`: if the stored profile has **no `weightKg` key**, it is prefilled from the
  latest plausible (30–300 kg) `healthLog[].weightKg` (rounded to 0.1 kg); runs once, never overwrites, does not
  mutate its input.
- Service worker `activate` deletes the legacy caches `pt-share` and every `pt-ocr-*` (≈ 7 MB) besides old
  `physio-*` versions.


## 15. v4 – Sprachführung, Dehnen, Rudern als Aufwärmen

Feedback after the first real sessions (right-handed compound archer, left meniscus tear + cartilage damage,
microfracture OP 2027-01-05, then 6 weeks non-weight-bearing p4; doctor cleared full rowing pre-op; weight loss is an
additional goal). Everything is **additive**: no signature from §7/§12 was removed, `SCHEMA_VERSION` stays 1, new
settings are filled in by `migrate()`'s deep merge (stored values always win). Tests: `tests/logic-v4.test.js`.

### 15.1 Settings (store.defaults)

| key | default | meaning |
|---|---|---|
| `prepSeconds` | 5 | „Bereit machen“ phase before **every set** (0–30, clamped by `duration.prepSeconds`) |
| `holdRelaxSeconds` | 5 | minimum „Loslassen“ pause between two hold reps (0–30, `duration.holdRelaxSeconds`) |
| `rowWarmupDefault` | true | strength sessions p1–p3 start with 10 min rowing (per-session toggle in the session start UI) |
| `rowFinisherDefault` | false | add the optional rowing finisher to strength plans (normally the session asks after the strength part) |
| `voiceEnabled` | true | German speech cues (`js/util/voice.js`); `sound: false` silences voice and tones |
| `voiceRate` | 1.05 | speech rate (0.7–1.5) |
| `voiceVolume` | 1 | speech volume (0–1) |
| `beepsWithVoice` | true | soft tick under the voice on phase changes |
| `cardioGoalPerWeek` | **3** (unchanged) | separate rowing sessions per week (warm-ups/finishers do not count, §15.3) |

### 15.2 Content

**Dynamic warm-up (block `warmup`, category `mobilitaet`, 3–4 min, knee-safe – no deep left knee flexion, no
kneeling):** new `leg-swing-front` (hand on the wall, small arc), `leg-swing-side` (hands on a chair),
`hip-circles-standing` (both feet down), `ankle-circles-seated`, `band-dislocate` (light band, wide grip); existing
`seated-thoracic-rotation`, `seated-spine-wave` (seated cat-cow), `shoulder-circles` (level 0 now 30 s), `ankle-pumps`.
Leg swings/hip circles: `postOpAllowed: false`. p4 warm-ups are seated/supine only (ankle pumps, shoulder circles,
spine wave, thoracic rotation, band dislocates – `postOpNote` „im Sitzen“).

**Static stretching (block `cooldown`, category `dehnung`, `type: "hold"`, `side: "perSide"`, levels 20 s / 30 s per
side, `setupSec: 5`):** `hip-flexor-stretch-standing` (short split stance, back knee almost straight, front knee
≤ 30°; **no heel-to-buttock quad stretch** – deep flexion loads meniscus/cartilage, explained in `kneeNote`),
`hip-flexor-stretch-supine` (side `left`; right knee to chest, left leg stays long – p4 variant),
`hamstring-stretch-band` (supine, knee straight), `figure-4-stretch-supine` (careful flexion; not post-op),
`seated-pec-stretch` (both sides, 2 × 20 s), `lat-side-stretch`, `cross-body-shoulder-stretch`,
`forearm-flexor-stretch` (draw + bow hand), `neck-side-stretch`; existing `doorway-pec-stretch`,
`hamstring-stretch-seated`, `calf-stretch-wall` converted from `timed` to `hold`. Every stretch description says
honestly: stretching hardly prevents DOMS; it is for mobility, relaxation and posture.

**4-7-8 breathing:** `breathing-reset` („Atemübung 4-7-8 in Rückenlage“) is now `type: "timed"` with
`level.breath = {inhale: 4, hold: 7, exhale: 8, rounds: 4}` (`seconds: 76`; level 1: 6 rounds = 114 s). Description:
„Bei Schwindel einfach normal weiteratmen; das lange Ausatmen beruhigt den Puls.“ It closes every strength cool-down.

**Workouts** (`data/workouts.json` v3): every strength workout (p1–p4) = warm-up 4 mobility items (`maxSets: 1`) +
knee/archery blocks + cool-down 4 stretches + `breathing-reset` (~5 min). p4: only seated/supine items, no standing on
the left leg. Short workouts: `mobility-flow-short` / `stretch-flow-short` (p4: `mobility-flow-seated` /
`stretch-flow-seated`) – compact 2-min `timed` flows whose `level.phases` (`{label, seconds, say}`, Σ = `seconds`)
are announced one by one. Budget tweaks: p2-b dropped `straight-leg-raise`, p4-short dropped `glute-set`, a few
`maxSets: 1`; leg swings/ankle circles level 0 = 15 s per side.

New/changed fields: Exercise `setupSec?` (setup seconds for the estimate, default 20; flows/stretches/mobility 5),
`cueWords?` (§15.5); Level `breath?`, `phases[].say?`; WorkoutItem `keepWithRow?`; Workout `rowWarmup?`
(rowing exercise id, p1–p3 strength: `"row-warmup-10"`), `maxMinutesWithRow?` (42), `durationMinWithRow?` (estimate
at level 0 with rowing, kept in sync by a test); Phase `rowFinisher?` (exercise id; p1 `row-finisher-short`,
p2/p3 `row-finisher-intervals`, none in p4).

### 15.3 Rowing as warm-up — `progression.js`

- Exercise `row-warmup-10` (block `cardio`, `postOpAllowed: false`, one level, `seconds: 600`): `level.phases` = 4 ×
  30 s technique (arms → arms + body → half slide → full stroke) + 480 s „Locker rudern · RPE 3–4“, `targetSpm
  [18, 22]`, `targetRpe [3, 4]`. It **replaces the general part** of the mobility warm-up; the warm-up items marked
  `keepWithRow: true` (band dislocates + thoracic rotation / spine wave, ≈ 1.5 min for shoulders/T-spine for the bow)
  follow the rowing. Session ≈ 38–41 min.
- `canRowWarmup(workout, state, content) → boolean` – workout has `rowWarmup`, kind strength, current phase not
  post-op, phaseMin reached, `exerciseAvailable` (user toggle). Never in p4, never for short/custom/cardio.
- `buildSessionPlan(w, state, content, {…, rowWarmup, rowFinisher})`: `rowWarmup` defaults to
  `settings.rowWarmupDefault ?? false`. When applied: first entry `{exerciseId: "row-warmup-10", section: "cardio",
  plannedSets: 1}`, then only the `keepWithRow` warm-up items. Plan fields: `rowWarmup: boolean` (every non-cardio
  plan), `warmupRowing: null` (only with rowing; display values via `cardio.validateRowing` →
  `session.warmupRowing = value`), `budgetMin` (time budget the plan was fitted to).
- **Never** write `session.rowing` for strength sessions: a `rowing` object classifies legacy sessions as cardio and
  replaces the session duration in `energy.sessionDurationSec`. Rowing values inside strength sessions live in
  `warmupRowing` / `finisherRowing`.
- Session UI for the `cardio` entry: run it with the rowing timer (`cardio.rowingPhases` or `exerciseCuePlan`), mark
  the set `{done, seconds}`, ask „Knieschmerz beim Rudern“ (`painDuring`, counts for the traffic light like knee
  entries), optional display values. `workoutItems(w, {rowWarmup})` and
  `estimateWorkoutMinutes(w, content, state, settings, {rowWarmup: true})` give the variant for labels
  („ca. 32 Min · mit Rudern ca. 40 Min“; or use `durationMinWithRow`).
- **Counting (decision):** the weekly cardio goal (`cardioProgress().done/ratio`, `streak(..., {cardio: true})`,
  `cardioCount` badge, A/B/C rotation) counts **only separate rowing sessions**. A strength session with rowing stays a
  strength session (`isCardioSession` → false: `kind === "cardio"`, or legacy sessions without `kind` that have a
  `rowing` object). Its rowing minutes/distance **do** count: `stats.inSessionRowingSec(s)` (alias
  `warmupRowingSec`) = `warmupRowing.durationSec` (else done timer seconds of non-finisher cardio entries) +
  `finisherRowing.durationSec` (else done finisher timer seconds); `cardioProgress()` adds `minutes`/`distanceM`
  from them and returns `warmupMinutes`, `warmupCount`; `cardio.rowingLogs(sessions)`, `rowingTotals()` (now
  `{sessions, warmups, distanceM, durationSec, kcalDisplay}`), `rowingRecords()` and the `rowingDistance` badges
  include them. Personal hold/rep records and `totalHoldSeconds` ignore sections `warmup`/`cooldown`/`cardio`.
- Resolved in the v4 integration: `insights.weeklyReport().cardio` adds `inSessionMinutes`, `inSessionDistanceM`,
  `inSessionCount` (rowing inside strength sessions, shown separately); `recommendLevels` skips single-level rowing
  entries inside strength sessions (no „Höchste Stufe“ card for `row-warmup-10`); `energy.sessionKcal` adds the
  rowing parts (`inSessionRowingKcal`: display kcal, else work × level MET + active rest × easy MET) and applies the
  strength MET only to the remaining time; the session UI never plans the finisher up front (`rowFinisher: false`)
  but always asks after the strength part (`rowFinisherDefault` only preselects „Ja“); Heute/Plan use
  `progression.plannedWorkoutMinutes` (= the start screen's estimate).

### 15.4 Duration model & budgets — `duration.js`

- Per set: `prep` (`settings.prepSeconds ?? 5`; 0 for block `cardio`) + work; hold work = `reps × hold + (reps − 1) ×
  relax` with `relax = max(level.restBetween ?? 5, settings.holdRelaxSeconds ?? 5)` (was 3 s); timed work = Σ
  `level.phases[].seconds` if given, else `seconds`; perSide → `work × 2 + 5`. Setup = `exercise.setupSec ?? 20`
  (0 for cardio). `effectiveDose()` returns `restBetween` (effective relax), `prep`, `phases`.
- Exports: `prepSeconds(settings)`, `holdRelaxSeconds(settings)`, `setupSeconds(exercise)`, constants
  `DEFAULT_PREP_SEC = 5`, `DEFAULT_HOLD_RELAX_SEC = 5`, `DEFAULT_HOLD_REST_SEC = 5`, `MAX_SESSION_MIN = 30`
  (custom workouts, unchanged), `STRENGTH_SESSION_MIN = 32`, `MAX_SESSION_WITH_ROW_MIN = 42`.
- Budgets (`progression.planBudgetMinutes(workout, rowWarmup = false, finisherMin = 0)`): strength `maxMinutes: 32`
  (level 0 = 30–32 min untrimmed), with rowing `maxMinutesWithRow: 42` (level 0 = 39–41), + finisher minutes
  (total ≤ ~50); short `maxMinutes: 16` (level 0 = 13–15); custom 30; cardio none.
- `fitPlanToMinutes` never trims `cardio` entries (rowing warm-up / finisher); only main-block sets.

### 15.5 Cue plans (voice guidance) — `js/logic/cues.js` (pure)

`exerciseCuePlan(entry, exercise, settings, {prep?, fromSet?}) → CuePhase[]` for every exercise type. Each step
`{phase, seconds, say, setIndex, repIndex, side, sets?, reps?, label?, intensity?, targetSpm?, targetRpe?}`;
`say` is spoken at the **start** of the step (`''` = silent), then `seconds` elapse (0 = marker). `setIndex`/
`repIndex` are 0-based, `side` 1|2 for `perSide`. **No rep numbers in `say`** (the user does not want counting).
Σ seconds = `estimateExerciseSeconds − setupSeconds` (tested for every exercise and level). `prep` defaults to true
(false for rowing), `fromSet` resumes at a later set.

| phase | when | default `say` |
|---|---|---|
| `prep` | before every set (`settings.prepSeconds`) | „Bereit machen: {name}“ / „Bereit machen. Satz 2 von 3“ |
| `hold` | hold rep (isometric / stretch) | words.hold („Anspannen“ / „Dehnen“) |
| `relax` | between hold reps (relax seconds) | words.release („Loslassen“ / „Lösen“) |
| `switch` | perSide, before side 2 (5 s) | holds: „{release}. Seite wechseln“, else „Seite wechseln“ |
| `rep-up` / `rep-hold` / `rep-down` | reps with tempo `"ecc-pause-con"`: played **con → pause → ecc** like the figure (start pose → end pose first) – `"3-1-2"` → up 2 s, hold 1 s, down 3 s | words.up / hold / down |
| `work` | timed block, untimed reps (`reps × 3 s`, `reps` field, „Los: 10 Wiederholungen“), each part of a flow (`label`, `say`), rowing phases | words.work / part `say` |
| `inhale` / `breath-hold` / `exhale` | `level.breath` (4-7-8): per round | „Einatmen“ / „Halten“ / „Ausatmen“ |
| `rest` | between sets (`rest` > 0) | „Pause“ (rowing intervals: „Locker rudern“) |
| `set-done` | 0 s, after each set | „Satz 1 geschafft“ (holds prefixed with release; '' after the last set) |
| `exercise-done` | 0 s, last step | „Übung geschafft“ (holds: „Loslassen. Übung geschafft“; rowing „{name} geschafft“) |

Cue words: `cueWordsFor(exercise)` = `BREATH_CUE_WORDS` + `DEFAULT_CUE_WORDS[cueKind(exercise)]` +
`exercise.cueWords`. Kinds (`cueKind`): `stretch` (hold + category dehnung: Dehnen/Lösen/Seite wechseln),
`isometric` (other holds: Anspannen/Loslassen), `band` (reps with a band: Ziehen/Halten/Zurück), `reps`
(Hoch/Halten/Runter), `timed` (Los), `rowing`. Keys: `up` (first movement of a rep), `hold`, `down`, `release`,
`switch`, `work`, `inhale`, `breathHold`, `exhale`. ~55 exercises carry explicit `cueWords` (e.g. pull-apart
„Auseinanderziehen/Halten/Zurück“, sit-to-stand „Aufstehen/Stehen/Hinsetzen“, mini-squat „Beugen/Halten/Strecken“,
SPT „Ausziehen und halten/Kontrolliert ablassen“, single-leg stance „Halten/Absetzen“).
Rowing (`block: "cardio"`): one `work` step per `level.phases` drill (`say` from the drill, last long part gets
„…, Schlagzahl 18 bis 22“), else per set `work` „{Locker|Gleichmäßig|Zügig} rudern, Schlagzahl a bis b – Runde i von
n“ + `rest` („Locker rudern“ when `restActive`); steps carry `intensity`, `targetSpm`, `targetRpe`
(`ROW_INTENSITY_SAY`). Also exported: `CUE_PHASES`, `tempoParts(tempo)`, `cuePlanSeconds(plan)`.
`session-helpers.cuePlanFor` (voice agent) consumes it; its local fallback phases are no longer needed.

### 15.6 Rowing finisher & more rowing (weight loss as additional goal)

- Exercises `row-finisher-short` (p1: 5 × (30 s zügig / 30 s locker), 4.5 min, RPE 5–6) and
  `row-finisher-intervals` (phaseMin p2: 4× / 5× (1 min zügig / 1 min locker), 7 / 9 min, RPE 6–7, SPM 22–26),
  both `restActive`, `postOpAllowed: false`. Phase field `rowFinisher`.
- `finisherPlan(workout, state, content, {taper}) → {exerciseId, level, plannedSets, seconds, minutes} | null` (strength
  only, prehab phase with `rowFinisher`, phaseMin, `exerciseAvailable`, not in the taper week, never p4).
- `finisherEligible(session, settings) → {ok, reasons[]}`: only at a **green knee light** of the running session –
  kind strength, not post-op, not taper, pre-check pain ≤ `painThresholds.greenMax` (2), no swelling, no
  locking/giving way, no `sharpPain`, every recorded `painDuring` ≤ greenMax (finisher entry itself ignored).
- `appendFinisher(session, workout, state, content) → new session` inserts `{exerciseId, section: "cardio",
  finisher: true, level, plannedSets, …}` **before the first cool-down entry**, sets `rowFinisher: true`,
  `finisherRowing: null`, `budgetMin += minutes`; idempotent. `buildSessionPlan({rowFinisher})` (default
  `settings.rowFinisherDefault ?? false`) does the same at plan time. UI flow: after the last main-block exercise, if
  `finisherEligible(...).ok` and `finisherPlan(...)` → ask „Noch 5–10 Min. rudern?“ → `appendFinisher`; if a planned
  finisher is not eligible, mark it `skipped`. Total strength + rowing warm-up + finisher ≤ ~50 min (tested).
- Separate rowing: new `row-long` (21/23/25 min, RPE 4–5, SPM 18–22) and workouts `p1-row-long`, `p2-row-long`,
  `p3-row-long` „Rudern – Grundlage lang“ (25–29 min, `maxMinutes: 30`) in each prehab `phase.cardio`. Copy is honest:
  calories come mainly from the total weekly volume, nutrition is the biggest lever, the app only shows training
  kcal as an estimate. `cardioGoalPerWeek` stays 3.

### 15.7 Voice API — `js/util/voice.js` (voice agent) & `<pt-timer>`

- `say(text, {priority: 'low'|'normal'|'high', interrupt, cue, maxAgeMs, fallbackOnDrop, calm, tick}) →
  'spoken'|'queued'|'tone'|'muted'|'none'` – German Web Speech voice (offline preferred, `pickGermanVoice`); stale
  queued cues expire after `maxAgeMs`; `interrupt` cancels the current utterance; `calm` = slower/quieter (breathing);
  `tick: false` = no soft tick; without a German voice a distinct tone per `cue` is played.
- `countdown(n, opts)` („Drei, Zwei, Eins“ one second apart, or ticks), `unlock()` (call in the Start tap – Android
  Chrome needs a first speak from a gesture), `cancel()`, `voiceAvailable()`, `voiceActive()`, `testVoice()`,
  `voiceSettings(settings)` (reads `voiceEnabled`, `voiceRate`, `voiceVolume`, `beepsWithVoice`; `sound: false` mutes).
- `<pt-timer>` property **`plan`** = a cue plan (§15.5) replaces the attribute timeline; every phase start is
  announced; `prep` counts down; holds ≥ 15 s get „Noch 5 Sekunden“; rests ≥ 10 s „Gleich geht's weiter“. Attribute
  **`block="knee|archery|neutral"`** colours the phase banner. Accepted phase names: `prep`, `work`, `tense` (alias of
  an isometric hold start), `hold`, `relax`, `switch`, `rep-up`, `rep-hold`, `rep-down`, `inhale`, `breath-hold`,
  `exhale`, `rest`, `set-done`, `exercise-done`; optional step fields `label` (banner text) and `countdown: true`
  (spoken countdown at the end of a rest). Zero-second steps are not spoken by the timer (the session announces them).


## 16. v5 – Ausrüstung steuert den Plan

Owned equipment („Meine Ausrüstung“) now changes the plan automatically. `APP_VERSION` 5.0.0, `SCHEMA_VERSION` stays 1
(additive; the equipment migration runs once inside `store.migrate`). Pure logic: `js/logic/equipment.js`;
tests: `tests/logic-v5.test.js`.

### 16.1 Equipment model — `js/logic/equipment.js`

- **Base** (always available): `theraband, loop, mat, chair, step, wall, door, none` (`BASE_EQUIPMENT`). v5.3: `chair` is no
  longer base – see §18.1 (`chair-fixed`, `office-chair`, virtual `seat`).
- **Optional** (`OPTIONAL_EQUIPMENT`, `{id, label, icon, hint}`, in toggle order): `rowing-machine`, `sling-trainer`,
  `door-anchor`, `band-handles`, `ankle-weights`, `balance-pad`, `dumbbells`, `pedal-trainer`, `release-trainer`,
  `ice-pack`, `measuring-tape`. `EQUIPMENT_INFO[id] = {label, icon}` for all ids (`ui.EQUIPMENT_LABEL` derives from it).
- `settings.ownedEquipment: string[]` = ticked optional ids (normalised by `normalizeOwned`: legacy ids mapped, base and
  unknown ids dropped, order of `OPTIONAL_EQUIPMENT`). `availableEquipment(settings)` → `Set` (base + owned) or **`null`
  when no settings / no `ownedEquipment` array = no filtering** (legacy callers and older tests keep v4 behaviour).
- `hasEquipment(ex, s)`, `missingEquipment(ex, s)`, `ownsRowingMachine(s)`, `usesEquipment(ex, id)` (library filter:
  `equipment[]` or a `setupByEquipment` key), `equipmentNeeds(ex, s)` („Benötigt“: `{id,label,icon,base,owned,optional}`).
- **Legacy ids** (`LEGACY_EQUIPMENT_IDS`): `tueranker-griffe → door-anchor + band-handles`, `massband → measuring-tape`,
  `pedaltrainer → pedal-trainer`, `fussgewichte → ankle-weights`, `balancepad → balance-pad`, `schusstrainer →
  release-trainer`, `kuehlpack → ice-pack`, `kurzhanteln → dumbbells`. `data/equipment.json` items use the new ids and
  carry `equipment: string[]` (the set „Türanker + Bandgriffe“ → `["door-anchor","band-handles"]`); new item
  `sling-trainer` „Schlingentrainer (Suspension-Trainer) mit Türanker“.
- **Migration** `migrateEquipment(data)` (called by `store.migrate` before the defaults merge; runs only while
  `settings.equipmentModel < 2`): maps legacy ids; if the stored list is **empty** and a session used rowing
  (`sessionUsedRowing`: cardio session, `rowing`/`warmupRowing`/`finisherRowing`, or a done `row-*`/cardio entry) →
  `["rowing-machine"]` so the update never removes rowing the user does; nothing else is ever pre-ticked (the user ticks
  sling trainer, anchor, handles himself). Sets `settings.equipmentModel = 2` and, for existing users (sessions, owned
  items or `welcomeDone`), `state.equipmentNotice = "pending"`. `store.load` writes the migrated data back once.
  Defaults: `ownedEquipment: []`, `equipmentModel: 2`, `state.equipmentNotice: null`.

### 16.2 Exercise availability, upgrades and fallbacks

- An exercise is usable when **all** `exercise.equipment` ids are available (plus phaseMin and `exerciseAvailable`).
- **Upgrades** are declared on the base exercise: `upgrades: [{equipment: ["sling-trainer"], exerciseId, chip?}]`;
  the reverse `replaces: ["base-id" | {exerciseId, equipment?}]` on the variant is accepted too (`upgradeRules`,
  `fallbackRules`). `resolveExercise(id, {exercises, avail, usable, allowUpgrade})` → `{exerciseId, upgradedFrom?, chip?}`
  | `{exerciseId, fallbackFrom}` | `null` (drop).
- `buildSessionPlan` (settings given) resolves every non-cardio item: upgrade when the equipment is owned and the variant
  is usable (phaseMin, post-op block, user toggle); else the exercise itself; else the fallback base; else **dropped**
  (the duration fitter never refills). Entries carry `upgradedFrom`, `upgradeChip` („Sling-Variante“) and `newVariant:
  true` while the variant has no stored level and was never done → UI chip „Neu: Sling-Variante“. The variant uses
  **its own level** (`exerciseLevels[variant]`, default 0 = start at level 1). No upgrades for custom workouts (fallback
  and drop still apply); duplicates created by upgrades are skipped; in the **taper week** a never-done variant falls back
  to the known base exercise (no new exercises).
- Mapping (all `equipment: ["sling-trainer"]`): seated-row → sling-row, face-pull → sling-face-pull (p2), wall-slide →
  sling-y-raise, band-pull-apart → sling-t-raise, prone-ytw → sling-rear-delt-fly, single-arm-high-row →
  sling-single-arm-row (p2), pallof-press → sling-pallof-press, mini-squat → sling-assisted-mini-squat (p2),
  hamstring-bridge-chair → sling-heel-bridge (p2), band-triceps-extension → sling-triceps-press, chair-dip →
  sling-dip-assisted, serratus-punch → sling-push-up-incline. `sling-plank-forearms` and `sling-standing-rollout` are
  library/custom exercises. Workouts are unchanged (no duplicates); p1–p3 strength and short workouts pick the variants
  up automatically; p4 never (every sling exercise has `postOpAllowed: false`).
- **Rowing:** without `rowing-machine` → `canRowWarmup(w, state, content, settings)` false, `finisherPlan(…, {settings})`
  null, `appendFinisher(…, settings)` no-op, cardio plans empty, `cardioWorkoutsFor(phase, workouts, settings)` → `[]`.
  Heute/Plan hide rowing cards/workouts and show „Rudergerät in Ausrüstung abhaken“ (link `#/ausruestung`); Mehr hides
  the rowing warm-up/finisher defaults; the session start screen shows no rowing toggle.
- `phasePlanExerciseIds(state, content, settings)` (A/B/C + short as planned incl. rowing warm-up default, finisher,
  rowing workouts) and `equipmentPlanChanges(state, content, before, after) → {added, removed}` (names) drive the toggle
  toast „Neu in deinem Plan: … · Entfernt: …“ and the library filter „Im Plan“.

### 16.3 Setup text variants

Band exercises with a door step carry `setupByEquipment: {"door-anchor": "Band mit dem Türanker auf Brusthöhe
befestigen …", "band-handles"?: "Griffe an die Bandenden einhängen …"}` and optional `setupStep` (index of the knot step,
default 0). `instructionsFor(exercise, settings)` replaces that step when the door anchor is owned and inserts the
handles step after it; exercise detail and session („So geht's“) use it. Without settings → plain instructions.

### 16.4 Sling trainer content & figures

14 exercises (German, `equipment: ["sling-trainer","door"]` (+ `mat` for the heel bridge), levels progress via body
angle / foot position, `cueWords`, `postOpAllowed: false`, knee notes: both feet on the floor, no loaded knee flexion;
leg exercises phaseMin p2 with ≤ 60° flexion / 20–30° for the heel bridge, pain ≤ 3/10; the plank is standing with
forearms in the cradles – never kneeling or feet in the straps). New prop **`sling`** (`{type, x, y, to?, behind?,
door?}`): anchor block at the top of the door (x/y), straps to `to` points (default both hands; heel cradles
`footL/footR`) with handles/cradles, drawn every frame (`behind: true` → behind the body). Poses `sling-*` in
`tools/gen-poses.mjs` (lean around the feet, grounded), `data/poses.json` regenerated. `tests/data.test.js` allows the
figure prop `sling`.

### 16.5 UI

- **Mehr → Meine Ausrüstung** (`#/ausruestung`, `views/equipment.js`): hero (x von 11 Extras, open budget), last change
  callout, **toggles first** (icon, label, hint), „Immer dabei“ (base items + band order), **Einkaufsideen** only for
  items not fully owned (grouped by priority, „Mehr dazu“, „Hab ich“ ticks all ids of the item). Visiting the page marks
  the Heute banner as seen. Mehr shows the owned list on the „Meine Ausrüstung“ item; the separate rowing switch is gone.
- **Heute:** one-time banner „Neu: Deine Ausrüstung steuert jetzt den Plan – hake ab, was du hast“ (link, ✕ →
  `equipmentNotice = "seen"`), rowing hint card when the phase has rowing but no machine is ticked.
- **Plan:** current-phase workout lists show the resolved plan (chip „Neu: Sling-Variante“ / „Sling-Variante“ + „statt
  …“; fallback note; „fehlt: …“ chip). **Session:** chip on upgraded entries, instructions via `instructionsFor`.
- **Übungen:** equipment filter chips incl. Schlingentrainer, Türanker, Bandgriffe, Rudergerät; cards show „fehlt: …“.
  **Exercise detail:** „Benötigt“ chips (owned ✓ / fehlt / optional) with link to Meine Ausrüstung, fallback and
  variant hints. **Eigene Workouts:** warnings for missing equipment (fallback or skipped).

## 17. v5.2 – Sync über Google Drive

Optional two-device sync (phone + tablet, trained alternately) through the user's own Google Drive.
`APP_VERSION` 5.2.0, `SCHEMA_VERSION` stays 1 (all additions are additive and filled by `store.defaults`).
The app stays fully functional offline and without Google; sync code lives in `js/sync/` and is loaded after boot.

### 17.1 Auth — `js/sync/auth.js`, `js/sync/config.js`

- Google Identity Services token client; `https://accounts.google.com/gsi/client` is injected lazily (only when sync
  is enabled/used and online), never precached. Scope **only** `https://www.googleapis.com/auth/drive.appdata`.
- Client id: `settings.sync.clientId` (Mehr → Synchronisierung, pattern `*.apps.googleusercontent.com`), fallback
  `DEFAULT_CLIENT_ID` in `js/sync/config.js` (empty).
- Access token in memory + `sessionStorage` (`pt.sync.token`) with expiry (60 s margin). No refresh tokens exist in
  the browser: re-auth = `requestAccessToken({prompt: ''})` and needs a user gesture (popup), so it is only called
  from taps (Verbinden, Erneut anmelden, Jetzt synchronisieren, Heute chip „Abgleichen“) – never automatically,
  never during a training.

### 17.2 Storage & engine — `js/sync/drive.js`, `js/sync/engine.js`

- One file `physiobogen-sync.json` in `appDataFolder` (Drive v3 REST via fetch): `files.list`
  (`spaces=appDataFolder`, `q=name=…`), `files.get alt=media`, `files.create` (multipart), `files.update`
  (media upload, `If-Match: <ETag>`), `files.delete`.
- Content = backup envelope (export format, `exportedAt`) + `{app, syncFormat: 1, deviceId, deviceName, syncedAt, rev,
  activeSessions}`. Device-local parts are stripped on upload (`settings.sync`, `state.activeSession`,
  `state.remoteActiveSession`, notices).
- Cycle: list → download → `parseRemote` (newer schema → error, nothing written; invalid → error) → `mergeSync` →
  version re-check (`files.get fields=version`) → update with If-Match. 412 or changed version → re-read + re-merge,
  up to 3 retries, then status error. Several files (created concurrently) are folded into the oldest, others deleted.
- Result applied via `store.applySync()` (no change tracking, no `onLocalChange`); if local data changed during the
  upload it is merged again with the uploaded data. `settings.sync.lastSyncAt` = sync time.
- Clock: the Drive `Date` header sets `store.setClockOffset()` when the device clock is > 60 s off; all change
  timestamps use `store.nowISO()`.
- Status (`getStatus()`, window event `pt-sync-status`): `off | syncing | ok | error | needsAuth | offline | readonly`.

### 17.3 Change tracking (store) & merge — `js/store.js`, `js/sync/merge.js`

`store.update()` diffs before/after (`trackChanges`) and writes bookkeeping into the new data:
`settings._updatedAt[key]`, `settings._equipmentAt[id]`, `state._updatedAt[key]` (all state keys except
`UNTRACKED_STATE_KEYS`), `state.levelsUpdatedAt[exerciseId]`, `updatedAt` on edited sessions/custom workouts, and
tombstones `state.deletedSessionIds` / `state.deletedCustomWorkoutIds` (`[{id, at}]`, kept 90 days) for removed
ones. Listeners: `store.onLocalChange(cb(data, {kinds}))` – not for `settings.sync`-only changes.

`mergeSync(local, remote, {now, join})` (extends `export-import.mergeBackups`, which now also honours tombstones):

| Part | Rule |
| --- | --- |
| sessions | union by id minus tombstones; conflict: newer of `updatedAt/endedAt/startedAt`, tie → the one with `nextDay`; a `nextDay` is never lost |
| customWorkouts | by id, newer `updatedAt` wins, minus tombstones |
| exerciseLevels | newer `levelsUpdatedAt` wins (explicit regress beats max); one side untracked → the stamped one; none / `join` → max |
| xp / badges / records / exitCriteriaDone | max / union (earliest date) / better / union |
| settings | per key last-write-wins via `_updatedAt`; untracked on both: non-null wins, then remote on `join`, else local; `sync` always local |
| ownedEquipment | per id via `_equipmentAt`; untracked → owned if owned on either side |
| state keys (phaseId, nextWorkoutId, phaseHistory, clearances, toggles, …) | per key last-write-wins via `state._updatedAt` |
| activeSession | always local, never taken from remote |

`join` = this device has never synced (`settings.sync.lastSyncAt` null): it adopts shared values for untracked
settings and keeps the max of levels. Timestamps more than 5 min in the future (broken clock) count as untracked.

Running training on another device: `activeSessions[deviceId] = {deviceName, workoutName, startedAt, updatedAt}` in the
envelope (own entry set/removed on each sync, entries > 12 h dropped). The newest foreign entry < 12 h becomes
`state.remoteActiveSession` (info only, never resumed).

### 17.4 Triggers

App start (online + valid token), `visibilitychange` → visible (≥ 60 s since the last attempt), `onLocalChange`
debounced 20 s (while a training runs: throttled to ≥ 2 min since the last attempt), session finished / next-day
check → immediately, „Jetzt synchronisieren“, `online` event after a queued (offline) attempt. Never in read-only
mode (newer schema). Without a token: status `needsAuth`, GIS is preloaded so the next tap can open the popup.

### 17.5 UI

- Mehr → card „Synchronisierung“: status line with dot (Nicht verbunden / Google-Konto verbunden · Letzter Abgleich
  vor 3 min / Anmeldung nötig / Offline / Fehler: …), Gerätename (default „Handy“/„Tablet“ by screen size),
  Client-ID with link to `docs/SYNC_SETUP.md`, buttons Verbinden / Jetzt synchronisieren / Erneut anmelden / Trennen,
  checkbox „Beim Trennen auch die Daten in Google Drive löschen“ (confirm dialog). Deep link `#/mehr?focus=sync`.
- Heute: status dot in the header (links to the card); without token a chip „Abgleichen“ (one-tap re-auth + sync);
  info banner „Training läuft gerade auf <Gerät>“ from `state.remoteActiveSession`.
- `sw.js` never handles Google hosts (and no cross-origin request at all).

## 18. v5.3 – Sitz ohne Rollen, Knie-Entlastung, Schulter-Schutz, mitdenkender Button, Rudern ohne Timer

Feedback of the user (right-handed compound archer, left meniscus tear + cartilage damage, microfracture 2027-01-05):
owns TheraBands, loops, mat, step, rowing machine, door anchor, band handles, sling trainer and a massage stick, but
**no fixed chair – only an office chair with wheels that swivels**; pain directly above the patella (the physio's
inferior patellar glide + long-axis traction relieved it); **impingement of both shoulders** (pain-free only up to
≈ 60–70° arm elevation; the bow draw at shoulder height is fine; orthopaedist recommends rotator cuff training).
`APP_VERSION` 5.3.0, `SCHEMA_VERSION` stays 1, `EQUIPMENT_MODEL` 3. Tests: `tests/logic-v53.test.js`,
`PW_E2E=1 node --test tests/v53-e2e.test.js` (browser QA with this user's equipment + shoulder protection).

### 18.1 Seat split — `js/logic/equipment.js`

- `BASE_EQUIPMENT` = `theraband, loop, mat, step, wall, door, none` (the old base `chair` is gone). New optional ids (toggle
  order first): `chair-fixed` „Fester Stuhl / Hocker ohne Rollen“, `office-chair` „PC-Stuhl mit Rollen“, `bed-edge`
  „Bett- oder Sofakante“, `massage-stick` „Massagestab (z. B. Blackroll)“.
- **anyOf groups:** `ANY_OF = {seat: ['chair-fixed', 'office-chair']}` – the virtual id `seat` is available when any id of
  the group is owned (`availableEquipment` adds it). Exercises list `seat` (quiet seated work) or `chair-fixed`.
- Classification: **seat** (safe on a braked office chair): knee pendulum, seated knee extension, seated hamstring curl,
  lat pulldown, seated rotation / spine wave / ankle circles, seated stretches and flows, hamstring stretch seated.
  **chair-fixed** (pushing/standing up from the seat or loading it horizontally): sit-to-stand, right-leg sit-to-stand,
  chair dip, seated press-up, heel bridge on the chair, thoracic extension over the backrest, **seated row** (the band
  pulls a chair on wheels away from the wall). **Support → wall** (holding on to a rolling chair is a fall risk): calf
  raise, single-leg stance (+ reach), mini squat, standing hip abduction/extension, leg swing sideways, hip flexor stretch
  standing, side plank (wall only). Their figures show a wall at the hands.
- `instructionsFor`: with `office-chair` but no `chair-fixed`, `seat` exercises start with `OFFICE_CHAIR_NOTE` „PC-Stuhl
  mit der Lehne an die Wand stellen, Rollen feststellen falls möglich, nicht drehen.“ (also shown as 💺 note in the session).
- **Fallback chains** (`exercise.fallback`: id or ordered list; `resolveExercise` tries the chain, then the derived base of an
  upgrade rule; a candidate must have its equipment, be `usable` (phaseMin, post-op block, toggle, **shoulder limit**) and not
  be `taken` (already in the same section)). Unsafe chair exercises: chair-dip → sling-dip-assisted (upgrade) /
  band-triceps-extension; seated-press-up → sling-triceps-press / band-triceps-extension; sit-to-stand →
  sling-assisted-mini-squat (p2+) / **box-squat-bed-edge** (new, `bed-edge`) / mini-squat (wall); right-leg-sit-to-stand →
  box-squat-bed-edge / right-leg-band-press; hamstring-bridge-chair → sling-heel-bridge (upgrade) / **hamstring-bridge-step**
  (new) / glute-bridge; thoracic-extension-chair → **thoracic-extension-floor** (new, towel roll); seated-row → sling-row
  (upgrade) / **long-sit-row** (new, long sitting on the mat, band low at the door).
- **Migration** (`migrateEquipment`, model < 3): the old base chair is NOT taken over as `chair-fixed`; users with sessions
  get `office-chair` ticked (unless `_equipmentAt['office-chair']` shows they toggled it), existing users get
  `state.seatNotice = "pending"` → Heute banner „Neu: Sitzgelegenheit angeben – fester Stuhl oder PC-Stuhl mit Rollen?“
  (link to Meine Ausrüstung, ✕ or visiting the page → `"seen"`; also shown while no seat is owned). Users with sessions get
  `shoulderImpingement: true`, `shoulderMaxElevationDeg: 65`. Migrated values carry `MIGRATION_STAMP`
  (`2026-11-01T00:00:00Z`) in `_equipmentAt` / `_updatedAt`, so every real change on any device wins in the sync merge.
  `seatNotice` is a tracked state key (last write wins), the shoulder settings are tracked settings keys.

### 18.2 Context-aware big button (session) — `session-helpers.ctaState` (pure)

`ctaState({allDone, hasNext, resting, timerLed, timerState, rowEntry, rowDone}) → {key, label}`:

| situation | label | action |
|---|---|---|
| timer-led set (hold/timed/tempo coach), idle | Satz starten | starts prep + cue plan of the open set (voice unlock in the tap) |
| timer running / paused | Anhalten / Weiter | `pause()` / `start()` |
| set rest running | Pause überspringen | `afterRest()` (next timer-led set starts with its prep) |
| reps without timer | Satz fertig | ticks the open set → rest |
| all sets done | Nächste Übung / Zum Abschluss | old „next“ (pain / RPE nudges, finisher offer) |
| rowing part | Gerudert ✓ / Weiter | see 18.5 |

The button never skips an unfinished exercise (that is the small link „Übung überspringen“); taps within 700 ms after a CTA
action are ignored (double-tap guard, plus the existing re-render guard). The timer's own toggle/±15/reset are hidden; ±15 s and
„Zurücksetzen“ live in the disclosure „Timer anpassen“ under the timer (they act on the rest timer during a rest).

### 18.3 Knee relief & shoulder protection — content, `js/logic/shoulder.js`

- **Knee relief:** `patella-mobilization` (p1+, p4 note kept) now with inferior glide first, 10× per direction and the
  physio variation (glide held down + gentle quad set / small lift); `quad-massage-stick` (massage stick on the quads up to
  just above the patella, never on it; fallback `quad-self-massage`); `prone-quad-lengthening-band` (prone, band, knee only
  to ≈ 60–70°, pain ≤ 2); `knee-pendulum` (sit high, e.g. office chair raised). All texts: „ersetzt keine Behandlung; bei
  stärkerem Schmerz/Schwellung Physio fragen; nach Freigabe durch deinen Physio“. Voice cue words for each.
  Workouts `p1-relief` … `p4-relief` (kind **"relief"**, „Knie-Entlastung (3–5 Min.)“, `maxMinutes` 6, phase field
  `relief`; p4 without the stick massage/prone stretch). Heute „Schnellstart“ and Plan show it any day; it does **not** count
  for the weekly strength goal or streak (`stats.countsAsStrength`), gives `XP.relief` = 8, no recommendations, no next-day
  check. Strength warm-ups p1–p3 start with 35 s patella mobilisation (`item.override`, replaces one leg drill; budgets kept).
  Workout items may carry `override` (copied to the plan entry, used by the duration estimate).
- **Shoulder:** settings `shoulderImpingement` (default false, switch „Schulter-Impingement (keine Überkopf-Übungen)“ under
  Mehr → Trainingsziele) and `shoulderMaxElevationDeg` (default 65, stepper 40–120). Every exercise has
  `shoulderElevationDeg` (level value `levels[i].shoulderElevationDeg` wins), `shoulderFocus: ["rc"|"scapula"]`, and the five
  draw drills + bow-arm push carry `archeryDraw: true` (exception, hint „Schulter tief, bei Schmerz > 3 abbrechen“); rowing
  is exempt. `shoulderOk(ex, level, settings)` is part of `usable` in `buildSessionPlan`, so over-limit exercises take
  their fallback: wall-slide / sling-y → wall-push-up-plus; band-pull-apart / sling-t → pull-apart-low; prone-ytw /
  sling-rear-delt → prone-low-row; face-pull / sling-face-pull → low-face-pull; serratus-punch → serratus-punch-low;
  er-90-90 → er-towel / sidelying-er / er-iso-door; lat-pulldown / straight-arm-pulldown / high rows → low-row-band;
  dead-bug / side plank / sling plank / rollout → pallof-press; band-dislocate / shoulder-circles → scapula-setting;
  lat-side / seated-pec / doorway / cross-body / neck stretches → side-bend-low / pec-stretch-low / neck-stretch-low;
  stretch/mobility flows → `*-low` flows; sling-triceps-press → band-triceps-extension; single-leg-stance-reach →
  single-leg-stance. Items with `shoulderOnly: true` (rotator cuff in every strength/short workout, scapula setting in the
  C workouts) are only planned while the protection is on. `fitPlanToMinutes` additionally shortens repetitions
  (warm-up/cool-down first, ≥ 3 left) when every entry is already at one set. Library: chip „über Schulter-Limit“; custom
  workouts: warning with the replacement. Session: 🛡️ hint on shoulder exercises. Figures: no pose of an allowed exercise
  shows more than limit + 20° (tested via `computePoints`); side-lying poses no longer put the bottom arm overhead.

### 18.4 Figures

New poses (tools/gen-poses.mjs): box-sit*, bridge-heel-step-*, supine-towel-tspine-*, long-sit-row-*, long-sit-thigh-*
(+ new prop **`stick`**, a massage roller following the hands along the thigh), prone-quad-band-*, stand-scap-*,
stand-punch-low-*, wall-push-up-plus-*, stand-low-row-*, front-arms-*-low, low-face-pull-*, front-rc-iso,
stand-hands-behind-*, front-sit-side-bend-low, front-sit-neck-low; support poses carry a wall at the hands.

### 18.5 Rowing without a timer (warm-up, finisher, rowing sessions)

The guided rowing timer is gone (`rowingPhases` stays as pure logic for texts and logging). A card shows goal and
instructions (`session-helpers.rowingBrief`: „10 Min. locker rudern, Schlagzahl 18–22“, intervals „6 × (1 Min. zügig /
1 Min. locker), Schlagzahl 22–26“, technique steps as text), „Erledigt“ toggle, minutes (pre-filled with the goal, ±1 and
direct input), optional display values (distance, kcal, Ø watt, SPM, Ø pulse), mandatory knee pain + sharp-pain button with
red warning, „Heute nicht gerudert“ / „Überspringen“. Big button „Gerudert ✓“ (needs the pain value, saves, continues) /
„Weiter“. `applyRowedDuration` scales the planned phases to the minutes and logs them via `applyRowingLog`; values go to the
same fields as before (`warmupRowing`, `finisherRowing`, `rowing.durationSec` …) so statistics, kcal and sync are unchanged.
No phase announcements – only „Rudern: … Tippe auf Erledigt, wenn du fertig bist.“ when the card opens. Old resumes with
step `rowlog` open the card; a stale `rowTimer` of ≤ 5.2 is still flushed on „Jetzt abschließen“.
