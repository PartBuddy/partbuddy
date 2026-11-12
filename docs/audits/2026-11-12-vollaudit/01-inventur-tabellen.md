# Vollaudit Phase 1 – Inventur Fachtabellen (Präfix T)

Stand 12.11.2026, Zweig `docs/vollaudit-2026-11` auf `6151cef`. Nur gelesen; nichts gebaut, nichts gemessen.
Bereich: `apps/desktop/src/shared/` mit den zugehörigen Tests, abgeglichen mit `docs/feature-catalog.md`,
`docs/building-blocks.md` und `docs/engineering-notes.md`.

Lesehilfe: Pfade ohne Ordner liegen in `apps/desktop/src/shared/`, Tests in `apps/desktop/test/`.
"fest" heißt: Konstante ohne Eingabe, also auch ohne Bereichsprüfung. Die Spalte Status bleibt für Phase 4 leer.
Abgeleitete Werte in der Spalte "Wert" (z. B. Senkung Ø 6.7) sind aus den Tabellen gerechnet, nicht gemessen.

Umfang: 594 Zeilen in der Prüfliste (17 Materialien mit je 6 Zahlen, 77 Drucker), 61 Befunde
(5 A, 30 B, 26 C).

## Prüfliste

## 1 Schraubentabellen (`screwSizes.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 1 | BLOCK_SIZES | screwSizes.ts:7 | M2, M2.5, M3, M4, M5, M6, M8, M10 | wählbare Schraubengrößen aller Bausteine | Enum in blockTool.ts:49, mechanismTool.ts:51; dupliziert in contract.ts:803 | blocks.test.ts (Default-Blöcke) |  |
| 2 | CAP_HEAD M2 | screwSizes.ts:12 | dk 3.8 / k 2 mm (ISO 4762) | Senkung Ø 3.8+2·0.6=5.0, Tiefe 2.4 | keine Bereichsprüfung, Tabelle fest | blocks.test.ts:26 (nur M3/M4 lt. Titel) |  |
| 3 | CAP_HEAD M2.5 | screwSizes.ts:13 | dk 4.5 / k 2.5 | Senkung Ø 5.7, Tiefe 2.9 | keine | keiner (einzeln) |  |
| 4 | CAP_HEAD M3 | screwSizes.ts:14 | dk 5.5 / k 3 | Senkung Ø 6.7, Tiefe 3.4 | keine | blocks.test.ts:26, mechanism.test.ts:373 |  |
| 5 | CAP_HEAD M4 | screwSizes.ts:15 | dk 7 / k 4 | Senkung Ø 8.2, Tiefe 4.4 | keine | keiner (einzeln) |  |
| 6 | CAP_HEAD M5 | screwSizes.ts:16 | dk 8.5 / k 5 | Senkung Ø 9.7, Tiefe 5.4 | keine | keiner (einzeln) |  |
| 7 | CAP_HEAD M6 | screwSizes.ts:17 | dk 10 / k 6 | Senkung Ø 11.2, Tiefe 6.4 | keine | keiner (einzeln) |  |
| 8 | CAP_HEAD M8 | screwSizes.ts:18 | dk 13 / k 8 | Senkung Ø 14.2, Tiefe 8.4 | keine | keiner (einzeln) |  |
| 9 | CAP_HEAD M10 | screwSizes.ts:19 | dk 16 / k 10 | Senkung Ø 17.2, Tiefe 10.4 | keine | keiner (einzeln) |  |
| 10 | COUNTERSUNK_HEAD M3 | screwSizes.ts:23 | 6.72 mm theoretisch, 90° (ISO 10642) | Senkung Ø 7.32 | sizesOf blocks.ts:62; screwProblem mechanisms.ts:451 | blocks.test.ts:26 |  |
| 11 | COUNTERSUNK_HEAD M4 | screwSizes.ts:23 | 8.96 | Senkung Ø 9.56 | wie oben | keiner (einzeln) |  |
| 12 | COUNTERSUNK_HEAD M5 | screwSizes.ts:23 | 11.2 | Senkung Ø 11.8 | wie oben | keiner (einzeln) |  |
| 13 | COUNTERSUNK_HEAD M6 | screwSizes.ts:23 | 13.44 | Senkung Ø 14.04 | wie oben | keiner (einzeln) |  |
| 14 | COUNTERSUNK_HEAD M8 | screwSizes.ts:23 | 17.92 | Senkung Ø 18.52 | wie oben | keiner (einzeln) |  |
| 15 | COUNTERSUNK_HEAD M10 | screwSizes.ts:23 | 22.4 | Senkung Ø 23.0 | wie oben | keiner (einzeln) |  |
| 16 | COUNTERSUNK_HEAD M2 / M2.5 | screwSizes.ts:23 | kein Eintrag | Baustein bietet Senkkopf erst ab M3 | nur sizesOf (blocks.ts:62) und screwProblem (mechanisms.ts:451); featureBlockSchema lässt es zu, dann Rückfall auf CAP_HEAD (blocks.ts:226, mechanisms.ts:505) | blockTool.test.ts:22 (Ablehnung im Werkzeug) |  |
| 17 | INSERT M2 | screwSizes.ts:30 | Loch 3.2 / Länge 4 mm (ruthex) | Sitz Ø 3.2, Tiefe 5 | sizesOf blocks.ts:61; screwProblem mechanisms.ts:449 | keiner (einzeln) |  |
| 18 | INSERT M2.5 | screwSizes.ts:31 | Loch 3.6 / Länge 5.7 | Sitz Ø 3.6, Tiefe 6.7 | wie oben | keiner (einzeln) |  |
| 19 | INSERT M3 | screwSizes.ts:32 | Loch 4 / Länge 5.7 | Sitz Ø 4, Tiefe 6.7; Dom Ø 8, Höhe 8.7 | wie oben | blocks.test.ts:33, mechanism.test.ts:373 |  |
| 20 | INSERT M4 | screwSizes.ts:33 | Loch 5.6 / Länge 8.1 | Sitz Ø 5.6, Tiefe 9.1; Dom Ø 9.6, Höhe 11.1 | wie oben | keiner (einzeln) |  |
| 21 | INSERT M5 | screwSizes.ts:34 | Loch 6.4 / Länge 9.5 | Sitz Ø 6.4, Tiefe 10.5; Dom Ø 10.4, Höhe 12.5 | wie oben | keiner (einzeln) |  |
| 22 | INSERT M6 | screwSizes.ts:35 | Loch 8 / Länge 12.7 | Sitz Ø 8, Tiefe 13.7; Dom Ø 12, Höhe 15.7 | wie oben | keiner (einzeln) |  |
| 23 | INSERT M8 / M10 | screwSizes.ts:29-36 | kein Eintrag | kein Einsatz; defaultBlock fällt auf M3-Werte zurück (blocks.ts:68), stepOf boss ebenso (blocks.ts:234) | nur sizesOf / screwProblem; Schema lässt M8/M10 zu | mechanism.test.ts:398 (Ablehnung) |  |
| 24 | Sitz tiefer als Einsatz | screwSizes.ts:27 / blocks.ts:75 / mechanisms.ts:481 | +1 mm | Raum für verdrängten Kunststoff | fest | blocks.test.ts:33 |  |
| 25 | NUT M2 | screwSizes.ts:40 | SW 4 / m 1.6 (ISO 4032) | Tasche SW 4.3, Tiefe 2.0 | keine | keiner (einzeln) |  |
| 26 | NUT M2.5 | screwSizes.ts:41 | SW 5 / m 2 | Tasche SW 5.3, Tiefe 2.4 | keine | keiner (einzeln) |  |
| 27 | NUT M3 | screwSizes.ts:42 | SW 5.5 / m 2.4 | Tasche SW 5.8, Tiefe 2.8 | keine | blocks.test.ts:71 |  |
| 28 | NUT M4 | screwSizes.ts:43 | SW 7 / m 3.2 | Tasche SW 7.3, Tiefe 3.6 | keine | keiner (einzeln) |  |
| 29 | NUT M5 | screwSizes.ts:44 | SW 8 / m 4.7 | Tasche SW 8.3, Tiefe 5.1 | keine | keiner (einzeln) |  |
| 30 | NUT M6 | screwSizes.ts:45 | SW 10 / m 5.2 | Tasche SW 10.3, Tiefe 5.6 | keine | keiner (einzeln) |  |
| 31 | NUT M8 | screwSizes.ts:46 | SW 13 / m 6.8 | Tasche SW 13.3, Tiefe 7.2 | keine | keiner (einzeln) |  |
| 32 | NUT M10 | screwSizes.ts:47 | SW 16 / m 8.4 | Tasche SW 16.3, Tiefe 8.8 | keine | keiner (einzeln) |  |
| 33 | NUT_ALLOWANCE.flats | screwSizes.ts:51 | 0.3 mm auf die Schlüsselweite (0.15 je Seite) | Luft um die Mutter | fest, nicht material-/düsenabhängig | blocks.test.ts:71 |  |
| 34 | NUT_ALLOWANCE.depth | screwSizes.ts:51 | 0.4 mm | Mutter liegt unter der Fläche | fest | blocks.test.ts:71 |  |
| 35 | HEAD_ALLOWANCE.diameter | screwSizes.ts:54 | 0.6 mm; Zylinderkopf ×2 (=1.2 auf Ø), Senkkopf ×1 | Luft um den Kopf | fest | blocks.test.ts:26 |  |
| 36 | HEAD_ALLOWANCE.depth | screwSizes.ts:54 | 0.4 mm | Kopf versenkt | fest | blocks.test.ts:26 |  |
| 37 | CLEARANCE_NORMAL M2 | screwSizes.ts:57 | 2.4 mm (ISO 273 mittel) | Schlitzbreite (blocks.ts:86) | nur Schlitz; Bohrungen nimmt SolidCraft selbst (`clearance`, `fit`) | keiner (einzeln) |  |
| 38 | CLEARANCE_NORMAL M2.5 | screwSizes.ts:57 | 2.9 | wie oben | wie oben | keiner |  |
| 39 | CLEARANCE_NORMAL M3 | screwSizes.ts:57 | 3.4 | wie oben | wie oben | blocks.test.ts:81 |  |
| 40 | CLEARANCE_NORMAL M4 | screwSizes.ts:57 | 4.5 | wie oben | wie oben | keiner |  |
| 41 | CLEARANCE_NORMAL M5 | screwSizes.ts:57 | 5.5 | wie oben | wie oben | keiner |  |
| 42 | CLEARANCE_NORMAL M6 | screwSizes.ts:57 | 6.6 | wie oben | wie oben | keiner |  |
| 43 | CLEARANCE_NORMAL M8 | screwSizes.ts:57 | 9 | wie oben | wie oben | keiner |  |
| 44 | CLEARANCE_NORMAL M10 | screwSizes.ts:57 | 11 | wie oben | wie oben | keiner |  |

## 2 Funktionsbausteine (`blocks.ts`, Schema in `contract.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 45 | BLOCK_KINDS | blocks.ts:45 | tappedHole, screwHole, insertSeat, nutTrap, boss, slot, text, logo, lip, snapFit | Bausteine der Oberfläche | featureBlockSchema contract.ts:807-880 | blocks.test.ts:184 |  |
| 46 | needsNormal | blocks.ts:48-50 | text, logo, nutTrap, slot, snapFit | Skizzenebene aus der Flächennormale | blockTool.ts:86 | blockTool.test.ts:22 |  |
| 47 | hasSize | blocks.ts:53-55 | nicht text, logo, lip, snapFit | Schraubengröße wird ignoriert | nur Formular | keiner |  |
| 48 | sizesOf insertSeat/boss | blocks.ts:61 | M2 bis M6 | Größenwahl | blockTool.ts:89-90, BlockPanel.tsx:190,232; nicht im Schema | blockTool.test.ts:22 |  |
| 49 | sizesOf screwHole countersunk | blocks.ts:62 | M3 bis M10 | Größenwahl | wie oben | blockTool.test.ts:22 |  |
| 50 | sizesOf sonst (auch tappedHole, nutTrap) | blocks.ts:63 | M2 bis M10 | Größenwahl | wie oben | keiner |  |
| 51 | tappedHole.depth | blocks.ts:71,218 | null = durchgehend; sonst >0 bis 500 mm | Gewindetiefe an SolidCraft `solid.hole thread` | contract.ts:808 (blockLength) | blocks.test.ts:12 |  |
| 52 | tappedHole.modeled | blocks.ts:71 | Standard true | modelliertes (druckbares) Gewinde | keine Größengrenze | blocks.test.ts:12 |  |
| 53 | tappedHole/screwHole/insertSeat.more | blocks.ts:19-21,203 | bis 99 weitere Punkte | Lochreihe | contract.ts:806 | blocks.test.ts:17 |  |
| 54 | screwHole.head | blocks.ts:73 | none / cap / countersunk, Standard cap | Senkung für den Kopf | contract.ts:810 | blocks.test.ts:26 |  |
| 55 | screwHole.fit | blocks.ts:73,220 | close / normal / loose, Standard normal | ISO-273-Reihe, von SolidCraft gerechnet | contract.ts:810; kein Lochschwund-Aufmaß | keiner (nur normal) |  |
| 56 | screwHole Zylindersenkung | blocks.ts:223 | Ø dk+1.2, Tiefe k+0.4 | counterbore | fest | blocks.test.ts:26 |  |
| 57 | screwHole Kegelsenkung | blocks.ts:226-227 | Ø dk+0.6, 90° | countersink | fest | blocks.test.ts:26 |  |
| 58 | insertSeat.diameter | blocks.ts:75 | Standard aus INSERT; 0 < x <= 500 | Lochdurchmesser | contract.ts:812 nur >0 | blocks.test.ts:33 |  |
| 59 | insertSeat.depth | blocks.ts:75 | Standard Länge+1; 0 < x <= 500 | Sacklochtiefe | contract.ts:812 | blocks.test.ts:33 |  |
| 60 | boss.diameter | blocks.ts:78 | Standard Einsatzloch+4 (2 mm Wand) | Außendurchmesser Dom | contract.ts:813 nur >0; keine Prüfung gegen das Loch | blocks.test.ts:33 |  |
| 61 | boss.height | blocks.ts:78 | Standard Länge+3 | Domhöhe | contract.ts:813 | blocks.test.ts:33 |  |
| 62 | boss Loch | blocks.ts:234-237 | hole_diameter = INSERT, hole_depth = Länge+1 (nicht einstellbar) | Einsatzsitz im Dom | fest; Rückfall 4/5.7 für Größen ohne Einsatz | blocks.test.ts:33 |  |
| 63 | text.text | blocks.ts:80 | 1 bis 80 Zeichen, Standard "PartBuddy" | Schriftzug | contract.ts:821 | blocks.test.ts:55 |  |
| 64 | text.height | blocks.ts:80 | Standard 5 mm (Versalhöhe); 0 < x <= 500 | Schriftgröße | contract.ts:822; keine Untergrenze zur Düse | blocks.test.ts:55 |  |
| 65 | text.depth | blocks.ts:80 | Standard 0.6 mm | Präge-/Gravurtiefe | contract.ts:823; nicht schichtabhängig | blocks.test.ts:55 |  |
| 66 | text.mode | blocks.ts:80 | emboss / deboss, Standard deboss | erhaben oder graviert | contract.ts:824 | blocks.test.ts:55 |  |
| 67 | text.bold / font / boldFace | blocks.ts:80,136,208-211 | Standard fett, Arial (BOLD_FONT) | Schriftschnitt | contract.ts:825-827 | blocks.test.ts:62 |  |
| 68 | text Lage | blocks.ts:152 | at [0, -height/2], align center | mittig auf dem Punkt | fest | blocks.test.ts:55 |  |
| 69 | nutTrap.flats | blocks.ts:83,160 | Standard SW+0.3; Radius = flats/2 auf 0.01 gerundet | Sechsecktasche (circumscribed) | contract.ts:830 nur >0 | blocks.test.ts:71 |  |
| 70 | nutTrap.depth | blocks.ts:83,161 | Standard m+0.4 | Taschentiefe (Schnitt -depth, ohne targets) | contract.ts:830 | blocks.test.ts:71 |  |
| 71 | nutTrap Durchgangsloch | blocks.ts:157,162 | `clearance: size, fit: normal` am Taschenboden | Schraubenloch durch den Rest | fest | blocks.test.ts:71 |  |
| 72 | slot.length | blocks.ts:87,166-170 | Standard 10 mm; ist Mittenabstand der Rundungen (Gesamtlänge = length + width) | Langloch | contract.ts:832 nur >0 | blocks.test.ts:81 |  |
| 73 | slot.width | blocks.ts:86-87 | Standard CLEARANCE_NORMAL | Schlitzbreite | contract.ts:832 | blocks.test.ts:81 |  |
| 74 | slot.depth | blocks.ts:87,172 | null = durch: Schnitt -1000 mm; sonst Tiefe | Schnitttiefe (ohne targets) | contract.ts:832 | blocks.test.ts:81 |  |
| 75 | slot.along | blocks.ts:87,167 | x / y | Richtung in der Fläche | contract.ts:832 | blocks.test.ts:81 |  |
| 76 | lip.type | blocks.ts:90,200 | lip / groove | `plastic.lip` | contract.ts:835 | blocks.test.ts:90 |  |
| 77 | lip.width | blocks.ts:90 | Standard 1.2 mm | Lippenbreite | contract.ts:835 nur >0 | blocks.test.ts:90 |  |
| 78 | lip.height | blocks.ts:90 | Standard 2 mm | Lippenhöhe | contract.ts:835 | blocks.test.ts:90 |  |
| 79 | lip.gap | blocks.ts:90,200 | Standard 0.2 mm; 0 bis 5; nur bei groove übergeben | Spiel Nut zu Lippe | contract.ts:835 | blocks.test.ts:90 |  |
| 80 | snapFit.length | blocks.ts:96 | Standard 12 mm (einschließlich Rastnase) | Armlänge | contract.ts:872 nur >0 | blocks.test.ts:96 |  |
| 81 | snapFit.thickness | blocks.ts:96 | Standard 1.5 mm | Armdicke | contract.ts:873 | blocks.test.ts:96 |  |
| 82 | snapFit.width | blocks.ts:96 | Standard 5 mm | Armbreite | contract.ts:874 | blocks.test.ts:96 |  |
| 83 | snapFit.catchDepth | blocks.ts:96 | Standard 0.8 mm | Hinterschnitt | contract.ts:875 | blocks.test.ts:96 |  |
| 84 | snapFit.catchLength | blocks.ts:96 | Standard 1.5 mm | Länge der Nase | contract.ts:876 | blocks.test.ts:96 |  |
| 85 | snapFit.hook | blocks.ts:41,96,111-115 | y+ / y- / x+ / x- | Richtung der Nase in der Fläche | contract.ts:877 | blocks.test.ts:96 |  |
| 86 | snapStrain | blocks.ts:105-108 | 150·t·y / Hebel² in %, Hebel = max(L - Nase/2, L/4); Standard 1.42 % | Randfaserdehnung am Fuß | nur Anzeige BlockPanel.tsx:485 (SNAP_STRAIN_LIMIT dort); Werkzeug prüft nicht | blocks.test.ts:116 |  |
| 87 | logo.width | blocks.ts:93 | Standard 20 mm; 0 < x <= 500 | Logobreite | contract.ts:856 | blocks.test.ts:124 |  |
| 88 | logo.depth | blocks.ts:93,182 | Standard 0.6 mm | Extrusion (cut / join) | contract.ts:857 | blocks.test.ts:124 |  |
| 89 | logo.mode | blocks.ts:93 | emboss / deboss | erhaben / vertieft bzw. eingelegt | contract.ts:858 | blocks.test.ts:124 |  |
| 90 | logo.colours | blocks.ts:246-257,288-334 | bool; ab 2 Füllfarben je Stück ein Körper | Mehrfarbdruck | contract.ts:860 | blocks.test.ts:153 |  |
| 91 | logo.centre | blocks.ts:37 | bool | auf die Flächenmitte | contract.ts:862 | logoMove.test.ts (nicht gelesen) |  |
| 92 | logo.svg | contract.ts:846-855 | 1 Zeichen bis 512 KiB, wird neu gelesen | saubere Zeichnung an SolidCraft | parseDrawing | blocks.test.ts:137 |  |
| 93 | logoFrom Standardbreite | blocks.ts:344 | 100 mm, wenn die Datei keine Größe nennt | Maßstab der Zeichnung | keine | blocks.test.ts:137 |  |
| 94 | planeAt | blocks.ts:122-131 | x waagerecht (z × n), Rückfall [1,0,0] unter 1e-6; Rundung 1e-6 | Skizzenlage auf der Fläche | keine | blocks.test.ts:45 |  |
| 95 | Rundung der Bausteinmaße | blocks.ts:57,145 | 0.01 mm | Maße an SolidCraft | fest | keiner |  |
| 96 | blockLength | contract.ts:804 | > 0 bis 500 mm | Obergrenze aller Bausteinmaße | Zod | blocks.test.ts:184 |  |

