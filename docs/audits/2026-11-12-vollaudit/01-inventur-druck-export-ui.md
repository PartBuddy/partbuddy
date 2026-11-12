# Vollaudit Phase 1 – Inventur Druckprüfung, Export, Teilen, SolidCraft-Anbindung, Oberfläche

Stand: 12.11.2026, Zweig `docs/vollaudit-2026-11` (HEAD `6151cef`). Nur gelesen, nichts gebaut, nichts gemessen.
Maßstab: [AUFTRAG.md](AUFTRAG.md). Präfix der Befunde: **D**.

Pfadkürzel: **G** = `packages/geometry/src`, **M** = `apps/desktop/src/main`, **S** = `apps/desktop/src/shared`,
**R** = `apps/desktop/src/renderer/src`, **T** = `apps/desktop/test`, **E** = `apps/desktop/e2e`.

Spalte „Test“: zugeordnet nach Dateiname und Testtitel (`it(...)`); der Inhalt der Desktop-Tests unter **T** wurde
nicht gelesen (siehe „Nicht geprüft“). „keiner“ heißt: kein Testtitel in `G/*.test.ts` nennt den Fall bzw. keine
passende Datei unter **T**.

## Prüfliste

### 1 Druckprüfung `checkPrint` (G/printCheck.ts)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 1 | Profil `bed` | G/printCheck.ts:22 | [X, Y, Z] mm; Schema 20–2000 je Achse (S/contract.ts:1055) | Bauraum, gegen den die Größe geprüft wird; ohne Rand | Schema in `printSettingsSchema`; in `checkPrint` keine eigene Prüfung | G/printCheck.test.ts („blocks a part larger…“) | |
| 2 | Profil `nozzle` | G/printCheck.ts:23 | mm; Schema 0,1–2 (S/contract.ts:1056) | Schwelle „Wand druckt nicht“ und Basis der Mindestwand | Schema; sonst keine | G/printCheck.test.ts | |
| 3 | Profil `overhang` | G/printCheck.ts:25 | Grad ab Senkrechte; Schema 20–70 (S/contract.ts:1070) | Winkel, ab dem eine Fläche als Überhang zählt | Schema; sonst keine | G/printCheck.test.ts („follows the overhang angle…“) | |
| 4 | Profil enthält **keine** Schichthöhe | G/printCheck.ts:20-26 | – | Dicke in Z wird wie Wand in XY bewertet | keine (D4) | keiner | |
| 5 | `minimumWall(nozzle)` | G/printCheck.ts:93-95 | `round(nozzle·2·1,125, 2)`; 0,4 → 0,9 mm | dünnste Wand „zwei Linien“ | reine Funktion | G/printCheck.test.ts („warns about walls under two lines…“) | |
| 6 | Faktor Linienbreite 1,125 | G/printCheck.ts:94; G/overhang.ts:72; M/print/printProfiles.ts:297; S/designFit.ts:21 | dimensionslos | Linienbreite = 1,125 × Düse | viermal einzeln hinterlegt (D37) | keiner eigens | |
| 7 | `MIN_AREA` | G/printCheck.ts:98 | 1 mm² je B-rep-Fläche | kleinere Fundflächen gelten als Tessellationsrauschen | `locate` Zeile 205 (je Fläche, nicht summiert, D7) | keiner | |
| 8 | `BLOCK_THIN_AREA` | G/printCheck.ts:100 | 5 mm² | ab dieser Fläche unter Düsenbreite: `block`, sonst `warn` | Zeile 349 | G/printCheck.test.ts | |
| 9 | `MIN_CONTACT` | G/printCheck.ts:102 | 25 mm², Summe über alle Körper | darunter Warnung „kann sich lösen/kippen“ | Zeile 410 (D3, D17) | G/printCheck.test.ts („…the small foot on the bed“) | |
| 10 | `OPPOSITE` | G/printCheck.ts:109 | −cos 10° | Gegenwand zählt nur, wenn Normalen innerhalb 10° gegenläufig sind; Keile bleiben außen vor | Zeile 187 | G/printCheck.test.ts („knife edge where a thread runs out…“) | |
| 11 | `MAX_RAYS` | G/printCheck.ts:111 | 40 000 Strahlen je Körper | größere Netze werden gleichmäßig ausgedünnt (`stride`) | Zeile 177 | keiner | |
| 12 | `EPSILON` | G/printCheck.ts:112 | 1e-3 mm | Strahlstart knapp unter der Oberfläche; gemessene Dicke = Treffer + EPSILON | Zeile 182, 188 | keiner | |
| 13 | Wanddicke: ein Strahl je Dreieck vom Schwerpunkt | G/printCheck.ts:179-188 | Reichweite 0…`minimumWall` | misst die Dicke nur am Schwerpunkt jedes (abgetasteten) Dreiecks | – (D6) | G/printCheck.test.ts | |
| 14 | Wanddicke: Flächenhochrechnung `area · stride` | G/printCheck.ts:188 | mm² | Fundfläche bei Ausdünnung geschätzt | keine (D40) | keiner | |
| 15 | Wand „zu dünn“ = kleinster Wert der Fläche < Düse | G/printCheck.ts:346 | mm | Auswahl der Flächen für `block` | Zeile 346-349; Fläche = ganze dünne Fläche (D39) | G/printCheck.test.ts | |
| 16 | Befund `thinWall`: Rundung | G/printCheck.ts:350 | Dicke 2 Stellen, Fläche 0 Stellen | Anzeigezahlen | – | G/printCheck.test.ts | |
| 17 | `TOUCH` | G/printCheck.ts:223 | 0,05 mm | Abstand, ab dem zwei Körper als berührend gelten | Zeile 237, 252, 254-255 | G/printCheck.test.ts („…warns when bodies touch“) | |
| 18 | `MAX_TOUCH_VERTICES` | G/printCheck.ts:225 | 4000 Eckpunkte je Körper | Berührprüfung nur an (abgetasteten) Eckpunkten | Zeile 242 (D41) | keiner | |
| 19 | „innen“-Test: Strahl −Z, erste Fläche mit `normal.z < 0` und Abstand > TOUCH | G/printCheck.ts:248-253 | – | erkennt Eckpunkte von a im Volumen von b | – | keiner | |
| 20 | Befund `separate` | G/printCheck.ts:354-365 | Schwere `warn` | berührende/durchdringende Körper werden genannt | – | G/printCheck.test.ts | |
| 21 | `printedSize`: Breite/Tiefe über **alle** Körper, Höhe des höchsten | G/printCheck.ts:261-280 | mm | Größe für den Bauraumvergleich | – (D1) | G/printCheck.test.ts („blocks a part larger…“, ein Körper) | |
| 22 | `sizeFinding`: Rundung auf 0,1 mm vor dem Vergleich | G/printCheck.ts:313 | 0,1 mm | 256,04 mm zählt als 256,0 | – (D38) | keiner | |
| 23 | `sizeFinding`: passt, wenn (x,y,z) oder (y,x,z) ≤ Bauraum | G/printCheck.ts:314-317 | nur 0°/90° um Z | keine schräge Lage, kein Rand | – (D2, D38) | G/printCheck.test.ts | |
| 24 | `sizeFinding.lying` | G/printCheck.ts:318 | boolean | Hinweis „passt auf einer anderen Seite“ (übrige vier Permutationen) | – | G/printCheck.test.ts („…says when it would fit lying on its side“) | |
| 25 | Befund `size` Schwere | G/printCheck.ts:319 | `block` | – | – | G/printCheck.test.ts | |
| 26 | `laid`: Drehung auf Druckfläche (`planeNormal` → −Z) | G/printCheck.ts:283-301 | Float32 | Körper wird für Größe/Überhang/Auflage auf die Druckfläche gelegt | Fläche per **Name** gesucht; nicht gefunden oder nicht plan → stillschweigend „wie konstruiert“ (D20) | G/printCheck.test.ts („checks a body lying on its print face…“) | |
| 27 | `bedOf`: tiefster Punkt des einzelnen Körpers | G/printCheck.ts:304-308 | mm | jedes Teil steht auf seinem eigenen tiefsten Punkt | – | G/printCheck.test.ts („lays every body on the bed by itself…“) | |
| 28 | Feature-Fehler → `block`, Feature-Warnung → `warn` | G/printCheck.ts:331-335 | unterdrückte/zurückgerollte übersprungen | Befund `feature` mit SolidCrafts Text | – | G/printCheck.test.ts („blocks on a feature SolidCraft could not build…“) | |
| 29 | Körper ohne Flächen werden ausgelassen | G/printCheck.ts:337 | `faces.length > 0` | solche Körper werden gar nicht geprüft | keine Meldung (D51) | keiner | |
| 30 | Überhang-Befund: Schwelle Fläche | G/printCheck.ts:406-407 | ≥ 1 mm² (je Fläche und gesamt) | Befund `overhang`, immer `warn` | – | G/printCheck.test.ts („marks the ceiling of a table top…“) | |
| 31 | Auflage-Befund | G/printCheck.ts:410-413 | Summe `onBed` < 25 mm² → `warn` | Befund `contact` | – (D3) | G/printCheck.test.ts | |
| 32 | Sortierung/Status | G/printCheck.ts:322-325, 416-417 | block vor warn; Status = schwerster Befund | Ampel | – | G/printCheck.test.ts („keeps what blocks printing first…“) | |
| 33 | `MIN_OVERLAP` | G/printCheck.ts:427 | 0,01 mm³ | kleinere Durchdringung gilt als Flächenkontakt | Zeile 441 | G/printCheck.test.ts („…ignores the contact of two faces“) | |
| 34 | `CONTACT` | G/printCheck.ts:429 | 1e-3 mm | darunter „berührt“, kein `tight` | Zeile 446 | G/printCheck.test.ts („warns about gaps under the push fit…“) | |
| 35 | `GAP_PAD` | G/printCheck.ts:431 | 2 mm | Kamerabox um Engstelle/Kontaktpunkt | Zeile 447-448, 468-469 | keiner | |
| 36 | `withClearance`: Spalt < `pushFit` → `tight` (warn) | G/printCheck.ts:444-450 | `pushFit` = Material `clearance.push` **unskaliert** (R/print/usePrintCheck.ts:54) | Warnung enge Spalte zwischen Körpern | nur wenn `pushFit > 0` (D9, D10) | G/printCheck.test.ts | |
| 37 | `withClearance`: Überlappung → `overlap` (warn) | G/printCheck.ts:440-443 | Volumen 2 Stellen | – | – | G/printCheck.test.ts | |
| 38 | `AT_LIMIT` | G/printCheck.ts:456 | 0,5° / 0,1 mm | Sweep, der so nah am Limit endet, gilt als durchgelaufen | Zeile 467 | keiner in G; T/actions.test.ts (Titel nicht gelesen) | |
| 39 | `withMotion`: `blocked` (warn) | G/printCheck.ts:466-471 | at/limit 1 Stelle | Gelenk stößt vor dem Limit an | – | keiner in G | |
| 40 | `withMotion`: `posed` ab \|Wert\| > 1e-3 | G/printCheck.ts:472-476 | deg/mm | Gelenk steht nicht auf 0 | – | keiner in G | |
| 41 | `bodyOf`: Vorkommen `<Körper>:<n>` → Körpername | G/printCheck.ts:458 | Regex `:\d+$` | Körpername im Befund | – | keiner | |

