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
- **Meine Ausrüstung** – abhaken, was du hast (Rudergerät, Schlingentrainer, Türanker, Bandgriffe …); der Plan passt
  sich automatisch an. Darunter Einkaufsideen mit Budget für das, was noch fehlt.

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

### Neu in Version 5.3 – sicher sitzen, Knie entlasten, Schulter schonen

- **Fester Stuhl oder PC-Stuhl mit Rollen?** Unter **Meine Ausrüstung** gibt es jetzt „Fester Stuhl / Hocker ohne Rollen“,
  „PC-Stuhl mit Rollen“, „Bett- oder Sofakante“ und „Massagestab (z. B. Blackroll)“. Ruhige Übungen im Sitzen gehen auch
  auf dem PC-Stuhl (Hinweis: Lehne an die Wand, Rollen feststellen, nicht drehen). Alles, was vom Sitz hochdrückt,
  aufsteht oder den Stuhl waagerecht belastet, braucht einen festen Stuhl – sonst kommt automatisch ein Ersatz:
  Stütz-Dips/Abstützen im Sitz → Dips bzw. Trizepsdrücken am Schlingentrainer oder Trizeps mit Band, Aufstehen vom Stuhl →
  assistierte Mini-Kniebeuge (ab Phase 2), Hinsetzen auf die Bettkante oder Mini-Kniebeuge an der Wand, Fersen-Brücke auf
  dem Stuhl → am Schlingentrainer bzw. auf der Stufe, Brustwirbel-Streckung → auf dem Boden über die Handtuchrolle,
  Rudern im Sitzen → am Schlingentrainer bzw. im Langsitz. Zum Festhalten (Wadenheben, Einbeinstand …) dient die Wand.
  Beim Update wird der PC-Stuhl übernommen, wenn du schon trainiert hast; Heute fragt einmal nach der Sitzgelegenheit.
- **Knie-Entlastung (3–5 Min.)** – bei Druck direkt oberhalb der Kniescheibe: Kniependel, Kniescheiben-Mobilisation
  (sanft nach unten gleiten, Variante wie beim Physio), Oberschenkel-Massage mit dem Massagestab (nie auf der Kniescheibe)
  und sanftes Verlängern in Bauchlage (Knie nur bis ca. 60–70°). Jederzeit über Heute → Schnellstart oder den Plan,
  zählt nicht fürs Wochenziel. Ehrlich: ersetzt keine Behandlung – bei stärkerem Schmerz oder Schwellung Physio fragen.
  Jedes Krafttraining in Phase 1–3 beginnt mit einer kurzen Kniescheiben-Mobilisation.
- **Schulter-Schutz bei Impingement** (Mehr → Trainingsziele): keine Übungen mit Armhebung über 65° (einstellbar). Wall
  Slide, Y-Heben, Latzug, Band-Dislocates, Arme-über-Kopf-Dehnungen usw. werden ersetzt – z. B. durch Wand-Liegestütz mit
  Plus, Low Row, Pull-Apart tief, Low Face Pull auf Brusthöhe, Schulterblätter setzen. Jedes Krafttraining enthält
  Rotatorenmanschetten-Training (isometrisch am Türrahmen, Außenrotation mit Handtuchrolle, Seitlage, Innenrotation).
  Der Bogenauszug auf Schulterhöhe bleibt („Schulter tief, bei Schmerz über 3/10 abbrechen“). Schmerzarm arbeiten:
  höchstens leichter Schmerz (≤ 3/10), der nicht anhält.
- **Ein großer Button, der mitdenkt** – im Training zeigt der Knopf unten immer den nächsten Schritt: „Satz starten“ →
  „Anhalten“/„Weiter“ → „Pause überspringen“ → „Nächste Übung“ → „Zum Abschluss“; bei Wiederholungen ohne Timer
  „Satz fertig“. Er überspringt nie eine Übung – dafür gibt es den kleinen Link „Übung überspringen“. ±15 s und
  Zurücksetzen stecken unter „Timer anpassen“.
- **Rudern ohne Timer** – Aufwärmen, Finisher und Rudereinheiten zeigen nur noch Ziel und Anleitung
  („10 Min. locker rudern, Schlagzahl 18–22“). Danach „Erledigt“ und die Minuten eintragen (optional Werte vom Display);
  der Knieschmerz beim Rudern bleibt Pflicht.

### Neu in Version 5.2 – Handy und Tablet synchron