## 3 Mechanik: Scharnier (`mechanisms.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 97 | hinge.diameter | mechanisms.ts:60 | 4 bis 40 mm; Standard 6 (mechanismTool.ts:122) | Außendurchmesser Rolle | hingeProblem | mechanism.test.ts:42 |  |
| 98 | hinge.gap | mechanisms.ts:61 | 0.2 bis 1 mm; Standard min(1, max(0.3, Düse)) (mechanismTool.ts:109) | Spalt axial und um den Stift | hingeProblem | mechanism.test.ts:42,53 |  |
| 99 | hinge.knuckles | mechanisms.ts:62 | 3, 5, 7, 9; Standard erstes n mit Länge/n <= 10 mm, sonst 9 (mechanismTool.ts:124) | Anzahl Gelenkaugen | hingeProblem | mechanism.test.ts:42,53 |  |
| 100 | pinDiameter | mechanisms.ts:52-54 | max(2, Ø/2) | Stiftdurchmesser | abgeleitet | mechanism.test.ts:12 |  |
| 101 | MIN_BARREL_WALL | mechanisms.ts:44,63-64 | 0.8 mm: (Ø - Stift)/2 - gap | Wand der Rolle um die Bohrung | hingeProblem, Vorschlag ceil((0.8+gap)·4) | mechanism.test.ts:42 |  |
| 102 | Dach über der Bohrung | mechanisms.ts:66-68 | >= 0.9 mm bei liegendem Scharnier: Ø/2 - (Stift/2+gap)·1.05 | Wand über dem Flachdach | hingeProblem (fest für 0.4-mm-Düse) | mechanism.test.ts:42 (laut Titel) |  |
| 103 | MIN_KNUCKLE | mechanisms.ts:46,69-70 | 2.5 mm je Auge | Mindestlänge eines Auges | hingeProblem | mechanism.test.ts:42 |  |
| 104 | fixed != moving | mechanisms.ts:59 | zwei Körper | - | hingeProblem | mechanism.test.ts:42 |  |
| 105 | Raum je Auge | mechanisms.ts:100 | Ø + 2·gap, von start-gap bis end+gap | Freischnitt im anderen Körper | fest | mechanism.test.ts:12 |  |
| 106 | Bohrung im beweglichen Körper | mechanisms.ts:105 | Stift + 2·gap, -gap bis Länge+gap | Lagerbohrung | fest | mechanism.test.ts:12 |  |
| 107 | ROOF_TOP | mechanisms.ts:150,159-166 | 1.05 Radien über der Achse; Flanken 45°, Flachstück 0.73·r breit | Tropfendach der liegenden Bohrung | nur wenn Achse waagerecht (Achse gerundet < 1e-6) | mechanism.test.ts (liegend, laut Titel nicht eindeutig) |  |
| 108 | WEB.into | mechanisms.ts:112,132 | 0.5 mm | Steg reicht in die eigene Wand | fest | mechanism.test.ts (Stege, nicht eindeutig zugeordnet) |  |
| 109 | WEB.least | mechanisms.ts:112,127,131 | 0.3 mm | niedrigere Stege entfallen | fest | wie oben |  |
| 110 | Steg unter dem Auge | mechanisms.ts:121-143 | 45° von unter der Rolle zur eigenen Wand oder zum Bett; x0 = max(-r/√2, gap - Abstand des anderen Körpers) | trägt Augen, die über dem Bett beginnen | nur mit `support` (mechanismTool misst Wände) | mechanism.test.ts (nicht eindeutig) |  |
| 111 | Rundung Achse/Punkte | mechanisms.ts:48,83-84 | 0.001 | Lage der Zylinder | - | keiner |  |

## 4 Mechanik: Schwalbenschwanzführung

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 112 | slide Länge | mechanisms.ts:202 | >= 5 mm | Schienenlänge | slideProblem | mechanism.test.ts:270 |  |
| 113 | slide.up | mechanisms.ts:203-204 | nicht null, rechtwinklig zur Linie (1e-6) | Normale der Trägerfläche | slideProblem | mechanism.test.ts:270 |  |
| 114 | slide.width | mechanisms.ts:205 | 2 bis 60 mm; Standard 6 | Fußbreite der Schiene | slideProblem | mechanism.test.ts:270 |  |
| 115 | slide.height | mechanisms.ts:206 | 1.5 bis 20 mm; Standard 3 | Schienenhöhe; Kopf = width + 2·height | slideProblem | mechanism.test.ts:270 |  |
| 116 | slide.gap | mechanisms.ts:207 | 0.2 bis 1 mm; Standard Düse min. 0.3; plug dovetail 0.2 (mechanismTool.ts:587) | Spiel ringsum | slideProblem | mechanism.test.ts:270,603 |  |
| 117 | Flankenwinkel | mechanisms.ts:186,252-253 | 45° fest | Hinterschnitt | fest | mechanism.test.ts:257 |  |
| 118 | Flankenversatz | mechanisms.ts:227 | gap·√2 waagerecht | Spiel rechtwinklig zur Flanke = gap | fest | mechanism.test.ts:257 |  |
| 119 | Nut unter die Fläche | mechanisms.ts:237-238 | -gap | bewegter Körper frei vom Schienenfuß | fest | mechanism.test.ts:257 |  |

## 5 Mechanik: Schnappverschluss Deckel (LIP)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 120 | LIP.thick | mechanisms.ts:303 | 1.2 mm | Lippenstärke | fest, keine Düsenprüfung | mechanism.test.ts:293 |  |
| 121 | LIP.high | mechanisms.ts:303 | 4 mm | Lippenhöhe über dem Rand | fest | mechanism.test.ts:293 |  |
| 122 | LIP.clear | mechanisms.ts:303 | 0.25 mm | Luft Lippe zu Boxwand | fest | mechanism.test.ts:293 |  |
| 123 | LIP.foot | mechanisms.ts:303,361 | 3 mm; Fußring 0.2 mm in die Deckelwand | Fuß der Lippe im Deckel | fest; entfällt bei flat | mechanism.test.ts:293 |  |
| 124 | LIP.bead | mechanisms.ts:303 | 0.5 mm vor der Lippe, Rasttiefe 0.25 | Wulst | fest | mechanism.test.ts:293 |  |
| 125 | LIP.beadLong | mechanisms.ts:303 | 14 mm | Wulstlänge in Wandmitte | fest | mechanism.test.ts:293 |  |
| 126 | LIP.notch | mechanisms.ts:303,387-397 | Ø 16 mm, Mitte 5.5 mm über dem Rand | Fingernagelkerbe 2.5 mm tief | fest; entfällt bei flat | mechanism.test.ts:293 |  |
| 127 | Wulst Höhe/Lage | mechanisms.ts:352,367-368 | 1 mm hoch, 2 bis 3 mm über dem Rand (up -1: -3 bis -2) | Rastlage | fest | mechanism.test.ts:293 |  |
| 128 | Wulstfasen | mechanisms.ts:374 | 0.45 mm (bead - 0.05) | 45°-Flanken | fest | mechanism.test.ts:293 |  |
| 129 | Fußfase | mechanisms.ts:363 | 1.4 mm (clear + thick - 0.05), eine Kante per Punkt | 45°-Schräge unter dem Fuß | fest | mechanism.test.ts:293 |  |
| 130 | Rille | mechanisms.ts:375-386 | Ø 1.4 mm, Länge 15 mm, Achse 0.25 mm vor der Wand, 2.5 mm über dem Rand | Rastrille, 0.45 mm tief in der Boxwand | fest; Boxwand ungeprüft | mechanism.test.ts:293,328 |  |
| 131 | lip Innenraum | mechanisms.ts:309 | >= 12 mm in x und y | Mindestgröße | lipProblem | mechanism.test.ts:334 |  |
| 132 | lip Wandlänge für Wulst | mechanisms.ts:310 | >= 14 + 2·max(radius, 2) + 2 mm | Wulst nicht in der Ecke | lipProblem | mechanism.test.ts:334 |  |
| 133 | lip.wall | mechanisms.ts:311 | 1.6 bis 10 mm; Standard 2 (mechanismTool.ts:166) | Deckelwand (Kerbe geht durch) | lipProblem | mechanism.test.ts:334 |  |
| 134 | lip.radius | mechanisms.ts:312,329 | >= 0; ab 2 mm runde Ecken | Eckenradius des Innenraums | lipProblem | mechanism.test.ts:334 |  |
| 135 | lip.up / side / hinge / flat | mechanisms.ts:278,284,289,294 | 1 / -1; x- x+ y- y+; Scharnierlinie; flache Platte | Lage der Lippe und der Rille | mechanismTool.ts:144-148 | mechanism.test.ts:328 |  |

## 6 Mechanik: Schraubverbindung

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 136 | SCREW_LENGTHS | mechanisms.ts:424 | 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80 mm | wählbare Kauflängen | screwLength | mechanism.test.ts:373,411 |  |
| 137 | TAPPED_FROM | mechanisms.ts:426,450 | M5 | kleinere modellierte Gewinde abgelehnt | screwProblem (nicht im Baustein tappedHole) | mechanism.test.ts:398 |  |
| 138 | UNDER_HEAD | mechanisms.ts:428,452-453 | 1.2 mm | Rest unter der Senkung | screwProblem | mechanism.test.ts:398 |  |
| 139 | grip | mechanisms.ts:430,448 | >= 1 mm | Dicke des gehaltenen Körpers | screwProblem | mechanism.test.ts:398 |  |
| 140 | headDepth cap | mechanisms.ts:433 | k + 0.4 | Senktiefe | abgeleitet | mechanism.test.ts:373 |  |
| 141 | headDepth countersunk | mechanisms.ts:433 | 0.6·d | angenommene Kegeltiefe | abgeleitet | keiner (einzeln) |  |
| 142 | hold | mechanisms.ts:435 | Einsatzlänge bzw. 2.5·d | nutzbare Einschraubtiefe | abgeleitet | mechanism.test.ts:373 |  |
| 143 | screwLength | mechanisms.ts:438-443 | längste Normlänge in [through + 2/3·hold, through + hold], sonst null | Kaufschraube | Meldung mechanismTool.ts:559 | mechanism.test.ts:411 |  |
| 144 | Gewindeloch tapped | mechanisms.ts:482 | Tiefe 2.5·d + 1, modeled | Gewinde im festen Körper | fest | mechanism.test.ts (nicht eindeutig) |  |
| 145 | screw.more | mechanisms.ts:454 | bis 40 | weitere Schrauben | screwProblem | mechanism.test.ts:398 |  |
| 146 | screw.head / thread / screws | mechanisms.ts:415-419 | cap, countersunk, none / insert, tapped / bool | Kopfart, Halt, Normteile | mechanismTool.ts:52-55 | mechanism.test.ts:373 |  |
| 147 | Normteil-Familie | mechanisms.ts:470 | socket_head_cap_screw / countersunk_socket_screw | `parts.insert` | fest | mechanism.test.ts:373 |  |

## 7 Mechanik: Schraubdeckel

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 148 | lid.diameter | mechanisms.ts:551 | 16 bis 200 mm | Halsdurchmesser | lidProblem | mechanism.test.ts:478 |  |
| 149 | lid.starts | mechanisms.ts:552 | 1, 2, 3 | Gangzahl | lidProblem | mechanism.test.ts:478 |  |
| 150 | lid.gap | mechanisms.ts:553 | 0.2 bis 0.6 mm; Standard min(0.6, max(0.3, 0.75·Düse)) (mechanismTool.ts:221) | radiales Spiel, ganz am Deckel | lidProblem | mechanism.test.ts:478 |  |
| 151 | Gewinde Ø <= 24 | mechanisms.ts:533 | Steigung 3 / Tiefe 1.1 mm; Kopf 0.4, Fuß 2.6 | Gewindeprofil | lidThread | mechanism.test.ts:433 |  |
| 152 | Gewinde Ø <= 77 | mechanisms.ts:533 | Steigung 4 / Tiefe 1.2; Kopf 0.8, Fuß 3.2 | wie oben | lidThread | mechanism.test.ts:433 |  |
| 153 | Gewinde Ø > 77 | mechanisms.ts:533 | Steigung 5 / Tiefe 1.5; Kopf 1.0, Fuß 4.0 | wie oben | lidThread | mechanism.test.ts:433 |  |
| 154 | Umdrehungen | mechanisms.ts:535 | max(0.75, 1.75 / Gänge) | Eingriffslänge = Umdrehungen · Steigung · Gänge | lidThread | mechanism.test.ts:433 |  |
| 155 | Profil in den Körper | mechanisms.ts:574 | min(Fuß/2 + 0.2, Steigung/2 - 0.05); 0.2 radial | Verschmelzung mit Hals/Deckel | fest | mechanism.test.ts:443 |  |
| 156 | LID.plain | mechanisms.ts:540 | 1 mm | glatter Hals über dem Gewinde | fest | mechanism.test.ts:443 |  |
| 157 | LID.wall | mechanisms.ts:540 | 2.4 mm | Deckelwand | fest | mechanism.test.ts:443 |  |
| 158 | LID.top | mechanisms.ts:540 | 2.4 mm | Deckelboden | fest | mechanism.test.ts:443 |  |
| 159 | LID.mouth | mechanisms.ts:540 | 1 mm | Raum unter dem Deckelgewinde | fest | mechanism.test.ts:443 |  |
| 160 | LID.flute | mechanisms.ts:540,595 | Ø 3 mm, 0.75 mm tief, eine je 7 mm Umfang, min. 8 (mechanisms.ts:585) | Griffrillen | fest | mechanism.test.ts:443 |  |
| 161 | Deckelfase | mechanisms.ts:590-591 | Kegel 0.6 mm × 45° an der Bettkante | Elefantenfuß | fest | mechanism.test.ts:443 |  |
| 162 | lidSkirt | mechanisms.ts:543-546 | plain + Fuß/2 + Länge + Steigung/2 + Fuß/2 + mouth | nötige glatte Halslänge | Meldung mechanismTool.ts:534 | mechanism.test.ts:443 |  |
| 163 | Druckfläche Deckel | mechanisms.ts:597 | Deckeloberseite | `body.print_face` | fest | mechanism.test.ts:443 |  |

