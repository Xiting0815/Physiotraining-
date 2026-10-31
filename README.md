# Physiotraining – Knie & Bogen

Mobile-first Offline-PWA als Trainingsbegleiter für die Knie-Prehab (Meniskus/Knorpel, OP voraussichtlich Januar 2027)
kombiniert mit Rücken-/Schultertraining für Compound-Bogenschießen. 3 Einheiten pro Woche (~40 min), Workouts A/B/C,
Ampel-Logik für Belastungssteuerung, Motivation (OP-Countdown, Serien, XP, Abzeichen, Trefferbild).

> Ersetzt keine ärztliche oder physiotherapeutische Beratung.

- Vanilla JS (ES-Module), kein Build-Schritt, keine Abhängigkeiten
- Daten bleiben lokal im Browser (`localStorage`, Schlüssel `pt.v1`), Export/Import als JSON
- Spezifikation: [`docs/SPEC.md`](docs/SPEC.md)

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

(Ein Webserver ist nötig, da ES-Module und `fetch` nicht über `file://` funktionieren.)

## Tests

```bash
node --test
```

## Deployment (GitHub Pages)

Repository → *Settings* → *Pages* → *Deploy from a branch* → Branch `main`, Ordner `/ (root)`.
Die App läuft dann unter `https://<user>.github.io/Physiotraining-/`. Alle Pfade sind relativ, es ist keine
weitere Konfiguration nötig.

## Offline / PWA

Die App ist installierbar (`manifest.webmanifest`) und funktioniert nach dem ersten Laden offline
(`sw.js`: App-Shell cache-first, `data/*.json` network-first mit Cache-Fallback, versionierter Cache).
Ist eine neue Version verfügbar, erscheint der Hinweis „Update verfügbar – neu laden“.

**Precache-Liste aktuell halten:** Nach dem Hinzufügen, Entfernen oder Ändern von App-Dateien

```bash
node tools/gen-precache.mjs          # schreibt PRECACHE + CACHE_VERSION (Inhalts-Hash) in sw.js
node tools/gen-precache.mjs --check  # prüft nur (Exit-Code 1, wenn veraltet)
```

Erfasst werden `index.html`, `manifest.webmanifest`, `css/**`, `js/**`, `data/*.json` und `icons/*`.
Da `CACHE_VERSION` ein Hash über alle Dateien ist, löst jede inhaltliche Änderung ein Update aus.

**Icons** werden aus `icons/icon.svg` erzeugt (benötigt Playwright mit Chromium, nur Entwicklung):

```bash
node tools/gen-icons.mjs   # icon-192/512.png, icon-maskable-*.png, apple-touch-icon.png
```
