# Physiotraining – Knie & Bogen

Mobile-first Offline-PWA als Trainingsbegleiter für die Knie-Prehab (Meniskus/Knorpel, OP voraussichtlich Januar 2027)
kombiniert mit Rücken-/Schultertraining für Compound-Bogenschießen. 3 Einheiten pro Woche (~40 min), Workouts A/B/C,
Ampel-Logik für die Belastungssteuerung und viel Motivation.

> **Hinweis:** Diese App ersetzt keine ärztliche oder physiotherapeutische Beratung. Bei starken Schmerzen,
> Blockieren, zunehmender Schwellung oder Nachtschmerz: Training stoppen und Rücksprache halten.
> Die App macht nur Vorschläge – Steigerungen, Stufen und Phasenwechsel bestätigst immer du.

## Funktionen

- **Heute** – Willkommenskarte beim ersten Start (OP-Termin, Bänder bestätigen, Sicherheitshinweis),
  nächstes Training (A/B/C) mit großem Start-Button, OP-Countdown, Wochenziel-Ring, Serie,
  XP-Level mit Bogenschützen-Titeln, Gedanke des Tages, Vorschläge zum Übernehmen, Folgetag-Hinweis.
- **Training** – Vor-Check (Schmerz, Schwellung, Warnzeichen) → Aufwärmen → Knie-Block → Bogen-/Rücken-Block
  → Cool-down → Nach-Check. Animierte Strichfigur je Übung, Timer für Halten/Zeit/Tempo und Satzpausen
  (mit Ton, Vibration und Wake Lock), Schmerz- bzw. RPE-Skala, „Stechender Schmerz“-Knopf, Überspringen,
  Satz anpassen (lange drücken). Unterbrechen und später fortsetzen ist jederzeit möglich.
- **Auswertung** – Ampel (Grün/Gelb/Rot/Stopp, immer mit Symbol + Text), Trefferbild als Zielscheibe,
  XP, neue Abzeichen und Bestwerte, Empfehlungen (Steigern / Halten / Zurückgehen) zum Bestätigen.
- **Folgetag-Check** – 30 Sekunden am Tag danach: Schmerz, Schwellung, Steifigkeit → finale Ampel.
- **Plan** – aktuelle Phase, Ausstiegskriterien zum Abhaken, Workouts A/B/C mit aktueller Stufe je Übung,
  alle Phasen.
- **Übungen** – Bibliothek mit Suche und Filtern (Block, Ausrüstung, im Plan); Detail mit Animation,
  Anleitung, Hinweisen fürs Knie, allen Stufen und manuellem Stufenwechsel.
- **Verlauf** – Kalender mit Ampelfarben, Schmerzverlauf, Einheiten pro Woche, persönliche Rekorde,
  Abzeichen und alle Einheiten mit Detailansicht.
- **Mehr** – OP-Termin, Wochenziel, Design (Auto/Hell/Dunkel), Schriftgröße, Satzpause, Ton, Vibration,
  Schmerzgrenzen, Reihenfolge der Bänder, Sicherung exportieren/importieren (JSON), alles löschen.
- **Ausrüstung** – vorhandene Bänder und eine Einkaufsliste mit Budget zum Abhaken.
- **Offline** – nach dem ersten Laden komplett offline nutzbar, installierbar als App.

Technik: Vanilla JS (ES-Module), kein Build-Schritt, keine Abhängigkeiten. Alle Daten bleiben lokal im Browser
(`localStorage`, Schlüssel `pt.v1`). Spezifikation: [`docs/SPEC.md`](docs/SPEC.md).

## Auf dem Handy installieren

Die App einmal online öffnen (z. B. `https://<user>.github.io/Physiotraining-/`), danach:

- **iPhone / iPad (Safari):** Teilen-Symbol (Quadrat mit Pfeil) → **„Zum Home-Bildschirm“** → „Hinzufügen“.
  Die App startet dann im Vollbild vom Home-Bildschirm und funktioniert offline.
  (Nur Safari kann auf iOS Web-Apps installieren.)
- **Android (Chrome):** Menü ⋮ → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“ → „Installieren“.
  Alternativ erscheint der Installationshinweis automatisch in der Adressleiste.

Tipp: Regelmäßig unter **Mehr → Daten → Sicherung exportieren** ein Backup speichern – Browserdaten können
beim Löschen des Verlaufs oder bei wenig Speicher verloren gehen.

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

1. Repository auf GitHub öffnen → **Settings** → **Pages**.
2. Unter *Build and deployment* → *Source*: **Deploy from a branch**.
3. Branch **`main`**, Ordner **`/ (root)`** → **Save**.
4. Nach ein bis zwei Minuten läuft die App unter `https://<user>.github.io/Physiotraining-/`.

Alle Pfade sind relativ, es ist keine weitere Konfiguration nötig.

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

## Entwickler-Werkzeuge

**Posen der Strichfigur** (`data/poses.json`) werden generiert – Änderungen im Generator vornehmen, nicht im JSON:

```bash
node tools/gen-poses.mjs "$PWD"   # Repo-Pfad als Argument; schreibt data/poses.json
node --test tests/figure.test.js  # prüft alle Posen gegen die Übungen
node tools/gen-precache.mjs       # danach Service-Worker-Cache aktualisieren
```

`tools/pose-editor.html` (über den lokalen Server öffnen) zeigt Posen und Übungen zur Kontrolle an;
offene Posen-Wünsche stehen in `docs/POSE_REQUESTS.md`.

**Icons** werden aus `icons/icon.svg` erzeugt (benötigt Playwright mit Chromium, nur Entwicklung):

```bash
node tools/gen-icons.mjs   # icon-192/512.png, icon-maskable-*.png, apple-touch-icon.png
```

## Haftungsausschluss

Die Übungen und Empfehlungen dienen der allgemeinen Information und Trainingsbegleitung. Sie ersetzen
keine ärztliche oder physiotherapeutische Untersuchung, Diagnose oder Beratung. Stimme Training und
Steigerungen mit deinem Arzt bzw. deiner Physiotherapeutin ab.