## 8 Mechanik: Schnapphaken mit Fenster (SNAP)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 164 | SNAP.length | mechanisms.ts:625 | 12 mm | Armlänge | fest, nicht einstellbar | mechanism.test.ts:515 |  |
| 165 | SNAP.thickness | mechanisms.ts:625 | 1.5 mm | Armdicke | fest | mechanism.test.ts:515 |  |
| 166 | SNAP.width | mechanisms.ts:625 | 5 mm | Armbreite | fest | mechanism.test.ts:515 |  |
| 167 | SNAP.catch | mechanisms.ts:625 | 0.8 mm | Nasentiefe (wirksam 0.6 nach Abzug gap) | fest | mechanism.test.ts:515 |  |
| 168 | SNAP.catchLength | mechanisms.ts:625 | 1.5 mm | Nasenlänge | fest | mechanism.test.ts:515 |  |
| 169 | SNAP.gap | mechanisms.ts:625,666 | 0.2 mm | Arm von der Wand abgesetzt | fest | mechanism.test.ts:515 |  |
| 170 | SNAP.side | mechanisms.ts:625,652 | 0.3 mm je Seite | Fenster breiter als der Arm (5.6 mm) | fest | mechanism.test.ts:515 |  |
| 171 | SNAP.seat | mechanisms.ts:625,658 | 0.2 mm | Fensterkante unter der Nase | fest | mechanism.test.ts:515 |  |
| 172 | SNAP.air | mechanisms.ts:625,653 | 0.5 mm | Luft über der Hakenspitze; Fensterhöhe 2.2 | fest | mechanism.test.ts:515 |  |
| 173 | snap.wall | mechanisms.ts:633 | 1.6 bis 10 mm; Standard 2 | Fenstertiefe = Wandstärke | snapProblem | mechanism.test.ts:531 |  |
| 174 | snap.more | mechanisms.ts:634 | bis 20 | weitere Haken | snapProblem | mechanism.test.ts:531 |  |
| 175 | snap.up / toward | mechanisms.ts:630-632 | nicht null, nicht parallel (1e-6) | Richtung Haken und Nase | snapProblem | mechanism.test.ts:531 |  |

## 9 Mechanik: Steckverbindung (PEG)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 176 | PEG.ratio | mechanisms.ts:703,706-708 | 1.5 × Ø | Zapfenlänge | fest | mechanism.test.ts:561 |  |
| 177 | PEG.deeper | mechanisms.ts:703,733 | 1 mm | Tasche tiefer (Luft, Kleber) | fest | mechanism.test.ts:561 |  |
| 178 | PEG.chamfer | mechanisms.ts:703,734,736 | 0.5 mm × 45° | Fase an Spitze und Mund | fest | mechanism.test.ts:561 |  |
| 179 | PEG.root | mechanisms.ts:703,735 | 0.5 mm | Zapfen wurzelt im Körper | fest | mechanism.test.ts:561 |  |
| 180 | PEG.least | mechanisms.ts:703 | 5 mm | Standarddurchmesser, darunter Warnung (mechanismTool.ts:604) | nur Warnung | mechanism.test.ts:587 |  |
| 181 | peg.diameter | mechanisms.ts:713 | 3 bis 20 mm | Zapfendurchmesser | pegProblem | mechanism.test.ts:587 |  |
| 182 | peg.gap | mechanisms.ts:714 | 0.05 bis 0.5 mm je Seite; Standard 0.2 (mechanismTool.ts:181) | Spiel | pegProblem | mechanism.test.ts:587 |  |
| 183 | peg.more | mechanisms.ts:715 | bis 20 | weitere Zapfen | pegProblem | mechanism.test.ts:587 |  |

## 10 Mechanik: Schnappriegel außen (LATCH)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 184 | LATCH.thick | mechanisms.ts:766 | 1.6 mm | Armdicke | fest | mechanism.test.ts:616 |  |
| 185 | LATCH.off | mechanisms.ts:766 | 1.5 mm | Arm von der Wand | fest | mechanism.test.ts:616 |  |
| 186 | LATCH.foot | mechanisms.ts:766 | 1 mm über der Fuge | Unterkante der Wurzel | fest | mechanism.test.ts:616 |  |
| 187 | LATCH.head | mechanisms.ts:766 | 5 mm über der Fuge | Oberkante der Wurzel, darüber 45° | fest | mechanism.test.ts:616 |  |
| 188 | LATCH.lever | mechanisms.ts:766 | 12 mm | Hebel bis zum Haken | fest | mechanism.test.ts:616 |  |
| 189 | LATCH.bead | mechanisms.ts:766 | 1.2 mm | Wulst an der Box, 2.4 hoch, 45° | fest | mechanism.test.ts:616 |  |
| 190 | LATCH.clear | mechanisms.ts:766 | 0.4 mm | Hakenspitze von der Wand; Überdeckung 0.8 | fest | mechanism.test.ts:616 |  |
| 191 | LATCH.seat | mechanisms.ts:766,803 | 0 mm | Abstand der 45°-Flächen (liegen aufeinander) | fest | mechanism.test.ts:616 |  |
| 192 | LATCH.tab | mechanisms.ts:766 | 2 mm | Griffstück unter dem Haken | fest | mechanism.test.ts:616 |  |
| 193 | LATCH.into | mechanisms.ts:766 | 0.5 mm | Profile reichen in die Wand | fest | mechanism.test.ts:616 |  |
| 194 | LATCH.beside | mechanisms.ts:766,818 | 1 mm je Seite | Wulst breiter als der Riegel | fest | mechanism.test.ts:616 |  |
| 195 | latch.width | mechanisms.ts:780 | 5 bis 40 mm; Standard 10 (mechanismTool.ts:191) | Breite entlang der Wand | latchProblem | mechanism.test.ts:644 |  |
| 196 | latchReach | mechanisms.ts:769-772 | oben 8.1 mm, unten 14.1 mm | nötige ebene Wand | nur Meldung (mechanismTool.ts:582) | mechanism.test.ts (nicht eindeutig) |  |
| 197 | latch.up / out | mechanisms.ts:777-779 | nicht null, nicht parallel | Richtung | latchProblem | mechanism.test.ts:644 |  |

## 11 Knopf für eine Welle (`knob.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 198 | KNOB_SHAFTS | knob.ts:11 | d, round, knurl | Wellenart | blockTool.ts:179 | blockTool.test.ts:98,109 |  |
| 199 | KNOB.roof | knob.ts:21 | 3 mm | Material über dem Wellenende | fest | blockTool.test.ts:61 |  |
| 200 | KNOB.wall | knob.ts:21,76 | 2.4 mm | Wand zwischen Bohrung und Rillengrund | über Mindestdurchmesser | blockTool.test.ts:109 |  |
| 201 | KNOB.insert | knob.ts:21,59-61 | 11 mm, höchstens Höhe - 3 | Einstecktiefe | abgeleitet | blockTool.test.ts:61 |  |
| 202 | KNOB.flat | knob.ts:21,115 | 7 mm | Länge der Abflachung am Bohrungsende | fest | blockTool.test.ts:61 |  |
| 203 | KNOB.flute | knob.ts:21,107 | Ø 3 mm, Mitte r + 0.75 | Griffrillen 0.75 mm tief | fest | blockTool.test.ts:61 |  |
| 204 | KNOB.band | knob.ts:21,107 | 2 mm | glattes Band oben, Rillen enden darunter | fest | blockTool.test.ts:61 |  |
| 205 | KNOB.chamfer | knob.ts:21,104-105 | 0.6 mm | Fase oben (Bettkante beim Druck) | fest | blockTool.test.ts:61 |  |
| 206 | KNOB.mouth | knob.ts:21,111 | 0.5 mm | Fase am Bohrungsmund | fest | blockTool.test.ts:61 |  |
| 207 | KNOB.pointer | knob.ts:21,132-133 | 1.2 mm breit, 0.6 tief, von 0.35·r bis r | Zeigernut | fest | blockTool.test.ts:61 |  |
| 208 | KNOB.setScrew | knob.ts:21,127 | 2.6 mm | Kernloch für M3-Gewindestift, auf halber Einstecktiefe | fest, nur round | blockTool.test.ts:98 |  |
| 209 | KNOB_CLEARANCE d | knob.ts:24 | 0.2 mm auf den Durchmesser | Bohrung = Welle + 0.2 | Standard, überschreibbar | blockTool.test.ts:109 |  |
| 210 | KNOB_CLEARANCE round | knob.ts:24 | 0.2 mm | wie oben | wie oben | blockTool.test.ts:98 |  |
| 211 | KNOB_CLEARANCE knurl | knob.ts:24 | 0 mm | glatte Bohrung im Nennmaß | wie oben | blockTool.test.ts:98 |  |
| 212 | knobFlat | knob.ts:54-56 | 4.5 mm bei 6 mm Welle, sonst Messwert nötig | Dicke an der Abflachung | blockTool.ts:182-183 | blockTool.test.ts:109 |  |
| 213 | knob.shaftDiameter | knob.ts:73 | 3 bis 10 mm; Standard 6 | Wellendurchmesser | knobProblem | blockTool.test.ts:109 |  |
| 214 | knob.clearance | knob.ts:74 | 0 bis 0.6 mm | Zugabe auf Ø und Abflachung | knobProblem | blockTool.test.ts:109 |  |
| 215 | knob.flat | knob.ts:75 | zwischen Ø/2 und Ø (offen) | Lage der Abflachung | knobProblem | blockTool.test.ts:109 |  |
| 216 | knob.diameter | knob.ts:76-77 | ceil(Ø + Spiel + 4.8 + 1.5) bis 80 mm; Standard 25 | Außendurchmesser | knobProblem | blockTool.test.ts:109 |  |
| 217 | knob.height | knob.ts:78 | 9 bis 60 mm; Standard 16 | Höhe | knobProblem | blockTool.test.ts:109 |  |
| 218 | knobFlutes | knob.ts:64-66 | max(8, round(π·Ø / 7)) | Rillenzahl (25 mm: 11) | abgeleitet | blockTool.test.ts:61 |  |
| 219 | knob Abflachung Lage | knob.ts:116-122 | Kante bei flat - Ø/2 + Spiel/2 von der Achse, Seite gegenüber dem Zeiger | D-Form | fest | blockTool.test.ts:61 |  |
| 220 | knob Druckfläche | knob.ts:134 | Oberseite | `body.print_face` | fest | blockTool.test.ts:61,125 |  |

## 12 Magnettaschen (`magnet.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 221 | MAGNET_HOLDS | magnet.ts:10 | glue, press | Halteart | blockTool.ts:149 | blockTool.test.ts:161 |  |
| 222 | MAGNET.room.glue | magnet.ts:17 | +0.3 mm auf den Durchmesser | Tasche zum Einkleben | fest | blockTool.test.ts:145 |  |
| 223 | MAGNET.room.press | magnet.ts:17 | +0.1 mm | Tasche zum Einpressen | fest | blockTool.test.ts:145 |  |
| 224 | MAGNET.sunk | magnet.ts:17 | 0.2 mm | Magnet liegt unter der Fläche | fest | blockTool.test.ts:145 |  |
| 225 | MAGNET.chamfer | magnet.ts:17,59 | 0.4 mm × 45° | Einführfase | fest | blockTool.test.ts:145 |  |
| 226 | magnet.diameter | magnet.ts:43 | 2 bis 40 mm; Standard 6 (blockTool.ts:151) | Magnetdurchmesser | magnetProblem | blockTool.test.ts:161 |  |
| 227 | magnet.height | magnet.ts:44 | 1 bis 20 mm; Standard 2 | Magnethöhe | magnetProblem | blockTool.test.ts:161 |  |
| 228 | magnet.more | magnet.ts:45 | bis 40 | weitere Taschen | magnetProblem (Werkzeugschema erlaubt 99) | keiner (Grenze) |  |
| 229 | magnet.normal | magnet.ts:42 | nicht null | Richtung der Tasche | magnetProblem | blockTool.test.ts:161 |  |

## 13 Wandmontage (`wallMount.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 230 | WOOD_SCREWS | wallMount.ts:11 | 3.5, 4, 4.5, 5 mm; Standard 4 (blockTool.ts:108) | Holzschraube | blockTool.ts:109 | blockTool.test.ts:209 |  |
| 231 | WALL 3.5 | wallMount.ts:20 | entry 8 / slot 4 / pocket 3 / clearance 4.1 / countersink 7.8 mm | Schlüsselloch und Senkloch | Tabelle | blockTool.test.ts:209 (laut Titel) |  |
| 232 | WALL 4 | wallMount.ts:21 | entry 9 / slot 4.5 / pocket 3.5 / clearance 4.7 / countersink 8.8 | wie oben | Tabelle | blockTool.test.ts:177,209 |  |
| 233 | WALL 4.5 | wallMount.ts:22 | entry 10 / slot 5 / pocket 3.8 / clearance 5.2 / countersink 9.7 | wie oben | Tabelle | blockTool.test.ts:209 |  |
| 234 | WALL 5 | wallMount.ts:23 | entry 11 / slot 5.5 / pocket 4.2 / clearance 5.7 / countersink 10.6 | wie oben | Tabelle | blockTool.test.ts:209 |  |
| 235 | KEYHOLE.travel | wallMount.ts:30 | 8 mm | Weg der Schraube im Schlitz | fest | blockTool.test.ts:177 |  |
| 236 | KEYHOLE.lip | wallMount.ts:30 | 2 mm | Steg vor dem Kopf (trägt die Last) | fest, eigene Wahl | blockTool.test.ts:177 |  |
| 237 | KEYHOLE.behind | wallMount.ts:30 | 1.2 mm | Rest hinter dem Kopf | nur in keyholeDepth | blockTool.test.ts:209 |  |
| 238 | keyholeDepth | wallMount.ts:54-56 | 6.2 / 6.7 / 7.0 / 7.4 mm | Mindestdicke des Teils | nur Meldung (blockTool.ts:133) | blockTool.test.ts:209 |  |
| 239 | keyhole.normal / up | wallMount.ts:60-62 | nicht null, rechtwinklig (1e-6) | Lage | keyholeProblem | blockTool.test.ts:209 |  |
| 240 | keyhole.more | wallMount.ts:63 | bis 20 | weitere Schlüssellöcher | keyholeProblem | keiner (Grenze) |  |
| 241 | Senkloch Holzschraube | wallMount.ts:106-112 | Ø clearance, Senkung Ø countersink, 90° | `solid.hole countersink` | keine eigene Prüfung | blockTool.test.ts:209 |  |

