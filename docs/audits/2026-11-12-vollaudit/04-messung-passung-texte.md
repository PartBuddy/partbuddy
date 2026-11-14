# Phase 4 – Messung Passung und Texte

Stand 12.11.2026. Kein SolidCraft, keine App: die Fälle rufen PartBuddys eigene Funktionen auf
(`apps/desktop/src/…`) und schreiben die Ausgaben nach `tools/audit/out/passung-texte/<name>.json`.
Alle Werte unten stammen aus dem Lauf vom 12.11.2026 (6 Dateien, 7 Tests, alle grün, 1,4 s).

Wiederholen (aus `apps/desktop`): `pnpm exec vitest run --config ../../tools/audit/vitest.config.mts passung-texte`
(alle) bzw. mit dem Dateinamen des Falls statt `passung-texte` (Spalte „Befehl“ nennt nur diesen Namen).

Fälle unter `tools/audit/cases/`, Hilfsdatei `tools/audit/passung-texte-helpers.ts`.

| Kennung | Urteil | Fall | Eingabe | gemessen | Soll | Befehl |
|---|---|---|---|---|---|---|
| T2 | bestätigt | `passung-texte-t2-toleranz.case.ts` | Düse 0,6 / Schicht 0,3; Testkamm `testPieceSteps`; Ablesung clamp 0,05, push 0,15, slide 0,30, turn 0,35 → `applyReadings(PLA)` → `printNote` | Kammloch „0.3“: Ø 6,6 mm bei Stift 6 mm = 0,30 mm je Seite, bei jeder Düse gleich (0,2 … 0,8). Gespeichert `clearance.slide` = 0,30 mm (das zeigt das Maßfeld, `PrintProfilesEditor.tsx:242`). An den Assistenten: „clamp 0.08 mm, push 0.23 mm, slide 0.45 mm, turn 0.53 mm“ und „sliding fit 0.45 mm“. Düse 0,2: slide 0,15 mm; 0,25: 0,19 mm; 0,4: 0,30 mm; 0,8: 0,60 mm | 0,30 mm – der Wert wurde auf dieser Düse gemessen | `passung-texte-t2` |
| MG-05 | bestätigt | `passung-texte-mg05-marke.case.ts` | `fittedValue({count:1, unit:'nozzle'}, 0.4, {nozzle:0.2, layer:0.1})`; dazu `refit` eines Spalts 0,3 mm mit Kommentar „Hinge gap [auto 1×nozzle]“ | 0,2 mm (Düse 0,25: 0,25 mm). `printInPlaceGap` = `snapSize('gap')` = Vorgabe des Scharnierwerkzeugs = 0,3 mm bei derselben Düse. Der Regeltext nennt bei Düse 0,2 „print-in-place gaps 0.3 mm“ und verlangt im selben Satz die Marke „Hinge gap [auto 1×nozzle]“; `refit` macht aus diesem 0,3-mm-Spalt 0,2 mm | ≥ 0,3 mm (eigene Untergrenze `designFit.ts:29-31`) | `passung-texte-mg05` |
| D5 | bestätigt | `passung-texte-d5-stuetzen.case.ts` | `shareDescription` mit Prüfbericht `block` (Wand 0,3 mm, Teil 300 mm bei Bett 256 mm, Auflage 4 mm²), ohne `overhang`-Fund; dazu `{block/warn/ready, overhang:false}`, `{warn, overhang:true}`, `null` | „- Supports: none needed, it prints as designed“ / „- Stützen: keine nötig, druckt wie konstruiert“ bei `block`, `warn` und `ready` gleich. Nur `null` → „not checked“, nur `overhang:true` → „some faces lean more …“. `check.status` wird in `description.ts` 0-mal gelesen; `printCheck.revision` wird in `index.ts` nur in Zeile 374 verglichen, nicht beim Teilen (Zeile 882) | keine Zusage bei `block`/veralteter Prüfung | `passung-texte-d5` |
| R1 | bestätigt | `passung-texte-r1-r3-pruefnotiz.case.ts` | echte `ProfileNote`, `printCheckNote`, `withViewTool`; Ablauf wie `index.ts:369-377, 737`: sauber (Rev. 1) → Modell ändert (Rev. 2, Wand 0,3 mm, `block`) → Zugende → nächste Nachricht | Im Zug sendet PartBuddy nichts (0 Texte). Die Sperrmeldung „not ready to print. - blocks printing: walls down to 0.3 mm, thinner than the 0.4 mm nozzle …“ kommt nur, wenn das Modell `partbuddy_view` ruft (vorher: „… is still running; call partbuddy_view again in a moment.“), sonst erst mit Nutzernachricht 2. `checkNote.take(` steht in `index.ts` genau einmal (Zeile 737, beim Senden). Erwähnungen der Prüfung in `agentService.ts`, `loop.ts`, `claudeCode.ts`, `workLog.ts`: 0 / 0 / 0 / 0 | Prüfung am Zugende erzwungen | `passung-texte-r1` |
| R3 | bestätigt | `passung-texte-r1-r3-pruefnotiz.case.ts` | `printCheckNote` mit 0 Funden; `standardText('vent')`; `printFindingSchema` | Wortlaut: „… overhangs by angle only): ready to print, nothing found.]“. Die Prüfung kennt 10 Fundarten: size, thinWall, overhang, contact, feature, separate, overlap, tight, blocked, posed – keine für Brücke, Schichtrichtung, Lochaufmaß, Detail, Schrift. Letzter Satz jedes Standards: „The print check in partbuddy_view still judges what you build.“ | Notiz nennt, was geprüft wird und was nicht | `passung-texte-r1` |
| R4 | bestätigt | `passung-texte-standards.case.ts` | Satz aus `STANDARDS.boardMount`: „pilot hole 0.25 mm less than the screw for print (Hubs), which is 2.0 mm for M2.5 and 2.5 mm for M3 after print“ | 2,5 − 0,25 = 2,25 mm, 3 − 0,25 = 2,75 mm; genannt 2,0 und 2,5 mm; Abstand der beiden Lesarten 0,25 mm je Schraube | ein Zeichenmaß je Schraube | `passung-texte-standards` |
| T26 | bestätigt | `passung-texte-standards.case.ts` | wie R4, mit `holeShrink` jedes Katalogmaterials | 0,25 mm kleiner gezeichnet druckt in PLA 2,10 / 2,60 mm, in PP 1,95 / 2,45 mm; nur ABS (0,25) ergibt 2,00 / 2,50 mm. Für 2,0 / 2,5 nach Druck wäre in PLA 2,15 / 2,65 mm zu zeichnen, in PP 2,30 / 2,80 mm | eindeutiges Zeichenmaß mit Herleitung | `passung-texte-standards` |
| T24 | bestätigt | `passung-texte-standards.case.ts` | Satz aus `STANDARDS.vent`: „bars at least 1.2 mm between them (three lines of a 0.4 mm nozzle; …“; `lineWidth`, `fitSize('wall', 1.2, 'user', {0.4, 0.2})`, `snapSize` | Bahn 0,45 mm; 1 … 4 Bahnen 0,45 / 0,9 / 1,35 / 1,8 mm; 1,2 mm = 2,667 Bahnen. `fitSize` warnt: „1.2 mm is not a whole number of 0.45 mm lines; 1.35 mm prints cleaner.“ `snapSize` → 1,35 mm. Derselbe Wert 1,2 mm steht ein zweites Mal („Hexagons … with 1.2 mm bars“) | 1,35 mm | `passung-texte-standards` |
| T25 | bestätigt | `passung-texte-standards.case.ts` | Sätze aus `STANDARDS`, `printNote` (PLA, Düse 0,4), `hingeOf` für Linien 20 … 150 mm, `WALL[…].entry` | Brückengrenze 5 mm („sags from 5 mm (Hubs)“, „fine up to 5 mm long (Hubs)“) gegen 10 mm („up to about 10 mm wide the slicer bridges them“, „walls at most 10 mm apart are bridged“). Gelenkauge (Stift überbrückt es): 6,4 / 9,733 / 9,68 / 9,644 mm bei 20 / 30 / 50 / 90 mm Linie, 10,756 mm bei 100 mm, 16,311 mm bei 150 mm. Schlüsselloch-Dach: 8 / 9 / 10 / 11 mm für Schraube 3,5 / 4 / 4,5 / 5 | ein Wert, überall derselbe | `passung-texte-standards` |
| T22 | bestätigt | `passung-texte-t22-t10-profile.case.ts` | `DEFAULT_PRINT_SETTINGS.materials` gegen `MATERIAL_CATALOG`, 5 Materialien × 6 Werte | 5 von 30 Werten verschieden, siehe Tabelle unten | 0 verschieden | `passung-texte-t22` |
| T10 | bestätigt (Maße gemessen; Luft gerechnet, nicht gedruckt) | `passung-texte-t22-t10-profile.case.ts` | `blockOf({nutTrap, M3})` mit und ohne `material: 'PP', nozzle: 0.8, holeShrink: 0.3`; `magnetPocket(6 × 2)`; Zugabe minus `holeShrink` je Katalogmaterial | Mutterntasche M3 in beiden Aufrufen Schlüsselweite 5,8 mm, Tiefe 2,8 mm (Mutter 5,5). `blockTool.ts` enthält weder `holeShrink` noch `clearance.…` noch `printProfiles` noch `nozzle`. Magnet 6 × 2: Tasche Ø 6,3 (glue) / 6,1 mm (press). Rest nach Lochschwund: Mutter und Magnet-glue PLA 0,15 mm, ABS 0,05 mm, PP 0 mm; Magnet-press PLA −0,05 mm, PP −0,2 mm; Kopf PP 0,3 mm; Einsatzloch M3 (4,0 mm gezeichnet) PLA 3,85 mm, PP 3,7 mm | Zugabe aus dem Profil des Teils | `passung-texte-t22` |

### T22 – Wert gegen Wert

| Material (Profil / Katalog) | Überhang | Lochschwund | clamp | push | slide | turn |
|---|---|---|---|---|---|---|
| PLA / PLA | 45 / 45 | 0,15 / 0,15 | 0,05 / 0,05 | 0,15 / 0,15 | 0,25 / 0,25 | 0,3 / 0,3 |
| PETG / PETG | 40 / 40 | **0,2 / 0,15** | 0,1 / 0,1 | 0,2 / 0,2 | 0,3 / 0,3 | 0,35 / 0,35 |
| PETG-CF / PETG-CF | 40 / 40 | **0,2 / 0,1** | 0,1 / 0,1 | 0,2 / 0,2 | 0,3 / 0,3 | 0,35 / 0,35 |
| ASA / ASA | **40 / 45** | **0,2 / 0,15** | 0,1 / 0,1 | 0,2 / 0,2 | 0,3 / 0,3 | 0,35 / 0,35 |
| TPU / TPU 95A | 35 / 35 | **0,25 / 0,1** | 0 / 0 | 0,1 / 0,1 | 0,3 / 0,3 | 0,4 / 0,4 |

### R1 – was das Modell wann bekommt (aus `r1-r3-pruefnotiz.json`, Feld `timeline`)

| Zeitpunkt | Text an das Modell |
|---|---|
| Nutzernachricht 1 geht hinaus (Rev. 1, sauber) | „… ready to print, nothing found.]“ |
| Modell ändert im Zug (Rev. 2) | nichts |
| nur bei Aufruf `partbuddy_view`, Prüfung noch von Rev. 1 | „… the ready-to-print check of the latest change is still running; call partbuddy_view again in a moment.]“ |
| nur bei Aufruf `partbuddy_view`, Prüfung von Rev. 2 da | „… not ready to print. - blocks printing: walls down to 0.3 mm, thinner than the 0.4 mm nozzle, so they do not print (faces "F2:side:0" of body "Plate"). Fix what blocks printing before you call the part done; …]“ |
| Zugende | nichts |
| Nutzernachricht 2 | dieselbe Sperrmeldung |
| Modell ändert erneut, Wand weiter 0,3 mm (Rev. 3), Nutzernachricht 3 | nichts (Text unverändert, `ProfileNote.take` gibt `null`) |

