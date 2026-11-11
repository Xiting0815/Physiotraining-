// Layperson texts per exercise: short / setup / steps / feel (+ targeted fixes of legacy fields).
const SLING = "Befestige den Schlingentrainer oben in der Tür (Scharnierseite), schließ die Tür zu dir hin und am besten ab. Teste den Halt mit einem kräftigen Zug.";
const ROW_SETUP = "Setz dich aufs Rudergerät. Füße in die Fußstützen, Gurt über den breitesten Teil des Fußes. Widerstand niedrig bis mittel einstellen.";
const ROW_STEPS = [
  "Zug: erst Beine strecken, dann leicht zurücklehnen, dann Arme ziehen.",
  "Griff zum unteren Rippenbogen ziehen, Schultern bleiben tief.",
  "Zurück: Arme strecken, Oberkörper vor, dann langsam nach vorn rollen.",
];
const ROW_FEEL = "Du spürst vor allem Beine, Gesäß und Rücken arbeiten, der Puls steigt.";
const DRAW_SETUP = "Stell dich im Schießstand hin: hüftbreit, beide Beine gleich belastet, Knie weich. Die linke Hand (Bogenhand) hält das Band auf Schulterhöhe, die rechte greift wie mit dem Release. Nimm ein Band, dessen Zug im Anker etwa deinem Haltegewicht entspricht.";