### 2 Überhang (G/overhang.ts)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 42 | `OVERHANG_LIMITS` (ohne Profil) | G/overhang.ts:19 | grenzwertig 35°, Stütze 45° | Standardklassen | Default-Parameter Zeile 174 | G/overhang.test.ts („marks 40°… borderline and 50°…“) | |
| 43 | `overhangLimits(support)` | G/overhang.ts:22-24 | grenzwertig = max(0, support − 10) | Klassen je Material | – | G/overhang.test.ts („moves the limits with the material…“) | |
| 44 | `ANGLE_TOLERANCE` | G/overhang.ts:31, 39 | 1° | Stütze erst ab Limit + 1° | – (D19) | G/printCheck.test.ts („takes a 45° chamfer… as printable“) | |
| 45 | `BED_TOLERANCE` | G/overhang.ts:34, 140, 183 | 0,05 mm | Fläche liegt auf dem Bett, wenn kein Eckpunkt höher liegt | – | G/overhang.test.ts („tells the bed…“) | |
| 46 | Klassifizierung über sin(Winkel) der Dreiecksnormalen | G/overhang.ts:37-45, 193-209 | `down = −n_z` | Fine / Borderline / Support | – | G/overhang.test.ts | |
| 47 | `smallOverhangReach(nozzle)` | G/overhang.ts:71-73 | `round(4·1,125·nozzle, 2)`; 0,4 → 1,8 mm | Überhänge, die höchstens so weit vom tragenden Material auskragen, zählen als grenzwertig | – (D18) | G/printCheck.test.ts („leaves out small overhangs…“) | |
| 48 | `WELD` | G/overhang.ts:76 | 1e-4 mm | Eckpunkte näher als das gelten als einer | Zeile 89, 140 | keiner eigens | |
| 49 | `smallPatches`: Anker = Kante, deren Nachbar nach unten weitergeht **oder** die auf dem Bett liegt | G/overhang.ts:140-144 | – | Flecken ohne Anker „beginnen in der Luft“ und bleiben Stütze | – | G/printCheck.test.ts | |
| 50 | `smallPatches`: Abstand nur in XY | G/overhang.ts:149-162 | ≤ `reach` | – | – | keiner eigens | |
| 51 | `smallPatches`: paarweiser Vergleich (shortcut) | G/overhang.ts:83-84 | – | Laufzeit O(Ecken × Anker) | – | keiner | |
| 52 | Bett-Fläche: ganze B-rep-Fläche ≤ bedZ + 0,05 | G/overhang.ts:177-183 | – | nur vollständig plane Bodenflächen zählen als Auflage | – | G/overhang.test.ts | |

### 3 Übrige Geometrie-Bibliothek (G)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 53 | `meshMetrics`: Volumen (Divergenzsatz), Box | G/analysis.ts:10-30 | mm³, mm | nur für geschlossene Netze gültig | keine Prüfung auf Geschlossenheit; in der App unbenutzt (D36) | G/geometry.test.ts („is watertight and has the expected bounding box“) | |
| 54 | `overhangFindings` `limitDeg` | G/analysis.ts:43 | Standard 60° | Prototyp-Überhangliste | in der App unbenutzt (D36) | G/geometry.test.ts | |
| 55 | `overhangFindings` `bedTolerance` | G/analysis.ts:43, 62 | 0,25 mm, Bett bei z = 0 angenommen | – | – (D36) | G/geometry.test.ts | |
| 56 | `FACE_TAG_NAMESPACE` | G/tagged3mf.ts:4 | Version 2026/10 | fremde/fehlende Kennung → Fehler | Zeile 35-37 | G/geometry.test.ts | |
| 57 | `parseTagged3mf`: Muster für Objekt/Eckpunkt/Dreieck | G/tagged3mf.ts:20-22 | feste Attributreihenfolge | was nicht passt, wird übersprungen | nur Indexgrenzen (Zeile 54-59), kein Zählabgleich (D30) | G/geometry.test.ts | |
| 58 | `parseTagged3mf`: Einheit | G/tagged3mf.ts:12, 29-68 | mm angenommen | `unit` des 3MF und `transform` werden nicht gelesen | keine (D30) | keiner | |
| 59 | `parseTagged3mf`: ein Netzobjekt je Datei | G/tagged3mf.ts:27, 38 | – | weitere Objekte würden in eines zusammenlaufen | keine | keiner | |
| 60 | `deriveEdges.openEdges` | G/edges.ts:77, 103 | Anzahl | Zahl offener Netzkanten (nicht geschlossen) | Ergebnis wird in `buildRenderMesh` verworfen (G/renderMesh.ts:51) (D12) | G/geometry.test.ts („is watertight…“) | |
| 61 | `edgeName` | G/edges.ts:112-114 | `A\|B` sortiert | Kantenname wie SolidCraft | – | G/geometry.test.ts | |
| 62 | `sameCylinder` Toleranz | G/faceTable.ts:41 | 1e-3 (mm bzw. dimensionslos) | Zylindernähte werden nicht als Kante gezeigt | – | G/geometry.test.ts („skips seams…“) | |
| 63 | `faceTableFromModelFaces` | G/faceTable.ts:75-102 | wirft bei Vertragsbruch; Fläche 0 erlaubt | Flächentabelle des Spiegels | wirft | G/geometry.test.ts („rejects entries…“, „takes a face without area…“) | |
| 64 | `faceDiff` Toleranzen | G/faceDiff.ts:18-19 | absolut 1e-3, relativ 1e-3 | „geändert“-Markierung in der Ansicht | – | G/geometry.test.ts („ignores differences below the export tolerance“) | |
| 65 | `ACCEPT_SCORE` / `ACCEPT_MARGIN` | G/noteAnchors.ts:48-49 | 0,75 / 0,15 | Wiederfinden einer Notizfläche nach Form | – | G/noteAnchors.test.ts | |
| 66 | `MAX_ANGLE_DEG` / `RADIUS_TOLERANCE` | G/noteAnchors.ts:50-51 | 5° / 5 % | Tor für Formvergleich | – | G/noteAnchors.test.ts | |
| 67 | Anker-Rundung | G/noteAnchors.ts:62 | 1e-4 mm | – | – | G/noteAnchors.test.ts | |
| 68 | Skizze: `DEFAULT_TOLERANCE` | G/sketch.ts:67 | 0,01 mm Sehnenfehler | Anzeige der Skizzenkurven | – | G/sketch.test.ts („matches SolidCraft’s own DXF… within 0.01 mm“) | |
| 69 | Skizze: `DEFAULT_MAX_SEGMENTS`, `MIN_PIECES`, `MAX_DEPTH` | G/sketch.ts:68-71 | 1024 / 8 / 12 | Segmentzahl je Kurve | – | G/sketch.test.ts („…bounds the segment count“) | |
| 70 | Skizze: Kegelschnitt `rho` | G/sketch.ts:122 | 0 < rho < 1 | sonst Kurve übersprungen | Zeile 122-123 | G/sketch.test.ts („skips curves it cannot read…“) | |
| 71 | Skizze: Spline-Grad | G/sketch.ts:129 | ganzzahlig ≥ 1, sonst 3 | – | – | G/sketch.test.ts | |
| 72 | `buildViewerModel`: BVH `indirect` | G/viewerModel.ts:41 | – | Dreieck i bleibt Fläche i | – | G/geometry.test.ts („keeps the triangle order…“) | |

