# Physiotraining – Knie & Bogen

Mobile-first Offline-PWA als Trainingsbegleiter für die Knie-Prehab (Meniskus/Knorpel, Mikrofraktur-OP links
voraussichtlich am **05.01.2027**) kombiniert mit Rücken-/Schultertraining für Compound-Bogenschießen.
3 Krafteinheiten pro Woche (max. 30 min, Workouts A/B/C) plus 3× Rudern (15–20 min), Kurztraining, eigene Workouts,
Ampel-Logik für die Belastungssteuerung, Auswertung und viel Motivation. Die App konzentriert sich aufs Training –
Gewicht und Gesundheitswerte bleiben in Samsung Health.

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
- **Abschluss einer Einheit** – Ampel (Grün/Gelb/Rot/Stopp, immer mit Symbol + Text), Trefferbild als Zielscheibe,
  XP, neue Abzeichen und Bestwerte, geschätzte kcal, Empfehlungen (Steigern / Halten / Zurückgehen) zum Bestätigen.
- **Folgetag-Check** – 30 Sekunden am Tag danach: Schmerz, Schwellung, Steifigkeit → finale Ampel.
- **Plan** – aktuelle Phase, Ausstiegskriterien zum Abhaken, Workouts A/B/C mit aktueller Stufe je Übung,
  alle Phasen.
- **Übungen** – Bibliothek mit Suche und Filtern (Block, Ausrüstung, im Plan); Detail mit Animation,
  Anleitung, Hinweisen fürs Knie, allen Stufen und manuellem Stufenwechsel.
- **Verlauf** – Kalender mit Ampelfarben, Schmerzverlauf, Einheiten pro Woche, persönliche Rekorde,
  Abzeichen und alle Einheiten mit Detailansicht; Link zur Auswertung.
- **Auswertung** (`#/auswertung`, erreichbar über Heute, Verlauf und Mehr) – **OP-Bereitschaft** (Heuristik aus
  Ausstiegskriterien, Kraftstufen, Schwellungsfreiheit und Regelmäßigkeit – keine medizinische Beurteilung),
  **Wochenbericht** zum Durchblättern (Kraft- und Rudereinheiten, Strecke, kcal-Schätzung, Trainingslast, Knie am
  Folgetag, Ampeln, Tipp) und **Trainingslast ↔ Knie am Folgetag** (vorsichtige Tendenz ab 8 Einheiten mit
  Folgetag-Check, „kein Beweis für Ursache und Wirkung“, Trainingslast pro Woche als Diagramm).
- **Mehr** – OP-Termin, Wochenziel, Auswertung, Trainingsziele (Rudern pro Woche, Körpergewicht für die
  Kalorienschätzung), Design (Auto/Hell/Dunkel), Schriftgröße, Satzpause, Ton, Vibration,
  Schmerzgrenzen, Reihenfolge der Bänder, Sicherung exportieren/importieren (JSON), alles löschen.
- **Ausrüstung** – vorhandene Bänder und eine Einkaufsliste mit Budget zum Abhaken.

### Neu in Version 2

- **Rudern** (Rudergerät, z. B. MERACH) – eigene Ausdauer-Einheiten mit 15–20 Minuten (Grundlage, Intervalle,
  Ausdauer je nach Phase), Wochenziel 3× bis zur OP. Geführter Timer mit Abschnitten, Intensität, Ziel-SPM/RPE und
  dauerhaftem Hinweis „Stopp bei Schmerz > 5/10 / Blockieren“. Danach die Display-Werte eintragen (Zeit, Strecke,
  SPM, Watt, kcal, Puls) → Pace pro 500 m, Bestwerte, Abzeichen. Die Knie-Ampel gilt auch beim Rudern; Rudern zählt
  nicht für die A/B/C-Rotation. Nach der OP ist Rudern gesperrt.
- **Kurztraining** – „Nur 15 Minuten?“: das Wichtigste der Phase in ca. 15 Minuten. Krafteinheiten bleiben
  automatisch unter 30 Minuten (Sätze werden bei hohen Stufen gekürzt und markiert).
- **Eigene Workouts** – aus der Übungsbibliothek zusammenstellen (Aufwärmen, Knie & Beine, Bogen/Rücken & Stütz,
  Cool-down), sortieren, Live-Dauer „ca. N Min“, Hinweise bei Übungen außerhalb der aktuellen Phase; als Kopie eines
  Plan-Workouts starten, duplizieren, löschen.
- **Kalorien pro Einheit** – Rudergerät-Display, Watt-Formel oder MET × Körpergewicht × Dauer. Das Körpergewicht
  stellst du unter **Mehr → Trainingsziele** ein (ohne Angabe 80 kg) – **ausdrücklich eine Schätzung**.
- **Phasen-Zeitplan bis zur OP am 05.01.2027** – Plan und Heute zeigen, in welcher Phase du laut Zeitplan sein
  solltest (Phase 1 bis 27.11., Phase 2 bis 18.12., Phase 3 mit OP-Woche ab 29.12.). Der OP-Termin wird in der
  Willkommenskarte vorgeschlagen und muss bestätigt werden; Phasenwechsel bleiben kriterienbasiert und von dir bestätigt.