## 14 Normen zum Nachschlagen (`standards.ts`) - Zahlen je Regel

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 242 | STANDARD_TOPICS | standards.ts:9 | slidingLid, clamp, feet, hook, cableEntry, vent, boardMount, starKnob | Themen von `partbuddy_standard` | standardTool.ts | standardTool.test.ts:29 |  |
| 243 | slidingLid Nutflanke / Brücke | standards.ts:16 | 45°; eckige Nut hängt ab 5 mm durch | Regeltext | keine (nur Text) | standardTool.test.ts:29 (nur Vorhandensein) |  |
| 244 | slidingLid Deckel / Nut / Wand | standards.ts:17 | Deckel 3-4 mm; Nut 1.5 tief, max. halbe Wand; 2 mm Wand über der Nut; Wände 3 mm | Regeltext | keine | keiner |  |
| 245 | slidingLid Spiel | standards.ts:18 | 0.3 mm je Seite und 0.3 darüber/darunter (Quellen 0.2-0.5) | Regeltext | keine | keiner |  |
| 246 | slidingLid Rastung / Griff | standards.ts:19 | Noppe 0.3 mm; Griffmulde Ø 12, 2 tief | Regeltext | keine | keiner |  |
| 247 | clamp C-Clip | standards.ts:27 | Innen-Ø Rohr + 0.3-0.5; Öffnung 75-85 %; Arme 1.5-2.5 dick, 8-12 breit | Regeltext | keine | keiner |  |
| 248 | clamp Schraubklemme | standards.ts:28 | Bohrung Messmaß (+0.1-0.2 gleitend); Schlitz 2-5; Wand ca. 4 bei 25 mm | Regeltext | keine | keiner |  |
| 249 | clamp zwei Hälften | standards.ts:29 | 0.4 mm Luft am Rohr; 1 mm Spalt | Regeltext | keine | keiner |  |
| 250 | feet 3M Bumpon | standards.ts:37 | SJ5302 7.9×2.2; SJ5076 8.0×2.8; SJ5306 9.5×3.8; SJ5003 11.1×5.0; SJ5012 12.7×3.5; SJ5744 19.1×4.1 (±0.5) | Regeltext | keine | keiner |  |
| 251 | feet Vertiefung | standards.ts:38 | 0.5 mm weiter; 0.5-1 tief; max. halber Fuß | Regeltext | keine | keiner |  |
| 252 | feet Bettfase | standards.ts:40 | 0.4 mm × 45° (Slicer ca. 0.2; Gridfinity 0.8) | Regeltext | keine | keiner |  |
| 253 | feet angedruckt | standards.ts:41 | min. Ø 8, 2 hoch | Regeltext | keine | keiner |  |
| 254 | hook Bruchlasten | standards.ts:47 | liegend 119 kg PLA / 106 kg PETG; stehend 69 / 36 kg; Dauerlast ein Zehntel | Regeltext | keine | keiner |  |
| 255 | hook Schicht / Wände | standards.ts:48 | Schicht max. 0.2; min. 4 Wandlinien | Regeltext | keine | keiner |  |
| 256 | hook Radius / Querschnitt | standards.ts:49 | Innenradius >= Hakendicke; min. 6 × 6 mm | Regeltext | keine | keiner |  |
| 257 | hook Aufhängung | standards.ts:50 | ab 60 mm Breite zwei Schrauben | Regeltext | keine | keiner |  |
| 258 | hook Öse | standards.ts:51 | 4 (5) mm Schlüsselring; 3.5 Kugelkette; 2×Draht+1 Karabiner; je +0.2; 2-3 mm Rand | Regeltext | keine | keiner |  |
| 259 | hook Kabelbinder | standards.ts:52 | 2.5 / 3.5 / 4.6 breit, ca. 1 dick; Schlitz +1 breit, 1.5 hoch | Regeltext | keine | keiner |  |
| 260 | cableEntry Kabel | standards.ts:58 | USB-C 2-4 / 4-6; H03VV-F 2×0.75 ca. 5.8; H05VV-F 3×0.75 6.0-7.6 | Regeltext | keine | keiner |  |
| 261 | cableEntry Loch | standards.ts:59 | Kabel + 1 mm; Kante 0.5; Stecker + 1 je Seite | Regeltext | keine | keiner |  |
| 262 | cableEntry Biegeradius | standards.ts:60 | min. 4 × Durchmesser | Regeltext | keine | keiner |  |
| 263 | cableEntry Zugentlastung | standards.ts:61 | Binder 2.5 / 3.5, Schlitz +1 breit, 1.5 hoch; Sattel 0.5 mm unter Kabelmaß | Regeltext | keine | keiner |  |
| 264 | cableEntry Verschraubung | standards.ts:62 | M12 12.2 (3-6.5); M16 16.2 (4-8 / 5-10); M20 20.2 (6-12); PG7 12.7-13; PG9 15.4-15.7 | Regeltext | keine | keiner |  |
| 265 | vent Schlitze | standards.ts:69 | 2-3 mm breit; Stege min. 1.2 mm; liegender Schlitz bis 5 mm; 45°-Spitze | Regeltext | keine | keiner |  |
| 266 | vent Waben | standards.ts:70 | SW 6-8; Stege 1.2 | Regeltext | keine | keiner |  |
| 267 | vent Fingerschutz | standards.ts:71 | Öffnung max. 12 mm (IP2X 12.5); 1 mm (IP4X) | Regeltext | keine | keiner |  |
| 268 | vent Lüfter-Lochabstand | standards.ts:72 | 25→20; 30→24; 40→32; 50→40; 60→50; 80→71.5; 92→82.5; 120→105 mm; M3 bis 60, darüber M4 | Regeltext | keine | keiner |  |
| 269 | vent Lüfteröffnung | standards.ts:73 | Loch 2 mm kleiner als Lüfter; 3 mm Wand | Regeltext | keine | keiner |  |
| 270 | boardMount Abstandsbolzen | standards.ts:80 | Außen-Ø 2-2.5 × Loch, min. 5; Höhe 5 (10 über Stiftleisten); Kehle 1 mm | Regeltext | keine | keiner |  |
| 271 | boardMount Kernloch | standards.ts:81 | 0.25 mm unter Schraube; "2.0 mm M2.5 / 2.5 mm M3 nach Druck"; Tiefe min. 2 × d | Regeltext | keine | keiner |  |
| 272 | boardMount ohne Schrauben | standards.ts:82 | Stifte 0.3 unter Loch; Platine 1.6; Haken 1 dick, 5 breit, 0.5 Luft | Regeltext | keine | keiner |  |
| 273 | boardMount Schlitz | standards.ts:83 | 2.0 breit für 1.6-mm-Platine, 2 tief | Regeltext | keine | keiner |  |
| 274 | boardMount Luft | standards.ts:84 | 0.5 um die Platine; 1 mm je Seite um Stecker | Regeltext | keine | keiner |  |
| 275 | boardMount Raspberry Pi 4/5 | standards.ts:85 | 85 × 56; 4 × Ø 2.7 (M2.5); Lochbild 58 × 49; 3.5 vom Rand | Regeltext | keine | keiner |  |
| 276 | boardMount Pi Zero | standards.ts:85 | 65 × 30; Lochbild 58 × 23 | Regeltext | keine | keiner |  |
| 277 | boardMount Arduino Uno | standards.ts:85 | 68.58 × 53.34; Ø 3.2 bei (13.97, 2.54), (15.24, 50.80), (66.04, 7.62), (66.04, 35.56) | Regeltext | keine | keiner |  |
| 278 | boardMount Pi-Stecker lange Kante | standards.ts:86 | Pi 4: USB-C 11.2, HDMI 26.0 / 39.5, Audio 54.0; Pi 5: 11.2, 25.8 / 39.2 | Regeltext | keine | keiner |  |
| 279 | boardMount Pi-Stecker kurze Kante | standards.ts:86 | Pi 4: USB 9 / 27, Ethernet 45.75; Pi 5: Ethernet 10.2, USB 29.1 / 47; ca. 3 mm Überstand | Regeltext | keine | keiner |  |
| 280 | starKnob DIN 6336 | standards.ts:92 | Ø 25 M5 (Nabe 12, Höhe 16); 32 M6 (14, 20); 40 M8 (18, 25); 50 M10 (22, 32); 63 M12 (26, 40) | Regeltext | keine | keiner |  |
| 281 | starKnob Lappen | standards.ts:93 | 5 Lappen; Radius ca. Ø/6 | Regeltext | keine | keiner |  |
| 282 | starKnob Sechskanttasche | standards.ts:94 | SW + 0.3; Loch Gewinde + 0.4; ISO 4017: M5 8/3.5, M6 10/4, M8 13/5.3 | Regeltext | keine | keiner |  |
| 283 | starKnob Mutter | standards.ts:95 | ISO 4032 Höhe 4.7 / 5.2 / 6.8; "nutTrap für M3 bis M6" | Regeltext | keine | keiner |  |
| 284 | standardText Rahmen | standards.ts:103-106 | Vor- und Nachsatz ("None of this has been printed") | Antwort des Werkzeugs | fest | standardTool.test.ts:15 |  |

## 15 Toleranz-Assistent (`tolerances.ts`, `testPieces.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 285 | FIT_STEPS | tolerances.ts:8 | -0.1 bis 0.5 mm in 0.05 (13 Stufen), je Seite | Löcher des Passungskamms | applyReadings: nur Stufen | tolerances.test.ts:41,54 |  |
| 286 | HOLE_SIZES | tolerances.ts:9 | 3, 5, 8, 10 mm | Lochplatte | - | tolerances.test.ts:54 |  |
| 287 | OVERHANG_STEPS | tolerances.ts:10 | 20° bis 70° in 5° (11) | Überhangtreppe | applyReadings: nur Stufen | tolerances.test.ts:41,54 |  |
| 288 | Ablesung Passung | tolerances.ts:38-41 | Stufe aus FIT_STEPS; geklemmt -0.5 bis 2 | Spiel je Passung im Profil | Problem `fit` | tolerances.test.ts:16,33 |  |
| 289 | Reihenfolge der Passungen | tolerances.ts:43-44 | nur unter den abgelesenen: nicht fallend | Plausibilität | Problem `order` | tolerances.test.ts:33 |  |
| 290 | Ablesung Loch | tolerances.ts:50 | > 0 und höchstens 1 mm vom Nennmaß | Lochschwund | Problem `hole` | tolerances.test.ts:33 |  |
| 291 | holeShrink aus Messung | tolerances.ts:53 | Mittel (Nenn - Mess), auf 0.05, geklemmt 0 bis 1 | Lochaufmaß im Profil | - | tolerances.test.ts:23,29 |  |
| 292 | Ablesung Überhang | tolerances.ts:55-59 | Stufe, 20 bis 70 | Überhanggrenze im Profil | Problem `overhang` | tolerances.test.ts:33,41 |  |
| 293 | toStep | tolerances.ts:24 | Rundung auf 0.05 | - | - | tolerances.test.ts:23 |  |
| 294 | PIN | testPieces.ts:14 | 6 mm | Stift; Loch = 6 + 2 × Stufe | fest | tolerances.test.ts:54 (indirekt) |  |
| 295 | Höhen auf Schichten | testPieces.ts:19 | ceil(mm / Schicht - 1e-9) × Schicht | Kamm 4, Platte 3, Sockel 1.2, Griff 2 mm | fest | tolerances.test.ts:58 |  |
| 296 | Gravurtiefe | testPieces.ts:20 | 2 Schichten | Beschriftung | fest | tolerances.test.ts:58 |  |
| 297 | Schrifthöhe | testPieces.ts:21 | max(3, 7.5 × Düse) mm, eingebaute Schrift (nicht fett) | Beschriftung | fest | keiner |  |
| 298 | Kamm Raster | testPieces.ts:31-37 | Teilung max(12, 4 × Schrift); Reihe Schrift + 12; 7 je Reihe | Lage der Löcher | fest | keiner |  |
| 299 | Stift | testPieces.ts:47-48 | Griff Ø 12 × 2 mm; Stift Ø 6 × 10 mm | Prüfstift | fest | tolerances.test.ts:58 (Körper) |  |
| 300 | Lochplatte | testPieces.ts:51-56 | 16 mm Teilung; Breite Schrift + 16; Dicke 3 | Messlöcher senkrecht | fest | tolerances.test.ts:58 (Körper) |  |
| 301 | Treppe Finne | testPieces.ts:65-69 | Teilung max(8, 2.7 × Schrift); Höhe 6; Tiefe max(3, 6 × Düse); Breite max(4, 8 × Düse) | Überhangfinnen | fest | keiner |  |
| 302 | Treppe Ausladung | testPieces.ts:75 | 6 × tan(Winkel) mm (70°: 16.5) | Neigung von der Senkrechten | fest | keiner |  |
| 303 | Testteil-Anfrage | contract.ts:1115 | Düse 0.1-2, Schicht 0.04-1.2 | Bereich | Zod | keiner |  |

## 16 Maße nach Düse und Schicht (`designFit.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 304 | lineWidth | designFit.ts:20-22 | Düse × 1.125 | Breite einer Bahn (0.45 bei 0.4) | - | designRules.test.ts:103 |  |
| 305 | printInPlaceGap | designFit.ts:29-31 | max(0.3, Düse) | Spalt beweglicher Teile | snapSize gap | designRules.test.ts:103,113 |  |
| 306 | scaleClearance | designFit.ts:34-36 | Spiel × Düse / 0.4 | Passungsspiele im Hinweis an den Assistenten (printProfiles.ts:261,303) | keine Grenzen | designRules.test.ts (Hinweistext, nicht eindeutig) |  |
| 307 | UNIT_OF | designFit.ts:40 | wall→line, height→layer, gap→nozzle, detail→nozzle | Raster je Maßart | - | designRules.test.ts:103 |  |
| 308 | MINIMUM.wall | designFit.ts:43 | 2 Bahnen (0.9 bei 0.4) | kleinste Wand | snapSize / Warnung fitSize | designRules.test.ts:103,122 |  |
| 309 | MINIMUM.height | designFit.ts:44 | 1 Schicht | kleinste Höhe | wie oben | designRules.test.ts:103 |  |
| 310 | MINIMUM.gap | designFit.ts:45 | 0.2 mm | Warnschwelle für Nutzermaße | nur fitSize 'user' | designRules.test.ts:122 |  |
| 311 | MINIMUM.detail | designFit.ts:46 | 1 Düse | kleinstes Detail | wie wall | designRules.test.ts:103,122 |  |
| 312 | snapSize | designFit.ts:50-55 | aufrunden auf ganzes Vielfaches (ε 1e-6), min. Minimum; gap: max(Wert, printInPlaceGap) | Maße des Assistenten | - | designRules.test.ts:103,113 |  |
| 313 | fitSize | designFit.ts:67-75 | Nutzermaß bleibt; Warnung unter Minimum oder Wand nicht auf Raster | Warntext | - | designRules.test.ts:122 |  |
| 314 | MARK / fitMarkOf | designFit.ts:82-90 | `[auto N×line / layer / nozzle]`, N > 0, auch x * , und Dezimal | Kennzeichen im Parameterkommentar | - | designRules.test.ts:131 |  |
| 315 | fittedValue | designFit.ts:102-106 | line/layer: Wert neu aufrunden; nozzle: N × Düse | Wert auf neuem Drucker | - | designRules.test.ts:131 |  |
| 316 | refit | designFit.ts:109-116 | nur markierte Parameter mit Änderung > 1e-6 | Nachführen bei Druckerwechsel | index.ts (Aufrufer) | designRules.test.ts:131 |  |
| 317 | Rundung | designFit.ts:16 | 0.001 mm | - | - | designRules.test.ts:113 (2.025) |  |

## 17 Profile und Grenzen (`contract.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 318 | printer.bed | contract.ts:1055 | je Achse 20 bis 2000 mm | Bauraum für die Größenprüfung | Zod | printerCatalog.test.ts |  |
| 319 | printer.nozzle | contract.ts:1056 | 0.1 bis 2 mm | Düse | Zod | printerCatalog.test.ts |  |
| 320 | printer.layer | contract.ts:1057 | 0.04 bis 1.2 mm | Schichthöhe | Zod; kein Bezug zur Düse | printerCatalog.test.ts |  |
| 321 | FIT_KINDS | contract.ts:1062-1063 | clamp, push, slide, turn | Passungsarten | Zod | tolerances.test.ts |  |
| 322 | material.overhang | contract.ts:1070 | 20 bis 70° von der Senkrechten | Überhanggrenze | Zod | materialCatalog.test.ts |  |
| 323 | material.holeShrink | contract.ts:1072 | 0 bis 1 mm auf den Durchmesser | Lochaufmaß | Zod | materialCatalog.test.ts |  |
| 324 | material.clearance je Passung | contract.ts:1074 | -0.5 bis 2 mm je Seite | Spiel | Zod; keine Reihenfolgeprüfung | materialCatalog.test.ts |  |
| 325 | MAX_PRINTERS / MAX_MATERIALS | contract.ts:1046,1048 | 20 / 50 | Anzahl Profile | Zod | keiner |  |
| 326 | DESIGN_RULES | contract.ts:1085-1091 | rounding, printInPlace, details, snap; alle an | Regelgruppen | Zod | designRules.test.ts:37-85 |  |
| 327 | supportFree | contract.ts:1106 | Standard true | stützfreie Konstruktion | Zod | designRules.test.ts |  |
| 328 | Standardprofile | printProfiles.ts:50-56 | Drucker 256³, 0.4 / 0.2; PLA 45° / 0.15 / 0.05-0.15-0.25-0.3; PETG 40 / 0.2 / 0.1-0.2-0.3-0.35; PETG-CF wie PETG; ASA 40 / 0.2 / wie PETG; TPU 35 / 0.25 / 0-0.1-0.3-0.4 | Startwerte ohne Katalog | - | (außerhalb shared; nur zum Abgleich) |  |
| 329 | designAction size | contract.ts:679,767-773 | > 0 bis 100000 mm; extrude -10000 bis 10000, nicht 0 | Verrundung, Fase, Extrusion, Loch, Schale der Oberfläche | Zod | keiner in shared |  |
| 330 | clearanceRequest.gap | contract.ts:917 | 0 bis 5 mm; 2 bis 200 Körper | Abstandsprüfung | Zod | keiner in shared |  |
| 331 | printFinding overhang.limit | contract.ts:1146 | 0 bis 90° | Befundgrenze | Zod | keiner in shared |  |
| 332 | printCheck findings | contract.ts:1158 | bis 40 Befunde; Düse 0.1-2 | Bericht | Zod | keiner in shared |  |
| 333 | logoMove | contract.ts:890-912 | depth > 0 bis 50; rotate -360 bis 360; width > 0 bis 1000; Texthöhe > 0 bis 500 | Logo/Text verschieben | Zod | logoMove.test.ts (nicht gelesen) |  |
| 334 | partInsert.length | contract.ts:791 | > 0 bis 1000 mm | Normteil | Zod | keiner in shared |  |
| 335 | partFamily | contract.ts:776 | socket_head_cap_screw, button_head_cap_screw, hex_bolt, set_screw, hex_nut, washer, dowel_pin, bearing | Normteile der Oberfläche | Zod | keiner in shared |  |
| 336 | exportFormat | contract.ts:662 | 3mf, stl, step | Export | Zod | keiner in shared |  |
| 337 | ZOOM_STEPS / zoomSchema | contract.ts:364-365 | 0.9, 1, 1.1, 1.25, 1.5 / 0.8 bis 1.5 | Oberflächengröße | Zod | settingsStore.test.ts |  |
| 338 | templateRequest | contract.ts:253 | Vorlage aus TEMPLATE_IDS; Name 1-80 | neue Vorlage | Zod | templates.test.ts:53 |  |