### 4 Druckprofile und Regeltext (M/print)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 73 | Startdrucker | M/print/printProfiles.ts:50 | 256 × 256 × 256 mm, Düse 0,4, Schicht 0,2 | Bauraum und Einheiten der Regeln | Schema | T/printProfiles.test.ts | |
| 74 | Schema Düse | S/contract.ts:1056; R/print/PrintProfilesEditor.tsx:208 | 0,1–2 mm, Schritt 0,05 | – | zod + Feldgrenzen | T/printProfiles.test.ts | |
| 75 | Schema Schichthöhe | S/contract.ts:1057; R/print/PrintProfilesEditor.tsx:209 | 0,04–1,2 mm, Schritt 0,02 | – | zod; **kein** Bezug zur Düse (D28) | keiner | |
| 76 | Schema Bauraum | S/contract.ts:1055; R/print/PrintProfilesEditor.tsx:193-195 | 20–2000 mm, Schritt 1 | – | zod | keiner eigens | |
| 77 | Schema Überhang | S/contract.ts:1070; R/print/PrintProfilesEditor.tsx:232 | 20–70°, Schritt 1 | – | zod | keiner eigens | |
| 78 | Schema Lochschwund | S/contract.ts:1072; R/print/PrintProfilesEditor.tsx:233 | 0–1 mm (Durchmesser), Schritt 0,05 | – | zod | keiner eigens | |
| 79 | Schema Spiel je Passung | S/contract.ts:1074; R/print/PrintProfilesEditor.tsx:243-245 | −0,5…2 mm je Seite, Schritt 0,05; keine Reihenfolge clamp ≤ push ≤ slide ≤ turn | – | zod (nur Bereich) | keiner eigens | |
| 80 | `MAX_PRINTERS` / `MAX_MATERIALS` | S/contract.ts:1046, 1048 | 20 / 50 | – | zod | keiner eigens | |
| 81 | PLA Start | M/print/printProfiles.ts:53 | Überhang 45°, Loch 0,15, Spiel 0,05 / 0,15 / 0,25 / 0,3 | Startwerte Passungen | keine Herkunft im Code (D27) | T/printProfiles.test.ts | |
| 82 | PETG Start | M/print/printProfiles.ts:54 | 40°, 0,2, 0,1 / 0,2 / 0,3 / 0,35 | – | keine Herkunft (D27) | – | |
| 83 | PETG-CF Start | M/print/printProfiles.ts:55 | 40°, 0,2, 0,1 / 0,2 / 0,3 / 0,35 | identisch mit PETG | keine Herkunft (D27) | – | |
| 84 | ASA Start | M/print/printProfiles.ts:56 | 40°, 0,2, 0,1 / 0,2 / 0,3 / 0,35 | identisch mit PETG | keine Herkunft (D27) | – | |
| 85 | TPU Start | M/print/printProfiles.ts:57 | 35°, 0,25, 0 / 0,1 / 0,3 / 0,4 | – | keine Herkunft (D27) | – | |
| 86 | `supportFree` Standard | M/print/printProfiles.ts:60; S/contract.ts:1106 | true | Regeln „ohne Stütze“ gehen an den Assistenten | Schalter | T/printProfiles.test.ts | |
| 87 | Regel: Fase 45° statt Rundung an Bettkanten | M/print/printProfiles.ts:230 | 45° | – | nur Text, keine Prüfung (D16) | T/designRules.test.ts (Inhalt nicht gelesen) | |
| 88 | Regel: liegende Löcher bis „etwa 10 mm“ überbrückt der Slicer | M/print/printProfiles.ts:231 | 10 mm fest | darüber Tropfen-/Dachform | nur Text (D15, D29) | – | |
| 89 | Regel: Decken bis 10 mm Wandabstand überbrückt | M/print/printProfiles.ts:232 | 10 mm fest | – | nur Text (D15, D29) | – | |
| 90 | Regel: Absätze bis 1,5 mm drucken | M/print/printProfiles.ts:232 | 1,5 mm fest | – | nur Text; Prüfung nutzt 4,5 × Düse (D18) | – | |
| 91 | Regel: Spalt unter 0,2 mm druckt nicht | M/print/printProfiles.ts:265 | 0,2 mm fest | – | nur Text (D29) | – | |
| 92 | Regel: Mindestwand (`fitSize('wall', 0, …)`), Detail < Düse | M/print/printProfiles.ts:260, 265 | aus S/designFit.ts | – | Wand: Druckprüfung; Detail: keine (D14) | – | |
| 93 | Regel: Passungen = Materialspiel × Düse / 0,4 | M/print/printProfiles.ts:261, 266, 303; S/designFit.ts:34-36 | linear skaliert | Spiel, das der Assistent einbaut | Prüfung vergleicht unskaliert (D9) | T/designRules.test.ts | |
| 94 | Regel: Radien 1 / 2 / 3 mm nach Teilgröße < 30 / ≤ 100 / > 100 mm | M/print/printProfiles.ts:271 | fest | – | nur Text (D29) | – | |
| 95 | Regel: Bettfase 2–3 Schichten hoch | M/print/printProfiles.ts:271 | `series(layer, 2, 3)` | soll Elefantenfuß aufnehmen | nur Text (D16) | – | |
| 96 | Regel: Innenradius ≥ halbe Wand, mindestens max(1, 2 × Düse) | M/print/printProfiles.ts:271 | mm | – | nur Text (D29) | – | |
| 97 | Regel: Print-in-place-Spalt | M/print/printProfiles.ts:259, 275; S/designFit.ts:29-31 | max(0,3; Düse) mm | – | Prüfung meldet nur < push (D10) | – | |
| 98 | Regel: Fase 2 Schichten an Bettkanten beweglicher Teile | M/print/printProfiles.ts:275 | `layer·2` | – | nur Text | – | |
| 99 | Regel: Schnapparm ≥ 5 × Dicke lang, Einlauf 30–45° | M/print/printProfiles.ts:275 | fest | – | nur Text (D29) | – | |
| 100 | Regel: Fasen an Bohrungen 0,5 mm × 45°, Fügefase 0,5 mm | M/print/printProfiles.ts:279 | fest | – | nur Text (D29) | – | |
| 101 | Regel: Schrift ≥ max(0,6; 3 Schichten) tief, Strich ≥ 2 × Düse | M/print/printProfiles.ts:279 | mm | – | nur Text (D14) | – | |
| 102 | Regel: Wände 2–5 Linien, Böden 3–6 Schichten, Boden ≥ max(0,8; 4 Schichten) | M/print/printProfiles.ts:283 | mm | – | nur Text; Prüfung kennt keine Schichthöhe (D4) | T/designRules.test.ts | |
| 103 | `printNote`: Wand „zwei Linien“ | M/print/printProfiles.ts:297, 301 | gleiche Formel wie Nr. 5 | – | Doppelung (D37) | T/printProfiles.test.ts | |
| 104 | `printFileOf` | M/print/printProfiles.ts:65-67 | `<Design>.print.json` | Material und Regelgruppen je Projekt | Schema Zeile 24-29 | T/printProfiles.test.ts | |
| 105 | `printCheckNote`: höchstens 12 Befunde, 4 Körper, 6 Flächen | M/print/printCheckNote.ts:11-13, 63 | – | was der Assistent von der Prüfung sieht | Kürzung ohne Hinweis bei > 12 Befunden (D35) | T/printCheckNote.test.ts | |
| 106 | `printCheckNote`: Wortlaut `thinWall` block | M/print/printCheckNote.ts:26 | „do not print“ | Aussage an den Assistenten | – (D4) | T/printCheckNote.test.ts | |
| 107 | `printCheckNote`: Wortlaut `size` | M/print/printCheckNote.ts:23 | „the part is X × Y × Z“ | bei mehreren Körpern die gemeinsame Box | – (D1) | T/printCheckNote.test.ts | |
| 108 | Bericht an Main: höchstens 40 Befunde, 20 Körper, 40 Flächen | R/print/report.ts:11, 18; S/contract.ts:1140-1141, 1158 | – | – | zod | keiner eigens | |
| 109 | `checkForView`: Prüfung einer älteren Revision gilt als „läuft noch“ | M/index.ts:372-377 | Revisionsvergleich | – | ja | keiner eigens | |
| 110 | `refitSizes` bei Düsen-/Schichtwechsel | M/index.ts:387-400 | nur Parameter mit `[auto …]` | passt gesnappte Maße an | ja | T/designRules.test.ts | |

### 5 Ablauf der Prüfung in der Oberfläche (R/print)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 111 | `CHECK_DELAY_MS` | R/print/usePrintCheck.ts:10 | 250 ms | Prüfung läuft nach jeder Revision, Drucker-/Material-/Druckflächenänderung | – | E/app.spec.ts (Inhalt nicht gelesen) | |
| 112 | Normteile aus der Prüfung | R/print/usePrintCheck.ts:28-29 | `structure.standardParts` | Gegenstücke werden nicht geprüft | – | T/standardParts.test.ts | |
| 113 | Logo-Farbkörper aus der Abstandsmessung | R/print/usePrintCheck.ts:37 | `isLogoColourBody` | Farbteile eines Logos werden nicht auf Spalt/Überlappung gemessen | – | keiner eigens | |
| 114 | Abstandsmessung nur ab 2 Teilen, `gap = max(push, 0)` | R/print/usePrintCheck.ts:54-62; S/contract.ts:917 | 0–5 mm | `inspect.clearance` | Fehler → Befunde entfallen still (D8) | keiner eigens | |
| 115 | Sweeps: je Gelenkwert zu jedem Limit, höchstens 40 | R/print/usePrintCheck.ts:66-70; S/contract.ts:924 | Limit ≠ Stand (> 1e-6) | Kollision auf dem Weg | Gelenke ohne Limit werden nie gefahren; > 40 still abgeschnitten (D42); Fehler → `[]` (D8) | keiner eigens | |
| 116 | Folgewerte (Getriebe) ausgelassen | R/print/usePrintCheck.ts:32 | `value.follows` | – | – | keiner eigens | |
| 117 | Anzeige `check.basis` | R/i18n/de.json:1114 | „wie konstruiert (auf der untersten Stelle stehend)“ | Aussage an den Nutzer | nennt die Druckfläche nicht (D34) | T/i18nKeys.test.ts (nur Schlüssel) | |
| 118 | Rückfrage vor Export nur bei Status `block` | R/shell/DesignActions.tsx:121-127; R/print/ExportConfirm.tsx | fragt einmal, hält nicht auf | – | kein Warten auf laufende Messung/Spiegelung (D23) | E/app.spec.ts | |

### 6 Export, Teilen, Slicer, Import (M/solidcraft/supervisor.ts, M/index.ts, M/share, M/projects)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 119 | Exportformate | S/contract.ts:662; M/index.ts:100-104; R/shell/DesignActions.tsx:15 | `3mf`, `stl`, `step` | `file.export {path, format, bodies}` | zod-Enum | T/supervisor.test.ts („exports every body through the cache folder…“), E/solidcraft.contract.spec.ts:167-177 (STL: 12 Dreiecke, binär) | |
| 120 | Export: Körperauswahl | M/solidcraft/supervisor.ts:222-224 | gespiegelte (= sichtbare) Körper ohne Normteile | ausgeblendete Körper fehlen in der Datei | Fehler nur bei 0 Körpern (D24) | T/supervisor.test.ts („refuses to export a design without a body“) | |
| 121 | Export: Qualität/Sehnenfehler | M/solidcraft/supervisor.ts:232 | **nicht gesetzt** (Spiegel: `quality: 'standard'`, M/solidcraft/mirror.ts:278) | Tessellation von STL/3MF = SolidCraft-Standard | keine (D22) | keiner | |
| 122 | Export: Einheit | – | nicht gesetzt, nicht geprüft; STL trägt keine Einheit | mm angenommen | keine | keiner | |
| 123 | Export: Lage | M/solidcraft/supervisor.ts:232 | wie konstruiert (kein Drehen auf die Druckfläche durch PartBuddy) | – | keine (D21) | keiner | |
| 124 | Export: Gelenkstellung | G/printCheck.ts:76-77, 472-476 | „wie es steht“ | bewegte Gelenke werden gestellt exportiert | nur Warnung `posed` | keiner eigens | |
| 125 | Export: Dateiname | M/solidcraft/supervisor.ts:228; M/solidcraft/headless.ts:199-206 | Buchstaben, Ziffern, Leerzeichen, `_`, `-`; 80 Zeichen | Name des Teils in STEP/3MF | ja | T/supervisor.test.ts | |
| 126 | Export: Zielordner | M/index.ts:811-815 | `<Projekt>/exports`, frei wählbar | SolidCraft schreibt nur in den Cache, PartBuddy kopiert | `allow_paths` | T/supervisor.test.ts | |
| 127 | Export: Zeitlimit | M/solidcraft/supervisor.ts:233 | 10 min | – | – | keiner | |
| 128 | Export legt eine Version an | M/index.ts:819-821 | – | – | ja | T/versions.test.ts | |
| 129 | Export ohne `assistantIdle()` | M/index.ts:808-823 | – | Export während der Assistent baut, mit der Körperliste der letzten Spiegelung | keine (D23) | keiner | |
| 130 | Teilen-Paket: Inhalt | M/index.ts:838-895 | 3MF + STEP, 4 Bilder (iso, front, top, right), Beschreibung `.md` | – | Ordner nie überschrieben (M/share/freeFolder.ts:5-9) | T/share.test.ts | |
| 131 | Teilen: Bildgröße | M/solidcraft/supervisor.ts:302 | 1600 × 1200 px | – | – | keiner eigens | |
| 132 | Teilen: „Stützen“-Zeile | M/share/description.ts:32-34, 84; M/index.ts:882 | „none needed, it prints as designed“, sobald eine Prüfung da ist und kein `overhang`-Befund | öffentliche Aussage über das Teil | `check.status` wird nicht ausgewertet, Revision nicht verglichen (D5) | T/share.test.ts | |
| 133 | Teilen: Maße je Körper | M/solidcraft/supervisor.ts:307-322 | Box aus `inspect.measure`, 0,01 mm | – | – | T/share.test.ts | |
| 134 | Teilen: Zahlenformat | M/share/description.ts:72-74 | höchstens 2 Nachkommastellen | – | – | T/share.test.ts | |
| 135 | Teilen: Parameterliste | M/index.ts:862, 878 | nur `editable` (mm, reine Zahl) | – | – | T/share.test.ts | |
| 136 | Teilen: Normteile | M/solidcraft/supervisor.ts:328-341 | `assembly.bom`, nur Zeilen mit Teilenummer, ≤ 100 | – | – | T/share.test.ts | |
| 137 | An den Slicer | M/solidcraft/supervisor.ts:456-469 | `file.send_to_slicer {slicer, bodies, wait: 'return'}` | SolidCraft legt Körper auf ihre Druckfläche | – | keiner eigens | |
| 138 | Druckfläche setzen/löschen | M/solidcraft/supervisor.ts:486-488; R/viewer/PrintFaceButton.tsx:20-27 | Punkt auf planer Fläche; null löscht | `body.print_face` | Knopf nur an planer Fläche; Name in `print-faces.json` (M/projects/assembly.ts:56-62) | T/printFaceWatch.test.ts | |
| 139 | Import: Arten | M/projects/importFile.ts:11-21 | `.sc`, `.step/.stp/.iges/.igs`, `.stl/.3mf/.obj`, `.partbuddy` | `file.insert_step` / `file.insert_mesh` | Endung | T/importFile.test.ts | |
| 140 | Import: Größe | M/projects/importFile.ts:32, 52 | ≤ 512 MB | – | ja | T/importFile.test.ts | |
| 141 | Import: Einheit/Maßstab von Netzdateien | M/projects/importFile.ts:57-59 | nicht abgefragt | STL in Zoll oder Metern kommt ungeprüft herein | keine (D44) | keiner | |
| 142 | Netz in Flächen wandeln | M/solidcraft/supervisor.ts:539-541; M/index.ts:1289-1299 | `mesh.convert`; offenes Netz → Grund `openMesh` | – | Meldung | keiner eigens | |
| 143 | Projektpaket | M/projects/projectPackage.ts:19-22, 59 | ≤ 20 000 Einträge, ≤ 2 GB entpackt, ≤ 512 MB Datei; ohne `exports` | – | ja | T/projectPackage.test.ts | |
| 144 | Versionsvergleich `SAME_VOLUME_PERCENT` | M/projects/versionCompare.ts:6, 44 | 0,01 (Prozent) | gleiches Volumen → Kandidat „verschoben“ | – (D31) | T/versions.test.ts | |
| 145 | Versionsvergleich `MOVED_MM` | M/projects/versionCompare.ts:7, 44 | 0,05 mm Schwerpunktweg | – | – (D31) | T/versions.test.ts | |
| 146 | Versionsvergleich `MAX_REGIONS` | M/projects/versionCompare.ts:4 | 20 je Körper | – | – | T/versions.test.ts | |
| 147 | Prüfkörper-Cache | M/index.ts:1150-1159 | Datei je Düse/Schicht, nie verworfen | Bild der Prüfkörper kann von altem Stand stammen | keine (D43) | T/tolerances.test.ts (Inhalt nicht gelesen) | |
| 148 | Prüfkörper-Export | M/index.ts:1166-1182; S/contract.ts:1115-1116 | Düse 0,1–2, Schicht 0,04–1,2; 3MF oder in den Slicer | – | zod | T/tolerances.test.ts | |

