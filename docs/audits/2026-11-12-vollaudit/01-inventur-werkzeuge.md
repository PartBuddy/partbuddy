# 01 – Inventur Werkzeuge des Assistenten

Stand: 12.11.2026, Zweig `docs/vollaudit-2026-11` (Commit e29171c). Phase 1 des [Auftrags](AUFTRAG.md), nur gelesen,
nichts gebaut. Bereich: alle 24 Dateien in `apps/desktop/src/main/agents/` (3863 Zeilen, vollständig gelesen). Für die
Spalte „Durchsetzung“ zusätzlich gelesen: `shared/mechanisms.ts`, `blocks.ts`, `screwSizes.ts`, `knob.ts`, `magnet.ts`,
`wallMount.ts`, `assembly.ts`, `contract.ts:802–850`; Verkettung der Werkzeuge in `main/index.ts:584–588`.

Kürzel (alle unter `apps/desktop/src/`): **mT** `main/agents/mechanismTool.ts` · **bT** `main/agents/blockTool.ts` ·
**dT** `main/agents/drawingTool.ts` · **mech** `shared/mechanisms.ts` · **blk** `shared/blocks.ts` · **con**
`shared/contract.ts` · **T-m** `test/mechanism.test.ts` · **T-b** `test/blockTool.test.ts` · **T-d**
`test/drawingTool.test.ts` · **T-a** `test/agent.test.ts` · **T-q** `test/questions.test.ts` · **T-n** `test/notes.test.ts`.
„Schema“ = JSON-Schema des Werkzeugs (nur Text für das Modell, siehe W28); „Code“ = tatsächliche Prüfung.
Testspalte: Testfall nach Titel/Zeile zugeordnet; die Testkörper wurden nicht Zeile für Zeile gegengelesen (siehe unten).

Reihenfolge der Hüllen (außen → innen, `main/index.ts:584–588`): Policy (`decide`, im Gate-Proxy bzw. `loop.ts`) →
`questions.tools` → `steps.tools` (WorkLog) → `withDesignTool` → `withAssemblyTool` → `withViewTool` → `guardNotes` →
`withStandardTool` → `withPrintFaces` → `withBlockTool` → `withMechanismTool` → `withDrawings` → SolidCraft.

## Prüfliste

### A. `partbuddy_mechanism` – Schema (mT:38–69)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 1 | `kind` (Pflicht, string enum) | mT:41 | hinge, slide, closure, screw, lid, snap, plug, latch | wählt den Mechanismus | mT:465–608, sonst Fehler mT:608 | T-m (je Art) | |
| 2 | `fixed` (Pflicht, string) | mT:42 | exakter Körpername | Körper, der bleibt / Stift, Schiene, Sitz trägt | getrimmt mT:96; Existenz gegen `inspect_design` mT:319–320 | T-m:75 | |
| 3 | `moving` (Pflicht, string) | mT:43 | exakter Körpername; lid: neuer Name ≤ 60 Zeichen | bewegter Körper / Deckel | mT:97, 319; lid: Name frei mT:318, Kürzung mT:211 | T-m:490 | |
| 4 | `fixed` ≠ `moving` | mech:59, 201, 308, 447, 550, 629, 712, 776 | – | – | jede `*Problem`-Funktion | T-m:42 u. a. | |
| 5 | `from` (Pflicht, 3 Zahlen, mm) | mT:44 | endlich | ein Ende der Linie / Ecke / Mittelpunkt / Fuß | `vec3` mT:75–76; mT:100 | T-m:42 | |
| 6 | `to` (optional im Schema, 3 Zahlen) | mT:45 | endlich; lid: nicht nötig | anderes Ende / Richtung | Pflicht für alle außer lid mT:100; Abstand ≥ 1e-6 mm mT:102 | T-m:42 | |
| 7 | `up` (optional, 3 Zahlen) | mT:46 | Standard [0,0,1] | slide/snap/latch: Normale bzw. Aufrichtung; closure: ±Z | slide mT:133–134 + mech:203–204; closure nur ±Z mT:146; snap mech:630–632; latch mech:777–779 | T-m:270, 334, 531, 644 | |
| 8 | `shape` (optional enum) | mT:47 | peg (Standard), dovetail | plug: Zapfen oder Schwalbenschwanz | mT:585, 596 | T-m:587, 603 | |
| 9 | `side` (enum, für closure Pflicht) | mT:48 | x-, x+, y-, y+ | Wand mit Wulst und Kerbe | mT:148 | T-m:334 | |
| 10 | `wall` Schema | mT:49 | 1,6–10 mm; closure/snap Standard 2; hinge ohne Standard | Kerbtiefe (closure), Fenstertiefe (snap), Hautprüfung (hinge) | closure mech:311; snap mech:633; hinge: **kein Bereichstest**, nur `typeof number` mT:488 | T-m:334, 531, 146 | |
| 11 | `radius` Schema | mT:50 | 0–100 mm, Standard 0 | closure: Eckradius des Innenraums; < 2 mm → scharfe Lippe (mech:329) | nur `< 0` abgelehnt mech:312; Obergrenze **keine** | T-m:334 | |
| 12 | `size` (enum) | mT:51 | M2, M2.5, M3, M4, M5, M6, M8, M10; Standard M3 | screw: Schraube | mT:231–232 | T-m:398 | |
| 13 | `head` (enum) | mT:52 | cap (Standard), countersunk, none | screw: Senkung für den Kopf | mT:233–234; Senkkopf ab M3 mech:451 | T-m:398 | |
| 14 | `thread` (enum) | mT:53 | insert (Standard, M2–M6), tapped (ab M5) | screw: Einschmelzsitz oder modelliertes Gewinde | mT:235–236; mech:449–450 | T-m:398 | |
| 15 | `more` (Array von Punkten) | mT:54 | Schema maxItems 40 | weitere Schrauben/Haken/Zapfen | screw ≤ 40 mech:454; snap ≤ 20 mech:634; peg ≤ 20 mech:715; Form mT:179–180, 201–202, 237–238 | T-m:398, 587 | |
| 16 | `screws` (boolean) | mT:55 | Standard true | screw: Schrauben als Normteile einsetzen | `args.screws !== false` mT:239 | T-m:373 | |
| 17 | `flat` (boolean) | mT:56 | Standard false | closure: Lippe auf flacher Platte, kein Fuß, keine Kerbe | `args.flat === true` mT:169 | keiner gefunden | |
| 18 | `hinge_from`, `hinge_to` (je 3 Zahlen) | mT:57–58 | waagrecht, entlang X oder Y | closure: Rille dort, wo der Wulst nach dem Zuklappen landet | mT:150–157 | T-m:328 | |
| 19 | `diameter` Schema | mT:59 | 3–200 mm | plug: Zapfen-Ø; hinge: Rollen-Ø; lid: Hals-Ø | plug 3–20 mech:713; hinge 4–40 mech:60; lid 16–200 mech:551 (lid: Pflicht mT:213) | T-m:42, 478, 587 | |
| 20 | `starts` (integer enum) | mT:60 | 1, 2, 3; Standard 1 | lid: Gangzahl | mech:552 | T-m:478 | |
| 21 | `knuckles` (integer enum) | mT:61 | 3, 5, 7, 9; Standard nach Länge | hinge: Anzahl Gelenkaugen | mech:62 | T-m:42, 53 | |
| 22 | `width` Schema | mT:62 | 2–60 mm | slide: Fußbreite Schiene (Standard 6); latch: Breite (5–40, Standard 10) | slide 2–60 mech:205; latch 5–40 mech:780 | T-m:270, 644 | |
| 23 | `height` Schema | mT:63 | 1,5–20 mm, Standard 3 | slide: Schienenhöhe | mech:206 | T-m:270 | |
| 24 | `gap` Schema | mT:64 | 0,05–1 mm | Spalt zwischen den Teilen | hinge 0,2–1 mech:61; slide/dovetail 0,2–1 mech:207; lid 0,2–0,6 mech:553; peg 0,05–0,5 mech:714; closure, screw, snap, latch: **ignoriert** | T-m:42, 270, 478, 587 | |
| 25 | `name` (string) | mT:65 | ≤ 60 Zeichen | Name der Features | Kürzung mT:110, 222 | keiner | |
| 26 | `required` | mT:67 | kind, fixed, moving, from | – | mT:100, 213 | T-m:42 | |
| 27 | `additionalProperties: false` | mT:68 | – | – | **keine** (unbekannte Schlüssel werden überlesen) | keiner | |