- **Synchronisierung über Google Drive** (Mehr → Synchronisierung) – Einheiten, Stufen, XP, Abzeichen, eigene
  Workouts, Ausrüstung und Einstellungen werden zwischen deinen Geräten abgeglichen. Gelöschte Einheiten
  verschwinden auch auf dem anderen Gerät. Ein Training, das gerade auf dem anderen Gerät läuft, wird auf Heute nur
  angezeigt („Training läuft gerade auf Tablet“) – nie übernommen. Details siehe unten.

### Version 5.1 – stabiler und übersichtlicher

- **Speicherfehler-Banner** – kann der Browser nicht speichern (Speicher voll, privater Modus), erscheint ein
  deutlicher Hinweis mit Knopf zum Sofort-Sichern (Export), damit nichts verloren geht.
- **Reparatur beschädigter Daten** – fehlerhafte Einträge werden beim Laden bereinigt; sind die gespeicherten Daten
  unlesbar, bewahrt die App vorher eine Kopie auf (zum Herunterladen). Startet die App gar nicht mehr, bietet eine
  **Notfall-Seite** „Neu laden“ und „Daten sichern“ an.
- **Doppeltipp-Schutz mit Rückgängig** – versehentliches Doppeltippen zählt nicht doppelt; ein abgehakter Satz lässt
  sich über „Rückgängig“ im Hinweis sofort zurücknehmen.
- **Echte Trainingszeit** – wird die App während einer Einheit beendet, zählt die Zeit dazwischen nicht als
  Trainingszeit. Nach mehr als 12 h Pause fragt die App: fortsetzen, jetzt abschließen oder verwerfen.
- **Im Training** – der Übungsname steht groß oben, ein **Tempo-Coach** gibt bei Knie-Wiederholungen den Takt vor,
  ein großer **„Satz fertig“**-Button zählt Sätze, und **„Wie eben“** übernimmt den letzten Schmerzwert.
- **Heute kompakter**, größere Tippflächen (mind. 44 px) überall.
- **Folgetag-Check für alle Einheiten eines Tages** – Krafttraining und Rudern am selben Tag werden mit einem Check
  beantwortet; Hinweis auf Heute und Folgetag-Seite zeigen immer dieselben Einheiten.

### Neu in Version 5 – Deine Ausrüstung steuert den Plan

- **Meine Ausrüstung** (Mehr → Meine Ausrüstung) – oben die Schalter mit Symbol für alles, was über die
  Grundausstattung (TheraBänder, Loops, Matte, Stufe, Wand, Tür; ab 5.3 ist der Stuhl abhakbar) hinausgeht: Rudergerät, Schlingentrainer,
  Türanker, Bandgriffe, Gewichtsmanschetten, Balance-Pad, Kurzhanteln, Pedaltrainer, Release-Trainer, Kühlpack,
  Maßband. Darunter Einkaufsideen nur noch für das, was fehlt. Nach jedem Umschalten sagt die App, was sich ändert:
  „Neu in deinem Plan: Rudern am Schlingentrainer, Stütz-Dips am Schlingentrainer …“ bzw. „Entfernt: …“.
- **Schlingentrainer (an der Tür)** – 14 neue Übungen, dosiert über den Körperwinkel statt über ein Bein:
  Rudern (Inverted Row), Face Pull, Y- und T-Heben, Reverse Flys, einarmiges Rudern im Schießstand (Zugarm rechts,
  Bogenarm links lang), Unterarmstütz im Stand (ohne Knien, Füße am Boden), Pallof Press, Rollout im Stand,
  Trizepsdrücken, Stütz-Dips mit Füßen am Boden, schräge Liegestütze und – ab Phase 2 – assistierte Mini-Kniebeuge
  (höchstens 60°) und Fersenbrücke (Knie nur 20–30° gebeugt). Wer den Schlingentrainer abhakt, bekommt in Phase 1–3
  automatisch die Sling-Variante statt der Band-Übung (z. B. „Rudern am Schlingentrainer“ statt „Rudern im Sitzen
  mit Band“) – mit eigener Stufe ab Stufe 1 und dem Hinweis „Neu: Sling-Variante“. Die Zeitbudgets bleiben gleich.
  Nach der OP (Phase 4) sind alle Sling-Übungen gesperrt.
- **Rudern nur mit Rudergerät** – ohne abgehaktes Rudergerät verschwinden Ruder-Aufwärmen, Finisher und
  Rudereinheiten aus Heute und Plan (Hinweis „Rudergerät in Ausrüstung abhaken“). Beim Update wird das Rudergerät
  automatisch übernommen, wenn du schon gerudert hast.