## Neue Befunde

| Kennung | Schwere | Datei:Zeile | Ist gemessen | Soll | Fall |
|---|---|---|---|---|---|
| N-passung-texte-1 | B | `renderer/src/print/usePrintCheck.ts:54` gegen `main/print/printProfiles.ts:303` | Die Druckprüfung nimmt `print.material.clearance.push` unskaliert (Zeile gelesen; `scaleClearance` kommt in der Datei nicht vor), der Assistent bekommt den skalierten Wert. PLA: Düse 0,2 → Assistent „push 0.08 mm“, Prüfung meldet genau diesen Spalt als „under the material's push fit of 0.15 mm per side“; Düse 0,6 → Assistent „push 0.23 mm“, Prüfung schweigt bis 0,15 mm | ein Wert für Notiz und Prüfung | `passung-texte-t2-toleranz.case.ts` (Felder `checkUsesStoredPush`, `tightNoteAtNozzle02`) |
| N-passung-texte-2 | B | `main/agents/mechanismTool.ts:122` (Vorgabe Ø 6), `:109` (Spalt = Düse) | Das Scharnier mit allen Vorgaben wird ab Düse 0,5 verweigert: 0,5 → „the barrel would be 0.9 mm thin over the bore's roof; use a larger diameter or a smaller gap“ (Grenze ist 0,9: die Meldung nennt den Grenzwert selbst als zu dünn); 0,6 → „… 0.795 mm thin …“; 0,8 → „the barrel wall around the pin would be 0.7 mm; use a diameter of at least 7 mm“ | Vorgabe-Durchmesser folgt dem Spalt, sodass die Vorgaben auf jeder Düse bauen | `passung-texte-mg05-marke.case.ts` (Feld `hingeToolDefaultGap`) |
| N-passung-texte-3 | B | `main/agents/mechanismTool.ts:123-124` | Kommentar „Knuckles of at most 10 mm“, aber bei 9 Augen ist Schluss: Linie 100 mm → 10,756 mm je Auge, 150 mm → 16,311 mm; der Stift überbrückt diese Länge | Auge ≤ Brückengrenze oder Ablehnung mit Meldung | `passung-texte-standards.case.ts` (Feld `bridges`) |
| N-passung-texte-4 | C | `main/print/printProfiles.ts:319-323`, `main/index.ts:737` | Bleibt der Wortlaut der Prüfung nach einer weiteren Änderung gleich (Rev. 3, Wand weiter 0,3 mm), bekommt das Modell mit der nächsten Nachricht keine Notiz; die Notiz trägt keine Revision | Nach jeder Änderung des Modells die Prüfung der neuen Revision nennen, auch wenn sie gleich lautet | `passung-texte-r1-r3-pruefnotiz.case.ts` (Zeitpunkt 7) |
| N-passung-texte-5 | C | `main/print/printProfiles.ts:214, 261, 303` | Skalierte Spiele werden auf 0,01 mm gerundet ausgegeben: 0,075 → „0.08“, 0,025 → „0.03“, 0,175 → „0.18“, 0,525 → „0.53“, 0,225 → „0.23“ | Wert wie gerechnet oder auf das Raster 0,05 mm des Profils | `passung-texte-t2-toleranz.case.ts` |
| N-passung-texte-6 | B | `main/print/printProfiles.ts:283` | Bei Düse 0,2 und 0,25 nennt der Regeltext den Spalt 0,3 mm und als Marke dafür „[auto 1×nozzle]“; 0,3 mm sind 1,5 bzw. 1,2 Düsen. Die Marke passt nicht zum Wert, den der Text verlangt (Ursache der 0,2 mm aus MG-05) | Marke, die den Wert trägt (Untergrenze im `refit`) | `passung-texte-mg05-marke.case.ts` (Felder `toldGap`, `toldMark`, `refitOfToldGap`) |