export const TEXTS = {
  'knee-pendulum': {
    short: "Lockeres Beinpendeln im Sitzen – ölt das Kniegelenk und nährt den Knorpel.",
    setup: "Setz dich hoch auf eine feste Kante (Tisch, Bettkante oder ganz hochgefahrener PC-Stuhl), sodass die Füße frei hängen. Die Oberschenkel liegen ganz auf, die Hände stützen seitlich.",
    steps: ["Setz dich hoch hin, die Füße hängen frei.", "Lass den linken Unterschenkel locker vor und zurück pendeln.", "Kleiner, ruhiger Bogen – Schwung statt Kraft.", "Nach der Zeit das rechte Bein pendeln."],
    feel: "Du spürst ein lockeres, warmes Gefühl im Knie – ohne Anstrengung.",
  },
  'ankle-pumps': {
    short: "Füße kräftig anziehen und strecken – bringt den Kreislauf in den Beinen in Schwung.",
    setup: "Leg dich auf den Rücken auf die Matte (oder setz dich im Langsitz hin). Beide Beine liegen lang.",
    steps: ["Leg dich auf den Rücken, beide Beine lang.", "Zieh beide Fußspitzen kräftig zur Nase.", "Streck die Füße danach weit nach unten.", "Wechsle zügig und gleichmäßig hin und her."],
    feel: "Du spürst Waden und Schienbeine arbeiten, die Beine werden warm.",
  },
  'shoulder-circles': {
    short: "Schultern kreisen und Arme heben – macht Schultergelenk und Schulterblätter warm.",
    setup: "Stell dich aufrecht hin, Füße hüftbreit, Knie locker. Ist das Knie gereizt, setz dich auf den Stuhl. Mit Schulterschutz ersetzt die App diese Übung durch „Schulterblätter setzen“.",
    steps: ["Kreise die Schultern langsam nach hinten, etwa 30 s.", "Heb dann die gestreckten Arme langsam nach vorn hoch.", "Senk die Arme langsam wieder ab.", "Bleib fließend, ohne Schwung."],
    feel: "Du spürst Schultern und oberen Rücken warm und locker werden.",
  },
  'seated-spine-wave': {
    short: "Rücken abwechselnd rund machen und aufrichten – die kniefreundliche Katze-Kuh im Sitzen.",
    setup: "Setz dich aufrecht auf die vordere Hälfte des Stuhls. Füße hüftbreit flach am Boden, Hände auf den Oberschenkeln.",
    steps: ["Setz dich vorne auf den Stuhl, Hände auf die Oberschenkel.", "Ausatmen: Becken nach hinten kippen, Rücken rund, Kinn zur Brust.", "Einatmen: Becken nach vorn, Brustbein hoch, Blick nach vorn.", "Wechsle langsam im Atemrhythmus."],
    feel: "Du spürst, wie sich der ganze Rücken Wirbel für Wirbel bewegt.",
  },
  'seated-thoracic-rotation': {
    short: "Oberkörper im Sitzen drehen – macht die Brustwirbelsäule frei für den Auszug.",
    setup: "Setz dich aufrecht auf den Stuhl, Knie und Füße zeigen nach vorn. Verschränk die Arme vor der Brust.",
    steps: ["Setz dich aufrecht hin, Arme vor der Brust verschränkt.", "Dreh den Oberkörper langsam nach rechts, der Blick folgt.", "Kurz halten, zurück zur Mitte, dann nach links.", "Knie und Becken bleiben ruhig nach vorn gerichtet."],
    feel: "Du spürst eine angenehme Drehung zwischen den Schulterblättern.",
  },
  'quad-set': {
    short: "Oberschenkel fest anspannen – Übung Nr. 1 nach der OP, jetzt schon üben.",
    setup: "Leg dich auf den Rücken auf die Matte oder setz dich im Langsitz hin, Beine lang. Leg eine kleine Handtuchrolle unter das linke Knie.",
    steps: ["Leg dich hin, Handtuchrolle unter das linke Knie.", "Drück die Kniekehle fest ins Handtuch, Zehen zu dir.", "Spann den Oberschenkel an und halte die Spannung.", "Lass danach ganz locker."],
    feel: "Du spürst den vorderen Oberschenkel hart werden, die Kniescheibe zieht leicht nach oben.",
  },
  'heel-slides': {
    short: "Ferse zum Gesäß gleiten lassen – sanfte Kniebeugung ganz ohne Last.",
    setup: "Leg dich auf den Rücken auf die Matte, Beine lang. Unter die linke Ferse ein Handtuch oder eine Socke, damit sie gut gleitet.",
    steps: ["Leg dich auf den Rücken, beide Beine lang.", "Lass die linke Ferse langsam Richtung Gesäß gleiten.", "Nur so weit, wie es angenehm ist – kurz halten.", "Streck das Bein wieder ganz und spann kurz an."],
    feel: "Du spürst ein leichtes Ziehen vorn am Knie – kein Stechen, kein Einklemmen.",
  },
  'straight-leg-raise': {
    short: "Gestrecktes Bein anheben – kräftigt den vorderen Oberschenkel ohne Kniebeugung.",
    setup: "Leg dich auf den Rücken auf die Matte. Das nicht trainierte Bein ist aufgestellt, das Trainingsbein liegt lang. Ab Stufe 4 kommt ein Loop um beide Fußgelenke.",
    steps: ["Leg dich hin, ein Bein aufgestellt, das andere lang.", "Spann das lange Bein fest an, Zehen zu dir.", "Heb es gestreckt bis auf Kniehöhe des anderen Beins.", "Langsam ablegen. Erst links, dann Beine tauschen."],
    feel: "Du spürst den vorderen Oberschenkel und etwas den Bauch arbeiten.",
  },
  tke: {
    short: "Knie gegen das Band ganz durchstrecken – trainiert die volle Streckung im Stand.",
    setup: "Stell dich mit dem Gesicht zur Tür, gut einen Schritt entfernt. Leg die Bandschlaufe hinter das linke Knie (Kniekehle) und geh zurück, bis das Band spannt. Füße hüftbreit, Fersen am Boden.",
    steps: ["Band auf Kniehöhe in der Tür, Schlaufe hinter das linke Knie.", "Gesicht zur Tür, Knie leicht beugen, Ferse bleibt unten.", "Knie gegen das Band ganz strecken, 2 s fest anspannen.", "Langsam zurück. Danach Schlaufe ans rechte Knie."],
    feel: "Du spürst den vorderen Oberschenkel direkt über dem Knie fest werden.",
  },
  'wall-sit': {
    short: "Mit dem Rücken an der Wand in leichter Kniebeuge halten – Kraft ohne Bewegung im Gelenk.",
    setup: "Stell dich mit dem Rücken an die Wand. Die Fersen stehen ca. 30–40 cm (gut zwei Fußlängen) vor der Wand, Füße hüftbreit. Gesäß, Rücken und Hinterkopf berühren die Wand. Tiefe: Stufe 1–2 ca. 30°, ab Stufe 3 bis 45° – nie tiefer.",
    steps: ["Rücken an die Wand, Fersen ca. 30–40 cm vor der Wand.", "Rutsch an der Wand runter, bis die Knie leicht gebeugt sind.", "Halten – Gewicht auf beiden Fersen, Knie über den Füßen.", "Schieb dich an der Wand wieder hoch."],
    feel: "Du spürst die vorderen Oberschenkel brennen – das Knie selbst bleibt ruhig.",
  },
  'sit-to-stand': {
    short: "Kontrolliert aufstehen und hinsetzen – die wichtigste Alltagsbewegung, Schritt für Schritt kräftiger.",
    setup: "Stell einen festen Stuhl ohne Rollen mit der Lehne an die Wand. Am Anfang ein Kissen auf die Sitzfläche (höherer Sitz). Setz dich vorn auf die Kante, Füße hüftbreit, Arme vor der Brust gekreuzt. Ab Stufe 4 (versetzt): linker Fuß eine halbe Fußlänge weiter hinten.",
    steps: ["Setz dich vorn auf den festen Stuhl, Arme vor der Brust.", "Neig den Oberkörper vor, Nase über die Zehen.", "Steh über beide Beine gleichmäßig auf.", "Setz dich langsam (3 s) wieder hin, ohne zu plumpsen."],
    feel: "Du spürst Oberschenkel und Gesäß arbeiten, beide Beine gleich.",
    instructions: { 1: "Vorne auf den Sitz, Füße hüftbreit, Arme vor der Brust gekreuzt." },
  },
  'mini-squat': {
    short: "Kleine Kniebeuge mit Loop – Beinachse stabil halten, Tiefe streng begrenzt.",
    setup: "Stell dich mit dem Gesicht zur Wand, ca. eine Armlänge entfernt. Die Fingerspitzen berühren die Wand auf Bauchhöhe nur leicht. Füße hüftbreit, Loop knapp oberhalb der Knie. Tiefe je Stufe: 30°, 45°, höchstens 60°.",
    steps: ["Gesicht zur Wand, eine Armlänge Abstand, Loop über den Knien.", "Schieb das Gesäß nach hinten wie zum Hinsetzen.", "Beug nur bis zur Stufen-Tiefe, Knie drücken leicht nach außen.", "Über die Fersen aufrichten, oben Gesäß anspannen."],
    feel: "Du spürst Oberschenkel und seitliches Gesäß – das Knie bleibt schmerzarm.",
  },
  'step-up': {
    short: "Mit dem linken Bein auf die Stufe steigen – Kraft und Kontrolle wie beim Treppensteigen.",
    setup: "Stell die Stufe neben eine Wand. Stell dich seitlich zur Wand direkt vor die Stufe (Fußspitzen ca. 10 cm davor), die Wand ist eine Unterarmlänge neben dir. Die wandnahe Hand liegt an der Wand.",
    steps: ["Vor die Stufe stellen, eine Hand an der Wand.", "Setz den linken Fuß komplett auf die Stufe.", "Drück dich über links hoch, der rechte Fuß tippt nur auf.", "Rechts langsam (3 s) absteigen. Danach rechts steigen."],
    feel: "Du spürst den linken Oberschenkel und das Gesäß arbeiten.",
    instructions: { 0: "Vor den Step stellen, eine Hand an der Wand." },
  },
  'seated-knee-extension': {
    short: "Unterschenkel gegen leichten Bandzug strecken – gezielt für den vorderen Oberschenkel.",
    setup: "Setz dich aufrecht auf den Stuhl, die Oberschenkel liegen ganz auf. Knote das Band hinten ums Stuhlbein (PC-Stuhl: um die Mittelsäule) und leg die Schlaufe um das linke Fußgelenk.",
    steps: ["Setz dich aufrecht, Bandschlaufe um das linke Fußgelenk.", "Streck den Unterschenkel langsam nach vorn.", "Oben kurz den Oberschenkel anspannen.", "Langsam (3 s) zurück. Danach das rechte Bein."],
    feel: "Du spürst den vorderen Oberschenkel – im Knie höchstens leichtes Ziehen.",
    instructions: { 0: "Band um das hintere Stuhlbein (PC-Stuhl: um die Mittelsäule) knoten, Schlaufe um das linke Fußgelenk." },
  },
  'lateral-step-down': {
    short: "Langsam auf einem Bein absenken – trainiert Bremskraft und eine gerade Beinachse.",
    setup: "Stell die Stufe ca. eine Unterarmlänge neben eine Wand. Stell dich seitlich zur Wand auf die Stufe, die linke Schulter zeigt zur Wand. Das linke Bein steht, das rechte hängt seitlich frei über der Kante. Die linke Hand liegt an der Wand.",
    steps: ["Links auf die Stufe, rechtes Bein hängt seitlich frei.", "Linkes Knie langsam (3–4 s) beugen, bis die rechte Ferse tippt.", "Nicht abstellen – sofort über links wieder hochdrücken.", "Becken bleibt waagerecht. Danach umdrehen, rechts stehen."],
    feel: "Du spürst den linken Oberschenkel und das seitliche Gesäß kräftig arbeiten.",
  },
  'glute-bridge': {
    short: "Becken heben, Knie gegen den Loop – kräftigt Gesäß und Beinrückseite, schont das Knie.",
    setup: "Leg dich auf den Rücken auf die Matte. Loop knapp über den Knien, Füße hüftbreit und eher weit vom Gesäß weg (Knie ca. 60–70° gebeugt). Arme neben dem Körper. Stufe 4: oben abwechselnd einen Fuß kurz anheben (Marschieren). Stufe 5: nur das linke Bein drückt, das rechte ist gestreckt in der Luft.",
    steps: ["Rückenlage, Loop über den Knien, Füße eher weit weg.", "Drück die Knie leicht nach außen gegen den Loop.", "Gesäß anspannen und Becken heben bis zur geraden Linie.", "Kurz halten, langsam Wirbel für Wirbel ablegen."],
    feel: "Du spürst Gesäß und hintere Oberschenkel – nicht den unteren Rücken.",
  },
  clamshell: {
    short: "In Seitlage das obere Knie öffnen – kräftigt den Gesäßmuskel, der das Knie in der Spur hält.",
    setup: "Leg dich auf die Seite auf die Matte, Kopf auf dem unteren Arm. Hüfte ca. 45°, Knie ca. 90° gebeugt, Fersen zusammen. Loop knapp über den Knien.",
    steps: ["Seitlage, Knie gebeugt, Fersen zusammen, Loop über den Knien.", "Öffne das obere Knie wie eine Muschel.", "Das Becken bleibt still und rollt nicht nach hinten.", "Langsam schließen. Danach auf die andere Seite legen."],
    feel: "Du spürst es seitlich-hinten im Gesäß des oberen Beins.",
  },
  'side-lying-hip-abduction': {
    short: "Gestrecktes oberes Bein in Seitlage anheben – stärkt den mittleren Gesäßmuskel.",
    setup: "Leg dich auf die Seite auf die Matte, Kopf auf dem unteren Arm. Unteres Bein leicht gebeugt, oberes Bein gestreckt in Verlängerung des Körpers. Ab Stufe 3: Loop knapp über den Knien.",
    steps: ["Seitlage, unteres Bein leicht gebeugt, oberes Bein lang.", "Die Fußspitze zeigt nach vorn, nicht zur Decke.", "Heb das obere Bein ca. 30–40 cm an, kurz halten.", "Langsam senken. Danach auf die andere Seite legen."],
    feel: "Du spürst es seitlich an der Hüfte, oberhalb des Gesäßes.",
  },
  'lateral-band-walk': {
    short: "Kleine Seitschritte mit Loop – Hüfte stabil, Knie in der Spur.",
    setup: "Stell dich frei in den Raum – oder an eine Wand entlang, wenn du unsicher bist. Loop knapp oberhalb der Knie, Füße hüftbreit, Knie leicht gebeugt.",
    steps: ["Loop über den Knien, Füße hüftbreit, Knie leicht gebeugt.", "Mach einen kleinen Schritt zur Seite, der Loop bleibt gespannt.", "Zieh den anderen Fuß nach – die Füße kommen nicht zusammen.", "Erst alle Schritte nach rechts, dann gleich viele nach links."],
    feel: "Du spürst es seitlich am Gesäß, auf beiden Seiten.",
  },
  'standing-hip-abduction': {
    short: "Rechtes Bein gegen das Band seitlich abspreizen – das linke Standbein arbeitet für die Stabilität.",
    setup: "Stell dich seitlich zur Tür, die linke Schulter zeigt zur Tür, gut einen Schritt entfernt. Die linke Hand stützt am Türrahmen oder an der Wand. Schlaufe ums rechte Fußgelenk, links ist Standbein mit weichem Knie. Für die andere Seite umdrehen.",
    steps: ["Band unten in der Tür, Schlaufe ums rechte Fußgelenk.", "Linke Seite zur Tür, linke Hand an Wand oder Rahmen.", "Rechtes Bein gestreckt 20–30° zur Seite führen, kurz halten.", "Langsam zurück. Danach umdrehen: Schlaufe links, rechts Standbein."],
    feel: "Du spürst es seitlich an der Hüfte – im bewegten Bein und im Standbein.",
  },
  'standing-hip-extension': {
    short: "Gestrecktes Bein gegen das Band nach hinten führen – Gesäß kräftigen, Standbein stabilisieren.",
    setup: "Stell dich mit dem Gesicht zur Tür, ca. einen Schritt entfernt. Hände auf Brusthöhe an Türrahmen oder Wand. Schlaufe ums rechte Fußgelenk, links ist Standbein mit weichem Knie.",
    steps: ["Band unten in der Tür, Schlaufe ums rechte Fußgelenk.", "Gesicht zur Tür, Hände am Rahmen, linkes Knie weich.", "Rechtes Bein gestreckt ca. 20° nach hinten, Gesäß anspannen.", "Langsam zurück. Danach Schlaufe ans linke Bein."],
    feel: "Du spürst das Gesäß des hinteren Beins – nicht den unteren Rücken.",
  },
  'seated-hamstring-curl': {
    short: "Ferse gegen das Band unter den Stuhl ziehen – stärkt die Beinrückseite mit begrenzter Beugung.",
    setup: "Stell den Stuhl mit Blick zur Tür ca. ein bis zwei Schritte davor, sodass das Band bei fast gestrecktem Bein leicht spannt. Setz dich aufrecht, Schlaufe um die linke Ferse.",
    steps: ["Band unten in der Tür, Stuhl mit Blick zur Tür davor.", "Schlaufe um die linke Ferse, Bein fast gestreckt.", "Zieh die Ferse zurück bis ca. 60° Kniebeugung.", "Langsam (3 s) nach vorn. Danach die rechte Ferse."],
    feel: "Du spürst die Rückseite des Oberschenkels – nicht hinten innen im Knie.",
    mistakes: { add: "Stuhl rollt Richtung Tür – dann leichteres Band oder kürzerer Abstand" },
  },
  'hamstring-bridge-chair': {
    short: "Fersen auf dem Stuhl, Becken heben – kräftigt Beinbeuger und Gesäß bei fast gestrecktem Knie.",
    setup: "Stell einen festen Stuhl ohne Rollen vor die Matte (Lehne an der Wand). Leg dich auf den Rücken, beide Fersen auf die Sitzfläche, Knie nur leicht gebeugt (ca. 20–30°). Arme neben dem Körper.",
    steps: ["Rückenlage, beide Fersen auf den festen Stuhl.", "Knie leicht gebeugt, Fersen in die Sitzfläche drücken.", "Becken heben, bis Schultern, Hüfte und Fersen eine Linie bilden.", "Kurz halten, langsam absenken."],
    feel: "Du spürst die Rückseite der Oberschenkel und das Gesäß.",
  },
  'calf-raise': {
    short: "Auf die Zehenspitzen und langsam zurück – kräftige Waden entlasten das Knie beim Gehen.",
    setup: "Stell dich mit dem Gesicht zur Wand, ca. 30 cm (eine Fußlänge) entfernt, Füße hüftbreit. Leg die Hände auf Brusthöhe leicht an die Wand. Ab Stufe 3 nur auf dem linken Bein, danach rechts gleich viele.",
    steps: ["Gesicht zur Wand, ca. 30 cm Abstand, Hände an die Wand.", "Drück dich gleichmäßig auf die Zehenspitzen hoch.", "Oben kurz halten.", "Langsam (3 s) absenken."],
    feel: "Du spürst die Waden fest werden.",
  },
  'single-leg-stance': {
    short: "Auf dem linken Bein ruhig stehen – schult Gleichgewicht und Kniekontrolle.",
    setup: "Stell dich seitlich neben eine Wand, ca. eine Unterarmlänge entfernt, sodass deine Hand sie jederzeit erreicht. Stufe 3: auf einem Kissen oder der gefalteten Matte. Stufe 4: rechter Fuß tippt nach vorn, zur Seite und nach hinten. Stufe 5: Band vor dem Bauch auseinanderziehen.",
    steps: ["Seitlich neben die Wand, Hand in Reichweite.", "Verlagere das Gewicht aufs linke Bein, Knie leicht gebeugt.", "Rechten Fuß lösen, Becken waagerecht, Blick auf einen Punkt.", "Halten. Rechts gern auch kurz zum Ausgleich."],
    feel: "Du spürst kleine Ausgleichsbewegungen in Fuß und Oberschenkel – das ist gewollt.",
  },
  'band-pull-apart': {
    short: "Band vor der Brust auseinanderziehen – Schulterblätter zusammen, wie beim Vollauszug.",
    setup: "Stell dich aufrecht hin (oder setz dich), Füße hüftbreit. Greif das Band schulterbreit vor dem Körper. Mit Schulterschutz nimmt die App die tiefe Variante.",
    steps: ["Band schulterbreit greifen, Arme gestreckt auf Schulterhöhe.", "Zieh das Band auseinander, bis es die Brust berührt.", "Schulterblätter dabei zusammen und nach unten.", "Kontrolliert zurück."],
    feel: "Du spürst es zwischen den Schulterblättern.",
  },
  'seated-row': {
    short: "Band zum Bauch ziehen, Schulterblätter nach hinten-unten – die Basis jeder Rückenspannung.",
    setup: "Setz dich auf einen festen Stuhl mit Blick zur Tür, so weit weg, dass das Band bei gestreckten Armen leicht spannt (ca. 1–1,5 m). Aufrecht sitzen, Füße flach, die Hände bleiben unter Schulterhöhe.",
    steps: ["Band auf Brusthöhe in der Tür, Blick zur Tür.", "Arme nach vorn gestreckt, Bandenden in beiden Händen.", "Erst Schulterblätter zurück, dann Ellbogen eng zum Bauch ziehen.", "Kurz halten, langsam zurück."],
    feel: "Du spürst den mittleren Rücken zwischen den Schulterblättern.",
  },
  'prone-ytw': {
    short: "Arme in Y-, T- und W-Form abheben – stärkt die Muskeln um die Schulterblätter.",
    setup: "Leg dich auf den Bauch auf die Matte, Kissen unter dem Becken, Stirn auf einem kleinen Handtuch. Drückt die Bauchlage aufs linke Knie: gefaltetes Handtuch darunter.",
    steps: ["Bauchlage, Stirn aufs Handtuch, Arme lang.", "Y: Arme schräg vorn, Daumen hoch, leicht abheben.", "T: Arme seitlich abheben. W: Ellbogen gebeugt zur Hüfte ziehen.", "Jede Form kurz halten. Y + T + W = eine Wiederholung."],
    feel: "Du spürst die Muskeln um und unter den Schulterblättern.",
  },
  'wall-slide': {
    short: "Unterarme an der Wand hochgleiten lassen – die Schulterblätter drehen sauber mit.",
    setup: "Stell dich mit dem Gesicht zur Wand, ca. eine Fußlänge (30 cm) entfernt. Loop um beide Handgelenke. Unterarme schulterbreit an die Wand, Ellbogen auf Schulterhöhe. Mit Schulterschutz ersetzt die App diese Übung.",
    steps: ["Gesicht zur Wand, Unterarme an der Wand, Loop um die Handgelenke.", "Drück die Handgelenke leicht nach außen gegen den Loop.", "Lass die Unterarme nach oben in ein Y gleiten.", "Langsam zurück, der Loop bleibt gespannt."],
    feel: "Du spürst es unter den Schulterblättern und hinten an der Schulter.",
  },
  'serratus-punch': {
    short: "Arm gegen das Band nach vorn schieben und das Schulterblatt mitnehmen – stabilisiert den Bogenarm.",
    setup: "Stell dich mit dem Rücken zur Tür, so weit weg, dass das Band leicht spannt (ca. ein Schritt). Kleine Schrittstellung, Knie weich, Bandende in einer Hand.",
    steps: ["Band auf Brusthöhe in der Tür, Rücken zur Tür.", "Arm auf Schulterhöhe nach vorn, Ellbogen leicht gebeugt.", "Arm strecken und die Schulter ein Stück nach vorn schieben.", "Langsam zurück. Erst links (Bogenarm), dann rechts."],
    feel: "Du spürst es seitlich am Brustkorb unter der Achsel.",
    labels: true,
  },
  'er-towel': {
    short: "Unterarm gegen das Band nach außen drehen – kräftigt die Außenrotatoren und schützt die Schulter.",
    setup: "Stell dich seitlich zur Tür, ca. einen Schritt entfernt. Für den rechten Arm zeigt die linke Schulter zur Tür – das Band läuft vor dem Bauch zur Tür. Kleines gerolltes Handtuch zwischen Ellbogen und Rumpf, Ellbogen 90° gebeugt.",
    steps: ["Band auf Ellbogenhöhe in der Tür, seitlich zur Tür stellen.", "Handtuch unter den Ellbogen, Ellbogen 90°, Hand vor dem Bauch.", "Dreh den Unterarm nach außen, Ellbogen bleibt am Handtuch.", "Langsam zurück. Erst rechts, dann umdrehen für links."],
    feel: "Du spürst es hinten an der Schulter – nicht vorn.",
    labels: true,
    instructions: { 3: "Langsam zurück. Rechts (Zugarm) zuerst, danach links." },
  },
  'er-90-90': {
    short: "Unterarm auf Schulterhöhe gegen das Band nach oben drehen – die Schulterposition des Zugarms.",
    setup: "Stell dich mit dem Gesicht zur Tür, ca. einen Schritt entfernt. Oberarm seitlich auf Schulterhöhe, Ellbogen 90° gebeugt, Unterarm zeigt nach vorn zur Tür. Mit Schulterschutz ersetzt die App diese Übung.",
    steps: ["Band auf Schulterhöhe in der Tür, Gesicht zur Tür.", "Oberarm seitlich auf Schulterhöhe, Ellbogen 90°.", "Dreh den Unterarm nach oben, bis er senkrecht steht.", "Langsam zurück. Erst rechts, dann links."],
    feel: "Du spürst es hinten an der Schulter.",
  },
  'sidelying-er': {
    short: "In Seitlage den Unterarm nach oben drehen – die sanfteste Übung für die Außenrotatoren.",
    setup: "Leg dich auf die linke Seite (für den rechten Arm), Kopf gestützt, Kissen zwischen den Knien. Oberer Ellbogen 90° gebeugt am Körper, Handtuchrolle darunter, der Unterarm liegt vor dem Bauch.",
    steps: ["Seitlage, oberer Ellbogen 90° am Körper, Handtuch darunter.", "Dreh den Unterarm langsam nach oben.", "Der Ellbogen bleibt am Handtuch.", "Langsam zurück. Danach auf die andere Seite legen."],
    feel: "Du spürst es hinten an der oberen Schulter.",
  },
  'face-pull': {
    short: "Band zum Gesicht ziehen und die Hände nach außen drehen – hintere Schulter und Rotatoren in einem.",
    setup: "Stell dich mit dem Gesicht zur Tür, ca. 1–1,5 m entfernt, Füße hüftbreit. Greif die Bandenden mit den Daumen nach hinten. Mit Schulterschutz nimmt die App die tiefe Variante.",
    steps: ["Band über Kopfhöhe in der Tür, Gesicht zur Tür.", "Arme schräg nach oben gestreckt, Daumen zeigen nach hinten.", "Zur Stirn ziehen, Ellbogen hoch, Hände nach hinten drehen.", "Kurz halten, langsam zurück."],
    feel: "Du spürst die hintere Schulter und den oberen Rücken.",
  },
  'lat-pulldown': {
    short: "Band von oben zur Brust ziehen – kräftigt den breiten Rückenmuskel für einen stabilen Anker.",
    setup: "Stell den Stuhl mit Blick zur Tür ca. 1 m davor. Setz dich aufrecht, Füße flach. Bandenden greifen, Arme schräg nach oben gestreckt. Mit Schulterschutz ersetzt die App diese Übung.",
    steps: ["Band oben in der Tür, Stuhl mit Blick zur Tür davor.", "Bandenden greifen, Arme schräg nach oben gestreckt.", "Schulterblätter nach unten, dann Ellbogen zu den Rippen ziehen.", "Langsam zurück, Schultern bleiben tief."],
    feel: "Du spürst es seitlich am Rücken unter den Achseln.",
  },
  'straight-arm-pulldown': {
    short: "Gestreckte Arme gegen das Band nach unten führen – verbindet Rücken und Rumpf wie im Vollauszug.",
    setup: "Stell dich mit dem Gesicht zur Tür, einen großen Schritt entfernt. Aufrecht, Knie weich, Bandenden in den Händen. Mit Schulterschutz ersetzt die App diese Übung.",
    steps: ["Band oben in der Tür, Gesicht zur Tür, einen Schritt zurück.", "Arme gestreckt schräg nach vorn-oben.", "Zieh die gestreckten Arme bis neben die Oberschenkel.", "Langsam zurück bis Augenhöhe."],
    feel: "Du spürst den breiten Rückenmuskel seitlich und den Bauch.",
  },
  'single-arm-high-row': {
    short: "Im Schießstand mit dem Zugarm auf Gesichtshöhe ziehen – die Auszugsbewegung mit Widerstand.",
    setup: "Stell dich im Schießstand seitlich zur Tür, die linke Schulter (Bogenarm) zeigt zur Tür, ca. 1–1,5 m entfernt. Die rechte Hand greift das Band, der Arm zeigt gestreckt zur Tür. Für die linke Seite umdrehen.",
    steps: ["Band auf Schulterhöhe in der Tür, Bogenarm-Seite zur Tür.", "Rechte Hand greift das Band, Arm zur Tür gestreckt.", "Ellbogen auf Schulterhöhe zurück bis zum Anker an der Kinnlinie.", "Kurz halten, zurück. Danach umdrehen, links ziehen."],
    feel: "Du spürst den Rücken zwischen Schulterblatt und Wirbelsäule.",
  },
  'band-draw-hold': {
    short: "Band wie den Bogen ausziehen und im Anker halten – Haltetraining für den Compound-Schuss.",
    setup: DRAW_SETUP,
    steps: ["Schießstand, die linke Hand hält das Band auf Schulterhöhe.", "Die rechte Hand zieht ruhig in den Anker.", "Rückenspannung halten, ruhig weiteratmen.", "Kontrolliert zurückführen – das Band nie schnappen lassen."],
    feel: "Du spürst den Rücken auf der Zugseite und eine tiefe, feste Bogenschulter.",
  },
  'bow-arm-push': {
    short: "Gestreckten Arm gegen die Wand drücken – ein stabiler Bogenarm wie ein Pfeiler.",
    setup: "Stell dich im Schießstand seitlich zur Wand, die linke Schulter zeigt zur Wand. Abstand ca. eine Armlänge: Der gestreckte linke Arm erreicht die Wand auf Schulterhöhe mit dem Handballen. Für rechts umdrehen.",
    steps: ["Seitlich zur Wand, eine Armlänge Abstand, Arm auf Schulterhöhe.", "Handballen wie am Bogengriff an die Wand.", "Aus der Schulter gegen die Wand drücken, Schulter tief.", "Halten, lösen. Erst links, dann umdrehen für rechts."],
    feel: "Du spürst es unter der Achsel und hinten am Schulterblatt.",
  },
  'mirror-draw': {
    short: "Den Auszug gespiegelt mit links ziehen – gleicht die einseitige Belastung des Bogensports aus.",
    setup: "Stell dich gespiegelt in den Schießstand (rechte Schulter vorn), hüftbreit, Knie weich. Die rechte Hand hält das Band auf Schulterhöhe, die linke zieht. Nimm ein leichteres Band als beim Auszug & Halten.",
    steps: ["Gespiegelter Stand: die rechte Hand hält das Band vorn.", "Die linke Hand zieht ruhig in einen gespiegelten Anker.", "Rückenspannung links halten, ruhig atmen.", "Kontrolliert zurück – das Band nie schnappen lassen."],
    feel: "Du spürst den linken Rücken zwischen Schulterblatt und Wirbelsäule.",
  },
  'pallof-press': {
    short: "Band seitlich, Arme nach vorn schieben und nicht verdrehen lassen – ein stabiler Rumpf für ruhiges Zielen.",
    setup: "Stell dich seitlich zur Tür, ca. 1 m (ein großer Schritt) entfernt, Füße hüftbreit, Knie weich. Halte das Band mit beiden Händen vor dem Brustbein – die Hände bleiben unter Schulterhöhe.",
    steps: ["Band auf Brusthöhe in der Tür, seitlich zur Tür stellen.", "Halte das Band mit beiden Händen vor dem Brustbein.", "Arme langsam nach vorn strecken, 3 s halten, nicht mitdrehen.", "Zurück zur Brust. Danach umdrehen, andere Seite zur Tür."],
    feel: "Du spürst den Bauch, vor allem seitlich – der Rumpf bleibt still.",
  },
  'dead-bug': {
    short: "In Rückenlage die Arme gegen das Band halten und die Ferse ausgleiten lassen – Rumpfkontrolle ohne Kniebelastung.",
    setup: "Leg dich auf den Rücken auf die Matte, Kopf zur Tür, ca. 1 m vor der Tür. Bandenden greifen, Arme gestreckt Richtung Decke, Füße aufgestellt, unterer Rücken flach. Mit Schulterschutz ersetzt die App diese Übung.",
    steps: ["Band unten in der Tür, Rückenlage mit dem Kopf zur Tür.", "Arme gestreckt zur Decke halten, Rücken flach am Boden.", "Ein Bein lang ausgleiten lassen, die Ferse bleibt am Boden.", "Zurück, dann das andere Bein."],
    feel: "Du spürst den Bauch fest arbeiten, der Rücken bleibt am Boden.",
  },
  'side-plank-elevated': {
    short: "Seitstütz mit erhöhtem Unterarm – seitliche Rumpfkraft ganz ohne Knien.",
    setup: "Stell dich seitlich zur Wand. Leg den Unterarm auf Schulterhöhe an die Wand, Ellbogen unter der Schulter. Die Füße stehen ca. einen Schritt von der Wand weg, Beine gestreckt. Ab Stufe 3: Unterarm auf einer stabilen Tischkante – nie auf einem Stuhl mit Rollen.",
    steps: ["Seitlich zur Wand, Unterarm an der Wand, Füße einen Schritt weg.", "Beine gestreckt, der Körper bildet eine gerade Linie.", "Becken nach vorn schieben und halten.", "Lösen, umdrehen, andere Seite."],
    feel: "Du spürst die seitliche Bauchmuskulatur auf der wandnahen Seite.",
    levelLabels: { 2: "Tischkante · 3 × 20 s je Seite", 3: "Tischkante · 3 × 30 s je Seite" },
    instructions: { 1: "Später: Füße weiter weg von der Wand bzw. Unterarm auf einer stabilen Tischkante (nie auf einem Stuhl mit Rollen abstützen)." },
  },
  'thoracic-extension-chair': {
    short: "Oberen Rücken über die Stuhllehne strecken – öffnet die Brust für einen aufrechten Auszug.",
    setup: "Setz dich aufrecht auf einen festen Stuhl mit niedriger Lehne (keine Rollen). Hände hinter den Kopf, Ellbogen zeigen nach vorn.",
    steps: ["Setz dich an die niedrige Lehne, Hände hinter den Kopf.", "Bauch leicht fest, Ellbogen zeigen nach vorn.", "Streck den oberen Rücken über die Lehne nach hinten.", "Kurz halten, langsam zurück."],
    feel: "Du spürst eine Dehnung im oberen Rücken und vorn an der Brust.",
  },
  'expansion-drill': {
    short: "Im Anker die Rückenspannung weiter aufbauen und das Lösen nur andeuten – Schussablauf ohne Bogen.",
    setup: DRAW_SETUP,
    steps: ["Wie beim Auszug & Halten in den Anker ziehen, 2 s zielen.", "Zugschulterblatt langsam weiter zur Wirbelsäule schieben, 3–5 s.", "Lösen nur andeuten: Ellbogen folgt 2–3 cm nach hinten.", "Band kontrolliert zurückführen, nie loslassen."],
    feel: "Du spürst die Spannung zwischen den Schulterblättern langsam zunehmen.",
  },
  'push-pull-iso': {
    short: "Bogenarm drückt gegen die Wand, Zugarm zieht das Band in den Anker – beide Seiten halten gleichzeitig.",
    setup: "Stell dich im Schießstand seitlich zur Wand bzw. zum Türrahmen, die linke Schulter zeigt dorthin. Abstand ca. eine Armlänge: Der gestreckte linke Arm erreicht Wand oder Rahmen auf Schulterhöhe. Das Band ist auf Schulterhöhe in der Tür befestigt, die rechte Hand greift es.",
    steps: ["Schießstand seitlich zur Wand, Band auf Schulterhöhe in der Tür.", "Die linke Hand drückt mit gestrecktem Arm gegen Wand oder Rahmen.", "Die rechte Hand zieht das Band in den Anker – halten.", "Beides kontrolliert lösen."],
    feel: "Du spürst den ganzen Schultergürtel – vorn drücken, hinten ziehen.",
  },
  'endurance-series': {
    short: "Passen zu 6 „Pfeilen“ ausziehen und halten – Haltekraft für lange Turniere.",
    setup: `${DRAW_SETUP} Eine Passe = 6 Pfeile.`,
    steps: ["Ausziehen, ankern, 10 s zielen und halten.", "Kontrolliert zurück, 20 s Pause – das war ein Pfeil.", "6 Pfeile = eine Passe, danach 2 min Pause.", "Jeden Pfeil mit voller Routine wie einen echten Schuss."],
    feel: "Du spürst gegen Ende der Passe den Rücken müde werden – die Form bleibt sauber.",
    description: "Passen zu 6 „Pfeilen“: ausziehen, 10 s halten, 20 s Pause – Haltekraft für lange Turniere.",
    instructions: { 1: "Pro Pfeil: ausziehen, ankern, 10 s zielen und halten, kontrolliert zurück." },
  },
  'doorway-pec-stretch': {
    short: "Unterarm an den Türrahmen, sanft nach vorn lehnen – dehnt die Brust als Gegenpol zur Zugarbeit.",
    setup: "Stell dich in den Türrahmen, kleine Schrittstellung. Leg den Unterarm auf Schulterhöhe an den Rahmen, Ellbogen 90° gebeugt. Mit Schulterschutz nimmt die App die tiefe Variante.",
    steps: ["Unterarm auf Schulterhöhe an den Türrahmen, Ellbogen 90°.", "Mach einen kleinen Schritt nach vorn.", "Halte bei sanftem Ziehen in der Brust, ruhig atmen.", "Dann umdrehen, der andere Arm."],
    feel: "Du spürst ein sanftes Ziehen vorn in der Brust – nicht vorn in der Schulter.",
  },
  'hamstring-stretch-seated': {
    short: "Mit geradem Rücken vorneigen – dehnt sanft die Rückseite des Oberschenkels.",
    setup: "Setz dich auf die vordere Kante des Stuhls. Ein Bein lang nach vorn, Ferse am Boden, Zehen zu dir. Das andere Bein ist angewinkelt.",
    steps: ["Vorn auf den Stuhl, ein Bein lang, Ferse am Boden.", "Hände auf den anderen Oberschenkel, Rücken gerade.", "Mit geradem Rücken aus der Hüfte vorneigen und halten.", "Dann die Beine tauschen."],
    feel: "Du spürst ein Ziehen hinten im Oberschenkel – nicht in der Kniekehle.",
  },
  'calf-stretch-wall': {
    short: "Hinteres Bein lang, Ferse am Boden – lockert die Wade nach dem Training.",
    setup: "Stell dich mit dem Gesicht zur Wand, ca. eine Armlänge (60 cm) entfernt. Hände auf Brusthöhe an die Wand – nicht höher. Ein Bein macht einen großen Schritt nach hinten.",
    steps: ["Gesicht zur Wand, Hände auf Brusthöhe an die Wand.", "Ein Bein nach hinten, Ferse unten, Fußspitze nach vorn.", "Vorderes Knie leicht beugen, Becken zur Wand schieben – halten.", "Dann die Beine tauschen."],
    feel: "Du spürst ein Ziehen in der Wade des hinteren Beins.",
    instructions: { 0: "Mit Gesicht zur Wand, Hände auf Brusthöhe an die Wand." },
  },
  'breathing-reset': {
    short: "Atmen im 4-7-8-Rhythmus – beruhigt Puls und Nervensystem zum Abschluss.",
    setup: "Leg dich auf den Rücken auf die Matte. Beine lang oder aufgestellt (ein Kissen unter den Knien ist erlaubt). Hände auf den Bauch.",
    steps: ["4 Sekunden durch die Nase einatmen, der Bauch hebt sich.", "7 Sekunden die Luft locker anhalten, nicht pressen.", "8 Sekunden langsam durch den Mund ausatmen.", "Bei Schwindel einfach normal weiteratmen."],
    feel: "Du spürst, wie Puls und Atmung ruhiger werden.",
  },
  'row-technique-warmup': {
    short: "Locker einrudern und die Reihenfolge Beine – Körper – Arme aufbauen.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "Aufbau: nur Arme, dann Oberkörper, dann halber und ganzer Beinweg."],
    feel: ROW_FEEL,
  },
  'row-steady': {
    short: "Gleichmäßig rudern im Gesprächstempo – Ausdauer ohne Stoßbelastung fürs Knie.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "Gleichmäßig rudern – du kannst dich noch unterhalten (RPE 4–5)."],
    feel: ROW_FEEL,
  },
  'row-intervals': {
    short: "Zügige und lockere Minuten im Wechsel – trainiert Herz und Kreislauf effizient.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "Zügig = mehr Druck pro Schlag, locker = entspannt weiterrudern."],
    feel: ROW_FEEL,
  },
  'row-endurance': {
    short: "Längere ruhige Einheit – sichert die Grundausdauer für die Zeit nach der OP.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "Ruhig und gleichmäßig rudern, RPE 4–5."],
    feel: ROW_FEEL,
  },
  'row-cooldown': {
    short: "Ganz locker ausrudern – Puls und Atmung beruhigen.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "Ganz locker ausrudern und die Atmung beruhigen."],
    feel: "Du spürst, wie Puls und Atmung langsam ruhiger werden.",
  },
  'chair-dip': {
    short: "Mit den Armen am Stuhl stützen und ein Stück absenken – Trizeps und Schulterstütz für die Krückenzeit.",
    setup: "Stell einen festen Stuhl ohne Rollen mit der Lehne an die Wand. Setz dich vorn auf die Kante, Hände neben dem Gesäß an der Kante, Finger nach vorn. Füße hüftbreit, Knie ca. 90°.",
    steps: ["Hände neben dem Gesäß an die Stuhlkante, Finger nach vorn.", "Schieb das Gesäß nach vorn von der Sitzfläche.", "Beug die Ellbogen nach hinten, nur ein kleines Stück absenken.", "Über die Handballen hochdrücken, Schultern bleiben tief."],
    feel: "Du spürst die Rückseite der Oberarme arbeiten.",
  },
  'band-triceps-extension': {
    short: "Arme gegen das Band nach unten strecken – Kraft zum Abstützen auf Krücken.",
    setup: "Stell oder setz dich mit dem Gesicht zur Tür, ca. einen großen Schritt entfernt. Bandenden in beiden Händen, Oberarme eng am Körper, Ellbogen ca. 90° gebeugt. Die Arme bleiben unten am Körper.",
    steps: ["Band oben in der Tür, Gesicht zur Tür, Enden in den Händen.", "Oberarme eng am Körper, Ellbogen 90° gebeugt.", "Streck die Unterarme nach unten, bis die Arme gerade sind.", "Langsam zurück bis 90°."],
    feel: "Du spürst die Rückseite der Oberarme.",
  },
  'seated-press-up': {
    short: "Mit den Armen das Gesäß vom Stuhl heben und halten – genau die Kraft für Krücken.",
    setup: "Setz dich auf einen festen Stuhl mit Armlehnen (nie mit Rollen). Alternativ: zwei stabile Bücherstapel neben dem Gesäß. Hände auf die Armlehnen, Ellbogen leicht gebeugt.",
    steps: ["Hände auf die Armlehnen, Ellbogen leicht gebeugt.", "Schultern aktiv nach unten drücken.", "Arme strecken, bis das Gesäß knapp abhebt – halten.", "Langsam wieder absetzen."],
    feel: "Du spürst Oberarme und die Muskeln unter den Schulterblättern.",
  },
  'right-leg-sit-to-stand': {
    short: "Mit Schwerpunkt rechts aufstehen – das gesunde Bein trägt dich später durch die Krückenzeit.",
    setup: "Setz dich auf einen festen Stuhl ohne Rollen (Lehne an der Wand). Rechter Fuß unter dem Knie, linker Fuß eine halbe Fußlänge weiter vorn. Arme vor der Brust gekreuzt.",
    steps: ["Rechter Fuß unter dem Knie, linker Fuß etwas vorn.", "Oberkörper vor, Gewicht deutlich aufs rechte Bein.", "Über das rechte Bein aufstehen, links tippt nur leicht.", "Langsam (3 s) wieder hinsetzen."],
    feel: "Du spürst vor allem den rechten Oberschenkel und das rechte Gesäß.",
  },
  'single-leg-stance-reach': {
    short: "Auf dem linken Bein stehen und mit dem Arm reichen – Kniekontrolle unter Ablenkung.",
    setup: "Stell dich seitlich neben eine Wand, ca. eine Unterarmlänge entfernt, die Hand in Reichweite. Stell dich aufs linke Bein, Knie ganz leicht gebeugt. Mit Schulterschutz nimmt die App den einfachen Einbeinstand.",
    steps: ["Seitlich an die Wand, aufs linke Bein stellen.", "Knie leicht gebeugt, nicht durchgedrückt.", "Rechten Arm langsam nach vorn, zur Seite und hoch reichen.", "Halten, dann den Arm wechseln."],
    feel: "Du spürst Fuß, Oberschenkel und Gesäß links ausgleichen.",
  },
  'patella-mobilization': {
    short: "Kniescheibe sanft in alle Richtungen schieben – entlastet bei Druck oberhalb der Kniescheibe.",
    setup: "Setz dich im Langsitz auf die Matte, den Rücken angelehnt oder hinten abgestützt. Linkes Bein gestreckt und ganz locker.",
    steps: ["Langsitz, linkes Bein lang und ganz locker.", "Fass die Kniescheibe mit Daumen und Zeigefinger von oben.", "Langsam nach unten schieben, halten, zurück – 10 ×.", "Dann nach oben, innen und außen, je 10 ×."],
    feel: "Du spürst eine sanfte Dehnung rund um die Kniescheibe – höchstens leichter Schmerz.",
  },
  'glute-set': {
    short: "Gesäß im Liegen fest anspannen – hält die Hüfte aktiv, ganz ohne Kniebelastung.",
    setup: "Leg dich auf den Rücken auf die Matte, Beine lang, Arme neben dem Körper.",
    steps: ["Rückenlage, beide Beine lang.", "Kneif beide Gesäßhälften fest zusammen.", "Halten und ruhig weiteratmen.", "Locker lassen."],
    feel: "Du spürst das Gesäß hart werden, das Becken hebt sich minimal.",
  },
  'right-leg-band-press': {
    short: "Das gesunde rechte Bein gegen das Band strecken – Kraft erhalten, links bleibt entlastet.",
    setup: "Leg dich auf den Rücken auf die Matte, linkes Bein lang und locker. Band um die rechte Fußsohle, Enden in beiden Händen, rechtes Knie zur Brust.",
    steps: ["Rückenlage, Band um die rechte Fußsohle, Knie zur Brust.", "Streck das rechte Bein langsam gegen das Band.", "Kurz halten, das Knie ist fast gestreckt.", "Kontrolliert zurück zur Brust."],
    feel: "Du spürst den rechten vorderen Oberschenkel und das Gesäß.",
  },
  'leg-swing-front': {
    short: "Bein locker vor und zurück pendeln – macht die Hüfte warm, ohne zu dehnen.",
    setup: "Stell dich seitlich neben die Wand, ca. eine Unterarmlänge entfernt. Die wandnahe Hand liegt auf Brusthöhe an der Wand. Standbein leicht gebeugt.",
    steps: ["Seitlich an die Wand, nahe Hand auf Brusthöhe an der Wand.", "Standbein leicht gebeugt, Oberkörper aufrecht.", "Freies Bein locker vor und zurück pendeln, kleiner Bogen.", "Nach der Zeit umdrehen und das andere Bein pendeln."],
    feel: "Du spürst die Hüfte locker und warm werden.",
    instructions: { 0: "Seitlich neben die Wand stellen, die nahe Hand auf Brusthöhe an die Wand." },
  },
  'leg-swing-side': {
    short: "Bein vor dem Körper seitlich pendeln – macht die Hüfte innen und außen warm.",
    setup: "Stell dich mit dem Gesicht zur Wand, ca. eine Armlänge entfernt. Beide Hände auf Brusthöhe an die Wand. Standbein leicht gebeugt.",
    steps: ["Gesicht zur Wand, beide Hände auf Brusthöhe an der Wand.", "Standbein leicht gebeugt.", "Freies Bein seitlich nach außen und wieder nach innen pendeln.", "Nach der Zeit die Beine tauschen."],
    feel: "Du spürst die Hüfte innen und außen warm werden.",
  },
  'hip-circles-standing': {
    short: "Becken in ruhigen Kreisen bewegen – lockert Hüfte und unteren Rücken.",
    setup: "Stell dich hüftbreit hin, Knie weich, Hände an die Hüften.",
    steps: ["Hüftbreit stehen, Knie weich, Hände an die Hüften.", "Becken langsam kreisen: vor, Seite, zurück, andere Seite.", "Nach der halben Zeit die Richtung wechseln.", "Beide Füße bleiben am Boden."],
    feel: "Du spürst Hüfte und unteren Rücken locker werden.",
  },
  'ankle-circles-seated': {
    short: "Sprunggelenk im Sitzen kreisen – macht Füße und Waden warm.",
    setup: "Setz dich aufrecht auf den Stuhl. Ein Bein lang nach vorn, Ferse am Boden.",
    steps: ["Setz dich hin, ein Bein lang, Ferse am Boden.", "Kreise den Fuß langsam in großen Kreisen.", "Dann Zehen abwechselnd zu dir ziehen und wegstrecken.", "Nach der Zeit das andere Bein."],
    feel: "Du spürst Sprunggelenk und Wade locker werden.",
  },
  'band-dislocate': {
    short: "Band weit gegriffen über den Kopf führen – öffnet Brust und Schultern.",
    setup: "Stell dich aufrecht hin oder setz dich. Greif ein leichtes Band (gelb) sehr weit, Arme gestreckt vor dem Körper. Mit Schulterschutz ersetzt die App diese Übung.",
    steps: ["Leichtes Band sehr weit greifen, Arme gestreckt vorn.", "Arme langsam über den Kopf und – schmerzfrei – nach hinten.", "Auf demselben Weg zurück nach vorn.", "Zwickt es: Griff weiter machen."],
    feel: "Du spürst eine sanfte Dehnung vorn an Brust und Schultern.",
  },
  'mobility-flow-short': {
    short: "Kompakte Mobilisation in 2 Minuten – jeder Abschnitt wird angesagt.",
    setup: "Stell dich seitlich neben eine Wand, ca. eine Unterarmlänge entfernt, die nahe Hand an der Wand. Die App sagt jeden Abschnitt an.",
    steps: ["Beinpendel an der Wand: 15 s rechts, 15 s links.", "Becken kreisen, beide Füße am Boden (30 s).", "Schultern rückwärts kreisen, dann Arme heben (30 s).", "Rumpfdrehung im Stand, Arme vor der Brust (30 s)."],
    feel: "Du spürst Hüfte, Rücken und Schultern warm werden.",
  },
  'mobility-flow-seated': {
    short: "Kompakte Mobilisation im Sitzen in 2 Minuten – passend für die Entlastungsphase.",
    setup: "Setz dich aufrecht auf den Stuhl, linkes Bein lang nach vorn. Die App sagt jeden Abschnitt an.",
    steps: ["Fußpumpe: Zehen zu dir und weg (30 s).", "Schultern rückwärts kreisen (30 s).", "Wirbelsäulen-Welle: Rücken rund, dann aufrichten (30 s).", "Rumpfdrehung, Arme vor der Brust verschränkt (30 s)."],
    feel: "Du spürst Füße, Rücken und Schultern warm werden – das linke Knie bleibt entlastet.",
  },
  'stretch-flow-short': {
    short: "Kompaktes Dehnen in 2 Minuten – jeder Abschnitt wird angesagt.",
    setup: "Stell dich in die Nähe von Wand und Türrahmen. Für Hüftbeuger und Wade: Gesicht zur Wand, ca. eine Armlänge entfernt, Hände auf Brusthöhe. Für die Brust stellst du dich in den Türrahmen. Die App sagt jeden Abschnitt an.",
    steps: ["Hüftbeuger: kurze Schrittstellung, Becken aufrichten, 20 s je Seite.", "Wade an der Wand: 15 s je Seite.", "Brust im Türrahmen: 20 s.", "Unterarme 15 s, dann hintere Schulter 15 s."],
    feel: "Du spürst nacheinander sanftes Ziehen in Hüfte, Wade, Brust und Armen.",
  },
  'stretch-flow-seated': {
    short: "Kompaktes Dehnen im Sitzen in 2 Minuten – passend für die Entlastungsphase.",
    setup: "Setz dich aufrecht auf den Stuhl, linkes Bein lang nach vorn. Die App sagt jeden Abschnitt an. Mit Schulterschutz nimmt die App die schulterfreundliche Variante.",
    steps: ["Brust: Hände hinter den Kopf, Ellbogen nach hinten (20 s).", "Seitdehnung: Arm über den Kopf, zur Seite neigen.", "Hintere Schulter: Arm vor der Brust, je Seite 15 s.", "Unterarme, dann Nacken: Ohr Richtung Schulter."],
    feel: "Du spürst sanftes Ziehen in Brust, Flanken, Schultern und Nacken.",
  },
  'hip-flexor-stretch-standing': {
    short: "Becken aufrichten in kurzer Schrittstellung – dehnt den Hüftbeuger, ohne das Knie tief zu beugen.",
    setup: "Stell dich seitlich neben eine Wand, ca. eine Unterarmlänge entfernt, die nahe Hand an der Wand. Kurze Schrittstellung: Der hintere Fuß steht ca. eine Fußlänge hinter dem vorderen.",
    steps: ["Seitlich an der Wand, kurze Schrittstellung, Hand an der Wand.", "Vorderes Knie leicht beugen, hinteres fast gestreckt.", "Po anspannen, Becken unten nach vorn einrollen – halten.", "Dann umdrehen, das andere Bein nach hinten."],
    feel: "Du spürst ein Ziehen vorn an der Hüfte des hinteren Beins.",
  },
  'hip-flexor-stretch-supine': {
    short: "Rechtes Knie zur Brust, linkes Bein bleibt lang – dehnt den linken Hüftbeuger ohne Kniebeugung links.",
    setup: "Leg dich auf den Rücken (Bett oder Matte), beide Beine lang.",
    steps: ["Rückenlage, beide Beine lang.", "Zieh das rechte Knie mit beiden Händen zur Brust.", "Das linke Bein bleibt gestreckt liegen und sinkt locker ab.", "Halten, ruhig atmen, langsam lösen."],
    feel: "Du spürst ein leichtes Ziehen vorn an der linken Hüfte.",
  },
  'hamstring-stretch-band': {
    short: "Gestrecktes Bein mit dem Band anheben – dehnt die Oberschenkelrückseite.",
    setup: "Leg dich auf den Rücken auf die Matte. Band um eine Fußsohle, Enden in beiden Händen. Das andere Bein liegt lang.",
    steps: ["Rückenlage, Band um die Fußsohle, Enden in den Händen.", "Heb das Bein gestreckt an, bis es hinten leicht zieht.", "Das andere Bein bleibt lang liegen – halten.", "Bein langsam ablegen, Band ans andere Bein."],
    feel: "Du spürst ein Ziehen hinten im Oberschenkel – nicht in der Kniekehle.",
  },
  'figure-4-stretch-supine': {
    short: "Knöchel aufs andere Knie legen – dehnt Gesäß und Hüftrotatoren (wichtig für den Bogenstand).",
    setup: "Leg dich auf den Rücken auf die Matte, beide Füße aufgestellt.",
    steps: ["Rückenlage, beide Füße aufgestellt.", "Leg den rechten Knöchel auf das linke Knie.", "Rechtes Knie locker nach außen sinken lassen – halten.", "Seite wechseln: linker Knöchel aufs rechte Knie."],
    feel: "Du spürst ein Ziehen tief im Gesäß.",
  },
  'seated-pec-stretch': {
    short: "Hände hinter den Kopf, Ellbogen öffnen – dehnt die Brust im Sitzen.",
    setup: "Setz dich aufrecht auf die vordere Hälfte des Stuhls. Mit Schulterschutz nimmt die App die tiefe Variante.",
    steps: ["Aufrecht sitzen, Hände locker hinter den Kopf.", "Ellbogen weit nach außen und hinten öffnen.", "Brustbein leicht anheben, halten, ruhig atmen.", "Kurz lösen, dann die zweite Runde."],
    feel: "Du spürst die Brust sanft gedehnt.",
  },
  'lat-side-stretch': {
    short: "Arm über den Kopf, zur Seite neigen – dehnt Latissimus und Flanke.",
    setup: "Setz dich aufrecht auf den Stuhl, beide Sitzbeinhöcker bleiben auf der Sitzfläche. Mit Schulterschutz nimmt die App die tiefe Seitneigung.",
    steps: ["Aufrecht sitzen, den rechten Arm lang über den Kopf.", "Oberkörper sanft nach links neigen.", "Halten, ruhig in die Flanke atmen.", "Dann die Seite wechseln."],
    feel: "Du spürst ein Ziehen seitlich am Rumpf.",
  },
  'cross-body-shoulder-stretch': {
    short: "Arm vor der Brust heranziehen – dehnt die hintere Schulter.",
    setup: "Setz dich aufrecht hin (oder stell dich hin). Mit Schulterschutz nimmt die App eine tiefe Variante.",
    steps: ["Rechten Arm waagerecht vor die Brust führen.", "Mit der linken Hand oberhalb des Ellbogens sanft heranziehen.", "Die Schulter bleibt tief – halten.", "Dann die Arme tauschen."],
    feel: "Du spürst ein Ziehen hinten an der Schulter.",
  },
  'forearm-flexor-stretch': {
    short: "Finger sanft zurückziehen – entlastet Zughand und Bogenhand.",
    setup: "Setz dich aufrecht hin. Ein Arm gestreckt schräg nach vorn-unten (unter Schulterhöhe), Handfläche zeigt nach vorn, Finger nach unten.",
    steps: ["Arm gestreckt schräg nach vorn-unten, Handfläche nach vorn.", "Mit der anderen Hand die Finger sanft zu dir ziehen.", "Halten, solange es innen am Unterarm zieht.", "Dann die Hände tauschen."],
    feel: "Du spürst ein Ziehen an der Innenseite des Unterarms.",
    instructions: { 0: "Aufrecht sitzen, einen Arm gestreckt schräg nach vorn-unten (unter Schulterhöhe), Handfläche zeigt nach vorn, Finger nach unten." },
  },
  'neck-side-stretch': {
    short: "Ohr Richtung Schulter – löst den oberen Nacken, der beim Auszug gern mitarbeitet.",
    setup: "Setz dich aufrecht hin. Die linke Hand greift unter die Sitzfläche oder hängt locker. Mit Schulterschutz nimmt die App die Variante ohne Hand am Kopf.",
    steps: ["Aufrecht sitzen, linke Hand hängt locker oder greift den Sitz.", "Kopf sanft nach rechts neigen, Blick nach vorn.", "Optional rechte Hand leicht auf den Kopf – nicht ziehen.", "Halten, langsam zurück, Seite wechseln."],
    feel: "Du spürst ein Ziehen seitlich am Hals bis zur Schulter.",
  },
  'row-warmup-10': {
    short: "10 Minuten locker rudern – wärmt den ganzen Körper vor dem Krafttraining auf.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "Erst 2 min Technik-Aufbau, dann 8 min locker (RPE 3–4)."],
    feel: ROW_FEEL,
  },
  'row-finisher-short': {
    short: "Kurzer Ruder-Finisher mit zügigen 30-s-Abschnitten – nur bei grüner Knie-Ampel.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "5 Runden: 30 s zügig, 30 s locker – Technik vor Tempo."],
    feel: "Du spürst den Puls in den zügigen Abschnitten deutlich steigen.",
  },
  'row-finisher-intervals': {
    short: "Ruder-Intervalle 1:1 nach dem Krafttraining – nur bei grüner Knie-Ampel.",
    setup: ROW_SETUP,
    steps: [...ROW_STEPS, "1 min zügig, 1 min locker im Wechsel – Technik vor Tempo."],
    feel: "Du spürst den Puls in den zügigen Minuten deutlich steigen.",
  },
  'row-long': {
    short: "Lange, ruhige Rudereinheit – viel Grundlagenausdauer bei wenig Kniebelastung.",
    setup: `${ROW_SETUP} Trinkflasche bereitstellen.`,
    steps: [...ROW_STEPS, "Lang und ruhig rudern, Schlagzahl 18–22, RPE 4–5."],
    feel: ROW_FEEL,
  },
  'sling-row': {
    short: "Schräg zurücklehnen und die Brust zu den Griffen ziehen – Rücken und Schulterblätter mit Körpergewicht.",
    setup: `${SLING} Stell dich mit dem Gesicht zur Tür, Füße hüftbreit ca. einen Schritt vor der Tür. Griffe fassen, die Hände bleiben unter Schulterhöhe.`,
    steps: ["Gesicht zur Tür, Griffe fassen, Füße hüftbreit.", "Mit gestreckten Armen zurücklehnen, der Körper bleibt gerade.", "Schulterblätter zurück, dann Ellbogen eng zur Brust ziehen.", "Kurz halten, langsam zurück in die Streckung."],
    feel: "Du spürst den Rücken zwischen den Schulterblättern.",
  },
  'sling-face-pull': {
    short: "Griffe zur Stirn ziehen und nach außen drehen – hintere Schulter und Rotatoren.",
    setup: `${SLING} Stell dich mit dem Gesicht zur Tür, ca. einen Schritt davor. Griffe mit den Daumen nach hinten fassen. Mit Schulterschutz nimmt die App die tiefe Variante.`,
    steps: ["Gesicht zur Tür, leicht zurücklehnen, Arme schräg nach oben.", "Hände zur Stirn ziehen, Ellbogen hoch und weit.", "Am Ende die Hände nach hinten-oben drehen.", "Kurz halten, kontrolliert zurück."],
    feel: "Du spürst hintere Schulter und oberen Rücken.",
  },
  'sling-y-raise': {
    short: "Mit gestreckten Armen in ein Y ziehen – unterer Trapez für eine tiefe Schulter.",
    setup: `${SLING} Stell dich mit dem Gesicht zur Tür, ca. einen Schritt davor, Griffe vor der Brust. Mit Schulterschutz ersetzt die App diese Übung.`,
    steps: ["Gesicht zur Tür, Griffe vor der Brust, leicht zurücklehnen.", "Arme gestreckt schräg nach oben in ein Y führen.", "Schultern tief, kurz halten.", "Langsam zurück."],
    feel: "Du spürst es unter den Schulterblättern.",
  },
  'sling-t-raise': {
    short: "Arme seitlich öffnen, bis der Körper ein T bildet – wie ein Pull-Apart mit Körpergewicht.",
    setup: `${SLING} Stell dich mit dem Gesicht zur Tür, ca. einen Schritt davor, Griffe vor der Brust. Mit Schulterschutz nimmt die App die tiefe Variante.`,
    steps: ["Gesicht zur Tür, Griffe vor der Brust, leicht zurücklehnen.", "Arme fast gestreckt seitlich öffnen, bis ein T entsteht.", "Schulterblätter zusammen, kurz halten.", "Langsam zurück."],
    feel: "Du spürst es zwischen den Schulterblättern.",
  },
  'sling-rear-delt-fly': {
    short: "Mit weichen Ellbogen nach hinten-außen öffnen – hintere Schulter und mittlerer Rücken.",
    setup: `${SLING} Stell dich mit dem Gesicht zur Tür, ca. einen Schritt davor, Griffe vor der Brust, Ellbogen weich.`,
    steps: ["Gesicht zur Tür, Griffe vor der Brust, Ellbogen weich.", "Leicht zurücklehnen, der Körper bleibt gerade.", "Arme im weiten Bogen nach außen-hinten öffnen.", "Kurz halten, kontrolliert zurück."],
    feel: "Du spürst die hintere Schulter.",
  },
  'sling-single-arm-row': {
    short: "Wie der Auszug: Zughand zieht den Griff bis zum Anker – mit dem eigenen Körpergewicht.",
    setup: `${SLING} Fass beide Gurte zu einem Griff zusammen oder nutze nur einen. Stell dich im Schießstand seitlich zur Tür, die linke Schulter zeigt zur Tür, Füße schulterbreit. Für die linke Seite umdrehen.`,
    steps: ["Schießstand seitlich zur Tür, die rechte Hand am Griff.", "Leicht zurücklehnen, der linke Arm zeigt lang nach vorn.", "Rechten Ellbogen zurückziehen bis zum Anker am Kinn.", "Kurz halten, zurück. Danach umdrehen, links ziehen."],
    feel: "Du spürst den Rücken auf der Zugseite.",
  },
  'sling-plank-forearms': {
    short: "Stehender Unterarmstütz in den Schlaufen – Rumpfkraft ganz ohne Knien.",
    setup: `${SLING} Schlaufen auf Hüfthöhe einstellen. Stell dich mit dem Rücken zur Tür, ca. einen halben Schritt davor, Füße hüftbreit.`,
    steps: ["Rücken zur Tür, Unterarme in die Schlaufen.", "Ellbogen unter den Schultern, Füße hüftbreit am Boden.", "Mit geradem Körper nach vorn lehnen und halten.", "Ruhig atmen, dann aufrichten."],
    feel: "Du spürst den Bauch fest arbeiten.",
  },
  'sling-pallof-press': {
    short: "Seitlich lehnen und die Griffe nach vorn drücken – der Rumpf darf sich nicht drehen.",
    setup: `${SLING} Stell dich seitlich zur Tür, ca. einen Schritt entfernt, Füße hüftbreit. Griffe mit beiden Händen vor dem Brustbein, die Hände bleiben unter Schulterhöhe.`,
    steps: ["Seitlich zur Tür, Griffe vor dem Brustbein.", "Ein kleines Stück von der Tür weg lehnen.", "Arme nach vorn strecken, 3 s halten, nicht mitdrehen.", "Zurück zur Brust. Danach umdrehen, andere Seite."],
    feel: "Du spürst die seitlichen Bauchmuskeln.",
  },
  'sling-standing-rollout': {
    short: "Im Stand nach vorn ausrollen – Bauchmuskeln gegen das Hohlkreuz.",
    setup: `${SLING} Stell dich mit dem Rücken zur Tür, Füße hüftbreit, Griffe mit gestreckten Armen vor der Brust. Mit Schulterschutz ersetzt die App diese Übung.`,
    steps: ["Rücken zur Tür, Griffe vor der Brust, leicht vorlehnen.", "Arme gestreckt langsam nach vorn-oben führen.", "Der Körper folgt nur, solange der Rumpf gerade bleibt.", "Mit festem Bauch zurückziehen."],
    feel: "Du spürst den Bauch stark arbeiten.",
  },
  'sling-assisted-mini-squat': {
    short: "Mini-Kniebeuge mit Halt an den Griffen – kontrolliert und knieschonend.",
    setup: `${SLING} Stell dich mit dem Gesicht zur Tür, ca. einen Schritt davor, Füße hüftbreit. Griffe mit leicht gestreckten Armen halten.`,
    steps: ["Gesicht zur Tür, Griffe halten, Füße hüftbreit.", "Gesäß nach hinten setzen, Knie über den Zehen.", "Nur bis 45–60° beugen, kurz halten.", "Über die Fersen aufrichten, die Arme helfen nur wenig."],
    feel: "Du spürst Oberschenkel und Gesäß – das Knie bleibt schmerzarm.",
  },
  'sling-heel-bridge': {
    short: "Fersen in den Schlaufen, Becken heben – Gesäß und Beinbeuger bei fast gestreckten Knien.",
    setup: `${SLING} Schlaufen ca. 30–40 cm über dem Boden einstellen. Leg dich auf den Rücken auf die Matte, Füße zur Tür, Kopf von der Tür weg. Beide Fersen in die Fußschlaufen.`,
    steps: ["Rückenlage, Fersen in den Schlaufen, Knie leicht gebeugt.", "Arme seitlich auf den Boden.", "Gesäß anspannen, Becken heben bis zur geraden Linie.", "Kurz halten, langsam absenken."],
    feel: "Du spürst Gesäß und Rückseite der Oberschenkel.",
  },
  'sling-triceps-press': {
    short: "Aus gebeugten Ellbogen die Arme strecken – Trizeps für die Krücken.",
    setup: `${SLING} Stell dich mit dem Rücken zur Tür, Füße hüftbreit, Griffe neben der Stirn, Körper gerade nach vorn gelehnt. Mit Schulterschutz ersetzt die App diese Übung.`,
    steps: ["Rücken zur Tür, Griffe neben der Stirn, vorlehnen.", "Ellbogen zeigen nach vorn-oben.", "Nur die Unterarme bewegen: Arme strecken.", "Langsam zurück, Ellbogen bleiben eng."],
    feel: "Du spürst die Rückseite der Oberarme.",
  },
  'sling-dip-assisted': {
    short: "Zwischen den Gurten stützen und etwas absenken – Trizeps und tiefe Schultern wie auf Krücken.",
    setup: `${SLING} Gurte kurz einstellen, die Griffe hängen neben den Hüften. Stell dich mit dem Rücken zur Tür zwischen die Gurte. Beine lang nach vorn, Fersen am Boden.`,
    steps: ["Rücken zur Tür, Griffe neben den Hüften, Arme gestreckt.", "Beine lang nach vorn, die Fersen bleiben am Boden.", "Ellbogen nach hinten beugen, nur ein Stück absenken.", "Nach unten drücken und die Arme wieder strecken."],
    feel: "Du spürst die Rückseite der Oberarme.",
  },
  'sling-push-up-incline': {
    short: "Schräge Liegestütze in den Griffen – Brust, Trizeps und Serratus für das Abstützen.",
    setup: `${SLING} Stell dich mit dem Rücken zur Tür, Füße hüftbreit, Griffe auf Brusthöhe, Arme gestreckt. Körper gerade nach vorn lehnen. Mit Schulterschutz nimmt die App den Wand-Liegestütz.`,
    steps: ["Rücken zur Tür, Griffe auf Brusthöhe, nach vorn lehnen.", "Ellbogen 45° beugen, Brust zwischen die Hände senken.", "Kräftig zurückdrücken.", "Oben die Schulterblätter leicht auseinanderschieben."],
    feel: "Du spürst Brust, Oberarme und seitlich den Brustkorb.",
  },
  'box-squat-bed-edge': {
    short: "Kontrolliert zur Bettkante absitzen und aufstehen – wie Aufstehen vom Stuhl, ohne Rollen.",
    setup: "Stell dich mit dem Rücken vor eine feste Bett- oder Sofakante, die Kante berührt fast die Waden. Füße hüftbreit, Arme vor der Brust gekreuzt. Am Anfang ein Kissen auf die Kante.",
    steps: ["Rücken zur Bettkante, Füße hüftbreit, Arme vor der Brust.", "Gesäß nach hinten, langsam (3 s) zur Kante absitzen.", "Nur kurz antippen, nicht zusammensacken.", "Über die Fersen aufstehen, oben Gesäß anspannen."],
    feel: "Du spürst Oberschenkel und Gesäß arbeiten.",
  },
  'hamstring-bridge-step': {
    short: "Fersen auf der Stufe, Becken heben – Beinbeuger und Gesäß bei fast gestrecktem Knie.",
    setup: "Leg dich auf den Rücken vor die Stufe auf die Matte. Beide Fersen auf die Stufe, Knie nur leicht gebeugt (ca. 20–30°). Arme neben dem Körper. Stufe 3: links stärker drücken. Stufe 4: nur links, das rechte Bein ist gestreckt in der Luft.",
    steps: ["Rückenlage, beide Fersen auf die Stufe.", "Knie leicht gebeugt, Fersen in die Stufe drücken.", "Becken heben bis zur geraden Linie.", "Langsam absenken."],
    feel: "Du spürst die Rückseite der Oberschenkel und das Gesäß.",
  },
  'thoracic-extension-floor': {
    short: "Oberen Rücken über eine Handtuchrolle strecken – die Arme bleiben unten.",
    setup: "Roll ein großes Handtuch fest zusammen. Leg dich auf den Rücken auf die Matte, die Rolle quer unter den Schulterblättern. Knie angestellt, Arme vor der Brust gekreuzt, Kopf ggf. auf einem Kissen.",
    steps: ["Rückenlage, Handtuchrolle quer unter den Schulterblättern.", "Knie angestellt, Arme vor der Brust gekreuzt.", "Oberen Rücken ausatmend über die Rolle sinken lassen.", "Kurz halten. Rolle eine Handbreit höher, wiederholen."],
    feel: "Du spürst eine Dehnung im oberen Rücken und vorn an der Brust.",
  },
  'long-sit-row': {
    short: "Im Langsitz das Band zum Bauch ziehen – Rücken und Schulterblätter, ganz ohne Stuhl.",
    setup: "Setz dich im Langsitz mit Blick zur Tür auf die Matte, ca. 1–1,5 m vor der Tür. Beine lang und locker, Rücken aufrecht, Bandenden in den Händen.",
    steps: ["Band unten in der Tür, im Langsitz Blick zur Tür.", "Arme gestreckt nach vorn-unten, Rücken aufrecht.", "Schulterblätter zurück, dann Ellbogen eng nach hinten ziehen.", "Kurz halten, langsam zurück."],
    feel: "Du spürst den mittleren Rücken zwischen den Schulterblättern.",
  },
  'quad-massage-stick': {
    short: "Vorderen Oberschenkel mit dem Massagestab lockern – entlastet das Knie.",
    setup: "Setz dich im Langsitz auf die Matte (oder aufrecht hin), linkes Bein entspannt lang. Leg den Massagestab mit beiden Händen quer auf den vorderen Oberschenkel.",
    steps: ["Linkes Bein lang und locker, Stab quer auf den Oberschenkel.", "Roll langsam von der Mitte bis knapp über die Kniescheibe.", "Sanfter Druck, langsam wieder zurück.", "Nie direkt über die Kniescheibe rollen."],
    feel: "Du spürst angenehmen Druck, der Oberschenkel wird weicher.",
  },
  'quad-self-massage': {
    short: "Vorderen Oberschenkel mit den Händen ausstreichen – lockert und entlastet das Knie.",
    setup: "Setz dich im Langsitz auf die Matte, linkes Bein entspannt lang.",
    steps: ["Langsitz, linkes Bein lang und locker.", "Streich den Oberschenkel mit beiden Händen Richtung Knie aus.", "Knete sanft, oberhalb der Kniescheibe nur ganz leicht.", "Ruhig atmen, der Oberschenkel bleibt locker."],
    feel: "Du spürst Wärme und Entspannung im Oberschenkel.",
  },
  'prone-quad-lengthening-band': {
    short: "Vorderen Oberschenkel in Bauchlage sanft verlängern – ohne tiefe Beugung, ohne Knien.",
    setup: "Leg dich auf den Bauch auf die Matte, Kissen unter dem Bauch, Stirn auf den Händen. Bandschlaufe um den linken Knöchel, die Enden in der rechten Hand neben dem Körper.",
    steps: ["Bauchlage, Bandschlaufe um den linken Knöchel.", "Halte die Bandenden rechts neben dem Körper.", "Unterschenkel mit dem Band nur bis 60–70° heranziehen.", "Halten, ruhig atmen, langsam ablegen."],
    feel: "Du spürst ein leichtes Ziehen vorn am linken Oberschenkel.",
  },
  'scapula-setting': {
    short: "Schulterblätter sanft nach hinten-unten ziehen – die Basis für eine tiefe, stabile Schulter.",
    setup: "Stell dich aufrecht hin oder setz dich. Die Arme hängen locker.",
    steps: ["Aufrecht stehen oder sitzen, Arme hängen locker.", "Schulterblätter sanft nach hinten-unten ziehen.", "Brustbein leicht anheben, halten, ruhig atmen.", "Locker lassen, wiederholen."],
    feel: "Du spürst die Muskeln zwischen und unter den Schulterblättern.",
  },
  'prone-low-row': {
    short: "In Bauchlage die Arme neben dem Körper leicht abheben – Schulterblätter nach hinten-unten.",
    setup: "Leg dich auf den Bauch auf die Matte, Kissen unter dem Becken, Stirn auf einem kleinen Handtuch. Arme lang neben dem Körper (Daumen außen) oder als W gebeugt.",
    steps: ["Bauchlage, Stirn aufs Handtuch, Arme neben dem Körper.", "Schulterblätter nach hinten-unten ziehen.", "Arme wenige Zentimeter vom Boden abheben.", "Kurz halten, langsam ablegen."],
    feel: "Du spürst es zwischen und unter den Schulterblättern.",
  },
  'serratus-punch-low': {
    short: "Arm nach vorn-unten schieben und die Schulter nachschieben – Serratus unter Schulterhöhe.",
    setup: "Stell dich mit dem Rücken zur Tür, ca. einen Schritt entfernt, kleine Schrittstellung, Knie weich. Bandende in einer Hand.",
    steps: ["Band auf Bauchhöhe in der Tür, Rücken zur Tür.", "Arm schräg nach vorn-unten, deutlich unter Schulterhöhe.", "Arm strecken und die Schulter ein Stück nach vorn schieben.", "Langsam zurück. Erst links, dann rechts."],
    feel: "Du spürst es seitlich am Brustkorb unter der Achsel.",
  },
  'wall-push-up-plus': {
    short: "Liegestütz an der Wand mit „Plus“ – kräftigt Brust und Serratus unter Schulterhöhe.",
    setup: "Stell dich mit dem Gesicht zur Wand, eine große Schrittlänge (ca. 70–80 cm) entfernt. Hände etwa auf Höhe der unteren Brust schulterbreit an die Wand.",
    steps: ["Gesicht zur Wand, großer Schritt Abstand, Hände auf Brusthöhe.", "Körper gerade, Brust zur Wand senken.", "Zurückdrücken, am Ende Schulterblätter auseinanderschieben.", "Langsam zurück in die Ausgangsposition."],
    feel: "Du spürst Brust, Oberarme und seitlich den Brustkorb.",
  },
  'low-row-band': {
    short: "Gestreckte Arme neben die Hüfte ziehen – Schulterblätter nach hinten-unten, Arme bleiben tief.",
    setup: "Stell dich mit dem Gesicht zur Tür, ca. 1 m (ein großer Schritt) entfernt, Füße hüftbreit, Knie weich.",
    steps: ["Band auf Hüfthöhe in der Tür, Gesicht zur Tür.", "Arme gestreckt schräg nach vorn-unten.", "Schulterblätter zurück, gestreckte Arme neben die Hüfte ziehen.", "Kurz halten, langsam zurück."],
    feel: "Du spürst es unter den Schulterblättern und im breiten Rückenmuskel.",
  },
  'pull-apart-low': {
    short: "Leichtes Band unter Schulterhöhe auseinanderziehen – Schulterblätter zusammen.",
    setup: "Stell dich aufrecht hin oder setz dich. Greif ein leichtes Band schulterbreit, Arme gestreckt auf Brust- bis Bauchhöhe.",
    steps: ["Leichtes Band schulterbreit, Arme auf Bauch- bis Brusthöhe.", "Band auseinanderziehen, Schulterblätter zusammen.", "Die Schultern bleiben tief.", "Kontrolliert zurück."],
    feel: "Du spürst es zwischen den Schulterblättern.",
  },
  'low-face-pull': {
    short: "Band zurückziehen und die Unterarme aufdrehen – Rotatoren und hintere Schulter unter Schulterhöhe.",
    setup: "Stell dich mit dem Gesicht zur Tür, ca. 1 m entfernt, Füße hüftbreit, Knie weich.",
    steps: ["Band auf Brusthöhe in der Tür, Gesicht zur Tür.", "Arme schräg nach vorn-unten gestreckt.", "Ellbogen nach hinten-außen ziehen, unter Schulterhöhe.", "Am Ende Unterarme aufdrehen, dann langsam zurück."],
    feel: "Du spürst die hintere Schulter und den Bereich zwischen den Schulterblättern.",
  },
  'er-iso-door': {
    short: "Handrücken gegen den Türrahmen drücken – kräftigt die Außenrotatoren schmerzarm.",
    setup: "Stell dich seitlich in den Türrahmen, die trainierte Schulter zeigt zum Rahmen, ca. eine Handbreit Abstand. Ellbogen 90° gebeugt am Körper, kleine Handtuchrolle darunter. Der Handrücken liegt am Rahmen.",
    steps: ["Seitlich in den Türrahmen, Ellbogen 90° am Körper.", "Leg den Handrücken an den Rahmen.", "Mit 30–50 % Kraft nach außen drücken – keine Bewegung.", "Halten, lösen. Dann umdrehen für die andere Seite."],
    feel: "Du spürst es hinten an der Schulter – ohne Schmerz.",
  },
  'ir-iso-door': {
    short: "Handfläche gegen den Türrahmen nach innen drücken – kräftigt die Rotatorenmanschette vorn.",
    setup: "Stell dich vor die Kante des Türrahmens, ca. eine Unterarmlänge entfernt, sodass die Kante vor deinem Bauch ist. Ellbogen 90° gebeugt am Körper, kleine Handtuchrolle darunter. Die Handfläche liegt an der Rahmenkante.",
    steps: ["Ellbogen 90° am Körper, Handfläche an die Rahmenkante.", "Mit 30–50 % Kraft nach innen drücken – keine Bewegung.", "Halten, ruhig atmen.", "Lösen, dann die andere Hand."],
    feel: "Du spürst es vorn an der Schulter und an der Brust – ohne Schmerz.",
  },
  'ir-band': {
    short: "Unterarm gegen ein leichtes Band zum Bauch drehen – Rotatorenmanschette vorn, ohne Armheben.",
    setup: "Stell dich seitlich zur Tür, ca. einen Schritt entfernt – die trainierte Schulter zeigt zur Tür. Handtuchrolle zwischen Ellbogen und Rumpf, Ellbogen 90° gebeugt.",
    steps: ["Leichtes Band auf Ellbogenhöhe, trainierte Seite zur Tür.", "Handtuch unter den Ellbogen, Ellbogen 90° gebeugt.", "Dreh den Unterarm langsam zum Bauch.", "Langsam zurück. Danach umdrehen, andere Seite."],
    feel: "Du spürst es vorn an der Schulter.",
  },
  'pec-stretch-low': {
    short: "Hände hinter dem Rücken, Brust öffnen – dehnt die Brust ohne Armheben.",
    setup: "Stell dich aufrecht hin oder setz dich. Hände hinter dem Rücken locker verschränken (oder ein Handtuch greifen).",
    steps: ["Hände hinter dem Rücken verschränken.", "Schulterblätter sanft zusammen und nach unten.", "Brustbein leicht heben, Arme nur wenig nach hinten.", "Halten, ruhig atmen."],
    feel: "Du spürst die Brust sanft gedehnt.",
  },
  'side-bend-low': {
    short: "Sanfte Seitneigung ohne Armheben – dehnt die Flanke.",
    setup: "Setz dich aufrecht hin oder stell dich hin, die Arme hängen locker.",
    steps: ["Aufrecht sitzen oder stehen, Arme locker.", "Oberkörper sanft nach rechts neigen, Hand gleitet am Bein.", "Nicht nach vorn kippen – in die Flanke atmen.", "Halten, dann zur anderen Seite."],
    feel: "Du spürst ein Ziehen seitlich am Rumpf auf der Gegenseite.",
  },
  'neck-stretch-low': {
    short: "Ohr Richtung Schulter, ohne Zug am Kopf – lockert den Nacken.",
    setup: "Setz dich aufrecht hin oder stell dich hin, beide Arme hängen locker.",
    steps: ["Aufrecht, beide Arme hängen locker.", "Kopf sanft zur Seite neigen, Ohr Richtung Schulter.", "Die Gegenseite sinkt nach unten – halten.", "Langsam zurück, dann die andere Seite."],
    feel: "Du spürst ein Ziehen seitlich am Hals.",
  },
  'stretch-flow-seated-low': {
    short: "Kompaktes Dehnen im Sitzen ohne Armheben – schulterfreundlich, jeder Abschnitt wird angesagt.",
    setup: "Setz dich aufrecht auf den Stuhl, linkes Bein lang nach vorn. Die App sagt jeden Abschnitt an.",
    steps: ["Brust tief: Hände hinter dem Rücken (20 s).", "Seitneigung: Hand gleitet am Bein, je Seite 15 s.", "Unterarme: Arm vorn-unten, Finger sanft zurück (15 s).", "Nacken: Ohr Richtung Schulter, ohne Zug (25 s)."],
    feel: "Du spürst sanftes Ziehen in Brust, Flanken, Unterarmen und Nacken.",
    mistakes: { set: ["Ziehen bis in den Schmerz", "Arme über Schulterhöhe heben"] },
  },
  'stretch-flow-short-low': {
    short: "Kompaktes Dehnen ohne Armheben – schulterfreundlich, jeder Abschnitt wird angesagt.",
    setup: "Stell dich mit dem Gesicht zur Wand, ca. eine Armlänge entfernt, Hände auf Brusthöhe an der Wand. Die App sagt jeden Abschnitt an.",
    steps: ["Hüftbeuger: kurze Schrittstellung, Becken aufrichten, 20 s je Seite.", "Wade an der Wand: 15 s je Seite.", "Brust tief: Hände hinter dem Rücken (20 s).", "Unterarme: Arm vorn-unten, Finger sanft zurück (15 s)."],
    feel: "Du spürst nacheinander sanftes Ziehen in Hüfte, Wade, Brust und Unterarmen.",
    mistakes: { set: ["Wippen", "Ziehen bis in den Schmerz", "Arme über Schulterhöhe heben"] },
  },
  'mobility-flow-short-low': {
    short: "Kompakte Mobilisation ohne Armheben – Hüfte, Rücken und Schulterblätter in 2 Minuten.",
    setup: "Stell dich seitlich neben eine Wand, ca. eine Unterarmlänge entfernt, die nahe Hand auf Brusthöhe an der Wand. Die App sagt jeden Abschnitt an.",
    steps: ["Beinpendel an der Wand: 15 s rechts, 15 s links.", "Becken kreisen, beide Füße am Boden (30 s).", "Schulterblätter nach hinten-unten ziehen und lösen (30 s).", "Rumpfdrehung im Stand, Arme vor der Brust (30 s)."],
    feel: "Du spürst Hüfte, Rücken und Schulterblätter warm werden.",
    mistakes: { set: ["Wippen in die Endposition", "Arme über Schulterhöhe heben"] },
  },
};