### B. `partbuddy_mechanism` – Standardwerte, Grenzen und Zahlen je Art

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 28 | Standardspalt hinge/slide | mT:109 | min(1, max(0,3, Düse)) mm | Spalt überall | hinge/slide-Bereich mech:61, 207 | T-m:53 | |
| 29 | Standardspalt lid | mT:221 | min(0,6, max(0,3, round(Düse·75)/100)) mm | radiales Gewindespiel, ganz am Deckel | mech:553 | T-m:478 | |
| 30 | Standardspalt plug (peg und dovetail) | mT:181, 587 | 0,2 mm je Seite | Luft um Zapfen / Schwalbenschwanz | peg mech:714; dovetail mech:207 | T-m:587, 603 | |
| 31 | Düse für closure/screw/snap/plug/latch | mT:141, 177, 187, 197, 229 | fest 0,4 an `common` übergeben, Ergebnis ungenutzt | keine | – | keiner | |
| 32 | hinge: Rollen-Ø Standard | mT:122 | 6 mm | Außendurchmesser Gelenkauge | mech:60 | T-m:53 | |
| 33 | hinge: Stift-Ø | mech:52–54 | max(2, Ø/2) mm | Stift am festen Körper | – | T-m:12 | |
| 34 | hinge: Gelenkaugen Standard | mT:124 | kleinstes aus 3/5/7/9 mit Länge/Anzahl ≤ 10 mm, sonst 9 | Augenlänge = (Länge − (n−1)·Spalt)/n | mech:62, 69–70 | T-m:53 | |
| 35 | hinge: Mindestwand um die Bohrung | mech:44, 63–64 | 0,8 mm | (Ø − Stift)/2 − Spalt | Ablehnung mech:64 | T-m:42 | |
| 36 | hinge: Mindestlänge Auge | mech:46, 69–70 | 2,5 mm | – | Ablehnung mech:70 | T-m:42 | |
| 37 | hinge: Mindeststärke über dem Bohrungsdach (liegend) | mech:66–68 | 0,9 mm | Ø/2 − (Stift/2 + Spalt)·1,05 | Ablehnung mech:68 | T-m:42 | |
| 38 | hinge: Dach der Bohrung `ROOF_TOP` | mech:150, 157–173 | 1,05 Radien; Flanken 45° | abgeschnittene Tropfenform in der bewegten Bohrung, nur bei waagrechter Linie | – | T-m:12 | |
| 39 | hinge: Raum für jedes Auge im anderen Körper | mech:100 | Ø + 2·Spalt, je Ende + Spalt | Schnitt im Gegenkörper | – | T-m:12 | |
| 40 | hinge: Bohrung in bewegten Augen | mech:105 | Stift + 2·Spalt, je Ende + Spalt | – | – | T-m:12 | |
| 41 | hinge: Stege unter schwebenden Augen `WEB` | mech:112, 121–143 | 45°; 0,5 mm in die Wand; ausgelassen unter 0,3 mm | Stütze unter dem Auge bis zur eigenen Wand oder zum Bett | nur wenn `support` gemessen mT:479, mech:122–123 | T-m:130–143 | |
| 42 | hinge: Messstab `PROBE` | mT:378, 389 | Ø 0,1 mm, Suchabstand = Ø Rolle | misst Abstand Linie → Körper, wird zurückgenommen | Batch mit Fehlschritt mT:391–403 | keiner für `roomDepths` | |
| 43 | hinge: Raumtiefe je Körper | mT:412 | max(0, Ø/2 + Spalt − Abstand − 0,05), auf 0,01 | wie tief der Raum in die Wand reicht | – | keiner | |
| 44 | hinge: Seite für Steg | mT:426–429 | verworfen, wenn waagrechter Abstand < 0,2 mm oder < senkrechter | – | – | keiner | |
| 45 | hinge: Bett | mT:431–433 | kleinstes z der Hüllkörper beider Körper | Fuß der Stege | – | T-m:142 (mit festem Wert) | |
| 46 | hinge: Hautprüfung `skinProblem` | mT:441–451 | Haut < Düse·2·1,125 (auf 0,01) und > 0 → Ablehnung | verhindert dünne Haut hinter dem Raum | nur wenn `wall` Zahl und Messung gelang mT:488 | T-m:146–150 | |
| 47 | hinge: Reichweite der Linie | mT:468, 483 | ≤ Ø/2 − 0,5 mm von beiden Körpern | Auge überlappt den Körper ≥ 0,5 mm | **keine Vorprüfung**; nur Warnung „separate pieces“ nach dem Bau mT:333–348 | T-m:158 | |
| 48 | hinge: Gelenk und Schwenk | mT:492 | revolute, −180…180°, Schritt 1° | Grenzen = Kontakt, zur Null hin abgeschnitten | mT:274–277, 362–373 | T-m:75, 218 | |
| 49 | slide: Mindestlänge | mech:202 | 5 mm | – | Ablehnung | T-m:270 | |
| 50 | slide: `up` rechtwinklig zur Linie | mech:204 | Skalarprodukt ≤ 1e-6·Länge·|up| | – | Ablehnung | T-m:270 | |
| 51 | slide: Profil Schiene | mech:248–258 | Fuß `width`, oben `width` + 2·`height`, Flanken 45° | Schwalbenschwanz am festen Körper | – | T-m:257 | |
| 52 | slide: Profil Nut | mech:235–247 | Flanke um Spalt·√2 versetzt, oben + Spalt, unten − Spalt | Nut im bewegten Körper, ringsum ein Spalt | – | T-m:257 | |
| 53 | slide: Verfahrweg `railTravel` | mT:259–271 | aus Hüllkörper, auf 0,1 mm | Grenzen halten den Körper auf der Schiene | mT:505–508 | T-m:277 | |
| 54 | slide: Schwenk | mT:508 | slider, Schritt 0,1 mm | Grenzen = Kontakt | mT:276 | T-m:75 (hinge), 277 | |
| 55 | closure: `from`/`to` gleiche Höhe | mT:144 | Δz ≤ 1e-6 | Rand des Deckels | Ablehnung | T-m:334 | |
| 56 | closure: Innenraum mindestens | mech:309 | 12 mm in x und y | – | Ablehnung | T-m:334 | |
| 57 | closure: Wandlänge für den Wulst | mech:310 | ≥ 14 + 2·max(Radius, 2) + 2 mm | Wulst nie in der Ecke | Ablehnung | T-m:334 | |
| 58 | closure: `LIP.thick` | mech:303 | 1,2 mm | Dicke der Lippe | fest | T-m:293 | |
| 59 | closure: `LIP.high` | mech:303 | 4 mm | Höhe der Lippe über dem Rand | fest | T-m:293 | |
| 60 | closure: `LIP.clear` | mech:303 | 0,25 mm | Luft Lippe ↔ Dosenwand | fest | T-m:293 | |
| 61 | closure: `LIP.foot` | mech:303, 361 | 3 mm, Überlappung 0,2 mm in die Deckelwand | Fuß der Lippe im Deckel mit 45°-Fase (`inner − 0,05`) | fest | T-m:293 | |
| 62 | closure: `LIP.bead` | mech:303, 365–374 | 0,5 mm vor, 1 mm hoch, Fasen 0,45 mm | Schnappwulst; Fang 0,25 mm | fest | T-m:293 | |
| 63 | closure: `LIP.beadLong` | mech:303 | 14 mm | Länge des Wulstes | fest | T-m:293 | |
| 64 | closure: Rille | mech:375–386 | Zylinder Ø 1,4 mm, Länge 15 mm, Achse 0,25 mm innen, 2,5 mm über/unter dem Rand | Rille in der Dosenwand (0,45 mm tief) | fest | T-m:293, 328 | |
| 65 | closure: `LIP.notch` | mech:303, 387–398 | Ø 16 mm, durch `wall` | Fingerkerbe im Deckelrand | nicht bei `flat` | T-m:293 | |
| 66 | closure: Dosenwand gerade und ≥ 1,6 mm | mT:523, 526 | Text | – | **keine** | keiner | |
| 67 | screw: Mindestabstand `from`–`to` | mech:448 | 1 mm | Klemmdicke | Ablehnung | T-m:398 | |
| 68 | screw: Rest unter dem Kopf `UNDER_HEAD` | mech:428, 452–453 | 1,2 mm | Material unter Senkung | Ablehnung | T-m:398 | |
| 69 | screw: Kopftiefe | mech:433 | cap: Kopfhöhe + 0,4; countersunk: 0,6·d; none: 0 | Tiefe der Senkung | – | T-m:373 | |
| 70 | screw: Durchgangsloch | mech:476 | `solid.hole {clearance: size, fit: normal}`, Tiefe = Klemmdicke | Loch im bewegten Körper | SolidCraft-Tabelle | T-m:373 | |
| 71 | screw: Zylindersenkung | mech:504 | Ø Kopf + 2·0,6; Tiefe Kopf + 0,4 | – | fest (`HEAD_ALLOWANCE`) | T-m:373 | |
| 72 | screw: Kegelsenkung | mech:505 | Ø Kopf (ISO 10642) + 0,6; 90° | – | fest | T-m:398 | |
| 73 | screw: Einschmelzsitz | mech:481 | Ø und Länge aus `INSERT`, Tiefe Länge + 1 mm | Loch im festen Körper | Tabelle; Dicke des Körpers **nicht** geprüft | T-m:373 | |
| 74 | screw: modelliertes Gewinde | mech:435, 482 | Tiefe 2,5·d + 1 mm, ab M5 (`TAPPED_FROM`) | `solid.hole {thread, modeled}` | mech:450 | T-m:398 | |
| 75 | screw: Schraubenlänge `SCREW_LENGTHS` | mech:424, 438–443 | 4…80 mm; längste mit ⅔·Halt ≤ Eingriff ≤ Halt | Kaufempfehlung, Normteil | sonst keine Schraube, Text mT:559 | T-m:411 | |
| 76 | screw: 2 mm Kunststoff um den Einsatz | mT:560 | Text | – | **keine** | keiner | |
| 77 | lid: Gewinde nach Ø | mech:533 | ≤ 24: Steigung 3 / Tiefe 1,1; ≤ 77: 4 / 1,2; sonst 5 / 1,5 mm | Flachgewinde 45° | fest | T-m:433 | |
| 78 | lid: Eingriff | mech:535 | max(0,75, 1,75/Gänge) Umdrehungen | Gewindelänge = Umdr. × Steigung × Gänge | fest | T-m:433 | |
| 79 | lid: `LID.plain` | mech:540 | 1 mm | glatter Hals über dem Gewinde | fest | T-m:443 | |
| 80 | lid: `LID.wall`, `LID.top` | mech:540 | 2,4 mm | Wand und Boden des Deckels | fest | T-m:443 | |
| 81 | lid: `LID.mouth` | mech:540 | 1 mm | Luft unter dem Deckelgewinde | fest | T-m:443 | |
| 82 | lid: Riffel `LID.flute` | mech:540, 585 | Ø 3 mm, alle 7 mm Umfang, mindestens 8 | Griffrillen | fest | T-m:443 | |
| 83 | lid: Kegel am Deckelrand | mech:590–591 | 0,6 mm hoch, Ø − 1,2 | Fase an der Bettkante | fest | T-m:443 | |
| 84 | lid: Gewindeprofil ragt in den Körper | mech:574, 587, 593 | 0,2 mm radial | Verbindung Wendel ↔ Körper | fest | T-m:443 | |
| 85 | lid: Hals glatt, Ø wie angegeben, Wand ≥ 2 mm | mT:534, 544 | Text | – | **keine** (nur „separate pieces“/Überlappungswarnung danach) | keiner | |
| 86 | lid: Druckfläche | mech:597; mT:537–539 | Deckeloberseite | `body.print_face`, für die Plattenansicht gemerkt | – | T-m:490 | |
| 87 | snap: `SNAP.length` | mech:625 | 12 mm | Armlänge inkl. Haken | fest | T-m:515 | |
| 88 | snap: `SNAP.thickness` | mech:625 | 1,5 mm | Armdicke | fest | T-m:515 | |
| 89 | snap: `SNAP.width` | mech:625 | 5 mm | Armbreite | fest | T-m:515 | |
| 90 | snap: `SNAP.catch`, `catchLength` | mech:625 | 0,8 mm auf den letzten 1,5 mm | Rastnase | fest | T-m:515 | |
| 91 | snap: `SNAP.gap` | mech:625, 666 | 0,2 mm | Arm steht so weit vor der Wand | fest | T-m:515 | |
| 92 | snap: Fenster | mech:652–660 | Breite 5 + 2·0,3; Höhe 1,5 + 0,2 + 0,5 = 2,2 mm; Unterkante 10,3 mm über dem Fuß; Tiefe = `wall` | Fenster durch die Wand des bewegten Körpers | fest | T-m:515 | |
| 93 | snap: Dehnung an der Wurzel | mT:570 | „about 1.4 %“ (Text) | – | Rechnung in blk:105–108, hier nur Text | keiner | |
| 94 | plug/peg: Ø Standard `PEG.least` | mech:703; mT:181 | 5 mm | Zapfen-Ø | 3–20 mech:713 | T-m:587 | |
| 95 | plug/peg: Länge `PEG.ratio` | mech:703, 706–708 | 1,5 × Ø | Zapfenlänge | fest | T-m:561 | |
| 96 | plug/peg: Tasche tiefer `PEG.deeper` | mech:703, 733 | 1 mm | Luft und Kleber | fest | T-m:561 | |
| 97 | plug/peg: Fasen `PEG.chamfer` | mech:703, 734, 736 | 0,5 mm, 45° | Spitze und Taschenmund | fest | T-m:561 | |
| 98 | plug/peg: Wurzel `PEG.root` | mech:703, 735 | 0,5 mm im festen Körper | Verbindung zum Körper | fest | T-m:561 | |
| 99 | plug/peg: „max(2·Ø, 4) mm Kunststoff um die Taschenachse“ | mT:605 | Text | – | **keine** | keiner | |
| 100 | plug/dovetail | mT:585–594 | Schiene/Nut wie slide, Spalt Standard 0,2, kein Gelenk | Steckverbindung | mech:197–209 | T-m:603 | |
| 101 | latch: `LATCH.thick` | mech:766 | 1,6 mm | Armdicke | fest | T-m:616 | |
| 102 | latch: `LATCH.off` | mech:766 | 1,5 mm | Abstand Arm ↔ Wand | fest | T-m:616 | |
| 103 | latch: `LATCH.foot`, `head` | mech:766 | 1 und 5 mm über der Fuge | Wurzel des Arms am Deckel, 45°-Schräge | fest | T-m:616 | |
| 104 | latch: `LATCH.lever` | mech:766 | 12 mm | Hebel bis zum Haken | fest | T-m:616 | |
| 105 | latch: `LATCH.bead` | mech:766 | 1,2 mm | Wulst an der Dose | fest | T-m:616 | |
| 106 | latch: `LATCH.clear` | mech:766 | 0,4 mm | Haken ↔ Wand; Überdeckung 0,8 mm | fest | T-m:616 | |
| 107 | latch: `LATCH.seat` | mech:766 | 0 mm | Abstand der 45°-Flächen | fest | T-m:616 | |
| 108 | latch: `LATCH.tab` | mech:766 | 2 mm | Fingerlasche unter dem Haken | fest | T-m:616 | |
| 109 | latch: `LATCH.into`, `beside` | mech:766 | 0,5 mm in die Wand; Wulst 1 mm breiter je Seite | Verbindung, Wulstbreite | fest | T-m:616 | |
| 110 | latch: benötigte ebene Wand | mech:769–772; mT:34, 582 | 8,1 mm am Deckel, 14,1 mm an der Dose | – | **keine** (Text) | T-m:644 (Wert) | |
| 111 | latch: Dehnung | mT:581 | „about 1.3 %“ (Text) | – | keine | keiner | |

