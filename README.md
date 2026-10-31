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
