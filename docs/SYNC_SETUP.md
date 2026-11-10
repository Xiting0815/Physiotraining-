# Synchronisierung einrichten – Schritt für Schritt

Mit dieser Anleitung verbindest du PhysioBogen auf **Handy und Tablet** mit deinem **eigenen Google Drive**.
Danach haben beide Geräte denselben Stand: Einheiten, Stufen, Abzeichen, eigene Workouts, Ausrüstung und
Einstellungen. Du brauchst keine Programmierkenntnisse, nur dein Google-Konto und ca. 15 Minuten. Das Einrichten
in der Google Cloud Console geht am bequemsten am Computer (oder am Tablet im Browser).

> **Warum muss ich das selbst anlegen?** PhysioBogen hat keinen eigenen Server. Damit die App in *deinem* Google
> Drive speichern darf, braucht sie eine „Client-ID“ – eine Art Kennung, die du bei Google für dich selbst
> erstellst. Kosten entstehen dabei keine.

## Datenschutz in Kürze

- Gespeichert wird **eine** Datei (`physiobogen-sync.json`) im **versteckten App-Ordner** deines Google Drive.
  Die App bekommt nur das Recht `drive.appdata` – sie kann **keine** deiner anderen Dateien sehen oder ändern,
  und die Datei erscheint nicht in „Meine Ablage“.
- Es gibt keinen Server dazwischen: Die App spricht direkt mit Google. Die Anmeldung (ein Zugangs-Token, ca. 1 Stunde
  gültig) bleibt **nur auf dem Gerät** und wird nicht mit gespeichert oder exportiert.
- Du kannst jederzeit trennen und die Datei in Google Drive löschen (Mehr → Synchronisierung → Trennen).

---

## Schritt 1 – Projekt anlegen

1. Öffne **<https://console.cloud.google.com/>** und melde dich mit deinem Google-Konto an.
   Beim ersten Besuch: Land wählen, Nutzungsbedingungen bestätigen.
2. Oben links neben „Google Cloud“ auf die **Projektauswahl** tippen → **Neues Projekt**.
3. Projektname: **PhysioBogen** → **Erstellen**. Warte kurz und wähle das neue Projekt oben in der Projektauswahl aus.

## Schritt 2 – Google Drive API aktivieren

1. Menü ☰ → **APIs & Dienste** → **Bibliothek**.
2. Nach **Google Drive API** suchen, antippen → **Aktivieren**.

## Schritt 3 – OAuth-Zustimmungsbildschirm einrichten

Google hat diesen Bereich umbenannt; je nach Ansicht heißt er **„OAuth-Zustimmungsbildschirm“** oder
**„Google Auth Platform“**. Die Schritte sind dieselben.

1. Menü ☰ → **APIs & Dienste** → **OAuth-Zustimmungsbildschirm** (bzw. **Google Auth Platform**) → **Jetzt starten**.
2. **App-Informationen:** App-Name **PhysioBogen**, **Nutzersupport-E-Mail**: deine eigene Adresse → Weiter.
3. **Zielgruppe:** **Extern** wählen → Weiter.
4. **Kontaktdaten:** wieder deine E-Mail-Adresse → Weiter → Richtlinie bestätigen → **Erstellen**.
5. **Berechtigung (Scope) hinzufügen:** Bereich **„Datenzugriff“** (ältere Ansicht: Schritt „Bereiche“) →
   **Bereiche hinzufügen oder entfernen**. In der Liste nach **`drive.appdata`** filtern und den Eintrag
   **`.../auth/drive.appdata`** („Eigene Konfigurationsdaten in Google Drive ansehen und verwalten“) anhaken →
   **Aktualisieren** → **Speichern**. Andere Bereiche brauchst du nicht.
6. **Testnutzer eintragen:** Bereich **„Zielgruppe“** → **Testnutzer** → **Nutzer hinzufügen** → deine eigene
   Gmail-Adresse (die du auf Handy und Tablet verwendest) → **Speichern**.

> **„Testmodus“ ist für dich genau richtig.** Die App bleibt im Status „Test“ – du musst sie **nicht** bei Google
> veröffentlichen oder prüfen lassen. Nur die eingetragenen Testnutzer (du) können sich anmelden. Beim Anmelden
> zeigt Google deshalb den Hinweis **„Google hat diese App nicht überprüft“** → **Weiter** tippen (es ist deine
> eigene App). Im Testmodus kann Google dich ab und zu bitten, die Anmeldung erneut zu bestätigen – einfach
> wieder zustimmen.