### C. `partbuddy_mechanism` – Ablauf, Rückgaben, Fehlermeldungen

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 112 | Körper vorhanden | mT:315–320 | – | – | Fehler „no body …; the bodies are …“ | T-m:75 | |
| 113 | Gelenke stehen auf 0 | mT:326–329 | |Wert| ≤ 1e-6 | Linie gilt in der Welt wie konstruiert | Fehler „the joint(s) … stand away from 0 …“ | T-m:203 | |
| 114 | Komponente aktivieren | mT:291–305 | je Schritt | Geometrie bewegt sich mit dem Körper | – | T-m:189 | |
| 115 | Lose Stücke | mT:333–348 | Warnung enthält „separate pieces“ | alles per `undo` zurück | Fehler „… Everything was taken back; call again with the line moved.“ / „Undo what was built, then call again.“ | T-m:158 | |
| 116 | Überlappung danach | mT:337–349 | `inspect.interference` count > 0 | – | nur Zusatz „ Warning: the two bodies still share volume …“ | T-m:75 | |
| 117 | Gelenk bauen | mT:353–375 | `component.from_bodies`, `joint.as_built`, `joint.sweep`, `joint.limits` | Gelenk mit Grenzen | Fehler mT:359; Sweep-Fehler → Text `unswept` mT:456–457 | T-m:75, 218 | |
| 118 | Grenze abschneiden `reach` | mT:274–277 | trunc(stopped/Schritt)·Schritt | Grenze diesseits des Kontakts | – | T-m:75 | |
| 119 | Rückgabe hinge | mT:495–499 | Augen, Ø, Stift, Spalt, Grenzen, Stege, Raumtiefen, Warnung | – | – | T-m:75 | |
| 120 | Rückgabe slide | mT:512–516 | Breite, Höhe, Spalt, Grenzen, „add stops“ | – | – | T-m:270 | |
| 121 | Rückgabe closure (normal / flat) | mT:522–527 | Lippe, Luft, Fang 0,25, Kerbe; flat: Druckfläche selbst setzen | – | – | T-m:348 | |
| 122 | Rückgabe lid | mT:540–545 | Steigung, Tiefe, Gänge, Umdrehungen, Breite, Schürze | – | – | T-m:490 | |
| 123 | Rückgabe screw | mT:555–561 | Löcher, Sitz, Stückliste | – | – | T-m:411 | |
| 124 | Rückgabe snap | mT:568–572 | Maße, Dehnung, Druckhinweis | – | – | T-m:531 | |
| 125 | Rückgabe latch | mT:579–583 | Maße, Dehnung, Wandbedarf, Druckhinweis | – | – | T-m:644 | |
| 126 | Rückgabe plug (dovetail / peg) | mT:590–593, 602–606 | Maße, Warnung bei 1 Zapfen und Ø < 5 | – | – | T-m:587, 603 | |
| 127 | Fehlerpräfix | mT:621 | „Not built: …“, `isError: true` | – | – | T-m:42 | |
| 128 | Fehler aus `common` | mT:100, 102 | „fixed, moving, from and to are needed“; „from and to must be two points“ | – | – | T-m:42 | |
| 129 | Fehler hinge | mech:59–70 | 7 Meldungen (zwei Körper, Ø 4–40, Spalt 0,2–1, Augen, Wand, Dach, Augenlänge) | – | – | T-m:42 | |
| 130 | Fehler slide | mech:201–207; mT:134, 507 | 7 Meldungen + „up must be three numbers“ + „could not be measured“ | – | – | T-m:270 | |
| 131 | Fehler closure | mT:144–155; mech:308–312 | 9 Meldungen | – | – | T-m:334 | |
| 132 | Fehler screw | mT:232–238; mech:447–454 | 11 Meldungen | – | – | T-m:398 | |
| 133 | Fehler lid | mT:213, 318; mech:550–553 | 6 Meldungen | – | – | T-m:478, 490 | |
| 134 | Fehler snap / latch / plug | mT:190, 200–202, 596; mech:629–634, 712–715, 776–780 | je 4–6 Meldungen | – | – | T-m:531, 587, 644 | |
| 135 | SolidCraft-Fehler | mT:462 | „SolidCraft refused <cmd>: <200 Zeichen>“ | – | – | T-m:218 | |
| 136 | `MECHANISM_GUIDANCE` (Rollenprompt) | mT:628 | Text | weist das Modell auf jede Art hin | keine (Prompt) | T-m:244/249 teils | |

### D. `partbuddy_block` – Schema (bT:40–71)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 137 | `block` (Pflicht, enum) | bT:19–24, 43 | screwHole, tappedHole, insertSeat, nutTrap, boss, slot, text, lip, snapFit, keyhole, woodScrew, magnet, knob | Art des Bausteins | bT:81, 104, 140, 168 | T-b:22 | |
| 138 | `body` (Pflicht, string) | bT:44 | exakter Name; knob: neuer Name | Zielkörper | nur „nicht leer“ bT:82–84; Existenz nur bei keyhole/woodScrew/magnet über `targets`; knob: Name frei bT:245–246 | T-b:125 | |
| 139 | `point` (Pflicht, 3 Zahlen) | bT:45 | endlich | Mitte Loch / Fuß / Textmitte | `vec3` bT:83 | T-b:22 | |
| 140 | `normal` (3 Zahlen) | bT:46 | Pflicht für nutTrap, slot, text, snapFit, keyhole, magnet; knob Standard +Z | Flächennormale / Wellenrichtung | bT:86, 121–122, 144–145, 172–173; Nullvektor nur bei keyhole/magnet/knob geprüft | T-b:22, 161, 209 | |
| 141 | `up` (3 Zahlen) | bT:47 | keyhole Standard +Z; knob Standard +Y (bzw. +Z bei Welle entlang Y) | Hängerichtung / Zeiger | bT:123–124, 175–177; wallMount.ts:62; knob.ts:72 | T-b:109, 209 | |
| 142 | `screw` (number enum) | bT:48 | 3,5 / 4 / 4,5 / 5 mm; Standard 4 | Holzschraube | bT:108–109 | T-b:209 | |
| 143 | `size` (enum) | bT:49 | M2…M10; Standard M3 | Schraube | bT:87–90 gegen `sizesOf` (blk:60–64); con:803 | T-b:22 | |
| 144 | `more` (Array) | bT:50 | Schema maxItems 99 | weitere Punkte | Blöcke ≤ 99 con:806; keyhole ≤ 20 wallMount.ts:63; magnet ≤ 40 magnet.ts:45; woodScrew **unbegrenzt**; nur für screwHole/tappedHole/insertSeat übernommen bT:94 | T-b:12 | |
| 145 | `head` (enum) | bT:51 | none, cap (Standard), countersunk | screwHole: Senkung | con:810; countersunk ab M3 blk:62 | T-b:22 | |
| 146 | `fit` (enum) | bT:52 | close, normal (Standard), loose | screwHole: Durchgangsloch ISO 273 | con:810; Maß aus SolidCraft | T-b:12 | |
| 147 | `depth` (number) | bT:53 | Schema ohne Grenzen | tappedHole, insertSeat, nutTrap, slot, text | > 0 und ≤ 500 con:804; bei anderen Arten **überlesen** bT:93 | keiner für Grenzen | |
| 148 | `diameter` (number) | bT:54 | Schema ohne Grenzen | insertSeat-Loch; boss außen; knob (Standard 25); magnet (Standard 6) | Block > 0 ≤ 500 con:804; knob knob.ts:76–77; magnet 2–40 magnet.ts:43 | T-b:109, 161 | |
| 149 | `height` (number) | bT:55 | Schema ohne Grenzen | boss; Texthöhe; lip; knob (Standard 16); magnet (Standard 2) | Block > 0 ≤ 500; knob 9–60 knob.ts:78; magnet 1–20 magnet.ts:44 | T-b:109, 161 | |
| 150 | `length` (number) | bT:56 | Schema ohne Grenzen | slot (Standard 10), snapFit-Arm (Standard 12) | > 0 ≤ 500 con:804 | keiner | |
| 151 | `width` (number) | bT:57 | Schema ohne Grenzen | slot, lip, snapFit | > 0 ≤ 500 con:804 | keiner | |
| 152 | `along` (enum) | bT:58 | x (Standard), y | slot: Richtung in der Fläche | con:832 | keiner | |
| 153 | `text` (string) | bT:59 | ≤ 80 Zeichen | Wörter | 1–80 con:821; fehlt es, gilt Standard „PartBuddy“ blk:80 | keiner | |
| 154 | `mode` (enum) | bT:60 | emboss, deboss (Standard) | text erhaben / vertieft | con:824 | keiner | |
| 155 | `type` (enum) | bT:61 | lip (Standard), groove | Lippe oder Nut am Rand | con:835 | keiner | |
| 156 | `hold` (enum) | bT:62 | glue (Standard, +0,3), press (+0,1) | magnet: Luft am Ø | bT:148–149 | T-b:161 | |
| 157 | `shaft` (enum) | bT:63 | d (Standard), round, knurl | knob: Wellenform | bT:178–179 | T-b:98 | |
| 158 | `shaftDiameter` (number) | bT:64 | Standard 6 | knob: Wellen-Ø | 3–10 knob.ts:73 | T-b:109 | |
| 159 | `flat` (number) | bT:65 | 4,5 bei 6 mm, sonst Pflicht | knob: Dicke der D-Welle an der Abflachung | bT:182–183; Ø/2 < flat < Ø knob.ts:75 | T-b:109 | |
| 160 | `clearance` (number) | bT:66 | Standard 0,2 (knurl 0) | knob: Luft am Wellen-Ø | 0–0,6 knob.ts:74 | T-b:109 | |
| 161 | `hook` (enum) | bT:67 | x+, x-, y+ (Standard), y- | snapFit: Richtung der Nase | con (HOOK_DIRECTIONS) | keiner | |
| 162 | `required` | bT:69 | block, body, point | – | bT:84, 107, 143, 171 | T-b:22 | |
| 163 | Schlüssel, die die Art nicht hat | bT:93 | – | – | **stillschweigend überlesen** | keiner | |