### 7 SolidCraft-Anbindung: Aktionen, Maßfeld, Messen, Gelenke, Normteile (M/solidcraft)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 149 | Aktion Rundung | M/solidcraft/actions.ts:24-25; S/contract.ts:767 | Radius > 0 … 100 000 mm; 1–50 Kantenpunkte | `solid.fillet {edges, radius}` | zod; sonst SolidCrafts Ablehnung (D25) | T/actions.test.ts | |
| 150 | Aktion Fase | M/solidcraft/actions.ts:26-27; S/contract.ts:768 | Abstand > 0 … 100 000 mm | `solid.chamfer {edges, distance}` | zod (D25) | T/actions.test.ts | |
| 151 | Aktion Ziehen | M/solidcraft/actions.ts:28-30; S/contract.ts:770 | −10 000…10 000 mm, ≠ 0 | `solid.press_pull {face, distance}`; negativ schneidet | zod (D25) | T/actions.test.ts | |
| 152 | Aktion Bohrung | M/solidcraft/actions.ts:31-35; S/contract.ts:772 | Durchmesser > 0 … 100 000 mm; `depth` optional | `solid.hole {position, diameter, depth?}`; die Oberfläche sendet nie `depth` (R/viewer/SelectionActions.tsx:39-40) | zod; kein Lochaufmaß, keine Lage-/Dachprüfung (D25) | T/actions.test.ts | |
| 153 | Aktion Schale | M/solidcraft/actions.ts:36-37; S/contract.ts:773 | Wand > 0 … 100 000 mm | `solid.shell {faces, thickness}` | zod; keine Mindestwand (D25) | T/actions.test.ts | |
| 154 | Startwerte der Aktionen | R/viewer/SelectionActions.tsx:21 | Rundung 1, Fase 0,5, Ziehen 5, Bohrung 3, Schale 1,6 mm | Vorgabe im Feld | – (D26) | keiner | |
| 155 | Welche Aktion bei welcher Auswahl | R/viewer/actionKinds.ts:12-20 | Kanten: Rundung/Fase; eine plane Fläche: Ziehen/Bohrung/Schale; sonst Flächen: Schale; nur ein Körper | – | ja | T/actions.test.ts | |
| 156 | Längeneingabe | R/viewer/lengthInput.ts:2-5, 12-19 | Ziffern mit Komma/Punkt, optional „mm“; Pfeile ±1, Umschalt ±10, Alt ±0,1; nie ≤ 0 | – | ja | keiner eigens gefunden | |
| 157 | Vorschau-Verzögerung | R/viewer/SelectionActions.tsx:22 | 250 ms | Probe-Bau mit Rücknahme (`UNDO_ALL`) | Anwenden nur nach geglückter Vorschau (Zeile 108) | E/solidcraft.contract.spec.ts | |
| 158 | `UNDO_ALL` | M/solidcraft/actions.ts:18; M/solidcraft/dimensions.ts:54 | `sketch.inspect {sketch: 2147483647}` | absichtlich scheiternder letzter Schritt nimmt den Stapel zurück | – | T/actions.test.ts, T/dimensions.test.ts | |
| 159 | `mm()` | M/solidcraft/actions.ts:19; M/solidcraft/dimensions.ts:109 | 6 Nachkommastellen | Übergabe der Länge an SolidCraft | – | T/dimensions.test.ts | |
| 160 | Maßfeld: `SAME` | M/solidcraft/dimensions.ts:50, 70-71, 150 | 1e-4 mm (Kandidat), 1e-3 mm (Treffer nach Probe) | welcher Parameter treibt die Auswahl | ja | T/dimensions.test.ts | |
| 161 | Maßfeld: `MAX_CANDIDATES` | M/solidcraft/dimensions.ts:52, 73 | 8 | weitere Parameter gleichen Werts werden nicht probiert | – (D45) | T/dimensions.test.ts | |
| 162 | Maßfeld: `PLAIN_NUMBER`, Faktor 1 oder 2 | M/solidcraft/dimensions.ts:56, 66-74 | mm, reine Zahl; Durchmesserparameter treibt Radius | Formeln werden nie überschrieben | ja (Zeile 217, 233) | T/dimensions.test.ts | |
| 163 | Maßfeld: Wertebereich | S/contract.ts:679-680, 698-706 | > 0 … 100 000 mm | – | zod + Zeile 135, 231 | T/dimensions.test.ts | |
| 164 | Maßfeld: Abstand zweier Flächen nur bei Parallelität | M/solidcraft/dimensions.ts:96; R/viewer/dimensionOf.ts:54 | \|\|dot\| − 1\| ≤ 1e-6 | – | ja | T/dimensions.test.ts | |
| 165 | Maßfeld: Ziehpfeil-Raster | R/viewer/dimensionOf.ts:149-157 | 1 mm, mit Alt 0,1 mm | – | Wert > 0 außer `signed` | keiner eigens gefunden | |
| 166 | Parameterliste | M/solidcraft/dimensions.ts:188-209 | nur `source: user`; `editable` = mm + reine Zahl; ≤ 300 | – | ja | T/parametersSection.test.ts | |
| 167 | Maßmarken | M/solidcraft/supervisor.ts:797-886; S/contract.ts:735-738 | ≤ 60 Features, ≤ 400 Marken, ≤ 200 Ausdrücke | Anzeige der Maße am Teil | – | T/dimensionMarks.test.ts | |
| 168 | Messen | M/solidcraft/actions.ts:137-145; S/contract.ts:913-915 | 1–2 Auswahlen (Fläche/Kante/Ecke) | `inspect.measure` → Abstand mm, Winkel ° | zod | T/measure.test.ts | |
| 169 | Messen lokal (≈) | R/viewer/measure.ts:41, 71, 92-100 | Kreis-/Geradentoleranz 0,02 mm; parallel ab < 0,01°; Winkel 0–90°, 3 Stellen | Sofortwert aus dem Netz, bis SolidCraft antwortet | als „≈“ markiert (R/viewer/SelectionActions.tsx:216-221) | T/measure.test.ts | |
| 170 | Abstandsmessung | M/solidcraft/actions.ts:184-188, 219-239; S/contract.ts:917 | 2–200 Körper, Spalt 0–5 mm; je ≤ 100 Paare | `inspect.clearance`; Netzkörper („unchecked“) werden ausgelassen | Auslassung ohne Meldung (D8) | T/actions.test.ts | |
| 171 | Gelenk fahren | M/solidcraft/supervisor.ts:731-741; S/contract.ts:919-921 | Gelenk ≥ 0, Index 0–5, Wert ±100 000 | `joint.drive`; SolidCraft klemmt auf die Limits | zod | keiner eigens | |
| 172 | Sweep | M/solidcraft/actions.ts:153-178; S/contract.ts:923-927 | ≤ 40 Sweeps | `joint.sweep`; „budget“/abgelehnt = durchgelaufen | – (D8) | T/actions.test.ts | |
| 173 | `SNAP_SPAN` | M/solidcraft/actions.ts:195, 199-202 | 6° / 4 mm vor dem Limit | Stopp so nah am Limit gilt als Schnapper, wenn die Endlage frei ist | – (D11) | T/actions.test.ts | |
| 174 | `REACHED` | M/solidcraft/actions.ts:196 | 0,5° / 0,1 mm | wie `AT_LIMIT` (Nr. 38), zweite Stelle | Doppelung | T/actions.test.ts | |
| 175 | Normteil-Familien | M/solidcraft/standardParts.ts:11; S/contract.ts:776 | 8 metrische Familien | `parts.insert {family, size, length?, at}` | zod-Enum | T/standardParts.test.ts | |
| 176 | Normteil: Länge | S/contract.ts:791 | > 0 … 1000 mm, optional | – | zod | T/standardParts.test.ts | |
| 177 | Normteil-Erkennung `LIBRARY_PARTS` | M/solidcraft/standardParts.ts:52-70 | 12 feste Familiennamen (auch Zoll) | Körper zählt als Normteil → nicht geprüft, nicht exportiert | feste Liste (shortcut Zeile 50) | T/standardParts.test.ts | |
| 178 | Normteil-Merkliste | M/solidcraft/standardParts.ts:8, 41-44 | Metadaten-Schlüssel; ≤ 500 Namen | – | – | T/standardParts.test.ts | |
| 179 | Spiegel: Exportqualität | M/solidcraft/mirror.ts:278; M/solidcraft/actions.ts:76; M/solidcraft/dimensions.ts:172 | `3mf-tagged`, `quality: 'standard'` | Netz, auf dem die Druckprüfung rechnet | Sehnenfehler von „standard“ nirgends beziffert | T/mirrorRevision.test.ts | |
| 180 | Spiegel: nur sichtbare Körper | M/solidcraft/mirror.ts:268-270 | – | ausgeblendete Körper werden weder geprüft noch exportiert | – (D24) | T/structure.test.ts | |
| 181 | Spiegel: `MAX_SKETCH_SEGMENTS` | M/solidcraft/mirror.ts:205 | 250 000 | weitere Skizzen werden nicht gezeigt | – | keiner eigens | |
| 182 | Spiegel: Gelenke | M/solidcraft/mirror.ts:155-189 | ≤ 200 Gelenke, ≤ 6 Werte, Einheit deg/mm | – | – | T/structure.test.ts | |
| 183 | Funktionsblöcke (Formular) | S/contract.ts:803-880 | Größen M2–M10; Längen > 0 … 500 mm; Lippen-Spalt 0–5 mm; ≤ 99 weitere Punkte | siehe Prüfliste Werkzeuge/Tabellen | zod | T/blocks.test.ts | |
| 184 | Logo ändern | S/contract.ts:890-912 | Tiefe > 0 … 50 mm, Drehung ±360°, Breite > 0 … 1000 mm, Texthöhe > 0 … 500 mm | – | zod | T/logoMove.test.ts | |
| 185 | Zeitleiste | S/contract.ts:937-940; M/solidcraft/supervisor.ts:1008-1011 | Position 0–5000 oder `end`; Feature unterdrücken | `timeline.roll_to`, `timeline.suppress` | zod | keiner eigens | |