## Nicht messbar, weil …

- **D5, Rest des Befunds** (kleine Überhänge, +1°, Brücken, schwebende Anfänge, Druckfläche): braucht Körper
  und `checkPrint`; hier wurde nur der Text aus einem gegebenen Prüfbericht gemessen. Dass die Revision
  beim Teilen nicht verglichen wird, ist aus `index.ts` gezählt (ein Vergleich, Zeile 374), nicht im
  laufenden Programm nachgestellt – `index.ts` lädt Electron und lässt sich ohne App nicht aufrufen.
- **R1, Verhalten des Modells**: ob der Assistent `partbuddy_view` nach der letzten Änderung ruft, zeigt
  nur ein echter Chat-Lauf (Phase 7). Gemessen ist, dass PartBuddy ihn nicht dazu zwingt.
- **R1, Ablauf**: `checkForView` und die Zeile 737 sind Closures in `index.ts`; der Fall bildet sie mit
  den echten Klassen nach (5 Zeilen im Fall, gegen `index.ts:372-377` zu lesen).
- **T2, Maßfeld**: der Wert im Einstellungsfeld ist aus `PrintProfilesEditor.tsx:242`
  (`value={material.clearance[fit]}`) gelesen, das Feld wurde nicht gerendert (App nicht gestartet).