### E. `partbuddy_block` – Standardwerte und Zahlen je Baustein

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 164 | screwHole Standard | blk:73, 219–230 | head cap, fit normal; `solid.hole {clearance, fit}` ohne Tiefe | Durchgangsloch nach SolidCrafts ISO-273-Tabelle | Maß von SolidCraft | T-b:12 | |
| 165 | screwHole Zylindersenkung | blk:221–223 | Ø Kopf + 1,2; Tiefe Kopf + 0,4 | – | fest | T-b:12 | |
| 166 | screwHole Kegelsenkung | blk:225–227 | Ø Kopf + 0,6; 90° | – | fest | keiner gefunden | |
| 167 | tappedHole Standard | blk:71, 218 | modelliert, Tiefe null (ohne `depth`) | `solid.hole {thread, modeled}` | alle Größen M2–M10 erlaubt blk:63 | T-b:12 | |
| 168 | insertSeat Standard | blk:75 | Ø aus `INSERT`, Tiefe Länge + 1 | Sackloch | M2–M6 blk:61 | T-b:12 | |
| 169 | boss Standard | blk:78, 233–238 | Ø Einsatz + 4; Höhe Länge + 3; Loch Einsatz-Ø, Tiefe Länge + 1 | `plastic.boss` | M2–M6 blk:61 | keiner | |
| 170 | nutTrap Standard | blk:81–84, 155–163 | SW + 0,3; Tiefe Mutternhöhe + 0,4; Durchgangsloch normal | Sechskanttasche + Loch | fest | keiner | |
| 171 | slot Standard | blk:85–88, 165–173 | Länge 10, Breite = Durchgang normal, Tiefe null → Schnitt 1000 mm | Langloch | fest | T-b:31 | |
| 172 | text Standard | blk:80, 147–154 | „PartBuddy“, Höhe 5, Tiefe 0,6, deboss, fett (Arial) | `sketch.text` + `solid.emboss` | con:813–828 | keiner | |
| 173 | lip Standard | blk:90, 199–200 | Breite 1,2, Höhe 2, Spalt 0,2 (nur groove) | `plastic.lip` am Rand | Spalt 0–5 con:835 | keiner | |
| 174 | snapFit Standard | blk:96, 184–198 | Länge 12, Dicke 1,5, Breite 5, Nase 0,8 × 1,5 | `plastic.snap_fit` | nur > 0 ≤ 500 | keiner | |
| 175 | Rückgabe Block `built` | bT:212–220 | „Built [n ×] <Art> on <body> at […]: <Schlüssel Wert, …>.“ | – | – | T-b:31 | |
| 176 | Fehler Block | bT:81, 84, 86, 90, 96 | 5 Meldungen | – | – | T-b:22 | |
| 177 | keyhole: `WALL` Eintritt | wallMount.ts:19–24 | 8 / 9 / 10 / 11 mm | Loch für den Kopf | Tabelle | T-b:209 | |
| 178 | keyhole: Schlitz | wallMount.ts:19–24 | 4 / 4,5 / 5 / 5,5 mm | Schlitz durch die Lippe | Tabelle | T-b:209 | |
| 179 | keyhole: Tasche | wallMount.ts:19–24 | 3 / 3,5 / 3,8 / 4,2 mm tief | Raum für den Kopf | Tabelle | T-b:177 | |
| 180 | keyhole: `KEYHOLE.travel` | wallMount.ts:30 | 8 mm | Weg der Schraube nach oben | fest | T-b:177 | |
| 181 | keyhole: `KEYHOLE.lip` | wallMount.ts:30 | 2 mm | Lippe vor dem Kopf | fest | T-b:177 | |
| 182 | keyhole: `KEYHOLE.behind` / Mindestdicke | wallMount.ts:30, 54–56; bT:133 | 1,2 mm; Dicke ≥ Lippe + Tasche + 1,2 | – | **keine** (Text) | T-b:209 (Wert) | |
| 183 | woodScrew: Durchgang / Senkung | wallMount.ts:19–24, 106–112 | 4,1/7,8 · 4,7/8,8 · 5,2/9,7 · 5,7/10,6 mm, 90° | Senkloch | Tabelle | T-b:209 | |
| 184 | woodScrew: Randabstand, Plattendicke | bT:118 | ≥ Schrauben-Ø; dicker als Senktiefe | – | **keine** (Text) | keiner | |
| 185 | „zwei Aufhänger ab 60 mm Breite“ | bT:264 | Text | – | keine | keiner | |
| 186 | magnet: Luft am Ø | magnet.ts:17 | glue 0,3 / press 0,1 mm | Taschen-Ø | fest | T-b:145 | |
| 187 | magnet: versenkt | magnet.ts:17 | 0,2 mm | Taschentiefe = Höhe + 0,2 | fest | T-b:145 | |
| 188 | magnet: Fase | magnet.ts:17 | 0,4 mm | Mund der Tasche | fest | T-b:145 | |
| 189 | magnet: Wand 1,2 mm rundum, 0,6 mm darunter; 80 °C | bT:162 | Text | – | **keine** | keiner | |
| 190 | knob: `KNOB.roof` | knob.ts:21 | 3 mm | Material über dem Wellenende | knob.ts:78 | T-b:61 | |
| 191 | knob: `KNOB.wall` | knob.ts:21 | 2,4 mm | Wand um die Bohrung | über Mindest-Ø knob.ts:76 | T-b:109 | |
| 192 | knob: `KNOB.insert` | knob.ts:21, 59–61 | min(11, Höhe − 3) mm | Bohrungstiefe | – | T-b:61 | |
| 193 | knob: `KNOB.flat` | knob.ts:21, 115 | 7 mm | Länge der Abflachung | – | T-b:61 | |
| 194 | knob: Riffel | knob.ts:21, 64–66 | Ø 3 mm, alle 7 mm, mindestens 8 | Griff | – | T-b:61 | |
| 195 | knob: Band, Fase, Mund | knob.ts:21 | 2 / 0,6 / 0,5 mm | glattes Band oben, Fasen | – | T-b:61 | |
| 196 | knob: Zeiger | knob.ts:21, 132–133 | 1,2 breit, 0,6 tief, von 0,35 r bis r | Nut auf der Oberseite | – | T-b:61 | |
| 197 | knob: Gewindestiftloch | knob.ts:21, 127 | Ø 2,6 mm, halbe Bohrungstiefe, von der Zeiger-Gegenseite | M3 schneidet selbst | – | T-b:98 | |
| 198 | knob: Ø-Bereich | knob.ts:76–77 | ceil(Welle + Luft + 4,8 + 1,5) … 80 mm | – | Ablehnung | T-b:109 | |
| 199 | knob: Druckfläche | knob.ts:134; bT:249–250 | Oberseite | `body.print_face`, gemerkt | – | T-b:125 | |
| 200 | Ablauf: Komponente aktivieren | bT:242–247 | nur wenn ein Schritt `sketch.create` ist | Block bewegt sich mit dem Körper | – | T-b:31 | |
| 201 | Ablauf: Warnungen | bT:251–255 | je ≤ 200 Zeichen, „ SolidCraft warns: …“ | – | Ergebnis bleibt Erfolg | keiner | |
| 202 | Fehler wall/magnet/knob | bT:107–124, 143–149, 171–183, 246; wallMount.ts:60–63; magnet.ts:42–45; knob.ts:70–78 | je Meldung | – | – | T-b:109, 161, 209 | |
| 203 | `BLOCK_GUIDANCE` | bT:264 | Text | – | keine (Prompt) | keiner | |