### 8 Plattenansicht (R/viewer)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert / zulässiger Bereich | Was es geometrisch bewirkt | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| 186 | Abstand zwischen Teilen | R/viewer/motion.tsx:42 | 5 mm | – | – | T/nesting.test.ts | |
| 187 | Rand zum Bett | R/viewer/motion.tsx:42 | 6 mm | – | Druckprüfung rechnet ohne Rand (D38) | T/nesting.test.ts | |
| 188 | Drehschritte | R/viewer/motion.tsx:42; R/viewer/nesting.ts:29-30 | 24 (je 15°) | – | Druckprüfung nur 0°/90° (D2) | T/nesting.test.ts | |
| 189 | Umriss | R/viewer/nesting.ts:8-9 | konvexe Hülle (shortcut), ≤ 4000 Punkte | – | – | T/nesting.test.ts | |

## Was die Druckprüfung erkennt und was nicht

Algorithmus in Reihenfolge (G/printCheck.ts:328-418, R/print/usePrintCheck.ts:26-87):

1. Feature-Fehler und -Warnungen aus der Zeitleiste (ohne unterdrückte/zurückgerollte).
2. Jeder Körper mit Flächen wird auf seine Druckfläche gedreht (sonst wie konstruiert).
3. Größe: gemeinsame XY-Box aller Körper und Höhe des höchsten gegen den Bauraum, 0°/90°.
4. Wände: je (abgetastetem) Dreieck ein Strahl vom Schwerpunkt ins Material, höchstens `minimumWall` weit;
   Gegenfläche muss innerhalb 10° gegenläufig sein.
5. Berührung zwischen Körpern an Eckpunkten (≤ 0,05 mm oder im Volumen).
6. Überhang je Körper auf eigenem Bett: Dreiecksnormale gegen Limit + 1°; kleine, getragene Flecken (≤ 4,5 × Düse)
   werden herausgenommen.
7. Auflage: Summe der vollständig auf dem Bett liegenden Flächen aller Körper < 25 mm².
8. Danach über SolidCraft: `inspect.clearance` (Überlappung, Spalt < push) und `joint.sweep` (Anschlag vor dem Limit).

| Fehlerbild | Wird es erkannt? | Fundstelle / Grund |
|---|---|---|
| Wand < 2 Linien, parallel begrenzt | ja, am Dreiecksschwerpunkt | G/printCheck.ts:167-191; Lücken siehe D6, D7 |
| Wand, die sich verjüngt (Keil ≤ 10°) | nur, wenn ein Schwerpunkt im dünnen Bereich liegt | D6 |
| Keil > 10°, Messerkante, Spitze, Mindestdetail < Düse | nein (bewusst ausgenommen) | G/printCheck.ts:103-109; D14 |
| dünner Boden/Deckel (Dicke in Z) gegen Schichthöhe | nein; wird wie eine Wand gegen Linienbreite bewertet | D4 |
| schmaler Schlitz/Spalt **innerhalb** eines Körpers | nein | Strahlen laufen nur ins Material; D14 |
| Brücken (Länge, Spannweite) | nein | Slicer überlassen (docs/feature-catalog.md:37); Regeltext nennt 10 mm; D15 |
| schwebender Anfang (lokales Tief über dem Bett) mit Flanken ≤ Limit | nein | nur Flächenwinkel; D13 |
| waagrechte Decke/Auskragung > 4,5 × Düse | ja, als Hinweis (gelb) | G/overhang.ts:86-167 |
| Auskragung ≤ 4,5 × Düse (auch 90°) | nein (zählt als grenzwertig) | D18 |
| nicht geschlossenes / nicht mannigfaltiges Netz | nein; `openEdges` wird berechnet und verworfen | D12 |
| Selbstdurchdringung eines Körpers | nein | kein Schritt dafür; D12 |
| mehrere lose Schalen in einem Körper | nur über SolidCrafts Feature-Warnung „separate pieces“ | M/print/printCheckNote.ts:38-40 |
| Durchdringung zweier Körper | ja, über SolidCraft; über das Netz nur an Eckpunkten | G/printCheck.ts:438-443; D8, D41 |
| Elefantenfuß / Rundung an der Bettkante | nein | D16 |
| zu wenig Auflage je Körper | nur als Summe aller Körper | D3 |
| Kippen (Schwerpunkt, Höhe zu Standfläche) | nein | D17 |
| Loch liegend/stehend, Lochaufmaß, Tropfenform | nein | nur Regeltext (M/print/printProfiles.ts:231, 302) |
| Print-in-place-Spalt < max(0,3; Düse) | nur, wenn < `push` des Materials | D10 |
| Verzug, Schichtrichtung unter Last, Kerben | nein | – |
| Netzkörper (STL-Import) gegen andere Körper | nein (SolidCraft „unchecked“) | M/solidcraft/actions.ts:181-183; D8 |
| Gelenk ohne Limits | wird nie gefahren | D42 |

## Export: Formate, Einheiten, Verluste

| Weg | Format | Was geschrieben wird | Was verloren geht / ungeklärt ist |
|---|---|---|---|
| Export-Menü (M/index.ts:808) | 3MF | sichtbare Körper ohne Normteile, Lage wie konstruiert, Gelenke wie gestellt | Parameter, Zeitleiste, Druckfläche (D21), Qualität nicht gesetzt (D22); Einheit und Farben nicht geprüft |
| Export-Menü | STL | wie oben; laut E/solidcraft.contract.spec.ts:176-177 binär, Würfel = 12 Dreiecke | Einheit (STL hat keine), Körpergrenzen bei mehreren Körpern (nicht geprüft), Flächennamen, Farben |
| Export-Menü | STEP | wie oben | Parameter und Zeitleiste; Rest nicht geprüft |
| Teilen-Paket (M/index.ts:838) | 3MF + STEP + PNG + MD | wie Export, dazu Beschreibung | „Stützen“-Aussage nicht gedeckt (D5) |
| An den Slicer (M/solidcraft/supervisor.ts:456) | 3MF von SolidCraft nach `%LOCALAPPDATA%\SolidCraft\slicer` | Körper auf ihrer Druckfläche (docs/engineering-notes.md, Abschnitt „Slicer“) | einziger Weg, der die Druckfläche anwendet |
| Projektpaket (M/index.ts:1055) | `.partbuddy` (zip) | Projektordner ohne `exports` | – |
| Prüfkörper (M/index.ts:1166) | 3MF aus `solidcraft-cli run --out` | drei Prüfkörper | – |

## Befunde