- **N-passung-texte-1**: `usePrintCheck` ist ein React-Hook und wurde nicht ausgeführt; die Zeile ist
  gelesen, der Meldungstext mit `minimum` = gespeichertem Wert erzeugt.
- **T10, tatsächliche Luft**: `holeShrink` ist im Profil als Schwund runder Löcher auf den Durchmesser
  definiert; die Restluft an Sechskant- und Magnettasche ist damit gerechnet, nicht gedruckt.
- **T25, welcher Wert stimmt**: 5 oder 10 mm entscheidet Phase 3, nicht diese Messung.

## Lücke im Harness

`harness.ts` schreibt Ergebnisse nur über `openAudit()`, das SolidCraft startet. Fälle ohne SolidCraft
haben keinen Ergebnisweg; `tools/audit/passung-texte-helpers.ts` ergänzt `save()` (nach
`out/passung-texte/`), `source()` (Quelltext zum Zählen) und ein `PartPrint` für `printNote`.
`tools/audit/out/` ist über `.gitignore:17` (`out/`) bereits ausgenommen.

## Nachmessung 13.11.2026 (main `a6e52eb`, SolidCraft 0.40.1)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`a6e52eb`, alle PRs bis #367), installiertes
SolidCraft 0.40.1, ein Worker, ohne Fenster. Erster Lauf: 28 Dateien, 108 Tests, 13 rot (Erwartungen am
alten Stand bzw. 0,3-mm-Deckel jetzt `warn`); nach dem Anpassen 29 Dateien, 109 Tests grün. Werte in `tools/audit/out/…` (nicht im Repo). Die Fälle T2, D5, MG-05 und R1/R3 prüfen jetzt den behobenen Stand; R1 bildet den Weg seit #357 nach (`withCheckOfChange`, `CheckTold`).