### F. `partbuddy_place_drawing`, `partbuddy_move_drawing`, `drawing:`-Verweise

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 204 | place `drawing` (Pflicht) | dT:20 | „svg-N“ (auch mit „drawing:“ davor) | welche Zeichnung | dT:175–177 | T-d:63 | |
| 205 | place `body` | dT:21 | Name; nicht bei part | Zielkörper | nur „nicht leer“ dT:186 | T-d:63 | |
| 206 | place `point`, `normal` | dT:22–23 | je 3 Zahlen; part: Standard Ursprung / +Z | Lage und Ebene | dT:186–187 (Normale ≠ 0) | T-d:63 | |
| 207 | place `mode` (Pflicht) | dT:24 | deboss, emboss, part | vertieft / erhaben / eigener Körper | dT:181, 188 | T-d:63, 98 | |
| 208 | place `depth` (Pflicht) | dT:25 | > 0 … 50 mm | Tiefe / Höhe / Dicke | dT:183, 188 | keiner für Grenzen | |
| 209 | place `fills` | dT:26 | `#rrggbb`, mindestens 1 | nur diese Füllungen | dT:190–193 | T-d:98 | |
| 210 | place `width` | dT:27 | > 0 … 1000 mm; Standard Nutzerbreite | Breite, Seitenverhältnis bleibt | dT:184, 188 | T-d:32 | |
| 211 | place `colours` | dT:28 | boolean | Körper je Farbe | `=== true` dT:199; wirkt nur bei ≥ 2 Füllungen blk:249 | keiner gefunden | |
| 212 | place `colours_max` | dT:29 | ganzzahlig 2–16 | nächste Farben verschmelzen | dT:196–197 | keiner gefunden | |
| 213 | place `centre` | dT:30 | x, y, both | danach auf der Fläche zentrieren | dT:185, 189, 195 | T-d:63 | |
| 214 | place Rückgabe | dT:211–213 | „Placed "<Skizze>" on <body> (…)“ / „Built …“ + ggf. Verschiebetext | – | – | T-d:63 | |
| 215 | place Fehler | dT:177, 186–197, 204, 231 | 9 Meldungen, Präfix „Not placed: “ | – | – | T-d:63 | |
| 216 | move `logo` (Pflicht) | dT:45 | Skizzenname | – | `planLogoMove` (außerhalb) | keiner hier | |
| 217 | move `by` | dT:46 | 2 Zahlen, mm | Verschiebung in Logo-x/y | dT:148, 150 | keiner hier | |
| 218 | move `centre` | dT:47 | x, y, both | auf Flächenmitte | dT:149 (Unbekanntes → still null) | T-d:63 | |
| 219 | move `rotate` | dT:48 | −360…360° | Drehung um die Mitte | dT:151–152 | keiner hier | |
| 220 | move `width` | dT:49 | > 0 … 1000 mm | neue Breite | dT:153–154 | keiner hier | |
| 221 | move Rückgabe / Fehler | dT:155, 158, 167, 238 | „Moved … by … mm …“; Präfix „Not moved: “ | – | – | T-d:63 | |
| 222 | Verweis `drawing:svg-N[:#rrggbb]` | dT:70, 88–96, 129–137 | N ≤ 6 Stellen | Konturen werden vor SolidCraft eingesetzt | Fehler bei unbekannter Zeichnung/Füllung | T-d:32, 51 | |
| 223 | Reservierter Name „SVG-Logo …“ | dT:242–248 | `params.name` in execute/batch | – | Ablehnung | keiner gefunden | |
| 224 | `drawingNote` | dT:100–127 | Dateiname ≤ 80 Zeichen, bereinigt | – | Prompt | T-d:125 | |

### G. Weitere PartBuddy-Werkzeuge

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 225 | `partbuddy_standard.topic` (Pflicht) | standardTool.ts:17; shared/standards.ts:9 | slidingLid, clamp, feet, hook, cableEntry, vent, boardMount, starKnob | keine (liefert Regeltext) | standardTool.ts:31–33 | test/standardTool.test.ts:15, 29 | |
| 226 | `STANDARD_GUIDANCE` | standardTool.ts:40 | Text | – | keine (Prompt) | standardTool.test.ts:29 | |
| 227 | `partbuddy_design_rules`: rounding, printInPlace, details, snap | designTool.ts:24–27 | je true / false / null | schaltet Regelgruppen der Druck-Notiz | designTool.ts:36–44 | test/designRules.test.ts:61, 76 | |
| 228 | design_rules Rückgabe / Fehler | designTool.ts:54, 59, 62 | „Kept for this project. On: … Off: …“; „Not kept: …“ | – | – | designRules.test.ts:76 | |
| 229 | `partbuddy_assembly.groups[]` | assemblyTool.ts:27–39 | ≤ 100; name ≤ 80; parent string/null | Unterbaugruppen | shared/assembly.ts:35–41, 52–69 | test/assembly.test.ts:63 | |
| 230 | `partbuddy_assembly.steps[]` | assemblyTool.ts:40–56 | 1–500; name ≤ 80; part/target ≤ 200; direction 3 Zahlen ≠ 0 | Reihenfolge und Fügerichtung (Ansicht) | shared/assembly.ts:16–33, 49; bekannte Körper assemblyTool.ts:73–75 | assembly.test.ts:107 | |
| 231 | assembly Rückgabe / Fehler | assemblyTool.ts:87, 91, 94 | „Kept: n steps …“; „The assembly order was not kept: …“ | – | – | assembly.test.ts:107 | |
| 232 | `partbuddy_view` (keine Parameter) | viewContext.ts:162–171 | – | keine; Auswahl, Kamera, Körper, Notizen, Druckprüfung | viewContext.ts:184–187 | test/viewContext.test.ts | |
| 233 | view: Rundung | viewContext.ts:13 | 2 Nachkommastellen | – | – | viewContext.test.ts | |
| 234 | view: Blickrichtung | viewContext.ts:122–123 | Komponente zählt ab 20° Neigung | – | – | viewContext.test.ts | |
| 235 | view: Kürzungen | viewContext.ts:95, 107 | 20 Körper in der Zusammenfassung; Label 400 Zeichen | – | – | keiner gefunden | |
| 236 | `partbuddy_ask.questions[]` | questions.ts:18–27, 48–84 | 1–4 Fragen; header ≤ 24; question 1–500; options 2–5; label 1–60; detail ≤ 200 | – | zod `strict` questions.ts:213–214 | T-q:58, 90 | |
| 237 | ask: „höchstens eine Empfehlung“ | questions.ts:69 | Text | – | **keine** | keiner | |
| 238 | `partbuddy_plan` | questions.ts:29–35, 94–113 | summary 1–300; name 1–60; steps 1–12 × 1–200 | – | zod questions.ts:227–228 | T-q:29, 51 | |
| 239 | Sperre bei offener Frage/Plan | questions.ts:169–176 | alle `CHANGING_TOOLS` | nichts wird gebaut, bis die Antwort da ist | Ablehnung; zweite Frage questions.ts:208 | T-q:29, 90 | |
| 240 | Antwortnotizen | questions.ts:186–200 | Go / Cancel / Change / answered | – | nur Text an das Modell | T-q:29, 58 | |
| 241 | `QUESTION_GUIDANCE`, `ANSWER_GUIDANCE` | questions.ts:122–143 | Text | – | keine (Prompt) | keiner | |

### H. Policy, Gate-Proxy, Ablaufsteuerung, Wachen

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 242 | Erlaubte Werkzeuge `ALLOWED` | policy.ts:13–49 | 16 SolidCraft-Werkzeuge + 9 `partbuddy_*` | – | policy.ts:166 | T-a:40 | |
| 243 | `NEEDS_CONFIRMATION` | policy.ts:56–61 | new_design, open, save, export | – | policy.ts:162–165 | T-a:45 | |
| 244 | Werkzeuge als Batch-Schritt | policy.ts:67–82 | 14 Namen | – | policy.ts:155 | T-a:59 | |
| 245 | Datei-Kommandos | policy.ts:88 | `^(file|doc|settings|diagnostics)\.` | – | policy.ts:119–124 | T-a:53, 70 | |
| 246 | `path` nur als Kurven-Id | policy.ts:95, 140–145 | `^[a-z]{1,3}\d{1,6}$`; Arrays/Objekte frei | – | Ablehnung | T-a:78 | |
| 247 | Foto als Canvas | policy.ts:137–139; photoNote.ts:10 | `…/photos/photo-JJJJMMTT-HHMMSS[-n].png`, ohne „..“ | – | Ausnahme | test/photo.test.ts | |
| 248 | Metadaten-Schreibschutz | policy.ts:98, 100–106, 125–129 | Schlüssel mit PartBuddy-Präfix (`key`, `keys`, `values`) | – | Ablehnung | T-n:148 | |
| 249 | Checkpoints | policy.ts:109, 130–135 | edit.checkpoint, edit.restore_checkpoint | – | Ablehnung | T-a:70 | |
| 250 | Schachtelungstiefe | policy.ts:168 | > 2 abgelehnt | – | Ablehnung | T-a:59 | |
| 251 | Gate-Proxy: Token, Host, Pfad | gateProxy.ts:57, 95–106 | 32 Byte Zufall; Host 127.0.0.1:Port; `/mcp` | – | 401 | T-a:149 | |
| 252 | Gate-Proxy: Body-Größe | gateProxy.ts:44, 112 | 4 MiB | – | 413 | keiner gefunden | |
| 253 | Gate-Proxy: Wiederholung | gateProxy.ts:47, 158–161; loop.ts:41 | 3. gleicher Aufruf in Folge | – | Ablehnung, bis neuer Zug | T-a:130 | |
| 254 | Gate-Proxy: Anzeige | gateProxy.ts:157 | Zusammenfassung 2000 Zeichen | – | – | keiner | |
| 255 | Eigene Schleife: Runden je Zug | loop.ts:38 | 25 | – | `stepCountIs` in chatgptAgent.ts:180 | test/chatgptAgent.test.ts | |
| 256 | Eigene Schleife: Wiederholungen | loop.ts:41, 54–58 | 3 gleiche Runden (oder nur ungültige) | – | Stoppbedingung | chatgptAgent.test.ts | |
| 257 | Eigene Schleife: Ergebnistext | loop.ts:79–83 | Bilder → „[image omitted]“ | – | – | keiner gefunden | |
| 258 | Eigene Schleife: Rollentext | loop.ts:20–35 | Text | – | keine (Prompt) | keiner | |
| 259 | WorkLog: ändernde Werkzeuge | workLog.ts:24 | execute, batch, set_parameter, undo, redo, partbuddy_mechanism, partbuddy_block | ein Schritt je Aufruf | workLog.ts:66–78 | test/workLog.test.ts:77, 91 | |
| 260 | WorkLog: Größe | workLog.ts:29 | 500 Schritte | – | workLog.ts:167 | keiner gefunden | |
| 261 | WorkLog: „zurück zu diesem Stand“ | workLog.ts:121–140 | über Undo-Tiefe | Entwurf auf früheren Stand | Fehler workLog.ts:124, 127, 129 | workLog.test.ts:97 | |
| 262 | Notiz-Wache: Ergebnisse säubern | noteGuard.ts:27–60 | Schlüssel mit Präfix, jede Tiefe | – | sonst ganzer Text ersetzt | T-n:94 | |
| 263 | Notiz-Wache: Undo auf Probe | noteGuard.ts:63–91, 105–130 | – | – | Ablehnung, wenn eine Notiz betroffen | T-n:106, 122 | |
| 264 | Druckflächen merken | printFaceWatch.ts:10–37 | `body.print_face` in execute/batch | Plattenansicht und Druckprüfung legen gleich | – | test/printFaceWatch.test.ts | |
| 265 | `TOOL_NOTES` | toolNotes.ts:7–27 | 6 Regeln (History, Files, Parameters, Arcs, Notes, describe_command) | – | teils policy.ts | keiner | |
| 266 | `VIEW_GUIDANCE` | viewContext.ts:194–199 | „Befunde lesen, bevor fertig“ | – | keine (Prompt) | keiner | |
| 267 | `ASSEMBLY_GUIDANCE`, `JOINT_GUIDANCE` | assemblyTool.ts:100, 106–114 | Text | – | keine (Prompt) | keiner | |
| 268 | `RESEARCH_GUIDANCE` | research.ts:7–13 | Text | – | keine (Prompt) | keiner | |