// ---------------------------------------------------------------- apply (node tools/exercise-texts.mjs [--check])
// Writes short / setup / steps / feel into data/exercises.json (right after `description`) and applies the targeted
// legacy-field fixes above (instructions[i], description, mistakes, level labels). `figure` fields are never touched.
// Idempotent. --check exits 1 when data/exercises.json is not up to date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIELDS = ['short', 'setup', 'steps', 'feel'];

export function applyTexts(data) {
  const out = { ...data, exercises: data.exercises.map((e0) => {
    const t = TEXTS[e0.id];
    if (!t) throw new Error(`no texts for ${e0.id}`);
    const e = structuredClone(e0);
    if (t.description) e.description = t.description;
    if (t.instructions) for (const [i, s] of Object.entries(t.instructions)) e.instructions[Number(i)] = s;
    if (t.mistakes?.set) e.mistakes = [...t.mistakes.set];
    if (t.mistakes?.add && !e.mistakes.includes(t.mistakes.add)) e.mistakes.push(t.mistakes.add);
    if (t.labels) e.levels.forEach((l) => { l.label = l.label.replace(/\s*\((links|rechts) \+1 Satz\)/, ''); });
    if (t.levelLabels) for (const [i, s] of Object.entries(t.levelLabels)) e.levels[Number(i)].label = s;
    // rebuild key order: text fields right after description
    const res = {};
    for (const [k, v] of Object.entries(e)) {
      if (FIELDS.includes(k)) continue;
      res[k] = v;
      if (k === 'description') for (const f of FIELDS) res[f] = Array.isArray(t[f]) ? [...t[f]] : t[f];
    }
    return res;
  }) };
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'exercises.json');
  const src = readFileSync(file, 'utf8');
  const next = JSON.stringify(applyTexts(JSON.parse(src)), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (next !== src) { console.error('data/exercises.json is not up to date – run node tools/exercise-texts.mjs'); process.exit(1); }
    console.log('exercise texts up to date');
  } else {
    writeFileSync(file, next);
    console.log('data/exercises.json updated');
  }
}