## 18 Vorlagen (`templates.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 339 | TEMPLATE_IDS | templates.ts:18 | hingedBox, slideStop, housing, sign, wallHolder | Vorlagen | contract.ts:253 | templates.test.ts:53 |  |
| 340 | hingedBox length | templates.ts:70 | 60 mm ("mindestens 54") | Außenlänge | Parameter, keine Grenze | templates.test.ts:16 |  |
| 341 | hingedBox width | templates.ts:71 | 40 mm | Außenbreite | Parameter | templates.test.ts:16 |  |
| 342 | hingedBox height | templates.ts:72 | 16 mm je Hälfte | Höhe | Parameter | templates.test.ts:16 |  |
| 343 | hingedBox wall | templates.ts:73 | 2.4 mm | Wand und Boden | Parameter | templates.test.ts:16 |  |
| 344 | hingedBox corner | templates.ts:74 | 5 mm ("mindestens Wand + 2") | Eckenradius | Parameter, keine Grenze | templates.test.ts:16 |  |
| 345 | hingedBox Scharnier | templates.ts:50-52,93 | Länge 40, Ø 8, gap 0.4, 5 Augen (je 7.68), Stift 4; Linie y 0.5, z = height; ohne `support` | Scharnier fest, nicht parametrisch | fest | templates.test.ts:98 |  |
| 346 | hingedBox Abstand der Hälften | templates.ts:50 | 1 mm | Fuge | fest | templates.test.ts:98 |  |
| 347 | hingedBox Bettfase | templates.ts:67 | 0.6 mm | Fase unten | fest | keiner |  |
| 348 | hingedBox Verschluss | templates.ts:79-91 | LIP-Werte; Raste Seite y+; Radius corner - wall | Schnappverschluss | lipSteps | mechanism.test.ts:328 |  |
| 349 | hingedBox Gelenk | templates.ts:103 | revolute, 0 bis 180°, offset -gap | Bewegung | fest | templates.test.ts:98 |  |
| 350 | slideStop length | templates.ts:121 | 120 mm | Länge Grundplatte/Schiene | Parameter | templates.test.ts:16 |  |
| 351 | slideStop base_width | templates.ts:122 | 40 mm (Anschlag fest 24 breit) | Breite | Parameter | templates.test.ts:16 |  |
| 352 | slideStop stop_length / stop_height | templates.ts:123-124 | 30 / 20 mm | Anschlag | Parameter | templates.test.ts:16 |  |
| 353 | slideStop screw_hole / screw_head | templates.ts:125-126,133-134 | 4.5 / 9 mm; Senkung 3 mm tief in 6-mm-Platte | Befestigung 4-mm-Holzschraube | Parameter | templates.test.ts:38 |  |
| 354 | slideStop clamp_hole | templates.ts:127,138 | 5.6 mm, durch die ganze Anschlaghöhe | M4-Einsatz | Parameter | templates.test.ts:16 |  |
| 355 | slideStop Führung | templates.ts:114,140 | Platte 6 dick; gap 0.4; Schiene 6 breit, 3 hoch | Schwalbenschwanz | fest | templates.test.ts:120 |  |
| 356 | slideStop Gelenk | templates.ts:150 | slider, -45 bis 45 mm (fest) | Weg | fest | templates.test.ts:120 |  |
| 357 | slideStop Druckfläche | templates.ts:146 | Oberseite des Anschlags | Nut ohne Brücke | fest | keiner |  |
| 358 | slideStop Radien / Fase | templates.ts:130-131,137 | Platte R 3, Bettfase 0.6; Anschlag R 2 | Kanten | fest | keiner |  |
| 359 | sign Parameter | templates.ts:162-167 | label "PartBuddy"; 80 × 25 × 3; Schrift 9; Loch 3.4 | Schild | Parameter | templates.test.ts:133 |  |
| 360 | sign Details | templates.ts:170-179 | R 4; Bettfase 0.6; Löcher bei x 6 und length - 6; Buchstaben 0.8 hoch, Arial fett | Schild | fest | templates.test.ts:133 |  |
| 361 | housing length / width / height | templates.ts:205-207 | 80 / 60 / 30 mm | Außenmaße | Parameter | templates.test.ts:16 |  |
| 362 | housing wall | templates.ts:208 | 2 mm | Wand, Boden, Deckel | Parameter | templates.test.ts:16 |  |
| 363 | housing boss | templates.ts:209 | Ø 8 mm; Mitte wall + boss/2 - 0.5 | Schraubdome | Parameter | templates.test.ts:16 |  |
| 364 | housing insert_hole / insert_depth | templates.ts:210-211 | 4 / 6.7 mm | M3-Einsatz | Parameter | templates.test.ts:16 |  |
| 365 | housing screw_hole | templates.ts:212 | 3.4 mm | Deckelloch M3 | Parameter | templates.test.ts:16 |  |
| 366 | housing corner / ear | templates.ts:213-214 | 6 / 12 mm | Eckenradius, Laschen | Parameter | templates.test.ts:16 |  |
| 367 | housing Lüftung | templates.ts:223-228 | 7 Schlitze je Wand, 2 breit, Teilung 5, Höhe 0.4 × height ab 0.3 × height | Lüftungsschlitze | fest | keiner |  |
| 368 | housing Laschen | templates.ts:184-190,230-237 | 22 breit, 4 dick; Langloch 4.5 breit, 9 lang; R 5 / R 1 | Befestigung | fest | keiner |  |
| 369 | housing Kanten | templates.ts:220-221,246-247 | Bettfase 0.6; Rand R 0.6; Deckel Fase 0.6, R 0.8 | Kanten | fest | keiner |  |
| 370 | housing Schrauben | templates.ts:254-258 | 4 × Linsenkopf M3×8 als Normteil | Montage | fest | templates.test.ts:133 |  |
| 371 | wallHolder plate_height / plate_width | templates.ts:264-265 | 100 / 50 mm | Platte | Parameter | templates.test.ts:16 |  |
| 372 | wallHolder wall | templates.ts:266 | 6 mm | Platte, Boden, Rand | Parameter | templates.test.ts:16 |  |
| 373 | wallHolder hook_width / lip_height | templates.ts:267-268 | 40 / 25 mm | Haken | Parameter | templates.test.ts:16 |  |
| 374 | wallHolder screw_hole / screw_head | templates.ts:269-270,280-282 | 4.5 / 9 mm, 90°; bei 0.8 und 0.4 der Höhe | Senklöcher | Parameter | templates.test.ts:16 |  |
| 375 | wallHolder Radien | templates.ts:284-288 | innen 2; außen 5; Rand 3; Bogen 5; weich 1.2 | Kanten | fest | keiner |  |
| 376 | wallHolder Bodenschlitz | templates.ts:290-292 | 6 breit, 0.4 × Breite lang | Wasserablauf | fest | keiner |  |
| 377 | germanFeatureName | templates.ts:387-393 | Namen und Marken · ○ ● ◢ ◆ ◠ △ | Zeitleiste deutsch | - | templates.test.ts:80 |  |

## 19 Montagefolge, Skizze, Einstellungen

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 378 | assembly Namen | assembly.ts:11-12 | Schrittname 1-80, Teilname 1-200 Zeichen | Montagefolge | Zod | assembly.test.ts:63 |  |
| 379 | assembly direction | assembly.ts:16-18 | Länge > 1e-6 | Fügerichtung | Zod | assembly.test.ts:63 |  |
| 380 | assembly Gruppen / Schritte | assembly.ts:48-49 | bis 100 Gruppen; 1 bis 500 Schritte | Umfang | Zod | assembly.test.ts:63 |  |
| 381 | assembly Gruppenregeln | assembly.ts:52-74 | eindeutig, Elter bekannt, kein Kreis, Schrittgruppe bekannt | Baumstruktur | superRefine | assembly.test.ts:63 |  |
| 382 | playbackOrder Ersatzrichtung | assembly.ts:119 | [0, 0, -1] | unbenannte Untergruppe von oben | fest | assembly.test.ts:78 |  |
| 383 | sketch Punkt | sketch.ts:9 | -2000 bis 3000 px | Skizzenblatt 640 × 420 | Zod | sketch.test.ts:129 |  |
| 384 | sketch Grenzen | sketch.ts:10-22 | Text 80; Stift 1-5000 Punkte; Radius 0-3000; 500 Elemente je Blatt | Umfang | Zod | sketch.test.ts:129 |  |
| 385 | sketch scale | sketch.ts:32 | > 0 bis 1000 mm je Kästchen, oder null | Maßstab | Zod | sketch.test.ts:109 |  |
| 386 | sketch Hintergrund | sketch.ts:24-27 | PNG-Data-URL bis 6 MB | Foto unter dem Blatt | Zod | sketch.test.ts:156 |  |
| 387 | keptSketch id | sketch.ts:43 | sketch-JJJJMMTT-HHMMSS | Ablage | Zod | sketch.test.ts:129 |  |
| 388 | settingsSchema | settings.ts:10-40 | language, theme, projectsFolder (1000), zoom, startPage, checkUpdates, setupDone, webResearch, claudeApiBilling, models | Einstellungen, Rückfall auf Standard | Zod `.catch` | settingsStore.test.ts |  |
| 389 | RESET_KEYS / LEGACY_FILES | settings.ts:46-59 | general, assistant / drei Altdateien | Zurücksetzen, Übernahme | settingsStore | settingsStore.test.ts:26,72 |  |

## 20 SVG-Zeichnungen (`svgDrawing.ts`, `drawingDetail.ts`, `drawingPlacement.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 390 | SVG_MAX_BYTES | svgDrawing.ts:15,763 | 512 KiB | größte Datei | Refused tooBig | svgDrawing.test.ts:80 |  |
| 391 | MAX_DEPTH | svgDrawing.ts:17,105 | 64 | Verschachtelung | Refused tooComplex | keiner (einzeln) |  |
| 392 | MAX_SHAPES / MAX_SEGMENTS | svgDrawing.ts:18-19,871 | 20000 / 200000 | Umfang | Refused tooComplex | keiner (einzeln) |  |
| 393 | MAX_USE_DEPTH | svgDrawing.ts:20,816 | 8 | `<use>`-Ketten | stilles Auslassen | keiner (einzeln) |  |
| 394 | Sicherheitsprüfung | svgDrawing.ts:89,115-127 | script, foreignObject, iframe, on*, externe href / url(), @import, ENTITY | Datei abgelehnt | Refused unsafe | svgDrawing.test.ts:80 |  |
| 395 | CUSP_SHARE / CUSP_OPEN | svgDrawing.ts:309,311,319-329 | 0.05 der Sehne / 0.1 | Kontrollpunkt von der Spitze wegrücken | fest | svgDrawing.test.ts:205 |  |
| 396 | Bogen als Kubik | svgDrawing.ts:265-305 | höchstens 90° je Stück; Abweichung max. 2.7e-4 × r | Kreise exakt | fest | svgDrawing.test.ts:18 |  |
| 397 | flatten | svgDrawing.ts:543-561 | Wang, höchstens 1000 Stücke je Kurve | Polygon für Prüfungen | fest | svgDrawing.test.ts:18 |  |
| 398 | Füllregel | svgDrawing.ts:614-630 | Toleranz 1e-4 × Größe; Fläche unter 1e-12 × Größe² entfällt; Abstand 1e-6 | Randschleifen | fest | svgDrawing.test.ts:63,153 |  |
| 399 | Hintergrund / Rahmen | svgDrawing.ts:665,673-691 | Rechteck >= 95 % der Box; Rand 2 %; Rahmenloch >= 80 %; L* >= 90 | Blatt und Rahmen entfallen | gezählt in skipped.backgrounds | svgDrawing.test.ts:186,197 |  |
| 400 | Strichkonturen | svgDrawing.ts:712-748 | Toleranz 5e-4 × Größe; Gehrung Standard 4; Präzision 0-8 Stellen | Linien-Icons als Flächen | fest | svgDrawing.test.ts:129,142 |  |
| 401 | Strichbreite | svgDrawing.ts:861 | Breite × Wurzel der Determinante; Standard 1 | Skalierung | fest | svgDrawing.test.ts:39 |  |
| 402 | MM_PER | svgDrawing.ts:515 | mm 1; cm 10; q 0.25; in 25.4; pt 25.4/72; pc 25.4/6 | natürliche Größe | px und ohne Einheit: keine Größe | svgDrawing.test.ts:97 |  |
| 403 | naturalWidth | svgDrawing.ts:926-928 | Breite × unitMm auf 0.01 | Vorgabebreite | - | svgDrawing.test.ts:97 |  |
| 404 | Farben | svgDrawing.ts:187-210 | #rgb, #rrggbb, rgb(), 20 Namen; sonst schwarz | Füllfarbe je Körper | Rückfall schwarz | svgDrawing.test.ts:39 |  |
| 405 | SAME_COLOUR | svgDrawing.ts:946,953-976 | ΔE*ab 6 | ähnliche Farben verschmelzen | fest | svgDrawing.test.ts:166,172 |  |
| 406 | Ausgabe | svgDrawing.ts:978,997-1003 | 1e-4 mm; evenodd; viewBox in mm | sauberes SVG an SolidCraft | fest | svgDrawing.test.ts:18 |  |
| 407 | drawingFacts | svgDrawing.ts:1064-1088 | Toleranz 0.005 mm; Fläche auf 0.1 mm² | Angaben an den Assistenten | - | drawingTool.test.ts (nicht gelesen) |  |
| 408 | MAX_EDGE_PX | drawingDetail.ts:12,155 | 1600 px; mm/px = max(Düse/10, Größe/1600) | Rasterauflösung | fest | drawingDetail.test.ts:18 |  |
| 409 | MIN_PLACE | drawingDetail.ts:14,141 | 3 × r² Pixel | kleinste gemeldete Stelle | fest | drawingDetail.test.ts:13 |  |
| 410 | Schwelle "zu fein" | drawingDetail.ts:156 | Scheibe mit Düsendurchmesser passt nicht | Warnung Strich/Spalt | nur Hinweis | drawingDetail.test.ts:18,31 |  |
| 411 | fineFrom | drawingDetail.ts:170 | ceil(Breite × Düse × 1.1 / dünnste Stelle) | empfohlene Mindestbreite | nur Hinweis | drawingDetail.test.ts:18 |  |
| 412 | LOGO_PREFIX / TEXT_PREFIX | drawingPlacement.ts:20,23 | "SVG-Logo " / "Text " | reservierte Skizzennamen | drawingTool.ts | drawingPlacement.test.ts:24 |  |
| 413 | logoBase | drawingPlacement.ts:32-34 | Buchstaben, Ziffern, Leerzeichen, _ -; 60 Zeichen | Namen | - | drawingPlacement.test.ts:24 |  |
| 414 | hostFace Toleranzen | drawingPlacement.ts:205,207 | Normale >= 0.999; Ebene ±1e-3 mm | Fläche unter dem Logo | fest | drawingPlacement.test.ts:63 |  |
| 415 | edgeExtent | drawingPlacement.ts:126-148 | Kreisbogen durch drei Punkte (Spline genähert) | Flächenmitte | shortcut-Kommentar | drawingPlacement.test.ts:48,52 |  |