## Schritt 4 – Client-ID erstellen

1. Menü ☰ → **APIs & Dienste** → **Anmeldedaten** (bzw. Google Auth Platform → **Clients**).
2. **+ Anmeldedaten erstellen** → **OAuth-Client-ID** (bzw. **Client erstellen**).
3. **Anwendungstyp:** **Webanwendung**. Name z. B. „PhysioBogen Web“.
4. **Autorisierte JavaScript-Quellen** → **URI hinzufügen** → genau diese Adresse eintragen:

   ```
   https://xiting0815.github.io
   ```

   (ohne `/Physiotraining-` dahinter und ohne Schrägstrich am Ende). **Autorisierte Weiterleitungs-URIs** bleiben leer.
5. **Erstellen**. Es erscheint ein Fenster mit der **Client-ID** – sie sieht so aus:
   `123456789012-abcdefg123456.apps.googleusercontent.com`. Auf das Kopier-Symbol tippen.
   Den „Clientschlüssel“ (Client Secret) brauchst du **nicht**.

Tipp: Schick dir die Client-ID z. B. per Notiz oder E-Mail aufs Handy und aufs Tablet – sie ist kein Passwort und
nicht geheim, sie funktioniert nur zusammen mit deinem Google-Konto auf der oben eingetragenen Adresse.

## Schritt 5 – In der App verbinden (auf beiden Geräten)

Zuerst auf dem Gerät mit den **meisten Daten** (meist das Handy), danach auf dem zweiten:

1. PhysioBogen öffnen → **Mehr** → **Synchronisierung**.
2. **Gerätename** prüfen (z. B. „Handy“ bzw. „Tablet“).
3. **Client-ID** einfügen.
4. **Verbinden** tippen → Google-Konto wählen → bei „Google hat diese App nicht überprüft“ **Weiter** →
   Zugriff erlauben (Haken bei Google Drive setzen, falls angezeigt).
5. Die Statuszeile zeigt **„Google-Konto verbunden · Letzter Abgleich gerade eben“**.

Fertig. Beim zweiten Gerät werden die Daten beider Geräte zusammengeführt – es geht nichts verloren.

## Im Alltag

- Die App gleicht automatisch ab: beim Öffnen, kurz nach Änderungen und sofort nach dem Training. Auf **Heute**
  zeigt ein kleiner Punkt oben rechts den Stand (grün = abgeglichen, gelb = wartet, rot = Fehler).
- Google erlaubt Web-Apps keine Dauer-Anmeldung. Nach einem Neustart der App steht oben auf **Heute** deshalb
  **„Abgleichen“** – ein Tipp genügt (meist ohne erneute Eingabe). Während eines Trainings öffnet sich nie ein
  Anmeldefenster.
- Läuft gerade ein Training auf dem anderen Gerät, zeigt Heute „Training läuft gerade auf Tablet“. Die Einheit
  erscheint nach dem Beenden und Abgleichen automatisch im Verlauf.
- Ohne Internet funktioniert alles wie immer; der Abgleich wird nachgeholt.

## Wenn etwas nicht klappt

| Meldung / Problem | Lösung |
| --- | --- |
| „Die Client-ID wird von Google abgelehnt“ / `origin_mismatch` | In Schritt 4 die JavaScript-Quelle genau als `https://xiting0815.github.io` eintragen. Änderungen brauchen bei Google bis zu 5 Minuten. |
| „Zugriff blockiert“ / `access_denied` | Deine E-Mail als **Testnutzer** eintragen (Schritt 3.6). |
| „Zugriff auf den App-Ordner … nicht erlaubt“ | Beim Anmelden den Haken für Google Drive setzen. |
| „Das Anmeldefenster wurde blockiert“ | Noch einmal auf den Knopf tippen; ggf. Pop-ups für die Seite erlauben. |
| „Google-Anmeldung nicht erreichbar“ | Internetverbindung prüfen, später erneut. |
| „Ein anderes Gerät nutzt eine neuere App-Version“ | Auf diesem Gerät die App aktualisieren („Update verfügbar – neu laden“). |

Trennen: Mehr → Synchronisierung → **Trennen**. Alle Daten bleiben auf dem Gerät. Mit dem Haken „Beim Trennen auch
die Daten in Google Drive löschen“ wird zusätzlich die Sync-Datei gelöscht. Den Zugriff kannst du auch unter
<https://myaccount.google.com/permissions> entfernen.