| Kennung | Schwere | Datei:Zeile | Ist | Soll (mit Quelle/Begründung) | Nachstellen |
|---|---|---|---|---|---|
| D1 | A | G/printCheck.ts:261-280, 310-319; M/print/printCheckNote.ts:23 | Breite und Tiefe werden über **alle** Körper gemeinsam genommen („Width and depth of all bodies together“), in der Lage, in der sie konstruiert (bzw. um den Ursprung gedreht) sind. Zwei kleine Teile, die 300 mm auseinander konstruiert sind, ergeben `size`/`block` „the part is 320 × … mm“. | Jeder Körper für sich gegen den Bauraum: Der Slicer legt jedes Objekt einzeln (G/printCheck.ts:14-17), und die Plattenansicht verteilt auf mehrere Platten (R/viewer/nesting.ts:1-4). | Zwei Würfel 20 mm bei x = 0 und x = 300, Drucker 256³ → Ampel rot, obwohl beide passen. |
| D2 | A | G/printCheck.ts:314-318 | Passt nur, wenn die achsparallele Box in 0° oder 90° passt. Ein Stab 300 × 10 × 5 mm auf 256 × 256 wird blockiert, obwohl er diagonal (362 mm) liegt. | Lage um Z frei prüfen (kleinste umschließende Box bzw. dieselben 15°-Schritte wie R/viewer/motion.tsx:42); sonst sagt die Ampel „passt nicht“, während die Plattenansicht das Teil legt. | Quader 300 × 10 × 5, Drucker 256³ → `size`/`block`; Plattenansicht legt ihn schräg. |
| D3 | A | G/printCheck.ts:371, 389, 410 | `onBed` wird über alle Körper addiert und einmal gegen 25 mm² verglichen. Ein Körper mit 100 mm² Auflage verdeckt einen zweiten, der auf einer Kante oder Spitze steht. | Auflage je Körper prüfen, weil jeder für sich auf dem Bett liegt (G/printCheck.ts:14-17). | Körper 1: Würfel 20 mm; Körper 2: Kugel Ø 20 → kein `contact`-Befund. |
| D4 | A | G/printCheck.ts:20-26, 167-191, 343-351; M/print/printCheckNote.ts:26; R/i18n/de.json:1120 | Die Wandprüfung ist richtungsblind und kennt keine Schichthöhe. Ein waagrechter Boden von 0,3 mm (1–2 Schichten bei 0,2 mm) wird als „dünner als die Düse: werden nicht gedruckt“ blockiert; ein Boden von 0,6 mm (3 Schichten) wird als „unter zwei Linien“ gewarnt. Umgekehrt wird die Regel „Boden ≥ max(0,8; 4 Schichten)“ (M/print/printProfiles.ts:283) nicht geprüft. | Dicke entlang der Druckrichtung gegen Schichthöhe (ganze Schichten), Dicke quer dazu gegen Linienbreite; Schichthöhe ins `PrintCheckProfile`. Die Aussage „wird nicht gedruckt“ ist für eine waagrechte Haut ≥ 1 Schicht falsch. | Platte 30 × 30 × 0,3 mm flach auf dem Bett → `thinWall`/`block`. |
| D5 | A | M/share/description.ts:32-34, 84; M/index.ts:882 | Die Beschreibung des Teilen-Pakets schreibt „Supports: none needed, it prints as designed“ / „keine nötig, druckt wie konstruiert“, sobald irgendeine Prüfung vorliegt und sie keinen `overhang`-Befund hat. `check.status` wird übergeben, aber nicht ausgewertet (auch bei `block`); die Revision der Prüfung wird nicht mit dem Design verglichen (anders als M/index.ts:374); Körper mit Druckfläche drucken gerade nicht „wie konstruiert“; und die Prüfung selbst lässt kleine Überhänge, +1° Toleranz, Brücken und schwebende Anfänge aus und sagt „the slicer decides“ (M/print/printCheckNote.ts:29). | Keine Zusage „keine Stützen nötig“ aus einer Prüfung, die das ausdrücklich dem Slicer überlässt; bei `block`, veralteter oder laufender Prüfung „nicht geprüft“ bzw. den Befund nennen; Lage (Druckfläche) nennen. Öffentliche falsche Aussage = Schwere A. | Teil mit 1,5 mm waagrechtem Absatz rundum und zu dünner Wand → Teilen-Paket → `Beschreibung.md`. |
| D6 | A | G/printCheck.ts:179-188; docs/engineering-notes.md (Abschnitt „SolidCraft 0.40.0-rc.4“: plane Flächen werden als ihr Rand vernetzt, Würfel = 12 Dreiecke) | Gemessen wird nur am Schwerpunkt jedes Dreiecks. Eine plane Wandfläche hat seit rc.4 oft nur zwei Dreiecke; eine Wand, die sich von 2,5 mm auf 0,2 mm verjüngt (Neigung < 10°), hat an beiden Schwerpunkten > 0,9 mm → kein Befund, obwohl das untere Drittel unter zwei Linien und die Kante unter der Düse liegt. Die gemeldete Zahl „walls down to X“ ist außerdem nicht das Minimum der Fläche. | Dicke flächig abtasten (Raster oder Unterteilung auf ≤ Düsenbreite), Minimum je Fläche; sonst ist „nichts gefunden“ nicht belegt. | Prisma: Wand 20 mm hoch, 30 mm lang, oben 2,5 mm, unten 0,2 mm dick → Ampel grün. |
| D7 | B | G/printCheck.ts:98, 204-205 | `MIN_AREA` 1 mm² gilt je B-rep-Fläche, nicht in Summe. Viele kleine dünne Flächen (Schriftstege, Rippchen, Rasterstege unter 1 mm² je Seite) ergeben zusammen keinen Befund. | Schwelle auf die Summe je Körper bzw. je zusammenhängendem Bereich; 1 mm² ist ohne Herkunft („noise of the tessellation“ ist keine Messung). | 20 Stege 0,3 × 0,9 × 1 mm auf einer Platte → kein `thinWall`. |
| D8 | B | R/print/usePrintCheck.ts:56-62, 71-73; M/solidcraft/actions.ts:156, 181-188 | Scheitert `inspect.clearance` oder `joint.sweep` (Fehler, Zeitlimit), werden die Befunde still weggelassen (`.catch(() => null)` / `.catch(() => [])`) und die Ampel zeigt den Netz-Stand als Endergebnis. Netzkörper, die SolidCraft als „unchecked“ meldet, werden ebenfalls ohne Hinweis ausgelassen. | Nicht gemessen ist ein eigener Zustand: Hinweis „Abstand/Bewegung nicht geprüft“ an Nutzer und Assistent statt grün. | Abstandsmessung im Fake-SolidCraft fehlschlagen lassen, zwei sich durchdringende Körper ohne gemeinsame Eckpunkte → grün. |
| D9 | B | R/print/usePrintCheck.ts:54-62; G/printCheck.ts:444-446; M/print/printProfiles.ts:261, 303; S/designFit.ts:33-36 | Der Assistent bekommt die Passungen auf die Düse skaliert (`scaleClearance`: Wert × Düse / 0,4), die Prüfung vergleicht den Spalt mit dem unskalierten `clearance.push`. Bei 0,6-mm-Düse baut der Assistent 0,225 mm, die Prüfung warnt erst unter 0,15 mm; bei 0,2-mm-Düse baut er 0,075 mm und wird gewarnt. | Eine Quelle für beide: dieselbe skalierte Zahl in Regeltext und Prüfung. | PLA, Düse 0,2: zwei Körper mit 0,1 mm Spalt → `tight` „under the push fit of 0.15 mm“, obwohl der Regeltext 0,08 mm nennt. |
| D10 | B | G/printCheck.ts:444-450; S/designFit.ts:28-31; M/print/printProfiles.ts:275 | Für zusammen gedruckte bewegliche Teile verlangt der Regeltext einen Spalt von max(0,3; Düse). Die Prüfung meldet Spalte nur unter `push` (PLA 0,15 mm). Ein Scharnier mit 0,2 mm Spalt bleibt grün, obwohl es nach der eigenen Regel verschmilzt. | Für Körperpaare, die ein Gelenk verbindet (aus `joint.list` bekannt), gegen `printInPlaceGap` prüfen. | Scharnier über `partbuddy_mechanism`, danach Spaltparameter auf 0,2 mm → kein Befund. |
| D11 | B | M/solidcraft/actions.ts:158-176, 195-202 | Ein Anschlag innerhalb 6° bzw. 4 mm vor dem Limit gilt als Schnapper und wird nicht gemeldet, wenn die Endlage frei ist. Ein Schieber, der kurz vor dem Limit durch einen 3 mm dicken Steg fährt und dahinter frei ist, bleibt grün. Die Zahlen 6°/4 mm haben keine Herkunft; geprüft wird nur Index 0. | Schnapper nur dort annehmen, wo PartBuddy einen gebaut hat (Verschluss, Rasthaken), oder die Überdeckung am Anschlag messen und gegen die zulässige Dehnung halten. | Schieber mit Limit 20 mm, bei 17–19 mm ein 2 mm breiter Steg im Weg → kein `blocked`. |
| D12 | B | G/edges.ts:77, 103; G/renderMesh.ts:51; G/printCheck.ts (ganz) | Es gibt keinen Schritt für offenes/nicht mannigfaltiges Netz oder Selbstdurchdringung. `deriveEdges` zählt offene Kanten, `buildRenderMesh` verwirft die Zahl. docs/feature-catalog.md:112, 133 nennt „mesh closed“/„mesh check“ als Prüfstufe. | Offene Kanten als Befund (`block`), mindestens für importierte Netzkörper; Selbstdurchdringung über SolidCraft (Phase 2 klären, welcher Befehl). | STL mit fehlendem Dreieck importieren → Ampel grün. |
| D13 | B | G/overhang.ts:37-45, 86-167 | Überhang wird nur nach Flächenwinkel bewertet. Ein Bereich, der an einem Punkt oder einer Kante über dem Bett beginnt und mit ≤ Limit ansteigt (umgekehrtes Dach, 45°-Kegel unter einer Brücke), beginnt in der Luft und wird nicht gemeldet. | Lokale Tiefpunkte je Körper suchen, die nicht auf dem Bett liegen (Eckpunkt ohne tieferen Nachbarn) → Hinweis „beginnt in der Luft“. | Portal 40 mm breit, mittig unter dem Balken ein Kegel mit 45°-Flanken nach unten, Spitze 5 mm über dem Bett → nur der Balken wird genannt, der Kegel nicht. |
| D14 | B | G/printCheck.ts:103-109, 167-191; M/print/printProfiles.ts:265, 279, 301 | Mindestdetail (< Düse), Messerkanten/Keile > 10°, Schriftstriche < 2 × Düse und Schlitze innerhalb eines Körpers werden nicht geprüft; der Regeltext nennt die Grenzen nur. | Prüfung für Detailbreite (Strahl auch nach außen für Schlitze; Keile bis zur Breite „eine Düse“ auswerten statt ganz auszunehmen). Harte Prüfung vor Prompt-Zeile (AUFTRAG.md, Phase 5). | Geprägter Text mit 0,2 mm Strich; Schlitz 0,1 mm breit, 10 mm tief → grün. |
| D15 | B | M/print/printProfiles.ts:231-232 | „bis etwa 10 mm überbrückt der Slicer“ (Löcher und Decken) steht fest im Text, unabhängig von Material und Düse, ohne Quelle im Code („common design-for-printing advice“), und wird nirgends gemessen. | Wert mit Quelle in die Fachtabelle (Phase 3), je Material; Brückenlänge messen und als Hinweis melden. | Decke 30 mm frei zwischen zwei Wänden: wird als Überhang (gelb) gemeldet, ohne Länge; Decke 9 mm bei TPU: kein Unterschied zu PLA. |
| D16 | B | M/print/printProfiles.ts:230, 271; R/viewer/SelectionActions.tsx:21 | Rundung an einer Bettkante und fehlende Elefantenfuß-Fase werden nicht geprüft; die Oberfläche bietet „Rundung“ an jeder Kante mit 1 mm an, auch an der Bettkante. | Kante auf dem Bett mit Rundung → Hinweis; fehlende Fase an Bettkanten von Passflächen → Hinweis. | Würfel, untere Kanten mit 2 mm runden → je nach Reichweite kein Befund (Radius ≤ 1,8 mm wird als „klein“ herausgenommen). |
| D17 | B | G/printCheck.ts:102 | 25 mm² Mindestauflage ist eine feste Zahl ohne Herkunft, unabhängig von Höhe, Masse und Lage des Schwerpunkts. Ein Turm 5 × 5 × 200 mm ist grün. | Auflage im Verhältnis zu Höhe/Schwerpunkt (Schwerpunkt über der Standfläche, Schlankheit), Zahl mit Quelle aus Phase 3. | Quader 5 × 5 × 200 stehend → grün. |
| D18 | B | G/overhang.ts:64-73; M/print/printProfiles.ts:232 | Die Prüfung nimmt Überhänge bis 4 × 1,125 × Düse heraus (0,4 → 1,8 mm; 0,8 → 3,6 mm), auch waagrechte Absätze; der Regeltext sagt dem Assistenten fest „Absätze bis 1,5 mm“. Zwei Zahlen für dieselbe Sache, eine skaliert, eine nicht. Die Herleitung (OrcaSlicer „Ignore small overhangs“, TreeSupport.cpp) ist ohne Version/URL angegeben. | Eine Zahl aus einer Tabelle mit Quelle; in Phase 3 gegen Slicer-Quelltext und Druck prüfen, ob 90°-Absätze von 1,8 mm bzw. 3,6 mm sauber drucken. | Würfel mit rundum 1,7 mm waagrechtem Absatz, Düse 0,4 → kein Befund; Regeltext verbietet ihn. |
| D19 | C | G/overhang.ts:26-31, 39; M/print/printCheckNote.ts:29 | Stütze erst ab Limit + 1°; die Meldung sagt „lean more than 45°“. 45,9° bleibt unerwähnt. | Toleranz gegen Rundung der Normalen genügt mit 0,1°; oder die Meldung nennt die wirkliche Schwelle. | Fase 46° zur Senkrechten an der Unterseite, PLA → kein Befund. |
| D20 | B | G/printCheck.ts:286-287; M/projects/assembly.ts:41-62; M/index.ts:1263-1273 | PartBuddy merkt sich die Druckfläche als Flächen**name** in `print-faces.json`; SolidCraft hält die eigentliche Druckfläche und meldet sie nicht zurück. Nach Rückgängig („shortcut“ in assembly.ts:44) oder wenn die Fläche nach einem Umbau anders heißt, prüft PartBuddy still „wie konstruiert“, der Slicer bekommt die Druckfläche. | Druckfläche aus einer Quelle; bis SolidCraft sie meldet: bei nicht auffindbarem Namen Hinweis statt stillem Rückfall, und nach Rückgängig neu lesen (`printFaceName`, M/solidcraft/supervisor.ts:475). | Druckfläche setzen, Strg+Z → `print-faces.json` hält sie weiter; Prüfung und Slicer laufen auseinander. |
| D21 | B | M/solidcraft/supervisor.ts:219-241; M/print/printCheckNote.ts:60; M/print/printProfiles.ts:304; M/share/description.ts:42 | Die Prüfung rechnet „each body lying on its print face“, der Regeltext sagt „the check and the slicer then lay it on that face“. Der Export über das Menü und das Teilen-Paket rufen `file.export` ohne jede Lageangabe; nur `file.send_to_slicer` legt laut docs/engineering-notes.md die Körper auf die Druckfläche. Das Teilen-Paket nennt sein 3MF „ready for the slicer“. | Entweder legt auch der 3MF/STL-Export auf die Druckfläche, oder Oberfläche und Beschreibung sagen, dass die Datei wie konstruiert liegt. In Phase 4 am echten SolidCraft nachmessen. | Deckel mit Druckfläche oben; 3MF exportieren, wieder einlesen, Lage gegen die Prüfung halten. |
| D22 | B | M/solidcraft/supervisor.ts:232; M/solidcraft/mirror.ts:278 | Der Export des Nutzers setzt keine `quality`; die Prüfung rechnet auf `quality: 'standard'`. Welcher Sehnenfehler in STL/3MF landet, steht nirgends, und der Nutzer kann ihn nicht wählen. | Qualität ausdrücklich setzen und beziffern (Sehnenfehler in mm) – Maßhaltigkeit runder Passflächen hängt daran; SolidCraft roh bietet die Wahl. | Zylinder Ø 10 als STL exportieren, Dreiecke zählen, Sehnenfehler messen. |
| D23 | B | M/index.ts:808-823, 838-849; M/solidcraft/supervisor.ts:222-224; R/shell/DesignActions.tsx:121-127 | Export und Teilen prüfen weder `assistantIdle()` noch, ob die Spiegelung oder die Messung der Prüfung läuft. Exportiert wird mit der Körperliste der letzten Spiegelung; die Rückfrage bei Rot liest den Prüfstand, der gerade noch misst oder zur vorigen Revision gehört. | Vor dem Export auf Spiegelung und Prüfung der aktuellen Revision warten; während der Assistent baut, sperren oder deutlich sagen. | Während eines Assistentenschritts „Export › STL“ auslösen. |
| D24 | C | M/solidcraft/mirror.ts:268-270; M/solidcraft/supervisor.ts:222-224; R/i18n/de.json:542-550 | Ausgeblendete Körper werden weder geprüft noch exportiert; die Hinweise im Export-Menü sagen das nicht. | Im Menü sagen („sichtbare Körper“) oder beim Export nennen, was fehlt. | Zwei Körper, einen ausblenden, 3MF exportieren. |
| D25 | B | M/solidcraft/actions.ts:22-39; R/viewer/SelectionActions.tsx:21, 32-45 | Die Aktionen der Auswahl reichen `solid.fillet`, `solid.chamfer`, `solid.hole`, `solid.shell`, `solid.press_pull` roh durch: Bohrung ohne Lochaufmaß und ohne Blick auf die Lage (liegend → Tropfen), Schale ohne Mindestwand, Rundung auch an Bettkanten. Geprüft wird erst danach durch die Ampel, die Löcher und Bettkanten gar nicht kennt. | „Nicht besser als SolidCraft roh“ (AUFTRAG.md, Schwere B): dieselben Tabellen wie die Funktionsblöcke nutzen (Aufmaß, Mindestwand) und vor dem Anwenden einen Hinweis geben. | Fläche wählen › Bohrung 3 mm in eine senkrechte Wand → Ø 3,00 ohne Aufmaß, runde Decke. |
| D26 | C | R/viewer/SelectionActions.tsx:21 | Startwerte „typical for FDM“ ohne Herkunft und unabhängig vom Drucker; Schale 1,6 mm ist kein ganzes Vielfaches der Linienbreite 0,45 mm (1,35 / 1,8), die der Regeltext verlangt (M/print/printProfiles.ts:283). | Startwerte aus `designFit` für den Drucker in Gebrauch. | Aktion „Schale“ öffnen: Feld zeigt 1,6. |
| D27 | B | M/print/printProfiles.ts:35-58 | Die fünf Startmaterialien tragen 30 Zahlen (Überhang, Lochschwund, vier Passungen) ohne Quelle; PETG, PETG-CF und ASA sind identisch. Der Kommentar nennt sie „a start that the user corrects“. | Jede Zahl mit Quelle (Phase 3) oder aus dem Materialkatalog mit Quellen (docs/feature-catalog.md:80) statt einer zweiten, unbelegten Tabelle; Abgleich beider Tabellen. | Lesen; Abgleich mit `materialCatalog` in der Prüfliste Fachtabellen. |
| D28 | B | S/contract.ts:1056-1057; R/print/PrintProfilesEditor.tsx:208-209 | Düse 0,1–2 mm und Schicht 0,04–1,2 mm sind unabhängig: Schicht 1,2 mm bei Düse 0,1 mm wird gespeichert. Daraus rechnen `designLines` Fasenhöhen und Böden. | Schicht ≤ etwa 80 % der Düse (Quelle in Phase 3 festlegen) als Schemaregel mit verständlicher Meldung. | Einstellungen › Drucker: Düse 0,1, Schicht 1,2 → Speichern geht. |
| D29 | B | M/print/printProfiles.ts:265, 271, 275, 279, 283 | Feste Zahlen im Regeltext ohne Quelle und ohne Prüfung im Code: Spalt 0,2 mm; Radien 1/2/3 mm bei 30/100 mm; Innenradius ≥ max(1; 2 × Düse); Schnapparm ≥ 5 × Dicke, Einlauf 30–45°; Fasen 0,5 mm; Schrift ≥ max(0,6; 3 Schichten); Boden ≥ max(0,8; 4 Schichten). | Jede Zahl in eine Fachtabelle mit Quelle und Gültigkeit (Material, Düse); wo messbar, als Prüfung (AUFTRAG.md, Phase 5). | Lesen; je Zahl Zeile 91–102 der Prüfliste. |
| D30 | B | G/tagged3mf.ts:20-22, 42-59 | Der Parser liest per Regex mit fester Attributreihenfolge. Ein `<triangle>` ohne `ft:face` oder mit anderer Reihenfolge wird still übersprungen: das Netz hat dann Löcher, und Prüfung wie Ansicht rechnen ohne Fehler darauf. `unit` und `transform` des 3MF werden nicht gelesen. | Zahl der gelesenen Dreiecke/Eckpunkte gegen die Zahl der Elemente halten und sonst werfen („fails loudly“, wie G/faceTable.ts:71-73 es für `model.faces` tut); `unit="millimeter"` prüfen. | 3MF-Fixture: bei einem Dreieck `ft:face` entfernen → `parseTagged3mf` liefert ein Dreieck weniger ohne Fehler. |
| D31 | B | M/projects/versionCompare.ts:6-7, 44, 52-53 | „verschoben“ heißt: Volumen gleich (< 0,01 %) und Schwerpunkt > 0,05 mm gewandert. Eine im Körper versetzte Bohrung erfüllt das: Der Vergleich meldet „Körper verschoben um x mm“ und lässt die geänderten Bereiche weg. | „verschoben“ nur, wenn auch die Box um denselben Vektor wandert; sonst „geändert“ mit Bereichen. | Platte mit Bohrung, Version sichern, Bohrung 5 mm versetzen, „Mit jetzt vergleichen“. |
| D32 | C | docs/feature-catalog.md:106-117, 133-134 | Der Katalog beschreibt Prüfstufen R/L/TG/SC/SL/PD („A level is shown only when its proof exists“), ein „Check panel: timeline check (TC rules), mesh check“ und ein „print gate (findings need a solution with proof)“. Im Code unter M, R, S gibt es keine Prüfstufen, keinen Netz-Check (D12) und statt des Gates nur eine einmalige Rückfrage bei Rot (R/print/ExportConfirm.tsx:9-12). | Katalog an den Stand angleichen oder umsetzen; der Katalog sagt selbst, dass der Plan oben gilt (Zeile 13-14), die Tabellen darunter sind aber nicht als überholt markiert. | Suche nach „verification“ / `'TG'` in apps/desktop/src: keine Treffer. |
| D33 | C | docs/building-blocks.md:52 | „STEP fallback: `occt-import-js@0.0.23`, optional and lazily loaded“. In keiner `package.json` des Repos steht das Paket; STEP läuft über `file.insert_step` (M/projects/importFile.ts:57-59). | Zeile streichen oder als „nicht eingebaut“ kennzeichnen. | `grep occt-import-js` über alle `package.json`: keine Treffer. |
| D34 | C | R/i18n/de.json:1114; G/printCheck.ts:14-17, 283-301 | Die Fußzeile der Befundliste sagt „wie konstruiert (auf der untersten Stelle stehend)“. Körper mit Druckfläche werden aber auf dieser liegend geprüft. | Text wie in M/print/printCheckNote.ts:60 („lying on its print face when it has one“). | Druckfläche setzen, Ampel öffnen, Fußzeile lesen. |
| D35 | C | M/print/printCheckNote.ts:63; R/print/report.ts:11 | Der Assistent bekommt höchstens 12 Befunde, ohne Hinweis, dass es mehr gibt (Flächenlisten sagen „and N more“, die Befundliste nicht). | „… and N more findings“ anhängen. | Design mit 15 Feature-Warnungen → Notiz zeigt 12. |
| D36 | C | G/analysis.ts:9, 38-43, 62; G/index.ts:1 | `meshMetrics` und `overhangFindings` sind exportiert, in der App unbenutzt (nur G/geometry.test.ts). `overhangFindings` ist als Prototyp bezeichnet, nimmt das Bett bei z = 0 an und 60° als Grenze; `meshMetrics` prüft nicht, ob das Netz geschlossen ist. AUFTRAG.md Phase 4 will mit `meshMetrics` nachmessen. | Vor Phase 4: `meshMetrics` um die Geschlossenheit ergänzen (sonst ist das Volumen ohne Aussage), `overhangFindings` entfernen oder durch `overhangOf` ersetzen. | Suche nach Aufrufern außerhalb von G: keine. |
| D37 | C | G/printCheck.ts:94; G/overhang.ts:72; M/print/printProfiles.ts:297; S/designFit.ts:21 | Der Faktor 1,125 und die Formel „zwei Linien“ stehen an vier Stellen; die Herkunft von 1,125 steht an keiner. | Eine Funktion (`lineWidth`) mit Quelle (Slicer-Standard 0,45 mm bei 0,4-mm-Düse; in Phase 3 belegen), überall benutzt. | Lesen. |
| D38 | C | G/printCheck.ts:313-317; R/viewer/motion.tsx:42 | Die Größe wird vor dem Vergleich auf 0,1 mm gerundet (256,04 → passt) und ohne Rand gegen den vollen Bauraum gehalten; die Plattenansicht hält 6 mm Rand. | Ungerundet vergleichen; ein Rand, einmal festgelegt, für Prüfung und Platte. | Würfel 256,04 mm, Drucker 256³ → grün. |
| D39 | C | G/printCheck.ts:346-349 | Für `block` zählt die ganze dünne Fläche einer B-rep-Fläche, sobald ihr kleinster Wert unter der Düse liegt – auch wenn nur ein Bruchteil davon so dünn ist. | Fläche unter der Düse getrennt summieren. | Wand 0,8 mm mit 0,5 mm² großer Stelle von 0,3 mm → `block`. |
| D40 | C | G/printCheck.ts:111, 176-188 | Ab 40 000 Dreiecken wird jedes n-te geprüft und die Fläche mit n hochgerechnet; dünne Stellen zwischen den Stichproben fallen weg, Schwellen (1 und 5 mm²) werden mit geschätzten Flächen entschieden. | Alle Dreiecke prüfen (BVH-Strahlen sind billig) oder die Stichprobe im Befund nennen. | Körper mit Rändelung/Gewinde > 40 000 Dreiecke und einer 0,3-mm-Rippe. |
| D41 | C | G/printCheck.ts:225, 234-258 | Die Berührprüfung über das Netz sieht nur Eckpunkte (höchstens 4000 je Körper). Zwei sich kreuzende Stäbe ohne Eckpunkt im anderen bleiben unerkannt; dann trägt allein SolidCrafts Messung (siehe D8). | Kanten gegen Dreiecke schneiden oder die Netzprüfung als Vorprüfung kennzeichnen. | Zwei Quader 100 × 5 × 5 über Kreuz, Abstandsmessung aus → kein `separate`. |
| D42 | B | R/print/usePrintCheck.ts:66-70 | Gefahren wird nur zu vorhandenen Limits. Ein Gelenk ohne Limits (frei drehend) wird nie auf Anstoßen geprüft; mehr als 40 Sweeps werden still abgeschnitten. | Gelenke ohne Limit über `joint.find_limits` (docs/engineering-notes.md, rc.4) prüfen oder als „nicht geprüft“ melden; Abschneiden nennen. | Drehgelenk ohne `joint.limits`, Arm stößt bei 90° an → kein Befund. |
| D43 | C | M/index.ts:1150-1159 | Das Design und das Bild der Prüfkörper werden je Düse/Schicht im Cache gehalten und nie verworfen; der Export baut frisch (Zeile 1167). Nach einer Änderung an `testPieceSteps` zeigt das Bild alte Prüfkörper. | Cache-Schlüssel um die App-Version oder einen Hash der Schritte erweitern. | Prüfkörper-Bild öffnen, `testPieceSteps` ändern, Bild erneut öffnen. |
| D44 | B | M/projects/importFile.ts:57-59; M/solidcraft/supervisor.ts:249-276 | Netzdateien gehen ohne Einheit/Maßstab an `file.insert_mesh`; ein STL in Zoll oder Metern kommt in falscher Größe herein, ohne Frage und ohne Plausibilitätshinweis (nur die Ampel „zu groß“, wenn es zufällig den Bauraum sprengt). | Nach dem Import die Box nennen und bei unplausibler Größe (z. B. < 1 mm oder > Bauraum) nach der Einheit fragen; SolidCraft roh fragt auch nicht – hier kann PartBuddy besser sein. | STL eines 1-Zoll-Würfels (Koordinaten 0…1) importieren. |
| D45 | C | M/solidcraft/dimensions.ts:52, 66-74 | Höchstens 8 Parameter gleichen Werts werden probiert. Hat ein Design mehr als 8 Parameter mit z. B. 3 mm, kann der treibende fehlen; das Maßfeld sagt dann „kein Treiber“ und schickt zum Assistenten. | Alle Kandidaten probieren (je Probe wenige ms) oder nach Nähe zur Auswahl (Feature des Körpers) ordnen. | Design mit 10 Parametern = 3 mm; Kante wählen, die der zehnte treibt. |
| D46 | C | docs/ui-inventur.md:1-6 | Die UI-Inventur ist ein Verzeichnis der Bedienelement-**Familien** für das Styling (Stand 07.11.2026, `d782dcf`), kein Verzeichnis der Aktionen. Später Gebautes (Gelenk-Regler, Plattenansicht, Toleranzassistent) kommt nicht vor; eine Liste „was kann der Nutzer auslösen“ gibt es in der Doku nicht (die Kanäle in S/channels.ts:5-121 sind die einzige vollständige Liste). | Für Phase 4/7 gilt S/channels.ts als Inventar; die Doku sollte das sagen. | Lesen. |
| D47 | C | G/printCheck.ts:337 | Körper ohne Flächeneintrag werden von Größe, Wand, Überhang und Auflage ausgenommen, ohne Meldung; bestehen alle Körper nur daraus, ist das Ergebnis „ready“. Laut docs/engineering-notes.md spiegelt ein Netzkörper mit einem Flächeneintrag, der Fall sollte also nicht eintreten – abgesichert ist er nicht. | Körper ohne Flächen als „nicht geprüft“ melden. | `checkPrint` mit einem Körper mit leerer Flächentabelle aufrufen → `ready`. |