| Kennung | behoben in | Urteil | gemessen am heutigen main | Fall |
|---|---|---|---|---|
| T2 | #349 | behoben bestätigt | Lesung bei Düse 0,6 (`applyReadings(…, 0.6)`, `measuredNozzle`): Notiz bei 0,6 „slide 0.3 mm“; bei 0,2 / 0,4 / 0,8: 0,1 / 0,2 / 0,4 mm | `passung-texte-t2` |
| MG-05 | #352 | behoben bestätigt | `[auto 1×nozzle]` bei Düse 0,2 und 0,25: 0,3 mm | `passung-texte-mg05` |
| D5 | #350 | behoben bestätigt | Bericht `block` ohne Überhang: „Supports: not settled: the print check found problems …“; keine Prüfung: „not checked“; `ready`/`warn` ohne Überhang: „… found no face that needs them; the slicer decides“ (de entsprechend) | `passung-texte-d5` |
| R1 | #357 | behoben bestätigt | Werkzeugantwort einer Änderung trägt die Prüfung: Sperrmeldung im selben Zug; noch nicht da: „… still running; call partbuddy_view for it before you call the part done“; gleiche Lage nach weiterer Änderung: „unchanged, still not ready to print, the same 1 finding as before“ | `passung-texte-r1-r3` |
| R3 | #357 | behoben bestätigt | „nothing found in what it checks (build volume, wall and floor thickness, …)“ und „Not checked: strength and layer direction under load, the fits and hole allowances you chose, details and text too fine to print, bed-edge chamfers“ | `passung-texte-r1-r3` |
| R4 | #351 | behoben bestätigt | Satz: „draw the pilot hole 0.8 times the screw's diameter (2.0 mm for M2.5, 2.4 mm for M3) plus the hole allowance of the print profile“ | `passung-texte-standards` |
| N-passung-texte-4 | #357 | behoben bestätigt | siehe R1: die Werkzeugantwort sagt „unchanged …“ auch bei gleichem Wortlaut | `passung-texte-r1-r3` |
| N-passung-texte-1 | – | weiter offen | `usePrintCheck.ts` nimmt `clearance.push` ungeskaliert (`scaleClearance` kommt nicht vor) | `passung-texte-t2` |