### I. Routen, Notizen, sonstige Zahlen (ohne Geometriewirkung)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 269 | Claude Code: Befehle mit Zeitgrenze | claudeCode.ts:54 | 20 s | – | `execFile timeout` | T-a:225 ff. | |
| 270 | Claude Code: Modelle lesen | claudeCode.ts:135, 151 | 20 s, sanftes Ende 5 s | – | – | T-a:264 | |
| 271 | Claude Code: Modell-Id / Stufen | claudeCode.ts:97–106 | `^[a-z]{1,20}$`; ≤ 12 Stufen; ≤ 30 Modelle; Name 80, Beschreibung 200 Zeichen | – | Filter | T-a:278 | |
| 272 | Claude Code: Sitzungsstart | claudeCode.ts:345–360 | nur `mcp__partbuddy` (+ WebSearch, WebFetch bei Recherche), keine Einstellungen, keine Sitzungsablage | – | Argumente | T-a:346 | |
| 273 | Claude Code: Stopp | claudeCode.ts:413, 420 | 5 s warten, sanftes Ende 1,5 s | – | – | T-a:264 | |
| 274 | Claude Code: Limits | claudeCode.ts:219–223 | ≤ 4 Fenster; Name 40 Zeichen; 0–1 | – | – | T-a:168 | |
| 275 | Claude Code: „abgemeldet“-Erkennung | claudeCode.ts:270–271 | Regex auf den Fehlertext, 300 Zeichen | – | – | T-a:318 | |
| 276 | Rollentext Claude Code | claudeCode.ts:288–306 | Text | – | keine (Prompt) | keiner | |
| 277 | AgentService: Zustand | agentService.ts:17–20 | Abo oder erlaubte API-Abrechnung | – | agentService.ts:183–188 | T-a:330 | |
| 278 | AgentService: MCP-Konfiguration | agentService.ts:200–205 | Datei mit Modus 0600, Name aus 6 Zufallsbytes | – | – | T-a:364 | |
| 279 | Recherche: Karten | research.ts:18, 21, 39, 49 | ≤ 8 Links; URL ≤ 2000; Titel/Anfrage ≤ 300 Zeichen; nur http/https | – | Filter | test/research.test.ts | |
| 280 | Foto-Datei | photoNote.ts:13–18 | `photos/photo-JJJJMMTT-HHMMSS[-n].png` | – | – | test/photo.test.ts | |
| 281 | Foto-Notiz | photoNote.ts:25–42 | „nie Maße aus Pixeln“; canvas nur bei Draufsicht | – | keine (Prompt) | photo.test.ts | |
| 282 | Skizzen-Notiz | sketchNote.ts:7–16 | 1 Kästchen = 20 px; Liste ≤ 8000 Zeichen | – | keine (Prompt) | test/sketch.test.ts | |
| 283 | Modellwahl | modelChoice.ts:20–35, 40 | Rückfall „medium“, sonst erste Stufe; ≤ 30 Modelle | – | modelChoice.ts:30–35 | T-a:278 | |
| 284 | Einstellungen | assistantSettings.ts:13–36 | API-Abrechnung, Web-Recherche, Modell je Route | – | zod bei `set` | keiner gefunden | |
| 285 | SolidCraft-MCP-Brücke | solidcraftTools.ts:29–34 | `mcp --connect 127.0.0.1:<port> --allow-path <Ordner>` | – | – | keiner gefunden | |
| 286 | Nachrichtenaufbau | viewContext.ts:99–113; assistant.ts:8–18 | Notiz, Auswahlzeilen, Text | – | – | viewContext.test.ts | |

## Befunde

Alle Befunde sind statisch (gelesen, nicht gebaut). „Nachstellen“ ist der Schritt für Phase 4.