- **Türanker & Griffe** – Band-Übungen zeigen mit Türanker „Band mit dem Türanker auf Brust-/Kopf-/Knöchelhöhe
  befestigen“ statt der Knoten-Methode, mit Bandgriffen zusätzlich „Griffe einhängen“ – in der Übung und im Training.
- **Übungen** – neue Filter für Schlingentrainer und Türanker; die Übungsseite zeigt „Benötigt: …“ mit vorhanden /
  fehlt und verweist auf die Variante bzw. die Ersatzübung.
- Beim Update werden alte Einträge der Einkaufsliste übernommen (z. B. „Türanker + Bandgriffe“ → Türanker und
  Bandgriffe). Einmalig erscheint auf Heute „Neu: Deine Ausrüstung steuert jetzt den Plan – hake ab, was du hast“.

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

## Synchronisierung zwischen Geräten (Google Drive)

Trainierst du abwechselnd auf Handy und Tablet, kann die App beide Geräte über **dein eigenes Google Drive**
auf demselben Stand halten. Das ist optional – ohne Synchronisierung funktioniert alles wie bisher, komplett offline.

**Einrichten (einmalig, ca. 15 Minuten):** Schritt-für-Schritt-Anleitung ohne Vorkenntnisse:
[`docs/SYNC_SETUP.md`](docs/SYNC_SETUP.md). Kurz: In der Google Cloud Console ein Projekt mit „Google Drive API“
und einer OAuth-Client-ID (Typ „Webanwendung“, JavaScript-Quelle `https://xiting0815.github.io`) anlegen, die
Client-ID unter **Mehr → Synchronisierung** einfügen und auf **beiden** Geräten **Verbinden** tippen.

**So funktioniert es**

- Gespeichert wird eine einzige Datei `physiobogen-sync.json` im versteckten **App-Ordner** deines Google Drive
  (Berechtigung `drive.appdata`). Die App sieht keine anderen Dateien, die Datei taucht in „Meine Ablage“ nicht auf.
  Kein fremder Server, keine Weitergabe – die Anmeldung (Zugangs-Token) bleibt auf dem Gerät.
- Abgeglichen wird beim Start, beim Zurückkehren in die App, kurz nach Änderungen, sofort nach dem Beenden einer
  Einheit und dem Folgetag-Check sowie mit **„Jetzt synchronisieren“**. Während eines Trainings höchstens alle
  2 Minuten. Offline merkt sich die App den Abgleich und holt ihn nach, sobald Internet da ist.
- **Zusammenführen statt Überschreiben:** Einheiten beider Geräte werden vereint; gelöschte Einheiten und eigene
  Workouts werden 90 Tage lang als „gelöscht“ vermerkt und verschwinden auch auf dem anderen Gerät. Bei Stufen,
  Einstellungen, Phase und Ausrüstung gewinnt die jeweils **neueste Änderung** (auch eine bewusst zurückgenommene
  Stufe). XP: höherer Wert, Abzeichen: alle.
- Ein **laufendes Training** wird nie vom anderen Gerät übernommen. Auf Heute erscheint nur der Hinweis
  „Training läuft gerade auf Tablet“.
- Google gibt Web-Apps keine dauerhafte Anmeldung: Nach einem Neustart der App (bzw. nach etwa einer Stunde) zeigt
  Heute den Knopf **„Abgleichen“** – ein Tipp meldet dich still neu an und gleicht ab. Während eines Trainings
  öffnet sich nie ein Anmeldefenster.
- **Trennen** behält alle Daten auf dem Gerät. Optional lässt sich die Sync-Datei in Google Drive dabei löschen.
  „Alle Daten löschen“ und „Sicherung importieren (Ersetzen)“ wirken nur auf dem aktuellen Gerät.
- Stammen die Daten aus einer neueren App-Version (Nur-Lese-Modus), pausiert die Synchronisierung.

Für Entwickler: Code in `js/sync/` (`merge.js` rein funktional, `drive.js` REST, `auth.js` Google Identity Services,
`engine.js` Auslöser/Status), Spezifikation in `docs/SPEC.md` §17. Optional kann eine Standard-Client-ID in
`js/sync/config.js` (`DEFAULT_CLIENT_ID`) hinterlegt werden.

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

(Ein Webserver ist nötig, da ES-Module und `fetch` nicht über `file://` funktionieren.)

## Tests

```bash
node --test
PW_E2E=1 node --test tests/sync-e2e.test.js   # Browser-Smoke-Test der Synchronisierung (Playwright + python3)
PW_E2E=1 node --test tests/hardening-session-e2e.test.js tests/voice-e2e.test.js tests/v53-e2e.test.js  # Training im Browser
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