## Nachmessung 14.11.2026 (SolidCraft 0.41.0)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`35653de`, alle PRs bis #405), installiertes
SolidCraft 0.41.0, ein Worker, ohne Fenster. Erster Lauf (`tools/audit/phase4-2026-11-14.log`): 29 Dateien, 109 Tests,
13 rot, alle 13 wegen Erwartungen am Stand vor den BC-Paketen; kein Fehler von SolidCraft 0.41.0. Die betroffenen Fälle
sind angepasst und einzeln nachgefahren, grün. Verglichen ist mit den Werten der Nachmessung 13.11. (bei Fällen ohne
Zeile dort mit der Tabelle oben). Werte in `tools/audit/out/…` (nicht im Repo). Die Fälle hier brauchen kein SolidCraft.

| Kennung / Wert | 13.11. (bzw. Tabelle oben) | 14.11. | Grund |
|---|---|---|---|
| T2: Kammloch „0.3“ | Ø 6,6 gezeichnet = 0,30 mm je Seite | Ø 6,75 gezeichnet (6,6 + PLA-Aufmaß 0,15), nach Druck 0,30 mm je Seite, bei jeder Düse | BC-16 (#398), N-nach-6 |
| T2: Spiel an den Assistenten (gelesen bei 0,6), Düse 0,2 / 0,4 / 0,8 | slide 0,1 / 0,2 / 0,4 | slide 0,2 / 0,2 / 0,4; bei 0,6 0,3 | BC-14 (#386): nie unter dem Wert für 0,4 mm |
| N-passung-texte-5: Rundung der skalierten Spiele | 0,08 / 0,23 | 0,033 / 0,233 (auf 0,001) | BC-05 (#377) |
| T22: Profil gegen Katalog | 5 von 30 Werten verschieden | 0 von 30 | BC-05 (#377) |
| T10: Zugaben der Bausteine | fest; `blockOf` mit `material: 'PP'` = ohne | aus dem Material: Mutter M3 Schlüsselweite PLA 5,8 / PETG, ASA, ABS, PA, PC, PP 5,9 / TPU 5,7 (Mutter + 2 × push), gezeichnet + Lochaufmaß; Magnet glue Raum PLA 0,3 / PETG … PP 0,4 / TPU 0,2, press −0,1 überall; Einsatz M3 4,0 ohne Aufmaß; `blockOf` mit `material` abgelehnt: „nutTrap takes no material, nozzle, holeShrink“ | BC-16 (#398); Ablehnung BC-03 (#369) |
| T24 | 1,2 mm; `fitSize` warnt | Satz: „bars at least 3 lines … 1.35 mm on a 0.4 mm nozzle“; `fitSize` entfernt | BC-22 (#394), BC-14 (#386) |
| T25 | 5 gegen 10 mm; Gelenkauge bis 16,3 mm | Normen und Notiz: „the print check takes up to 10 mm (UltiMaker), and from 5 mm it sags (Hubs)“; Scharnier 20 / 30 / 50 mm: 3 / 5 / 7 Augen à 6,4 / 5,68 / 6,8 mm, ab 90 mm abgelehnt („each at most 86 mm long“); Schlüsselloch-Eingang weiter 8 … 11 mm (sein Dach hier nicht nachgemessen) | BC-05 (#377), BC-10 (#382) |
| R4 / T26 | Satz neu seit #351 | „draw the pilot hole 0.8 times the screw's diameter (2 mm for M2.5, 2.4 mm for M3) plus the hole allowance of the print profile“ | #351 |
| MG-05 / N-passung-texte-6 | 0,3 mm | unverändert: Marke ergibt bei Düse 0,2 / 0,25 / 0,3 0,3 mm, `refit` lässt den genannten Spalt | #352 |

Ungeklärte Änderungen: keine.

**Angepasste Fälle.** `t22-t10-profile`: T22 erwartet 0 Unterschiede; T10 rechnet die Zugaben mit `nutFlats`,
`magnetRoom` und `magnetPocket` je Material (`MAGNET.room` und `NUT_ALLOWANCE.flats` gibt es seit BC-16 nicht mehr)
und erwartet die Ablehnung von `material` im Aufruf. `t2-toleranz`: das Spiel des Kamms nach Druck (Loch minus
Aufmaß). `standards`: `fitSize` entfernt (BC-14), stattdessen nennt der Stegsatz 1,35 mm; die Satzsuche für R4/T26
trifft jetzt „draw the pilot hole“ statt des Satzes über Dome.

**Echte Fehler:** keine.