| Kennung | Schwere | Datei:Zeile | Ist | Soll (mit Quelle/Begründung) | Nachstellen |
|---|---|---|---|---|---|
| W1 | A | bT:82–84, 212–220, 240–255; blk:153, 161, 172, 218–237 | Bei screwHole, tappedHole, insertSeat, boss, lip, snapFit, text, nutTrap, slot wird `body` nie gegen den Entwurf geprüft und geht in keinen SolidCraft-Schritt ein (kein `targets`/`body`); der Punkt entscheidet. Die Antwort lautet trotzdem „Built … on <body>“. | Körper prüfen (wie mT:319) und Schritte auf ihn begrenzen; sonst falsche Aussage (AUFTRAG „Schwere A“). keyhole/magnet/woodScrew tun es über `targets` (wallMount.ts:86, 89, 110; magnet.ts:58). | Zwei Körper mit gemeinsamer Fläche; `partbuddy_block {block: screwHole, body: "A", point auf der Fläche von B}` und mit erfundenem Namen; Antwort gegen `inspect_design` halten. |
| W2 | A | blk:172; bT:53 | Ein Langloch ohne `depth` wird 1000 mm tief geschnitten (Schnitt ohne `targets`). In einem Hohlkörper geht es durch alle Wände dahinter, ggf. durch weitere Körper. | „Durch“ = durch die Wand an der Stelle (Dicke messen) oder `targets` und Tiefe begrenzen; Begründung: engineering-notes.md:263–264 erklärt nur, warum `through_all` nicht ging. | Hohle Dose 40 mm, slot auf dem Deckel ohne `depth`; Boden und ein zweiter Körper darunter prüfen. |
| W3 | A | bT:91–95; blk:80 | text ohne `text` baut das Platzhalterwort „PartBuddy“ (Standard der Maske) und meldet Erfolg. | `text` für den Assistenten Pflicht; ohne ihn ablehnen. | `partbuddy_block {block: text, body, point, normal}` ohne `text`. |
| W4 | B | mT:109, 122; mech:63–68 | Das Standardscharnier (Ø 6) rechnet sich bei 0,6-mm-Düse zu Dach 0,795 mm (< 0,9) und bei 0,8 mm zu Wand 0,7 mm (< 0,8): es wird abgelehnt (liegend). Die Meldung rät „a larger diameter or a smaller gap“ – ein kleinerer Spalt als die Düse verschweißt beim Druck (F13: Spalt eine Düse, feature-catalog.md:79). | Standard-Ø aus Düse/Spalt ableiten; Meldung ohne den Rat „smaller gap“ unter die Düse. Werte hier gerechnet, nicht ausgeführt. | `hingeOf({…}, 0.6)` und `0.8` mit waagrechter Linie; danach echtes Scharnier je Düse bauen und messen. |
| W5 | C | mech:64 | Empfohlener Mindest-Ø `ceil((0,8 + Spalt)·4)` berücksichtigt das Dach nicht: Ø 4, Spalt 0,3 → „at least 5 mm“; Ø 5 wird dann wegen Dach 0,8725 < 0,9 abgelehnt. | Meldung nennt den kleinsten Ø, der alle Prüfungen besteht. | `hingeProblem` mit Ø 4 und Ø 5, Spalt 0,3, Linie waagrecht. |
| W6 | B | mech:44, 68; mT:442 | Wandgrenze 0,8 mm und Dachgrenze 0,9 mm sind fest für 0,4 mm Düse (Kommentar mech:65), die Hautprüfung daneben rechnet mit der Düse (Düse·2·1,125). | Eine Regel: zwei Linien der Düse in Gebrauch (feature-catalog.md:79 „walls to whole lines of nozzle × 1.125“). | Scharnier bei 0,6 mm Düse mit Ø 8: Wand um die Bohrung gegen 1,35 mm halten. |
| W7 | B | mT:49, 488, 472 | `wall` ist beim Scharnier optional und unbegrenzt; ohne `wall` oder wenn die Messung scheitert (`roomDepths` → null, mT:435–437) entfällt die Hautprüfung ohne Hinweis. | Wanddicke selbst messen oder `wall` für hinge verlangen; Ausfall der Messung in der Antwort nennen (AUFTRAG Phase 5: harte Prüfung vor Prompt-Zeile). | Praxisfall aus mT:382 (1,8-mm-Wand, 0,8 mm Haut) ohne `wall` aufrufen. |
| W8 | B | mT:22, 468, 483 | „Linie höchstens Ø/2 − 0,5 mm von beiden Körpern“ steht nur im Text. Geprüft wird erst nach dem Bau über SolidCrafts Warnung; ein Auge mit 0,05 mm Überdeckung gilt als gebaut. Der Abstand ist in `roomDepths` schon gemessen (mT:412). | Vor dem Bau ablehnen, wenn Überdeckung (Raumtiefe − Spalt) < 0,5 mm. | Linie 2,9 mm vor einer Wand bei Ø 6: Bau geht durch; Querschnitt der Anbindung messen. |
| W9 | B | mT:406–413 | Raumtiefe wird nur aus `near` gelesen. Liegt die Linie im Körper, steht das Paar vermutlich unter `overlaps` (engineering-notes.md:299–300) → Tiefe 0 „weiter weg als die Rolle breit ist“, Hautprüfung entfällt. | `overlaps` auswerten. Verhalten von `inspect.clearance` bei Durchdringung nicht geprüft. | Linie 0,5 mm in die Wand legen, `roomDepths` ausgeben. |
| W10 | B | mech:61, 207, 553; mT:64 | Ein ausdrücklich gegebener Spalt ab 0,2 mm wird für hinge/slide/lid bei jeder Düse angenommen (0,2 mm bei 0,8-mm-Düse). | Untergrenze an die Düse binden oder in der Antwort warnen (F13, feature-catalog.md:79). | hinge mit `gap: 0.2` bei Düse 0,6/0,8; Druckprüfung und Sweep. |
| W11 | B | mT:124 | Über 90 mm Linie bleiben es 9 Augen; jedes wird länger als 10 mm (200 mm, Spalt 0,3 → 21,96 mm), der Stift überbrückt weiter als der Kommentar zulässt. Keine Obergrenze, kein Hinweis. | Mehr Augen zulassen oder ablehnen/warnen; Brückenlänge aus Phase 3. | hinge mit 200 mm Linie. |
| W12 | C | mT:276 | `Math.trunc(stopped / 0.1) * 0.1`: 0,3 → 0,2; 5,1 → 5,0; 33,3 → 33,2 (in Node gerechnet); außerdem Werte wie 12,200000000000001 an `joint.limits`. | In ganzen Zehnteln rechnen (`Math.floor(x·10 + 1e-9)/10`). | Führung mit Anschlag bei 5,1 mm; Grenze lesen. |
| W13 | C | mT:270, 362, 510–516 | Ist der bewegte Körper so lang wie die Schiene oder länger, ist der Weg [0, 0]; es wird kein Sweep gefahren und „slides from 0 mm to 0 mm“ als Erfolg gemeldet. | Deutlich sagen, dass die Führung keinen Weg hat. | Schlitten länger als die Linie. |
| W14 | B | mech:235–247 | Die Nut liegt ringsum einen Spalt weiter, auch über der Schiene: senkrechter Spalt = `gap` (z. B. 0,3 mm = 1,5 Schichten bei 0,2 mm), nicht auf die Schichthöhe gerastet; das Nutdach ist eine Brücke direkt über der Schiene. Das Werkzeug kennt die Schichthöhe nicht (mT:612). | Senkrechte Spalte in ganzen Schichten (F13: „to whole layers“, feature-catalog.md:79); Sollwert aus Phase 3. | slide mit `up` +Z bauen, Schnitt quer, Spalt oben messen; Probedruck. |
| W15 | B | mT:141, 177, 187, 197, 229; mech:299, 303, 625, 703, 766 | closure, snap, latch, peg, screw rechnen mit festen Maßen „for a 0.4 mm nozzle“ (mech:299); die Düse wird nicht gelesen, `gap` wird bei closure/snap/latch/screw stillschweigend überlesen. Bei 0,6/0,8 mm Düse sind 1,2 mm Lippe 1,8 bzw. 1,3 Linien. | Maße aus der Düse ableiten oder bei anderer Düse ablehnen/warnen; überlesene Parameter melden. | closure und snap bei Düse 0,8 bauen; Druckprüfung (dünne Wände). |
| W16 | B | mT:612; bT:223; main/index.ts:588 | Die Werkzeuge bekommen nur die Düse (mechanism) bzw. nichts (block). Passungsspiel und Lochaufmaß des Materialprofils gehen in keinen Sitz, kein Loch, keine Tasche ein (Zapfen 0,2, Magnet 0,3/0,1, Knopf 0,2, Einsatzsitz ohne Aufmaß). | „fits by purpose with the material clearance scaled to the nozzle“ (feature-catalog.md:79) gilt auch für die Werkzeuge. | Gleicher Baustein mit PLA- und PETG-Profil: Maße sind gleich. |
| W17 | B | mT:523, 526; mech:309–312 | closure prüft nicht: Dosenwand gerade und ≥ 1,6 mm (Rille 0,45 mm tief), Innenraum der Dose = Innenraum des Deckels, Radius ≤ halbe kurze Seite (nur `< 0` wird abgelehnt). | Messen wie beim Scharnier oder ablehnen. | Dose mit 1,2-mm-Wand; Radius 10 bei 12 mm Raumbreite. |
| W18 | B | mech:481–482; mT:560 | Der Sitz (Einsatzlänge + 1 mm bzw. 2,5·d + 1 mm) wird ohne Blick auf die Dicke des festen Körpers gebohrt; „2 mm Kunststoff um den Einsatz“ steht nur im Text. | Dicke und Rand messen; ablehnen oder Dom verlangen. | screw M3 in eine 4-mm-Platte (Sitz 6,7 mm tief). |
| W19 | C | mech:433, 452–453 | Senkkopftiefe wird mit 0,6·d angesetzt; die gebaute Senkung (Ø Kopf + 0,6, 90°) ist (Ø − Durchgang)/2 tief: M3 1,96 statt 1,8; M4 2,53 statt 2,4. Die Prüfung „1,2 mm unter dem Kopf“ lässt bis 1,04 mm durch. | Tiefe aus den gebauten Maßen rechnen. Herkunft von 0,6 fehlt. | screw M3 countersunk, Klemmdicke 3,0 mm; Rest messen. |
| W20 | C | mech:438–443; mT:559 | Für manche Dicken gibt es keine Schraube (M3 cap, 12 mm: Fenster 12,4–14,3 mm → keine Länge); dann werden keine Schrauben eingesetzt. | Senkungstiefe oder Sitz anpassen, damit eine Normlänge passt, oder die nächste mit ihrem Überstand nennen. | screw M3, Klemmdicke 12 mm. |
| W21 | B | mech:476, 482; blk:218–229 | Durchgangsloch (`clearance`, `fit`) und modelliertes Gewinde kommen ungeprüft aus SolidCrafts Tabellen; die Antwort nennt „ISO 273, normal“, aber kein Maß, und kein Lochaufmaß für den Druck. | Schwere B nach AUFTRAG („SolidCraft-Funktion ungeprüft durchgereicht“); Maße aus eigener Tabelle, in der Antwort genannt. | Loch M3 normal bauen und Ø messen (Soll 3,4 nach screwSizes.ts:57). |
| W22 | B | mT:534, 544; mech:587 | lid misst den Hals nicht: Ø, Zylinderform, Mitte, Wand ≥ 2 mm stehen nur im Text. Ist der Hals kleiner, schwebt die Wendel; ist er größer, steckt sie im Körper. | Hals messen (`inspect.measure`/Schnitt) und vor dem Bau ablehnen. | Hals 40 mm, `diameter: 42` und `38`. |
| W23 | B | mech:652–660; mT:569 | snap braucht 12,5 mm Wand über dem Fuß (Fenster 10,3–12,5 mm); das wird weder geprüft noch genannt (latch nennt seinen Bedarf, mT:582). Die Antwort sagt „catch of 0.8 mm“; über der Kante liegen 0,6 mm (0,8 − 0,2 Abstand). | Bedarf prüfen und nennen; tragende Überdeckung nennen. | snap an 10 mm hoher Wand. |
| W24 | B | mech:733; mT:605 | Die Tasche (1,5·Ø + 1 mm) wird ohne Blick auf die Dicke des bewegten Körpers geschnitten. Der Satz „max(2·Ø, 4) mm of plastic should stay round each pocket's axis“ ist unklar (Ø oder Radius) und ohne Herkunft. | Tiefe messen; Satz mit Quelle und eindeutigem Maß. | peg Ø 5 in eine 6-mm-Platte. |
| W25 | C | mT:586–587; mech:207 | plug mit shape dovetail lehnt `gap` < 0,2 ab („gap must be 0.2–1 mm“), obwohl Schema (min 0,05), Beschreibung (0,1 zum Pressen) und Kommentar (0,1–0,3) kleinere Werte nahelegen. | Eigene Grenze für die Steckpassung oder Text anpassen. | `kind: plug, shape: dovetail, gap: 0.1`. |
| W26 | B | mT:337–349 | Teilen sich die Körper nach dem Bau Volumen, endet der Aufruf als Erfolg mit angehängter Warnung; nichts wird zurückgenommen. | Durchdringung ist ein Fehler des Modells (AUFTRAG Phase 4 Nr. 2); ablehnen oder zurücknehmen wie bei losen Stücken. | Deckel 0,5 mm in die Dose geschoben, hinge. |
| W27 | C | mT:333–336 | Lose Stücke werden am englischen Wortlaut „separate pieces“ einer SolidCraft-Warnung erkannt (0.40.0-rc.3). | Eigene Messung (Stückzahl je Körper) oder Vertragstest auf den Wortlaut. | Vertragstest gegen die eingesetzte Version. |
| W28 | C | mT:38–69; bT:40–71; gateProxy.ts:151–176; loop.ts:99 | Im gelesenen Code prüft nichts die Eingaben gegen das JSON-Schema (der Proxy reicht `arguments` durch, `jsonSchema` ohne Prüffunktion). Schema und Code weichen ab: `more` 40 vs. 20 (snap, peg) bzw. 99 vs. 20/40/unbegrenzt (keyhole, magnet, woodScrew); `gap` max 1 vs. 0,6 (lid) und 0,5 (peg); `radius` max 100 vs. keine; `wall` 1,6–10 beim Scharnier ungeprüft; `additionalProperties` ohne Wirkung; `more`-Beschreibung nennt plug nicht. | Eine Quelle für Grenzen; Schema je Art richtig oder im Code geprüft. Ob das MCP-SDK selbst validiert: nicht geprüft. | Aufruf mit `radius: 500`, `more` mit 30 Haken, unbekanntem Schlüssel. |
| W29 | C | mT:64, 221 | Beschreibung: Standardspalt „the printer's nozzle, at least 0.3“; lid nimmt 0,75 × Düse, höchstens 0,6. | Text nennt den Standard von lid. | – |
| W30 | B | bT:93–94 | Angaben, die die Art nicht kennt, werden stillschweigend verworfen: `depth` bei screwHole (immer SolidCrafts Standardtiefe), `more` bei nutTrap/boss/slot/text, `normal` bei Lochbausteinen und woodScrew. Das Modell glaubt, es habe sie gesetzt. | Unbekannte Angabe ablehnen oder in der Antwort nennen. | `screwHole` mit `depth: 3`; `nutTrap` mit `more`. |
| W31 | B | con:804, 808–836; bT:95 | Blockmaße sind nur > 0 und ≤ 500 mm begrenzt: snapFit-Arm 3 mm (rechnerisch 35 % Dehnung nach blk:105–108), Text 0,5 mm hoch, Einsatzloch 0,01 mm gehen durch. `snapStrain` wird nur in der Maske benutzt (BlockPanel.tsx). | FDM-Grenzen im Werkzeug (Mindestdetail, Dehnung je Material, Düse/Schicht), Werte aus Phase 3. | snapFit `length: 3`; text `height: 0.5`. |
| W32 | C | bT:85–86; blk:122–131 | Eine Normale [0,0,0] wird bei text/nutTrap/slot/snapFit nicht abgelehnt; `planeAt` liefert dann `y_dir` [0,0,0]. | Ablehnen wie magnet.ts:42. | `slot` mit `normal: [0,0,0]`. |
| W33 | B | bT:249–250 | Als Druckfläche wird das erste `face` irgendeines Schrittergebnisses gemerkt, nicht nur das von `body.print_face` (so in printFaceWatch.ts:26). Liefert z. B. `solid.hole` ein `face`, legt die Plattenansicht den Körper falsch. Ergebnisformen nicht geprüft. | Nur das Ergebnis von `body.print_face` nehmen. | Ergebnis von `solid.hole`, `solid.emboss`, `plastic.lip` auf ein Feld `face` prüfen. |
| W34 | B | bT:251–255, 242–247 | Der Block meldet „Built …“ auch mit SolidCraft-Warnung (z. B. Schnitt ohne Wirkung, lose Stücke) und prüft nicht, ob Gelenke auf 0 stehen (mechanism tut beides, mT:326–348). | Gleiche Wachen wie beim Mechanismus. | magnet neben dem Körper; Block an einem Körper mit ausgelenktem Gelenk. |
| W35 | B | bT:118, 133, 162 | keyhole (Dicke ≥ 6,2–7,4 mm), woodScrew (Platte dicker als die Senkung, Randabstand) und magnet (1,2 mm rundum, 0,6 mm darunter) nennen ihre Mindestmaße nur im Text; nichts wird gemessen. | Messen und ablehnen, sonst bricht die Tasche durch. | keyhole in 4-mm-Platte; magnet 6 × 2 in 2-mm-Wand. |
| W36 | C | blk:90; mech:303 | Zwei Maße für „Lippe am Deckel“: Block lip 1,2 × 2 mm, Spalt 0,2; closure 1,2 × 4 mm, Luft 0,25. Beide werden dem Modell für Deckel angeboten (bT:264, mT:628). | Ein Maßstab oder eine klare Abgrenzung im Text. | – |
| W37 | B | workLog.ts:24; questions.ts:169; main/index.ts:584–588 | `partbuddy_place_drawing` und `partbuddy_move_drawing` fehlen in `CHANGING_TOOLS`: sie bauen an einer offenen Frage oder einem offenen Plan vorbei und erzeugen keinen Schritt im Arbeitsprotokoll (ihre inneren `batch`-Aufrufe laufen unterhalb der Hüllen). | In `CHANGING_TOOLS` aufnehmen (AUFTRAG Phase 5: jeden Weg schließen). | `partbuddy_plan`, dann `partbuddy_place_drawing`; Schrittkarten ansehen. |
| W38 | B | dT:203–213, 229–231 | Scheitert das Zentrieren nach dem Platzieren, lautet die Antwort „Not placed: …“, das Logo ist aber gebaut. Gleiches Muster beim Mechanismus: „Not built: the solids are built, but …“ (mT:359, 507, 621). | Zurücknehmen oder wahrheitsgemäß melden. | place mit `centre` auf einer Fläche, die `planLogoMove` nicht findet. |
| W39 | B | dT:183, 199–204 | Logo: Tiefe nur 0–50 mm, nicht gegen die Wanddicke; keine Prüfung der Detailgröße gegen die Düse (eine solche gibt es für die Oberfläche, `shared/drawingDetail.ts`, hier nicht benutzt); `body` wie in W1 ungeprüft („Placed … on <body>“). | Gleiche Prüfungen wie in der Oberfläche; Tiefe gegen die Wand. `drawingDetail.ts` nicht gelesen. | deboss 5 mm in 2-mm-Wand; feines Logo 10 mm breit. |
| W40 | C | dT:154, 188, 149 | Sammelmeldung „mode must be …, depth 0–50 mm, width 0–1000 mm“ sagt nicht, was falsch ist; „0–1000“ schließt 0 aus; ein unbekanntes `centre` bei move wird überlesen. | Eine Meldung je Fehler. | – |
| W41 | B | questions.ts:169–176, 193–195; viewContext.ts:197–198; workLog.ts:24 | Nach „Cancel“ sperrt nichts mehr; „erst Konzept, Fragen, Plan, Go“ und „Druckprüfung lesen, bevor fertig“ sind reine Prompt-Regeln; `partbuddy_assembly` und `partbuddy_design_rules` gehen an einer offenen Frage vorbei. | Harte Prüfung vor Prompt-Zeile (AUFTRAG Phase 5). | Plan abbrechen, danach `execute`. |
| W42 | B | policy.ts:118–147, 155, 169–173; toolNotes.ts:12–13 | (a) `execute {command: "execute", params: {command: "file.…"}}` und ein Batch-Schritt `batch` werden als gewöhnliches Kommando durchgelassen, ihr Inhalt nicht geprüft; (b) die `path`-Regel gilt nur für Kommandos, nicht für Argumente der Werkzeuge selbst (`compare_picture {reference}`, `screenshot`, auch als Batch-Schritt). toolNotes sagt „every command given a file path are refused“. Ob SolidCraft diese Formen annimmt: nicht geprüft. | Rekursiv entscheiden; Dateiargumente der Werkzeuge prüfen. | Die genannten Aufrufe gegen das echte SolidCraft. |
| W43 | C | policy.ts:137; photoNote.ts:10; docs/feature-catalog.md:72 | Katalog: „PartBuddy allows exactly that file“. Erlaubt ist jeder Pfad, der auf `…/photos/photo-<Datum>-<Zeit>.png` passt. | Text oder Prüfung angleichen. | `canvas.insert` mit einem Foto eines anderen Projekts. |
| W44 | C | loop.ts:22, 79–83; viewContext.ts:199 | Auf den eigenen Routen (ChatGPT, lokal) werden Bilder aus Werkzeugergebnissen durch „[image omitted]“ ersetzt; der Rollentext empfiehlt dennoch `screenshot`, und er sagt „SolidCraft is open“ (headless nach ADR 0016). | Text je Route richtig. | – |
| W45 | C | docs/feature-catalog.md:92; mech:146–150 | Katalog: Dach der Bohrung „1.2 radii above the axis“. Code: `ROOF_TOP = 1.05`. | Katalog nachziehen. | – |
| W46 | C | docs/feature-catalog.md:61; mech:757–766 | Katalog: Riegel „on 45° faces 0.2 mm apart“. Code: `seat: 0` (bei 0,2 klapperte es). | Katalog nachziehen. | – |
| W47 | C | docs/feature-catalog.md:62, 92; docs/building-blocks.md:20, 68, 113; toolNotes.ts:4; policy.ts:43, 64 | Katalog nennt die Stege unter den Augen, die Hautprüfung mit `wall` und `flat` beim Verschluss nicht; „guides 0.05 to 0.3“ (Katalog) gegen „0.1 to 0.3“ (mT:586). building-blocks: `ai@7.0.155` (package.json: 7.0.159), SolidCraft „0.30.1, pinned“ und „No preview releases“ gegen empfohlene 0.40.0-rc.4 (engineVersion.ts:21). Kommentare in toolNotes/policy nennen 0.30.1 bzw. nur das Scharnier. | Dokumente und Kommentare nachziehen. | – |
| W48 | B | mT:523, 571, 582 | Druckrichtung wird beim flachen Verschluss, beim Riegel und bei den Schnapphaken nur dem Modell gesagt („set the print face …“, „Print the lid on its top“); lid und knob setzen die Druckfläche selbst (mech:597, knob.ts:134). | Das Werkzeug setzt die Druckfläche selbst, wo sie feststeht. | closure `flat`: Druckfläche danach lesen. |
| W49 | C | questions.ts:69 | „at most one recommended unless multiSelect“ wird nicht geprüft. | zod-Prüfung. | ask mit zwei Empfehlungen. |