## Abgleich Doku ↔ Code (ohne Abweichung)

Geprüft und übereinstimmend:

- docs/feature-catalog.md:37 (R1: Ampel hält Bauraum, dünne Wände, Feature-Fehler, Bettkontakt, Überhang nur gelb) ↔ G/printCheck.ts:63-77, 408.
- docs/feature-catalog.md:68 (F2: Überlappung und Spalt < push als Warnung; Normteile und Netzkörper nicht gemessen) ↔ G/printCheck.ts:438-454, R/print/usePrintCheck.ts:28, M/solidcraft/actions.ts:181-183.
- docs/feature-catalog.md:71 (F5: 3MF, STEP, vier Bilder 1600 × 1200, Beschreibung, nie überschreiben) ↔ M/index.ts:838-895, M/solidcraft/supervisor.ts:302, M/share/freeFolder.ts:5-9.
- docs/feature-catalog.md:78 (F12: 15°-Schritte, 5 mm, 6 mm) ↔ R/viewer/motion.tsx:42.
- docs/feature-catalog.md:91 (G2: 0,5°/0,1 mm erreicht; 6°/4 mm Schnapper; `posed`) ↔ G/printCheck.ts:456, M/solidcraft/actions.ts:195-196.
- docs/feature-catalog.md:47 (B4: STEP/IGES, STL/3MF/OBJ) ↔ M/projects/importFile.ts:11-21.
- docs/feature-catalog.md:79 (F13: Linie = Düse × 1,125; Print-in-place-Spalt eine Düse, mindestens 0,3) ↔ S/designFit.ts:20-31.
- docs/engineering-notes.md (Slicer; Standard parts; `inspect.clearance`) ↔ M/solidcraft/supervisor.ts:456-469, M/solidcraft/standardParts.ts:8, M/solidcraft/actions.ts:219-239.