- **Entlastungsphase nach der Mikrofraktur (Phase 4, 6 Wochen)** – Übungen im Sitzen und Liegen ohne Belastung des
  linken Beins (Fußpumpe, Quadrizeps anspannen, Kniescheiben-Mobilisation, Fersengleiten im erlaubten Bereich,
  gesundes Bein, Oberkörper/Bogen im Sitzen). **Startet erst nach der OP und nur, wenn du die Freigabe durch
  Arzt/Physio bestätigst – das Protokoll deines Behandlungsteams hat immer Vorrang.** Belastende Übungen und Rudern
  sind gesperrt; einzelne Übungen lassen sich passend zum Protokoll ein- oder ausschalten. Vor und nach jeder Einheit
  werden Rötung/Überwärmung und Fieber abgefragt – bei Warnzeichen heißt es „Bitte Arzt kontaktieren“.
- **Vorbereitung auf die Krücken** – Stütz-Dips, Trizeps, Abstützen im Sitz und Einbeinstand bereits vor der OP.
- **Offline** – nach dem ersten Laden komplett offline nutzbar, installierbar als App.

### Neu in Version 4

- **Sprachansagen** – eine deutsche Stimme führt durch jede Übung: „Bereit machen: Übungsname … Drei, Zwei, Eins –
  Anspannen“, „Loslassen“, „Seite wechseln“, „Pause, 45 Sekunden“, „Übung fertig. Nächste Übung: …“ – ohne
  Wiederholungen laut mitzuzählen. Unter **Mehr → Sprachansagen** stellst du Tempo und Lautstärke ein und kannst mit
  **„Stimme testen“** prüfen, ob dein Handy eine deutsche Stimme hat (sonst gibt es unterschiedliche Signaltöne).
- **5 Sekunden „Bereit machen“** vor jedem Satz und **mindestens 5 Sekunden „Loslassen/Entspannen“** zwischen zwei
  Halte-Wiederholungen – Zeit, um in Position zu kommen und kurz zu lockern.
- **Mobilisation vorher, Dehnen nachher** – jedes Krafttraining startet mit 3–4 Minuten knieschonender Mobilisation
  (Beinpendel mit Wandkontakt, Hüftkreisen, Band-Dislocates, Rotation der Brustwirbelsäule – kein tiefes Beugen des
  linken Knies, kein Knien) und endet mit statischem Dehnen (Hüftbeuger in kurzer Schrittstellung, Waden,
  Brust/Lat, Unterarme für Zug- und Bogenhand …). Ehrlich gesagt: **Dehnen hilft kaum gegen Muskelkater** – es ist
  gut für Beweglichkeit, Haltung und zum Runterkommen.
- **4-7-8-Atmung** zum Abschluss jedes Krafttrainings: 4 s einatmen, 7 s halten, 8 s ausatmen – ruhig angesagt
  („Einatmen / Halten / Ausatmen“), ohne Pieptöne. Bei Schwindel einfach normal weiteratmen.
- **Rudern als Aufwärmen** – in Phase 1–3 kann das Krafttraining mit 10 Minuten lockerem Rudern beginnen (2 Minuten
  Technik: nur Arme → Arme + Oberkörper → halber Beinweg → ganzer Schlag, dann 8 Minuten locker). Vor jedem Start
  umschaltbar („Mit 10 Min. Rudern aufwärmen“, Dauer „ca. N Min“ passt sich live an), Standard unter
  **Mehr → Darstellung & Training**. Danach optional Zeit, Strecke und kcal vom Display eintragen.
- **Ruder-Finisher bei grüner Ampel** – nach dem Kraftteil fragt die App „Noch 5–10 Min. rudern?“, aber nur, wenn
  dein Knie heute im grünen Bereich war (kein Schmerz über 2/10, keine Schwellung, kein Blockieren/Wegknicken, kein
  stechender Schmerz). Aufwärm- und Finisher-Minuten zählen für Ruder-Minuten, Strecke und Kalorien, aber nicht als
  eigene Rudereinheit im Wochenziel.
- **Lange Ruder-Einheiten fürs Abnehmen** – „Rudern – Grundlage lang“ (25–29 Minuten, locker bis gleichmäßig) in
  jeder Phase vor der OP. Wichtig und ehrlich: Kalorien kommen vor allem aus dem gesamten Wochenumfang – **der größte
  Hebel beim Abnehmen ist die Ernährung**; die App zeigt Trainings-Kalorien nur als Schätzung.
- **Tipp: App im Vordergrund lassen.** Der Bildschirm bleibt während des Trainings an. Wenn du das Handy sperrst oder
  zu einer anderen App wechselst, kann Android die Sprachansagen anhalten.

### Version 3.1 – Fokus Training

Die Importe (RENPHO-Screenshot, Samsung-Health-Export, Teilen an die App), das Gesundheits-Tagebuch und das
Abnehm-Ziel samt Kalorienziel wurden entfernt – Gewicht und Gesundheit trackst du in Samsung Health. Bereits
gespeicherte Tagebuch-Einträge und ein altes Gewichtsziel bleiben unangetastet im Browser-Speicher (und in der
Sicherung), werden aber nicht mehr angezeigt. Das zuletzt eingetragene Gewicht wird beim Update einmalig als
Körpergewicht für die Kalorienschätzung übernommen. Ein Update gibt außerdem den Speicher der früheren
Texterkennung (ca. 7,5 MB) wieder frei.

Technik: Vanilla JS (ES-Module), kein Build-Schritt, keine Abhängigkeiten. Alle Daten bleiben lokal im Browser
(`localStorage`, Schlüssel `pt.v1`). Daten aus Version 1 werden beim ersten Start automatisch übernommen und um die
neuen Felder ergänzt (keine Daten gehen verloren). Spezifikation: [`docs/SPEC.md`](docs/SPEC.md).

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