## Nicht geprüft, weil …

- **Nichts gebaut oder ausgeführt** (Vorgabe dieses Laufs): alle Befunde sind aus dem Code gelesen; die Zahlen in W4, W5, W12, W19, W20, W31 sind von Hand bzw. mit zwei Node-Einzeilern nachgerechnet, nicht mit den Funktionen selbst.
- **Verhalten von SolidCraft**: was `solid.hole`, `solid.extrude` (cut ohne `targets`), `plastic.lip`, `plastic.snap_fit`, `inspect.clearance` bei Durchdringung, `execute`/`batch` verschachtelt, `screenshot`/`compare_picture` mit Dateiargument tatsächlich tun und zurückgeben – nur soweit `docs/engineering-notes.md` es sagt (W1, W2, W9, W21, W33, W42).
- **Schema-Validierung durch die SDKs** (`@modelcontextprotocol/server` 2.4.0, `ai`): nicht nachgelesen; W28 gilt für PartBuddys eigenen Code.
- **Testkörper**: die Testdateien wurden nur nach Titeln und einzelnen Zeilen zugeordnet; ob ein Test den Grenzwert selbst (±1 Schritt) prüft, ist offen. „keiner gefunden“ heißt: kein passender Titel und kein Treffer in der Suche.
- **Herkunft und Richtigkeit der Tabellenwerte** (`screwSizes.ts`, `WALL`, `LIP`, `SNAP`, `PEG`, `LATCH`, `LID`, `KNOB`, `MAGNET`, Regeltexte in `standards.ts`): gehört zur Prüfliste Fachtabellen und zu Phase 3; hier nur erfasst, wie das Werkzeug sie durchsetzt.
- **Außerhalb des Bereichs, nur gestreift**: `solidcraft/logoMove.ts` (`planLogoMove`), `solidcraft/actions.ts` (`componentOf`), `shared/svgDrawing.ts`, `shared/drawingDetail.ts`, `shared/stepPhrases.ts`, `chatgpt/`, `local/`, woher `printProfiles.part().printer.nozzle` kommt und ob er leer sein kann.
- **`docs/building-blocks.md`**: nur die Zeilen mit Bezug zu `agents/` gegen `package.json` gehalten (MCP 2.4.0, zod 4.6.7 stimmen; `ai` weicht ab), nicht die ganze Tabelle.
- **Satz-für-Satz-Prüfung der Prompt-Texte** (Rollentexte, `*_GUIDANCE`, `TOOL_NOTES`, Notizen): Phase 5; hier nur als Zeilen erfasst und dort als Befund, wo eine Regel ohne Durchsetzung auffiel.