Abweichungen: D5, D18, D21, D32, D33, D34, D46.

## Nicht geprüft, weil …

- **Nicht gebaut, nicht gemessen:** Dieser Lauf liest nur. Jede Aussage über SolidCrafts tatsächliches Verhalten
  (Lage im exportierten 3MF/STL, Standard-Qualität von `file.export`, STL mit mehreren Körpern, Einheit im 3MF,
  Ergebnis von `inspect.clearance` für Netzkörper, `solid.hole` ohne `depth`) ist offen und gehört in Phase 2/4.
- **Sehnenfehler von `quality: 'standard'`:** im Repo nicht beziffert; damit ist offen, wie genau die Wandmessung auf
  gekrümmten dünnen Wänden ist.
- **Herkunft der Zahlen:** keine Online-Recherche in diesem Lauf (Phase 3). „Ohne Herkunft“ heißt: im Code und in den
  drei abgeglichenen Dokumenten steht keine Quelle.
- **Nicht gelesen** (kein oder nur mittelbarer Geometriebezug; Grenzwerte stammen aus dem Schema in S/contract.ts):
  M/solidcraft/logoMove.ts, machine.ts, headless.ts (nur `safeDesignFileName`/`isInside`), controlClient.ts,
  discovery.ts, engineChoice.ts, engineVersion.ts; M/projects/projectStore.ts, versionStore.ts, trash.ts,
  projectMeta.ts, sketches.ts.
- **Nur nach Grenzwerten durchsucht, nicht vollständig gelesen:** R/print/PrintProfilesEditor.tsx,
  ToleranceAssistant.tsx, R/viewer/nesting.ts (Kopf), motion.tsx, JointPanel.tsx, DimensionHud.tsx, Dimensions.tsx,
  BlockPanel.tsx, LogoPanel.tsx, PartPanel.tsx, PrintFaceButton.tsx, ViewTools.tsx, R/shell/ParametersSection.tsx,
  Viewer.tsx. Bedienelemente dieser Dateien, die keine Zahl an SolidCraft schicken, fehlen in der Prüfliste.
- **Nicht gelesen:** die übrigen Dateien unter R (Chat, Startseite, Einstellungen außer Druckprofil), `en.json`.
- **Tests:** G/*.test.ts nur nach Titeln; T/*.test.ts und E/*.spec.ts nur nach Dateinamen und einzelnen Treffern
  zugeordnet. Ob ein genannter Test den Grenzwert selbst (±1 Schritt) prüft, ist offen.
- **docs/building-blocks.md und docs/engineering-notes.md:** nach Stichworten zu Druckprüfung, Export, Import,
  Slicer, Abstand durchsucht und die Treffer gelesen, nicht Zeile für Zeile.
- **S/contract.ts:** Zeilen 640–950 und 960–1165 gelesen (Schemata dieses Bereichs); `bodyName`, `faceName`,
  `point3`, `finite` und alles davor nicht.
- **S/designFit.ts, S/blocks.ts, S/tolerances.ts, Materialkatalog:** gehören zur Prüfliste Fachtabellen; hier nur
  `lineWidth`, `printInPlaceGap`, `scaleClearance` gelesen.