## 21 Materialkatalog (`materialCatalog.ts`) - je Zahl eine Zeile

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 416 | PLA overhang | materialCatalog.ts:27 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); aus Quelle (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 417 | PLA holeShrink | materialCatalog.ts:27 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 418 | PLA clearance.clamp | materialCatalog.ts:27 | 0.05 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 419 | PLA clearance.push | materialCatalog.ts:27 | 0.15 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 420 | PLA clearance.slide | materialCatalog.ts:27 | 0.25 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 421 | PLA clearance.turn | materialCatalog.ts:27 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 422 | PLA Matte overhang | materialCatalog.ts:28 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 423 | PLA Matte holeShrink | materialCatalog.ts:28 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 424 | PLA Matte clearance.clamp | materialCatalog.ts:28 | 0.05 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 425 | PLA Matte clearance.push | materialCatalog.ts:28 | 0.15 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 426 | PLA Matte clearance.slide | materialCatalog.ts:28 | 0.25 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 427 | PLA Matte clearance.turn | materialCatalog.ts:28 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 428 | PLA Silk overhang | materialCatalog.ts:29 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 429 | PLA Silk holeShrink | materialCatalog.ts:29 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 430 | PLA Silk clearance.clamp | materialCatalog.ts:29 | 0.05 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 431 | PLA Silk clearance.push | materialCatalog.ts:29 | 0.15 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 432 | PLA Silk clearance.slide | materialCatalog.ts:29 | 0.25 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 433 | PLA Silk clearance.turn | materialCatalog.ts:29 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 434 | PLA-CF overhang | materialCatalog.ts:30 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 435 | PLA-CF holeShrink | materialCatalog.ts:30 | 0.1 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 436 | PLA-CF clearance.clamp | materialCatalog.ts:30 | 0.05 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 437 | PLA-CF clearance.push | materialCatalog.ts:30 | 0.15 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 438 | PLA-CF clearance.slide | materialCatalog.ts:30 | 0.25 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 439 | PLA-CF clearance.turn | materialCatalog.ts:30 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 440 | PETG overhang | materialCatalog.ts:31 | 40° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 441 | PETG holeShrink | materialCatalog.ts:31 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 442 | PETG clearance.clamp | materialCatalog.ts:31 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 443 | PETG clearance.push | materialCatalog.ts:31 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 444 | PETG clearance.slide | materialCatalog.ts:31 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 445 | PETG clearance.turn | materialCatalog.ts:31 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 446 | PETG-CF overhang | materialCatalog.ts:32 | 40° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 447 | PETG-CF holeShrink | materialCatalog.ts:32 | 0.1 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 448 | PETG-CF clearance.clamp | materialCatalog.ts:32 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 449 | PETG-CF clearance.push | materialCatalog.ts:32 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 450 | PETG-CF clearance.slide | materialCatalog.ts:32 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 451 | PETG-CF clearance.turn | materialCatalog.ts:32 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 452 | PET-CF overhang | materialCatalog.ts:33 | 40° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); aus Quelle (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 453 | PET-CF holeShrink | materialCatalog.ts:33 | 0.1 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 454 | PET-CF clearance.clamp | materialCatalog.ts:33 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 455 | PET-CF clearance.push | materialCatalog.ts:33 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 456 | PET-CF clearance.slide | materialCatalog.ts:33 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 457 | PET-CF clearance.turn | materialCatalog.ts:33 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 458 | ABS overhang | materialCatalog.ts:34 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); aus Quelle (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 459 | ABS holeShrink | materialCatalog.ts:34 | 0.25 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 460 | ABS clearance.clamp | materialCatalog.ts:34 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 461 | ABS clearance.push | materialCatalog.ts:34 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 462 | ABS clearance.slide | materialCatalog.ts:34 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 463 | ABS clearance.turn | materialCatalog.ts:34 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 464 | ABS-GF overhang | materialCatalog.ts:35 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 465 | ABS-GF holeShrink | materialCatalog.ts:35 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 466 | ABS-GF clearance.clamp | materialCatalog.ts:35 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 467 | ABS-GF clearance.push | materialCatalog.ts:35 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 468 | ABS-GF clearance.slide | materialCatalog.ts:35 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 469 | ABS-GF clearance.turn | materialCatalog.ts:35 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 470 | ASA overhang | materialCatalog.ts:36 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 471 | ASA holeShrink | materialCatalog.ts:36 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 472 | ASA clearance.clamp | materialCatalog.ts:36 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 473 | ASA clearance.push | materialCatalog.ts:36 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 474 | ASA clearance.slide | materialCatalog.ts:36 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 475 | ASA clearance.turn | materialCatalog.ts:36 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 476 | TPU 95A overhang | materialCatalog.ts:37 | 35° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 477 | TPU 95A holeShrink | materialCatalog.ts:37 | 0.1 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 478 | TPU 95A clearance.clamp | materialCatalog.ts:37 | 0 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 479 | TPU 95A clearance.push | materialCatalog.ts:37 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 480 | TPU 95A clearance.slide | materialCatalog.ts:37 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 481 | TPU 95A clearance.turn | materialCatalog.ts:37 | 0.4 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 482 | PA (Nylon) overhang | materialCatalog.ts:38 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 483 | PA (Nylon) holeShrink | materialCatalog.ts:38 | 0.2 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 484 | PA (Nylon) clearance.clamp | materialCatalog.ts:38 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 485 | PA (Nylon) clearance.push | materialCatalog.ts:38 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 486 | PA (Nylon) clearance.slide | materialCatalog.ts:38 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 487 | PA (Nylon) clearance.turn | materialCatalog.ts:38 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 488 | PA-CF overhang | materialCatalog.ts:39 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 489 | PA-CF holeShrink | materialCatalog.ts:39 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 490 | PA-CF clearance.clamp | materialCatalog.ts:39 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 491 | PA-CF clearance.push | materialCatalog.ts:39 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 492 | PA-CF clearance.slide | materialCatalog.ts:39 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 493 | PA-CF clearance.turn | materialCatalog.ts:39 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 494 | PA12-CF overhang | materialCatalog.ts:40 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 495 | PA12-CF holeShrink | materialCatalog.ts:40 | 0.1 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 496 | PA12-CF clearance.clamp | materialCatalog.ts:40 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 497 | PA12-CF clearance.push | materialCatalog.ts:40 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 498 | PA12-CF clearance.slide | materialCatalog.ts:40 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 499 | PA12-CF clearance.turn | materialCatalog.ts:40 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 500 | PC overhang | materialCatalog.ts:41 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 501 | PC holeShrink | materialCatalog.ts:41 | 0.2 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 502 | PC clearance.clamp | materialCatalog.ts:41 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 503 | PC clearance.push | materialCatalog.ts:41 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 504 | PC clearance.slide | materialCatalog.ts:41 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 505 | PC clearance.turn | materialCatalog.ts:41 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 506 | HIPS overhang | materialCatalog.ts:42 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 507 | HIPS holeShrink | materialCatalog.ts:42 | 0.15 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 508 | HIPS clearance.clamp | materialCatalog.ts:42 | 0.05 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 509 | HIPS clearance.push | materialCatalog.ts:42 | 0.15 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 510 | HIPS clearance.slide | materialCatalog.ts:42 | 0.25 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 511 | HIPS clearance.turn | materialCatalog.ts:42 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 512 | PP overhang | materialCatalog.ts:43 | 45° von der Senkrechten | Überhanggrenze für Druckprüfung und Regeltext | nur Bereich 20-70 (contract.ts:1070); abgeleitet (Notiz) | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 513 | PP holeShrink | materialCatalog.ts:43 | 0.3 mm auf den Durchmesser | Lochaufmaß im Hinweis an den Assistenten | nur Bereich 0-1 (contract.ts:1072); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 514 | PP clearance.clamp | materialCatalog.ts:43 | 0.1 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 515 | PP clearance.push | materialCatalog.ts:43 | 0.2 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 516 | PP clearance.slide | materialCatalog.ts:43 | 0.3 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |
| 517 | PP clearance.turn | materialCatalog.ts:43 | 0.35 mm je Seite (für 0.4-mm-Düse) | Passungsspiel, im Hinweis mit Düse/0.4 skaliert | nur Bereich -0.5 bis 2 (contract.ts:1074); in keinem Baustein verrechnet | materialCatalog.test.ts (nur Schema, URL, Datum) |  |

## 22 Druckerkatalog (`printerCatalog.ts`) - je Drucker eine Zeile

| Nr | Funktion/Option/Parameter/Grenzwert/Tabelleneintrag | Datei:Zeile | Wert bzw. zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Vorhandener Test | Status |
|---|---|---|---|---|---|---|---|
| 518 | Bambu Lab X1 Carbon | printerCatalog.ts:19 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 519 | Bambu Lab P1S | printerCatalog.ts:20 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 520 | Bambu Lab P2S | printerCatalog.ts:21 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 521 | Bambu Lab A1 | printerCatalog.ts:22 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 522 | Bambu Lab A1 mini | printerCatalog.ts:23 | 180 × 180 × 180 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 523 | Bambu Lab H2D | printerCatalog.ts:24 | 325 × 320 × 325 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 524 | Bambu Lab H2S | printerCatalog.ts:25 | 340 × 320 × 340 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 525 | Bambu Lab H2C | printerCatalog.ts:26 | 325 × 320 × 320 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 526 | Bambu Lab X2D | printerCatalog.ts:27 | 256 × 256 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 527 | Bambu Lab H3C | printerCatalog.ts:28 | 330 × 320 × 325 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 528 | Prusa MK4S | printerCatalog.ts:29 | 250 × 210 × 220 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 529 | Prusa CORE One | printerCatalog.ts:30 | 250 × 220 × 270 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 530 | Prusa CORE One L | printerCatalog.ts:31 | 300 × 300 × 330 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 531 | Prusa XL | printerCatalog.ts:32 | 360 × 360 × 360 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 532 | Prusa MK3S+ | printerCatalog.ts:33 | 250 × 210 × 210 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 533 | Prusa MINI+ | printerCatalog.ts:34 | 180 × 180 × 180 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 534 | Creality K1 Max | printerCatalog.ts:35 | 300 × 300 × 300 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 535 | Creality K1 | printerCatalog.ts:36 | 220 × 220 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 536 | Creality K1C | printerCatalog.ts:37 | 220 × 220 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 537 | Creality K2 Plus | printerCatalog.ts:38 | 350 × 350 × 350 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 538 | Creality K2 Pro | printerCatalog.ts:39 | 300 × 300 × 300 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 539 | Creality K2 | printerCatalog.ts:40 | 260 × 260 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 540 | Creality K2 SE | printerCatalog.ts:41 | 220 × 215 × 245 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 541 | Creality K3 | printerCatalog.ts:42 | 260 × 260 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 542 | Creality SparkX i7 | printerCatalog.ts:43 | 260 × 260 × 255 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 543 | Creality Hi | printerCatalog.ts:44 | 260 × 260 × 300 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 544 | Creality Ender-5 Max | printerCatalog.ts:45 | 400 × 400 × 400 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 545 | Creality Ender-3 V3 Mega | printerCatalog.ts:46 | 420 × 420 × 420 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 546 | Creality Ender-3 V3 SE | printerCatalog.ts:47 | 220 × 220 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 547 | Creality Ender-3 V3 KE | printerCatalog.ts:48 | 220 × 220 × 240 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 548 | Creality Ender-3 V3 | printerCatalog.ts:49 | 220 × 220 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 549 | Creality Ender-3 V3 Plus | printerCatalog.ts:50 | 300 × 300 × 330 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 550 | Creality Ender-3 V4 | printerCatalog.ts:51 | 220 × 220 × 235 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 551 | Elegoo Centauri Carbon | printerCatalog.ts:52 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 552 | Elegoo Centauri Carbon 2 | printerCatalog.ts:53 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 553 | Elegoo Centauri 2 | printerCatalog.ts:54 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 554 | Elegoo Neptune 4 | printerCatalog.ts:55 | 225 × 225 × 265 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 555 | Elegoo Neptune 4 Pro | printerCatalog.ts:56 | 225 × 225 × 265 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 556 | Elegoo Neptune 4 Plus | printerCatalog.ts:57 | 320 × 320 × 385 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 557 | Elegoo Neptune 4 Max | printerCatalog.ts:58 | 420 × 420 × 480 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 558 | Elegoo Neptune 3 Pro | printerCatalog.ts:59 | 225 × 225 × 280 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 559 | Elegoo Neptune 3 Plus | printerCatalog.ts:60 | 320 × 320 × 400 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 560 | Elegoo Neptune 3 Max | printerCatalog.ts:61 | 420 × 420 × 500 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 561 | Elegoo OrangeStorm Giga | printerCatalog.ts:62 | 800 × 800 × 1000 mm; Düse 0.6; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 562 | Anycubic Kobra S1 | printerCatalog.ts:63 | 250 × 250 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 563 | Anycubic Kobra S1 Max | printerCatalog.ts:64 | 350 × 350 × 350 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 564 | Anycubic Kobra X | printerCatalog.ts:65 | 260 × 260 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 565 | Anycubic Kobra 4 | printerCatalog.ts:66 | 260 × 260 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 566 | Anycubic Kobra 3 V2 | printerCatalog.ts:67 | 255 × 255 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 567 | Anycubic Kobra 3 Max V2 | printerCatalog.ts:68 | 420 × 420 × 500 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 568 | Sovol SV06 ACE | printerCatalog.ts:69 | 220 × 220 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 569 | Sovol SV08 | printerCatalog.ts:70 | 350 × 350 × 345 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 570 | Sovol SV08 MAX | printerCatalog.ts:71 | 500 × 500 × 500 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 571 | Sovol M1D | printerCatalog.ts:72 | 300 × 300 × 350 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 572 | Qidi Q1 Pro | printerCatalog.ts:73 | 245 × 245 × 240 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 573 | Qidi Q2 | printerCatalog.ts:74 | 270 × 270 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 574 | Qidi Plus4 | printerCatalog.ts:75 | 305 × 305 × 280 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 575 | Qidi X-Max 3 | printerCatalog.ts:76 | 325 × 325 × 315 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 576 | Flashforge Adventurer 5M | printerCatalog.ts:77 | 220 × 220 × 220 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 577 | Flashforge Adventurer 5M Pro | printerCatalog.ts:78 | 220 × 220 × 220 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 578 | Flashforge AD5X | printerCatalog.ts:79 | 220 × 220 × 220 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 579 | Flashforge Creator 5 | printerCatalog.ts:80 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 580 | Flashforge Creator 5 Pro | printerCatalog.ts:81 | 256 × 256 × 256 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 581 | Artillery Sidewinder X3 Plus | printerCatalog.ts:82 | 300 × 300 × 400 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 582 | Artillery Sidewinder X4 Plus | printerCatalog.ts:83 | 300 × 300 × 400 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 583 | Artillery Sidewinder X4 Pro | printerCatalog.ts:84 | 240 × 240 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 584 | Artillery M1 Pro | printerCatalog.ts:85 | 260 × 260 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 585 | Voron 2.4 250 | printerCatalog.ts:86 | 250 × 250 × 210 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 586 | Voron 2.4 300 | printerCatalog.ts:87 | 300 × 300 × 260 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 587 | Voron 2.4 350 | printerCatalog.ts:88 | 350 × 350 × 310 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 588 | Voron Trident 250 | printerCatalog.ts:89 | 250 × 250 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 589 | Voron Trident 300 | printerCatalog.ts:90 | 300 × 300 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 590 | Voron Trident 350 | printerCatalog.ts:91 | 350 × 350 × 250 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 591 | Voron 0.2 | printerCatalog.ts:92 | 120 × 120 × 120 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 592 | RatRig V-Core 4.1 300 | printerCatalog.ts:93 | 300 × 300 × 300 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 593 | RatRig V-Core 4.1 400 | printerCatalog.ts:94 | 400 × 400 × 400 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |
| 594 | RatRig V-Core 4.1 500 | printerCatalog.ts:95 | 500 × 500 × 500 mm; Düse 0.4; Schicht 0.2 | Bauraum der Größenprüfung und Plattenansicht; Düse und Schicht für Raster, Spalte, Testteile | nur Bereiche (contract.ts:1055-1057); Wert wird ins Profil kopiert | printerCatalog.test.ts (nur Schema, URL, Datum) |  |

## Befunde

Schwere nach AUFTRAG.md. "Verdacht": aus dem Code hergeleitet, in Phase 4 am gebauten Körper nachzumessen.

| Kennung | Schwere | Datei:Zeile | Ist | Soll (mit Quelle/Begründung) | Nachstellen |
|---|---|---|---|---|---|
| T1 | A | screwSizes.ts:31 | `INSERT['M2.5'].diameter` = 3.6 mm; Kommentar Zeile 26-28: "values of the common ruthex inserts". | 4.0 mm. ruthex M2.5×5.7: ⌀D1 4.6, ⌀D2 3.9, ⌀D3 4,0, L 5.7, W min. 1.6; M3×5.7 hat dieselben Durchmesser (https://www.3djake.com/ruthex/threaded-insert-m25-70-pieces und https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces, abgerufen 12.11.2026). Der Einsatz (4.6 außen) sitzt in 3.6 mit 1.0 statt 0.6 mm Übermaß; betroffen sind insertSeat, boss und `kind: screw`. | `partbuddy_block {block: insertSeat, size: 'M2.5'}`: Loch 3.6. Zweite Herstellerquelle in Phase 3. |
| T2 | A | designFit.ts:34-36; tolerances.ts:34-61; renderer/src/print/ToleranceAssistant.tsx:58,76; main/print/printProfiles.ts:261,266,303 | Die Testteile werden für die Düse des aktuellen Druckers gebaut, die abgelesenen Spiele gehen unverändert ins Materialprofil. `scaleClearance` multipliziert jedes Profilspiel danach mit Düse/0.4 ("starting values for a 0.4 mm nozzle"). Auf einer 0.6-mm-Düse gemessene 0.30 mm gehen als 0.45 mm an den Assistenten. | Gemessene Werte gelten für die Düse, auf der gemessen wurde: beim Übernehmen auf 0.4 normieren oder die Messdüse am Profil speichern und nicht skalieren. Sonst ist jede Passung nach "Toleranzen messen" auf Düsen ungleich 0.4 um den Faktor Düse/0.4 falsch. | Drucker 0.6/0.3, Toleranz-Assistent: slide = 0.3 übernehmen, dann den Druckhinweis lesen: "sliding fit 0.45 mm". |
| T3 | A (Verdacht) | templates.ts:93 (hingedBox), Dateikopf Zeile 4-5 | `hingeSteps({...})` ohne `support`: `web()` gibt nichts zurück (mechanisms.ts:122-123). Die Scharnierlinie liegt auf z = height = 16, die Rolle hat Ø 8: die Augen beginnen 12 mm über dem Bett mit runder Unterseite, ohne die 45°-Stege, die das Werkzeug seit #345 baut. Der Dateikopf sagt "stays printable as designed, Z up, without support". | Vorlage mit denselben Stegen wie das Werkzeug (support: bed 0, Wände der Hälften), oder die Aussage streichen. | Vorlage hingedBox bauen, Überhang der Körper Box und Lid messen (Unterseiten der Augen zwischen z 12 und 13.2). |
| T4 | A (Verdacht) | blocks.ts:172 (slot), blocks.ts:161 (nutTrap) | Schlitz "durch" = `solid.extrude` mit -1000 mm, `operation: cut`, ohne `targets`. In einem Hohlkörper schneidet das Profil auch die gegenüberliegende Wand und, ohne targets, womöglich andere Körper in der Flucht. | Durch die getroffene Wand und nicht weiter: Tiefe aus der Wandstärke am Punkt oder Schnitt bis zur nächsten Fläche; `targets: [body]` immer setzen. | Hohle Box 60×40×30, Wand 2: `slot` an einer Seitenwand ohne depth; gegenüberliegende Wand prüfen; dasselbe mit einem zweiten Körper dahinter. |
| T5 | A (Verdacht) | mechanisms.ts:233-247; main/agents/mechanismTool.ts:20 | Die Nut der Führung hat eine waagerechte Decke der Breite width + 2·height + 2·(gap·√2 + gap), nur `gap` über dem Schienenkopf: Standard 13.9 mm bei 0.4 mm Abstand, im zulässigen Bereich bis rund 103 mm (width 60, height 20). Das Werkzeug beschreibt die Mechanismen als "printed in one piece without support". Keine Grenze, kein Hinweis. | Druckfläche so setzen, dass die Nut offen nach oben druckt (wie die Vorlage slideStop, templates.ts:146), oder die Decke als Dach ausführen, oder die Breite begrenzen und es sagen. Die eigene Regel nennt 10 mm als Brückengrenze (printProfiles.ts:232). | `kind: slide` auf zwei übereinander liegenden Platten; Brückenlänge und Abstand Nutdecke zu Schienenkopf messen; Druckprüfung laufen lassen. |
| T6 | B | mechanisms.ts:574,581 (mit :533) | Für Hälse bis 24 mm (Steigung 3, Tiefe 1.1): `into = min(1.3 + 0.2, 1.5 - 0.05) = 1.45`. Flanke: radial 1.3, axial 1.45 - 0.2 = 1.25, also atan(1.3/1.25) = 46.1° von der Senkrechten. Kommentar Zeile 527-528 und die Antwort des Werkzeugs sagen "flanks at 45°". | Höchstens 45° (und höchstens `material.overhang`). Bei Steigung 4 und 5 sind es genau 45°. | `kind: lid`, diameter 20: Flankenwinkel messen; Druckprüfung mit PLA (45°). |
| T7 | B | mechanisms.ts:433,452-453,505 | `headDepth` für Senkkopf = 0.6·d (M3 1.8, M4 2.4, M5 3.0, M6 3.6). Geschnitten wird ein 90°-Kegel von Ø dk+0.6 auf das Durchgangsloch: Tiefe (cs - Loch)/2 = M3 1.96, M4 2.53, M5 3.15, M6 3.72 mm. Die Prüfung "1.2 mm unter der Senkung" rechnet mit dem kleineren Wert. | Kegeltiefe aus denselben Zahlen rechnen, die gebaut werden. Bei M3 und 3.0 mm Platte bleiben 1.04 statt der zugesagten 1.2 mm. | `kind: screw`, M3, head countersunk, Platte 3.0 mm: wird gebaut; Restdicke unter dem Kegel messen. |
| T8 | B | blocks.ts:60-64,71; main/agents/blockTool.ts:32 | `tappedHole` bietet M2 bis M10 und baut standardmäßig ein modelliertes Gewinde. `kind: screw` lehnt dasselbe unter M5 ab ("a printed M3 thread strips", mechanisms.ts:426,450); die Werkzeugbeschreibung sagt "from M5 in print", geprüft wird es nicht. | Eine Regel für beide Wege: unter M5 ablehnen oder auf insertSeat verweisen. | `partbuddy_block {block: tappedHole, size: 'M2'}` wird gebaut. |
| T9 | B | contract.ts:807-813; blocks.ts:68,226,234; mechanisms.ts:505 | `featureBlockSchema` kennt die Größengrenzen aus `sizesOf` nicht. Ein Baustein boss/insertSeat mit M8/M10 bekommt still die M3-Einsatzwerte (Rückfall `INSERT.M3` bzw. 4 / 5.7), ein Senkkopf M2/M2.5 den Zylinderkopf-Durchmesser als Kegelsenkung. Abgefangen nur im Formular und in `blockOf`. | Grenzen im Schema oder in `stepsOf` durchsetzen; kein stiller Rückfall auf eine andere Größe. | `featureBlockSchema.parse` mit block boss, size M10 gelingt; `stepOf` liefert hole_diameter 4 mm. |
| T10 | B | screwSizes.ts:51,54; knob.ts:24; magnet.ts:17; mechanisms.ts:303,625,703; wallMount.ts:19-24; blocks.ts:75,90 | Alle Zugaben der Bausteine sind feste Zahlen: Mutter +0.3, Kopf +1.2/+0.6, Knopf +0.2, Magnet +0.3/+0.1, Lippe 0.25, Haken 0.2/0.3, Zapfen 0.2, Holzschraube +0.2, Einsatzloch ohne Zugabe. Das Materialprofil (holeShrink 0.1 bis 0.3 mm, vier Passungen, vom Nutzer gemessen) und die Düse gehen nirgends ein. Beispiel PP (holeShrink 0.3, materialCatalog.ts:43): Muttertasche +0.3 - 0.3 = 0 Luft; Magnet glue +0.3 - 0.3 = 0. | Zugaben aus dem Profil des Teils ableiten (Lochschwund plus Passung der Art, mit Düse), die Tabellenwerte nur als Nennmaße. Sonst bleibt der Toleranz-Assistent für alle geprüften Bausteine wirkungslos. | Material PP bzw. ABS wählen, nutTrap M3 und magnet 6×2 bauen: Maße identisch zu PLA. |
| T11 | B | mechanisms.ts:134,159-166,186,252-253,363,374,527,812-816 | Alle Schrägen sind fest 45°: Bohrungsdach und Stege des Scharniers, Schwalbenschwanz, Lippenfuß, Wulst, Gewindeflanken, Riegel. Der Katalog führt PETG mit 40° und TPU mit 35° (materialCatalog.ts:31-33,37). | Schrägen nach `material.overhang` des Teils, oder klar sagen, dass der Mechanismus die Grenze des Materials überschreitet. Sonst meldet die eigene Druckprüfung die eigenen Mechanismen. | Material PETG (40°), `kind: hinge` liegend und `kind: lid`: Druckprüfung, Überhangbefund erwartet. |
| T12 | B | mechanisms.ts:44,63-68; main/agents/mechanismTool.ts:109,122 | `MIN_BARREL_WALL` 0.8 mm liegt unter zwei Bahnen der 0.4-mm-Düse (0.9, designFit.ts:43); die Dachgrenze 0.9 ist fest für 0.4 mm. Standard Ø 6 mit gap = Düse: bei 0.6 mm Düse Rollenwand (6-3)/2 - 0.6 = 0.9 mm unter 1.35 (zwei Bahnen); bei 0.8 mm wird Ø 7 empfohlen, Wand dann 0.95 unter 1.8. | Wand- und Dachgrenze = zwei Bahnen der Düse in Gebrauch; Standarddurchmesser aus der Düse. | Drucker 0.6: `kind: hinge` ohne diameter wird gebaut; Dünnwand-Befund der Druckprüfung. |
| T13 | B | mechanisms.ts:299-303 | Verschluss "by the usual sizes for a 0.4 mm nozzle": Lippe 1.2 mm, Wulst 0.5 mm, Luft 0.25 mm, ohne Düsenabfrage. Bei 0.6 mm: Lippe unter zwei Bahnen (1.35), Wulst unter einer Düsenbreite. 1.2 mm liegt auch bei 0.4 mm nicht auf dem eigenen Bahnraster (0.9 / 1.35). | Maße aus Düse und Profil; oder bei anderer Düse warnen bzw. ablehnen. | Drucker 0.6: `kind: closure` mit identischen Maßen; Dünnwand-Befund. |
| T14 | B | mechanisms.ts:375-386,306-314 | Die Rille (Ø 1.4, Achse 0.25 mm vor der Wand) geht 0.45 mm in die Boxwand. `lipProblem` prüft nur die Deckelwand (`wall`); die Boxwand ist unbekannt. Bei 0.9 mm Boxwand bleibt 0.45 mm (eine Bahn). | Boxwand messen oder abfragen und mindestens zwei Bahnen hinter der Rille verlangen. | Box mit 0.9 mm Wand, `kind: closure`: Restwand hinter der Rille messen. |
| T15 | B (Verdacht) | mechanisms.ts:363 | Die 45°-Fase unter dem Lippenfuß wird an genau einer Kante per Punkt (Mitte der Rastwand) gesetzt. Bei scharfen Ecken (radius unter 2) sind die vier Fußkanten getrennt; drei Seiten behielten dann eine waagerechte Stufe von 1.45 mm. | Fase an allen vier Fußkanten, oder nachweisen, dass SolidCraft die Kette mitnimmt. | `kind: closure`, radius 0: Unterseite des Fußes an allen vier Wänden messen. |
| T16 | B | mechanisms.ts:205-206 | Breite (2-60) und Höhe (1.5-20) der Schiene werden einzeln geprüft: Fuß 2 mm mit Höhe 20 mm ergibt einen 42 mm breiten Kopf auf 2 mm Hals. | Verhältnis begrenzen (Quelle in Phase 3). | `kind: slide`, width 2, height 20 wird gebaut. |
| T17 | B | mechanisms.ts:424,438-443; main/agents/mechanismTool.ts:559 | `SCREW_LENGTHS` gilt für alle Größen und beide Kopfarten (M2×80 und M10×4 sind möglich; 55 und 65 mm fehlen). Liegt keine Länge im Fenster, gibt es keine Schraube: M3 Zylinderkopf mit Einsatz, Platte 16 mm ergibt das Fenster 16.4 bis 18.3 mm, also `null` und "choose the length yourself". | Längen je Größe aus der Norm; bei fehlender Länge die Senkung tiefer legen, bis eine Normlänge passt. | `kind: screw`, M3, cap, insert, from–to 16 mm. |
| T18 | B | blocks.ts:105-108; mechanisms.ts:625 | Die Dehnung des Schnapphakens wird nur im Formular angezeigt (BlockPanel.tsx:485). `partbuddy_block snapFit` nimmt jede Kombination bis 500 mm ohne Prüfung (Dicke 3, Länge 5, Nase 2: 49 %). `SNAP` ist für alle Materialien gleich (1.4 %). | Dehnung im Werkzeug gegen eine Grenze je Material prüfen. | `partbuddy_block {block: snapFit, length: 5, thickness: 3, catchDepth: 2}` wird ohne Hinweis gebaut. |
| T19 | B | designFit.ts:19-22,43 | `lineWidth` = Düse × 1.125, "the slicers' default". Das ist eine Vorgabe von PrusaSlicer; der Drucker des Auftraggebers läuft mit Bambu Studio (docs/engineering-notes.md:349-352). Außerdem ist eine Wand aus n Bahnen wegen der Überlappung nicht n × Breite. Das Raster 0.9 / 1.35 / 1.8 ist damit nicht hergeleitet. | Herkunft belegen (Phase 3: Vorgaben von PrusaSlicer, Bambu Studio/OrcaSlicer, Cura) und Wandmaße so rechnen, wie die Slicer es tun, oder als eigene Wahl kennzeichnen. | Maßstab Phase 3. |
| T20 | B | designFit.ts:34-36; contract.ts:1056 | `scaleClearance` ist linear und unbegrenzt: Düse 0.2 halbiert jedes Spiel (clamp 0.025, slide 0.125), Düse 2.0 verfünffacht es (turn 1.5); negative Pressmaße werden mitskaliert. | Untergrenze je Passung und belegter Zusammenhang; die Herkunft der Proportionalität fehlt. | `scaleClearance(0.25, {nozzle: 0.2, layer: 0.1})` = 0.125. |
| T21 | B | designFit.ts:102-106 | Beim Nachführen werden Wände und Höhen nur aufgerundet, die Anzahl im Kennzeichen wird ignoriert. Wechsel 0.4, 0.6, 0.4: aus 0.9 wird 1.35 und bleibt 1.35; aus 2.025 wird 2.25, dann 2.7. Der Kommentar "[auto 2×line]" stimmt danach nicht mehr. | Rückweg ohne Wachstum (Ursprungswert oder Anzahl behalten) und Kennzeichen nachführen. | `refit` mit Wand 0.9 "[auto 2×line]" erst für 0.6, das Ergebnis dann für 0.4. |
| T22 | B | main/print/printProfiles.ts:52-56 gegen materialCatalog.ts:31,32,36,37 | Dasselbe Material mit zwei Werten: PETG holeShrink 0.2 (Standardprofil) und 0.15 (Katalog); PETG-CF 0.2 und 0.1; ASA 40° / 0.2 und 45° / 0.15; TPU 0.25 und 0.1. | Eine Quelle: Standardprofile aus dem Katalog erzeugen. | Neue Installation: Standardprofil PETG gegen "Material hinzufügen, PETG". |
| T23 | B | materialCatalog.ts:19-25; tolerances.ts:46-53 | `holeShrink` ist ein fester Betrag auf den Durchmesser, hergeleitet für ein 10-mm-Loch aus Spritzguss-Schwindmaßen, und gilt für alle Durchmesser und Lagen. Gemessen wird nur an senkrechten Löchern von 3 bis 10 mm, gemittelt. | Anteil je Durchmesser (fest plus proportional) oder Geltungsbereich nennen; liegende Löcher getrennt. Maßstab Phase 3. | Lochplatte drucken: Abweichung bei 3 und 10 mm vergleichen. |
| T24 | B | standards.ts:69,70 | "bars at least 1.2 mm between them (three lines of a 0.4 mm nozzle; Prusa lists 0.45, 0.9, 1.35 and 1.8 mm for one to four lines)": drei Bahnen sind nach dem eigenen Satz und nach designFit 1.35 mm, nicht 1.2. `fitSize('wall', 1.2)` warnt selbst. | 1.35 mm, oder Bahnen statt mm nennen; die Prusa-Angabe belegen. | `fitSize('wall', 1.2, 'user', {nozzle: 0.4, layer: 0.2})` gibt eine Warnung. |
| T25 | B | standards.ts:16,69; main/print/printProfiles.ts:231-232; wallMount.ts:20-23; main/agents/mechanismTool.ts:124 | Brückengrenze widersprüchlich: 5 mm "(Hubs)" in den Normen, 10 mm in den Regeln zum stützfreien Bauen, 10 mm als Augenlänge des Scharniers, 8 bis 11 mm Brücke im Schlüsselloch (5-mm-Schraube: 11 mm, über der eigenen 10-mm-Regel). | Ein Wert je Material und Düse mit Quelle (Phase 3), an allen Stellen derselbe. | Textvergleich der genannten Stellen. |
| T26 | B | standards.ts:81 | "pilot hole 0.25 mm less than the screw for print (Hubs), which is 2.0 mm for M2.5 and 2.5 mm for M3 after print": 2.5 - 0.25 = 2.25 und 3 - 0.25 = 2.75; mit PLA-Lochschwund 0.15 kommen 2.1 und 2.6 heraus, nicht 2.0 und 2.5. Unklar, welches Maß zu zeichnen ist. | Ein eindeutiges Zeichenmaß je Schraube mit Herleitung. | `partbuddy_standard {topic: boardMount}` lesen. |
| T27 | B | testPieces.ts:21,25,42,56; standards.ts:40; main/print/printProfiles.ts:279 | Die Testteile verletzen eigene Regeln: (a) keine Fase an den Bettkanten der Kamm- und Plattenlöcher, der Elefantenfuß verengt genau die gemessenen Löcher; (b) Beschriftung 3 mm hoch in der eingebauten, nicht fetten Schrift, die Regel verlangt 2 × Düse Strichbreite. | Bettfase an allen Löchern; Schrift fett und so groß, dass der Strich mindestens 2 × Düse breit ist. | Testteile für 0.4/0.2 bauen: Lochkanten bei z = 0 und Strichbreite der Ziffern messen. |
| T28 | B | templates.ts:52,73,114,208 | Vorlagen sind fest auf 0.4 mm ausgelegt und tragen kein `[auto …]`-Kennzeichen: Scharnierspalt 0.4, Führungsspalt 0.4 (unter der Düse bei 0.6/0.8, gegen designFit.ts:29-31); Wände 2.4 und 2 mm liegen nicht auf dem Bahnraster. `refit` greift nicht. | Spalte und Wände aus dem Drucker in Gebrauch, mit Kennzeichen. | Drucker 0.6, Vorlage hingedBox: Spalt bleibt 0.4. |
| T29 | B | templates.ts:262-294; standards.ts:47,49 | wallHolder steht wie gezeichnet (Platte senkrecht, Schichten quer zur Biegung an der Wurzel) und setzt keine Druckfläche; die eigene Hakenregel verlangt liegenden Druck. Innenradius 2 mm bei 6 mm Dicke; die Regel verlangt mindestens die Dicke. | `body.print_face` auf die Seitenfläche; Innenradius mindestens wall. | Vorlage wallHolder: Plattenansicht und Radius "Inner radius". |
| T30 | B | blocks.ts:155-163 | nutTrap: Sechsecktasche plus Loch vom Taschenboden, in jeder Lage gleich. Öffnet die Tasche nach unten oder zur Seite, ist die Taschendecke mit dem Loch darin ein Überhang; keine Brückenhilfe, kein Hinweis. | Lage zur Druckfläche auswerten: gestufte Brücke bzw. Tropfenform anbieten oder warnen. | nutTrap an der Unterseite eines Teils; Druckprüfung. |
| T31 | B | blocks.ts:220; contract.ts:810 | `fit: close` wird ungeprüft an SolidCraft gereicht (ISO 273 fein). Mit Lochschwund 0.15 bis 0.3 mm passt die Schraube rechnerisch nicht mehr (M3: 3.2 abzüglich 0.15 bis 0.3). | Lochschwund des Materials aufschlagen oder close für Druckteile sperren. | screwHole M3 close, Material ABS: Bohrungsmaß gegen 3.0 + holeShrink. |
| T32 | B | contract.ts:1055-1057 | Düse 0.1-2 und Schicht 0.04-1.2 unabhängig: Schicht 1.2 bei Düse 0.1 ist gültig; `snapSize('height')`, Testteile und Regeltext rechnen damit. | Schicht gegen die Düse begrenzen (Quelle Phase 3). | `printerProfileSchema.parse` mit nozzle 0.1, layer 1.2 gelingt. |
| T33 | B | tolerances.ts:43-44 | Die Reihenfolge clamp, push, slide, turn wird nur unter den abgelesenen Werten geprüft. Nur clamp = 0.4 ablesen: Profil wird clamp 0.4 / push 0.15, ohne Meldung. `materialProfileSchema` prüft die Reihenfolge auch nicht. | Gegen das ganze Ergebnisprofil prüfen. | `applyReadings(pla, {fits: {clamp: 0.4}, holes: [null, null, null, null], overhang: null})`. |
| T34 | B | magnet.ts:41-47; wallMount.ts:54-65,106-112; main/agents/blockTool.ts:118,133,162 | Restwände werden nur im Antworttext genannt (Magnet 1.2 rund / 0.6 darunter, Schlüsselloch Mindestdicke, Senkloch Plattendicke), nicht geprüft; `woodScrewSteps` hat keine Problemprüfung. Ein Magnet 6×2 in einer 2-mm-Platte geht durch. | Dicke am Punkt messen (wie das Scharnier seine Wände misst) und ablehnen. | magnet 6×2 auf 2 mm Platte; keyhole auf 4 mm Platte. |
| T35 | B | mechanisms.ts:44,46,112,303,533,540,625,703,766; knob.ts:21; magnet.ts:17; wallMount.ts:19-30; standards.ts:1-7 | Nach den eigenen Kommentaren ist keine dieser Konstanten gedruckt ("none of it printed here yet", "Not printed yet"); mehrere sind ausdrücklich eigene Wahl ohne Quelle (KEYHOLE.lip; Kopfhöhen der Holzschrauben nicht einzeln belegt; Gewindetabelle des Deckels; MIN_KNUCKLE; WEB). | Für jede Zahl Quelle (Phase 3) und Messbeleg (Phase 4). | Je Zeile der Prüfliste in Phase 4. |
| T36 | C | docs/feature-catalog.md:61 gegen mechanisms.ts:766 | Katalog: "0.8 mm of overlap on 45° faces 0.2 mm apart". Code: `seat: 0` ("at 0.2 it rattled"). | Katalog nachziehen. | Textvergleich. |
| T37 | C | docs/feature-catalog.md:92 gegen mechanisms.ts:150 | Katalog: Flachdach "1.2 radii above the axis". Code: `ROOF_TOP = 1.05`. | Katalog nachziehen. | Textvergleich. |
| T38 | C | docs/building-blocks.md:20,30,43,56-58,60,84,113 gegen apps/desktop/package.json:33,64 | Dokument: electron 45.1.0, SolidCraft 0.30.1 "pinned per release", dazu electron-store, better-sqlite3, kysely, @assistant-ui/react, dockview, electron-log als gewählte Bausteine. Code: electron 45.2.1; SolidCraft 0.40.0-rc.4 empfohlen (docs/engineering-notes.md:190); die sechs Pakete stehen nicht in package.json; `clipper2-ts` 2.0.1-18 (svgDrawing.ts:12) fehlt im Dokument, die Versionsnummer sieht nach Vorabstand aus ("No preview releases", Zeile 20). | Dokument auf den Stand des Codes bringen; clipper2-ts mit Lizenz und Begründung aufnehmen. | Paketnamen in package.json suchen. |
| T39 | C | screwSizes.ts:54; blocks.ts:223,227; mechanisms.ts:504-505 | `HEAD_ALLOWANCE.diameter` 0.6 wird beim Zylinderkopf verdoppelt (+1.2 auf den Durchmesser), beim Senkkopf einfach (+0.6). Name und Kommentar sagen nicht, ob je Seite. Die Senkungen M5/M8/M10 (9.7 / 14.2 / 17.2) liegen unter den mir geläufigen Werten von DIN 974-1 (10 / 15 / 18; nicht online belegt). | Eindeutig benennen; Senkmaße in Phase 3 gegen DIN 974-1 halten. | Phase 3. |
| T40 | C | mechanisms.ts:83,223,466,725; magnet.ts:52; wallMount.ts:76-78 | Richtungsvektoren werden auf 0.001 gerundet und nicht neu normiert. Bei schrägen Linien bis 5e-4 je Komponente: auf 200 mm Scharnier bis 0.1 mm Lagefehler der letzten Augen (ein Viertel des Spalts). | Voll rechnen, erst die Punkte runden. | Scharnier 200 mm entlang (1, 0.3337, 0): Lage des letzten Auges gegen `to`. |
| T41 | C | mechanisms.ts:66 gegen :158 | "Liegend" wird zweimal verschieden geprüft: Dachstärke bei Δz unter 1e-6, Dachbau bei gerundeter Achse (Neigung unter 0.05 %). Dazwischen wird ein Dach gebaut, dessen Stärke nicht geprüft wurde. | Eine Bedingung. | Scharnier mit Δz 0.01 mm auf 40 mm. |
| T42 | C | blocks.ts:90 gegen mechanisms.ts:303 | Lippe eines Deckels zweimal: Baustein gap 0.2 mm, Mechanismus clear 0.25 mm. | Ein Wert aus dem Profil. | Textvergleich. |
| T43 | C | templates.ts:125-126,269-270 gegen wallMount.ts:21 | 4-mm-Holzschraube: Vorlagen Loch 4.5 / Senkung 9; Tabelle Loch 4.7 / Senkung 8.8. | Vorlagen aus `WALL`. | Textvergleich. |
| T44 | C | blocks.ts:166-170; main/agents/blockTool.ts:56 | `slot.length` ist der Mittenabstand der Rundungen; das Langloch ist length + width lang. Beschreibung: "slot: its length". | Gesamtlänge oder Verstellweg, klar benannt. | slot length 10, M3: Länge 13.4 messen. |
| T45 | C | contract.ts:806; main/agents/blockTool.ts:50; magnet.ts:45; wallMount.ts:63,106-112 | `more`: Schema und Werkzeug 99, Magnet 40, Schlüsselloch 20, Senkloch nur durch das Schema begrenzt. | Eine Grenze, im Werkzeugschema dieselbe. | magnet mit 50 Punkten: Schema lässt zu, magnetProblem lehnt ab. |
| T46 | C | knob.ts:64-66,107,127 | Die Rillenzahl kann ungerade sein (Standard 25 mm: 11). Dann liegt genau gegenüber dem Zeiger eine Rille, und das Loch des Gewindestifts mündet in ihr. | Gerade Anzahl erzwingen. | knob shaft round, diameter 25: Lage des Stiftlochs. |
| T47 | C | contract.ts:363-365 | Kommentar "90 % to 150 %", `ZOOM_STEPS` ab 0.9, `zoomSchema` ab 0.8. | Gleiche Grenzen. | Textvergleich. |
| T48 | C | contract.ts:803,877 gegen screwSizes.ts:7 und blocks.ts:41; contract.ts:776 gegen mechanisms.ts:470 | Größen- und Hakenrichtungs-Enum doppelt geführt; `partFamilySchema` kennt `countersunk_socket_screw` nicht, das `screwSteps` einfügt. | Enums aus einer Quelle; Familie ergänzen. | Textvergleich. |
| T49 | C | blocks.ts:80; main/print/printProfiles.ts:279 | Standardtext 0.6 mm tief unabhängig von der Schicht; die Regel verlangt max(0.6, 3 Schichten), bei 0.3 mm also 0.9. | Standard aus dem Drucker. | Drucker 0.6/0.3, text ohne depth. |
| T50 | C | standards.ts:40,82,92,94,95 | Innere Unstimmigkeiten: Bettfase 0.4 (Vorlagen 0.6); Haken 1 mm dick (SNAP 1.5); Sterngriffe bis M12, Köpfe nur bis M8; Durchgangsloch "Gewinde + 0.4" (ISO 273 in der Tabelle: M5 5.5); "nutTrap für M3 bis M6", der Baustein bietet M2 bis M10. | Angleichen. | Textvergleich. |
| T51 | C | svgDrawing.ts:194-210,750,806 | Unbekannte Farben (#rgba, #rrggbbaa, hsl, weitere Namen, Verläufe) werden schwarz; clip-path und mask werden ohne Zählung übergangen; stroke-dasharray wird zur durchgehenden Linie; ein inneres `<svg>` verliert viewBox und Beschnitt. Das Logo kann von der Zeichnung abweichen, ohne dass `skipped` es sagt. | Zählen und dem Nutzer melden; gängige Farbformen lesen. | SVG mit `fill="#ff000080"` und eines mit clipPath. |
| T52 | C | drawingDetail.ts:151-173 | "Zu fein" heißt schmaler als eine Düse; die Regeln verlangen sonst zwei Bahnen Wand und 2 × Düse Strich. Über 1600 × Düse/10 Breite (64 mm bei 0.4) wird das Raster gröber als Düse/10; bei 640 mm ist r = 0.5 px. | Schwelle an die Wandregel angleichen; Auflösung nach unten begrenzen oder es sagen. | Logo 400 mm breit mit 0.45-mm-Strich. |
| T53 | C | tolerances.ts:24,53 | `toStep` rundet Mittelwerte auf 0.05; genau auf der Grenze entscheidet Gleitkommarauschen (0.075 kann 0.05 oder 0.1 werden). | Vor dem Runden glätten. | Löcher mit Abweichung 0.05 und 0.1. |
| T54 | C | designFit.ts:45,50-55,72 | Spalt: Warnung unter 0.2 mm, eigenes Minimum max(0.3, Düse); ein Nutzerspalt von 0.25 bei 0.4-mm-Düse bleibt ohne Hinweis. Details und Radien werden auf Vielfache der Düse aufgerundet (0.5 wird 0.8), ohne Begründung. | Eine Schwelle; Raster für Details begründen oder streichen. | `fitSize('gap', 0.25, 'user', {nozzle: 0.4, layer: 0.2})`. |
| T55 | C | materialCatalog.ts:23,31; alle Katalogzeilen | PETG trägt die +0.05 der "warping types", die Notiz nennt nur Überhang und Loch. Die Quell-URLs der 17 Materialien und 77 Drucker sind hier nicht abgerufen. | Begründung ergänzen; Quellen in Phase 3 abrufen. | Phase 3. |
| T56 | C | templates.ts:70,74,162-179 | Grenzen stehen nur im Parameterkommentar ("at least 54 mm", "at least 2 mm more than the wall"); ein langer Schildtext läuft über Löcher und Rand. | Bereich am Parameter bzw. Prüfung. | hingedBox length 40; sign label mit 30 Zeichen. |
| T57 | C | testPieces.ts:14,56,65-78 | Messmittel: ein 3-mm-Loch ist mit dem Messschieber kaum messbar und geht voll ins Mittel; die Passung wird nur bei Ø 6 geprüft; die Überhangtreppe zeigt in eine Richtung. | Hinweis in der Anleitung oder Teile anpassen. | Phase 4 am Druck. |
| T58 | C | mechanisms.ts:625,666,568-593 | Der wirksame Hinterschnitt des Hakens ist catch - gap = 0.6 mm, genannt werden 0.8. Das Flankenspiel des Deckelgewindes ist gap/√2 (0.21 bei 0.3). | In Kommentar und Antworttext richtig nennen. | Phase 4 messen. |
| T59 | C | mechanisms.ts:711-717 | `pegProblem` prüft nicht, dass from und to verschieden sind; `pegSteps` teilt dann durch 0. Ob mechanismTool es vorher abfängt, ist hier nicht geprüft. | Prüfung in `pegProblem`. | `pegSteps` mit from = to. |
| T60 | C | printerCatalog.ts:24 | Bambu Lab H2D mit 325 × 320 × 325; mit beiden Düsen ist die nutzbare Breite kleiner (nicht online belegt). Der Katalog kennt nur einen Quader je Drucker. | In Phase 3 prüfen; Hinweis im Katalog. | Phase 3. |
| T61 | C | mechanisms.ts:428 | Kommentar "three layers and more" zu 1.2 mm; der Wert ist fest und nicht an die Schicht gebunden. | An Schicht oder Düse binden oder den Kommentar richtigstellen. | Textvergleich. |

## Nicht geprüft, weil …

- **Nichts gebaut oder gemessen** (Vorgabe dieses Laufs). Alle Befunde mit "Verdacht" (T3, T4, T5, T15) und alle
  abgeleiteten Maße der Prüfliste sind aus dem Code gerechnet und in Phase 4 am Körper nachzumessen.
- **Normwerte nicht online belegt** bis auf ruthex M2.5/M3 (T1): ISO 4762, ISO 10642, ISO 4032, ISO 273, ISO 4017,
  DIN 74, DIN 974-1, DIN 6336, DIN 7996/7997, 3M Bumpon, HellermannTyton, EN 60423, IP2X/IP4X, Lüfter-Lochabstände,
  Raspberry-Pi- und Arduino-Maße, CNC-Kitchen-Bruchlasten, Hubs-/Prusa-/Xometry-Angaben. Beim Lesen fiel an den
  Tabellen CAP_HEAD, COUNTERSUNK_HEAD, NUT, CLEARANCE_NORMAL und den übrigen INSERT-Zeilen nichts auf; das ist kein
  Prüfergebnis. Jede Zahl gehört in Phase 3 gegen zwei Quellen.
- **Quell-URLs der Kataloge** (17 Materialien, 77 Drucker) nicht abgerufen; Bauräume nicht gegen die Hersteller gehalten.
- **`stepPhrases.ts` (552 Zeilen) und `api.ts` (348 Zeilen)** nicht vollständig gelesen: Texte des Arbeitsprotokolls
  und Typen der IPC-Brücke, keine Fachtabellen; daraus steht nur `MAX_PHRASES_PER_STEP` = 50 (stepPhrases.ts:102) fest.
  `channels.ts` gelesen: nur Kanalnamen.
- **`contract.ts`**: vollständig gelesen; in die Prüfliste aufgenommen sind die Grenzen mit Fachbezug (Profile,
  Bausteine, Druckprüfung, Logo, Normteile). Die übrigen IPC-Schemata (Projekte, Versionen, Chat, Notizen, Assistent)
  gehören zur Inventur der Oberfläche.
- **Tests**: vollständig gelesen sind tolerances, materialCatalog, printerCatalog und der Raster-Teil von designRules.
  Von blocks, mechanism, blockTool, templates, standardTool, assembly, sketch, svgDrawing, drawingDetail,
  drawingPlacement und settingsStore nur die Titel der Fälle; die Spalte "Test" ordnet danach zu ("nicht eindeutig",
  wo der Titel es offen lässt). `e2e/solidcraft.contract.spec.ts` (3832 Zeilen), `logoMove.test.ts`,
  `drawingTool.test.ts` nicht gelesen. Kein Test wurde ausgeführt.
- **Aufrufer außerhalb von shared** (`mechanismTool.ts`, `blockTool.ts`, `printProfiles.ts`,
  `ToleranceAssistant.tsx`, `BlockPanel.tsx`) nur so weit gelesen, wie es für "Durchsetzung" und für T2, T5, T8,
  T17, T18, T22 nötig war; ihre eigene Inventur steht in `01-inventur-werkzeuge.md`. `SNAP_STRAIN_LIMIT` in
  BlockPanel.tsx ist nicht nachgeschlagen.
- **`docs/ui-inventur.md` und frühere Berichte unter `docs/audits/`** nicht gelesen (nicht Teil dieses Auftrags).
- **SolidCraft-Verhalten** (ob ein Schnitt ohne `targets` andere Körper trifft, ob `solid.chamfer` per Punkt die
  Kantenkette mitnimmt, wie `fit: close` gerechnet wird) ist nur aus Kommentaren und engineering-notes bekannt.
