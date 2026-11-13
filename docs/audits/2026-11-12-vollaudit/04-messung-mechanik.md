# Phase 4 – Messung Mechanik (`partbuddy_mechanism`, Vorlage hingedBox)

Stand 12.11.2026. SolidCraft `0.40.0-rc.4` (portable, `mcp --headless` über das Harness, kein Fenster, App nicht
gestartet). Alle Werte stammen aus den Läufen vom 12.11.2026 und stehen in
`tools/audit/out/mechanik/<Szene>/result.json` (gesendete Befehle der Werkzeuge in `sent.json`).

Dateien: `tools/audit/cases/mechanik-hinge.case.ts`, `tools/audit/cases/mechanik-others.case.ts`,
`tools/audit/mechanik-helpers.ts` (eigene Hilfen, Harness unverändert), `tools/audit/mechanik-print.mjs` (Ausgabe).

Wiederholen (aus `apps/desktop`; 100 Szenen, zusammen rund 5 Minuten):

```
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts mechanik                      # alles
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts mechanik-hinge -t "<Teil>"    # unten als H "<Teil>"
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts mechanik-others -t "<Teil>"   # unten als O "<Teil>"
node ../../tools/audit/mechanik-print.mjs <Szenen-Präfix>                                        # Ergebnis lesen
```

Messwege: Spalt = `inspect.clearance` (exakt); Wände und Spalte entlang einer Linie = Strahl durch das Netz
(`ray`, gekrümmte Flächen bis 0,01 mm innen); Überhang = Dreiecke des Netzes nach Winkel zur Senkrechten in
Drucklage (`downFaces`: 90° = waagrechte Decke; Fläche über 45,5° / 40,5° / 35,5°; „Decke“ = Fläche über 89° mit
ihrer Hüllbox); Druckprüfung = `checkPrint` der App (PLA 0,4/45°, PETG 0,4/40°, Düse 0,6 und 0,8 bei 45°).

## Befunde

| Kennung | Urteil | Fall | Eingabe | gemessen | Soll | Befehl |
|---|---|---|---|---|---|---|
| T3 | bestätigt | mechanik-hinge (`t3-template-hingedbox`, `t3-tool-on-shells`) | `templateSteps('hingedBox')` unverändert; Vergleich: dieselben Schalen, Scharnier über das Werkzeug (Ø 8, Spalt 0,4, 5 Augen, `wall` 2,4) | Vorlage: Augen beginnen 12,007 mm über dem Bett, kein Steg. Überhang über 45°: Box 134,86 mm² (3 Augen je 26,23 mm², bis 87,2°), Lid 92,43 mm² (2 Augen je 28,68 mm²). Druckprüfung PLA: `warn`, Überhang 189 mm². Mit Werkzeug (5 Stege): Box 125,90 / Lid 74,85 mm², `warn` 174 mm² | „printable as designed, without support“ (templates.ts:4-5): kein Überhangbefund | H "T3" |
| T5 | bestätigt | mechanik-others (`slide-default`, `slide-min`, `slide-max`, `slide-max-gap1`, `slide-w20-h3`) | `kind: slide`, Platte 6 mm + Block darüber; Vorgaben (6 / 3 / 0,4); 2 / 1,5 / 0,2; 60 / 20 / 0,4; 60 / 20 / 1; 20 / 3 / 0,4 | Waagrechte Nutdecke: 13,932 mm breit (Vorgaben), 5,966 mm (kleinste), 27,932 mm (Breite 20), 101,932 mm (größte), 104,828 mm (größte, Spalt 1). Abstand Decke–Schienenkopf 0,400 mm (0,2 / 1,0). Deckenfläche 417,96 … 3144,84 mm². Druckprüfung PLA: in allen fünf Fällen `ready` (siehe N-mechanik-1) | Brücke höchstens 10 mm (printProfiles.ts:232) oder Decke als Dach; sonst Meldung | O "T5" |
| G1 | bestätigt | mechanik-hinge (`g1-lid-underside-lowest`, `g1-lid-in-the-air`), mechanik-others (`slide-default`) | Dose 40×30×30, Deckelblock auf z 22…30 (bzw. Platte z 27…30), `kind: hinge` Linie z 28,5 | Block z 22…30: Unterseite 1200 mm² liegt 22 mm über dem gemeinsamen Bett, zählt als Bettfläche (eigenes Bett z 22); Druckprüfung: nur 25 mm² am Stift der Dose, nichts zum Deckel. Platte z 27…30: Unterseite wird gemeldet (Überhang 1198 mm²), aber nur, weil der Stegfuß bei z 22,362 zum eigenen Bett des Deckels wird (4,87 mm² „Auflage“ in der Luft). Führung: Schieber auf eigenem Bett z 6,4, Auflage 602 mm², gemeinsam 0 mm² | Mit einem Gelenk verbundene Körper auf ein gemeinsames Bett | H "G1" |
| H-02 | teilweise | mechanik-hinge (`h02-one-component`, `h02-second-hinge`) | (a) beide Körper in einer Komponente, `kind: hinge`; (b) zweites Scharnier mit Vorgabename „Hinge“ | (a) bestätigt: Antwort „Not built: { "applied": [], … "error": "invalid parameters for `joint.create`: a joint needs two different occurrences …" …“, `isError`; dabei Base 4800 → 5333,728 mm³, Flap 4800 → 4855,691 mm³, 2 → 11 Features, 0 Gelenke. Zweiter gleicher Aufruf: wieder „Not built“, 20 Features. (b) der vorgeschlagene Nachstellweg ist widerlegt: SolidCraft nimmt den doppelten Gelenknamen an, kein Fehler – stattdessen N-mechanik-3. Logo-Teil (drawingTool) nicht messbar | Nach dem Bau entweder zurückgenommen und „Not built“, oder „Built …“ mit dem, was fehlt | H "H-02" |
| T6 | bestätigt | mechanik-others (`lid-d16`, `lid-d20`, `lid-d24`, Vergleich `lid-d25` … `lid-d200`) | `kind: lid`, Hals Ø 16 / 20 / 24 (Steigung 3) und 25 / 40 / 77 / 78 / 200 | Gesendeter Schnitt bei Ø 20: Fuß (9,8; ±1,45), Kamm (11,1; ±0,2) → radial 1,3, axial 1,25. Flanken am Hals im Netz: 46,11° und 46,24° (Ø 16), 46,12° / 46,30° (Ø 20), 46,12° / 46,38° (Ø 24); Fläche über 45,5°: 143,6 / 177,2 / 210,8 mm². Ab Ø 25: 44,99° … 45,22° (2 Gänge: bis 45,48°). Antwort des Werkzeugs: „a thread with 45° flanks“ | höchstens 45° | O "T6" |
| W4 | bestätigt | mechanik-hinge (`w4-default-lying-n06`, `-n08`, `w4-n06-smaller-gap`, `w4-n06-gap05`, `w4-n06-d7`) | Standardscharnier liegend bei Düse 0,6 und 0,8; dann dem Rat gefolgt | 0,6: „Not built: the barrel would be 0.795 mm thin over the bore's roof; use a larger diameter or a smaller gap“. 0,8: „… barrel wall around the pin would be 0.7 mm; use a diameter of at least 7 mm“. Rat „smaller gap“: `gap: 0.45` bei Düse 0,6 wird ohne Hinweis gebaut, Spalt gemessen 0,450 mm. Rat „larger diameter“: Ø 7 gebaut, Dach 1,025 mm, Wand 1,153 mm, Druckprüfung Düse 0,6: Dünnwand 1,0 < 1,35 mm | Standard-Ø aus der Düse; kein Rat zu einem Spalt unter der Düse | H "W4" |
| W6 | bestätigt | mechanik-hinge (`w6-n06-d8`) | Düse 0,6, `diameter: 8`, liegend | gebaut; Wand um die Bohrung 1,40 mm (Strahl 1,402 / 1,404), über dem Dach 1,26 mm; Druckprüfung Düse 0,6: Dünnwand 1,23 < 1,35 mm (41 mm²). Das Werkzeug nennt in derselben Antwort 1,35 mm als Mindesthaut | eine Regel: zwei Bahnen der Düse (1,35 mm) | H "W4" |
| W7 | bestätigt (erster Teil) | mechanik-hinge (`w7-skin`) | zwei Wände 1,8 mm, Linie 2,4 mm vor beiden, Ø 6; mit und ohne `wall` | mit `wall: 1.8`: abgelehnt („… leave a skin of 0.8 mm …“), nichts gebaut. Ohne `wall`: gebaut, Haut hinter dem Raum 0,802 mm (Strahl), Druckprüfung PLA: Dünnwand 0,8 < 0,9 mm (38 mm²); `roomDepths` hatte 1 mm Raumtiefe gemessen. Ausfall der Messung (`roomDepths` → null) nicht ausgelöst | Hautprüfung ohne `wall`, oder `wall` Pflicht | H "W7" |
| W8 | bestätigt | mechanik-hinge (`w8-line-2_5`, `w8-line-2_9`, `w8-line-2_99`) | Platten 5,0 / 5,8 / 5,98 mm auseinander, Ø 6 (Linie 2,5 / 2,9 / 2,99 mm vor jedem Körper) | alle drei gebaut, keine Warnung, ein Körper je Seite (1 Schale). Höhe der Anbindung des Auges an seine Platte: 3,338 mm (2,5), 1,600 mm (2,9), 0,633 mm (2,99) | Ablehnung, wenn die Überdeckung unter 0,5 mm liegt (Text mechanismTool.ts:22) | H "W8" |
| W9 | bestätigt | mechanik-hinge (`w9-line-in-wall`, `w9-probe`) | Wand 4,5 mm, Linie 0,5 mm in der Wand der festen Seite, `wall: 4.5` | `roomDepths` → `{ fixed: 0, moving: 1.4 }`; Antwort „rooms go 0 mm into Base“. `inspect.clearance` des Stabs: Base steht unter `overlaps`, nicht unter `near`. Gebaut trotz `wall`; Haut hinter dem Raum 0,603 mm (Strahl), Druckprüfung PLA: Dünnwand 0,6 < 0,9 mm | `overlaps` auswerten; Ablehnung wie bei W7 | H "W9" |
| T11 | bestätigt | mechanik-hinge (`hinge-default`, `hinge-support-d6`), mechanik-others (`slide-default`, `lid-d40`) | dieselben Bauten, Druckprüfung mit 45° (PLA), 40° (PETG), 35° (TPU) | Scharnier liegend: Überhangbefund 156 → 190 → 206 mm² (bei 40° kommen Dach und Dachflanken der Bohrung dazu). Scharnier mit Stegen: 90 → 150 mm² (Stegflächen mit 45° dabei). Führung: `ready` → `warn` 509 mm² (beide Schienenflanken, 45,0°). Schraubdeckel: 384 mm² Gewindeflanke am Hals über 40,5°, von der Druckprüfung nicht gemeldet (kleiner Überhang) | Schrägen nach `material.overhang` oder Hinweis | H "hinge lying", O "T5", O "T6" |
| T12 | teilweise | mechanik-hinge (`w4-default-lying-n06`, `t12-default-upright-n06`, `-n08`, `t12-n08-d7-upright`, `hinge-upright-d4`) | Scharnier ohne `diameter` bei Düse 0,6 / 0,8, liegend und stehend | Liegend 0,6: abgelehnt (siehe W4), also nicht „wird gebaut“. Stehend 0,6: gebaut, Rollenwand 0,894 mm, Dünnwand 0,89 < 1,35 mm. 0,8: Vorgabe liegend und stehend abgelehnt; der empfohlene Ø 7 stehend gebaut, Wand 0,949 mm, Dünnwand 0,94 < 1,8 mm. Düse 0,4, Ø 4, Spalt 0,2 stehend: Wand 0,801 mm, die eigene Druckprüfung meldet 0,8 < 0,9 mm | Wand- und Dachgrenze = zwei Bahnen der Düse | H "W4", H "hinge upright" |
| T13 | bestätigt | mechanik-others (`closure-default`, `closure-default-n06`) | `kind: closure` bei Düse 0,4 und 0,6, gleiche Körper | Bei 0,6 dieselbe Geometrie (Lid 9408,504 mm³ in beiden): Lippe 1,200 mm, Luft 0,250 mm; Druckprüfung Düse 0,6: Dünnwand 1,2 < 1,35 mm auf 1383 mm²; kein Hinweis in der Antwort | Maße aus der Düse, oder Warnung | O "T13" |

## Jede Mechanik mit Vorgaben und an den Grenzen

Drucklage: Scharnier und Führung wie konstruiert auf gemeinsamem Bett; Deckel (Verschluss, Schraubdeckel, Riegel)
gedreht auf seiner Oberseite. „Überhang“ = Fläche über 45,5° ohne Bettfläche. Körper überall geschlossen, je 1 Schale,
`inspect.interference` 0 (Ausnahme vermerkt).

| Mechanik / Szene | Eingabe | Körper | kleinster Spalt | größter Winkel / Fläche über 45° | längste Decke | dünnste Wand |
|---|---|---|---|---|---|---|
| Scharnier liegend `hinge-default` | Ø 6, Spalt 0,4, 3 Augen | 2 | 0,400 mm; axial 0,400 / 0,401; um den Stift 0,399 | 86,0° an Augen und Stift, Dach 90°; 166 mm² (Prüfung `warn` 156) | Dach der Bohrung 1,384 mm | über dem Dach 1,003 mm, unten 1,103 mm; kein Fund |
| `hinge-d5-gap02` (kleinstes liegendes) | Ø 5, Spalt 0,2 | 2 | 0,199 mm (axial) | 86,0° / 128,5 mm² | 1,056 mm | Dach 0,974 mm |
| `hinge-d40` | Ø 40 | 2 | 0,400 mm | 89,0° / 1120,5 mm² (`warn` 1048) | 7,576 mm | 9,07 mm |
| `hinge-gap1-d9` | Spalt 1, Ø 9 | 2 | 1,000 mm | 89,0° / 240,7 mm² | 2,368 mm | Dach 1,085 mm |
| `hinge-gap02` | Spalt 0,2 | 2 | 0,199 mm | 86,0° / 164,9 mm² | 1,238 mm | 1,212 mm |
| `hinge-knuckles9` | 9 Augen auf 30 mm | 2 | 0,400 mm (axial 0,399 … 0,400) | 87,6° / 166,9 mm² | 1,384 mm | Augen 2,978 mm lang |
| `hinge-knuckle-2_5` | 3 Augen auf 8,3 mm | 2 | 0,400 mm | 86,0° / 41,7 mm² (`ready`) | 1,384 mm | Augen 2,500 mm lang |
| Scharnier stehend `hinge-upright-d4` | Ø 4, Spalt 0,2, Linie senkrecht | 2 | 0,199 mm | 90° an den Stirnflächen der Augen, 18,8 mm² | Ring Ø 4 über 0,2 mm Luft | 0,801 mm; Fund 0,8 < 0,9 |
| Scharnier mit Stegen `hinge-support-default` | Blöcke 16 hoch, Linie auf der Kante, Ø 8 | 2 | 0,400 mm | 88,5° / 138,4 mm² (`warn` 121) | 1,748 mm | kein Fund |
| `hinge-support-d6` / `-d40` | Ø 6 / Ø 40 | 2 | 0,400 mm | 89,2° / 107,4 mm² (`warn` 90); 89,5° / 697,5 mm² (`warn` 619) | 1,384 / 7,576 mm | kein Fund |
| Führung `slide-default` | 6 / 3 / 0,4 | 2 | 0,400 mm (Flanke 0,566 waagrecht = 0,400 rechtwinklig) | 90° / 1020 mm² (Decke 418 + Unterseite 602, 0,4 mm über der Platte) | 13,932 mm | kein Fund |
| `slide-min` / `slide-max` / `slide-max-gap1` | 2 / 1,5 / 0,2; 60 / 20 / 0,4; 60 / 20 / 1 | 2 | 0,200 / 0,400 / 1,000 mm | 90° / 720; 4680; 4680 mm² | 5,966 / 101,932 / 104,828 mm | kein Fund |
| Steckverbindung Schwalbenschwanz `plug-dovetail-default` | Vorgaben, Spalt 0,2 | 2 | 0,200 mm | 90° / 1020 mm² | 12,966 mm | kein Fund |
| Verschluss `closure-default` | Wand 2, Raum 56×36, Ecken scharf | 2 | 0 (Rand auf Rand, gewollt); Lippe–Wand 0,250 mm | Deckel gedreht: 90° / 184,75 mm² (Fußring ohne Schräge, N-mechanik-14); Dose 60,3° / 3,2 mm² (Rille) | Ring 1,45 mm breit | Lippe 1,200 mm; kein Fund bei 0,4 |
| `closure-wall-1_6` / `-wall-10` / `-room-20x12` | Wand 1,6 / 10; Raum 20×12 | 2 | 0; Lippe–Wand 0,250 mm | wie oben; Raum 20×12: 61,2 mm² | – | Dosenwand an der Rille 1,154 mm (Wand 1,6) |
| `closure-radius-2` / `-radius-8` / `closure-flat` | Ecken r 2 / 8; flache Platte | 2 | 0; 0,250 mm | 90° / 9,7; 9,2; 0,7 mm² | – | Lippe 1,200 mm |
| Schraubverbindung `screw-default` | M3, Zylinderkopf, Einsatz; Deckel 6, Boden 12 | 3 (mit Schraube) | 0 (Körper liegen aufeinander, gewollt) | keine an Base und Cover | – | unter dem Kopf 2,600 mm; Durchgang Ø 3,4, Senkung Ø 6,7 × 3,4, Sitz Ø 4 × 6,7 |
| `screw-m2` / `-m6-insert` / `-m5-tapped` / `-m10-tapped` | Größen an den Grenzen | 2 / 3 / 3 / 3 | 0 | Gewinde M5 / M10: 60,5° / 62,1°, 108,9 / 420,6 mm² | – | unter dem Kopf 3,6 / 3,6 / 2,6 / 3,6 mm |
| `screw-countersunk-m3` / `-head-none` / `-more-3` / `-thinnest-cover` | Senkkopf; ohne Kopfraum; 4 Schrauben; Deckel 4,6 | 3 / 3 / 6 / 3 | 0 | keine | – | dünnster Deckel: 1,200 mm unter dem Kopf (Düse 0,6: Fund 1,2 < 1,35) |
| Schraubdeckel `lid-d40` | Hals Ø 40, 1 Gang, Spalt 0,3 | 2 | 0 (Deckel auf dem Rand, gewollt); Gewinde radial 0,300, axial 0,300 mm | 45,1° Hals, 45,4° Deckel gedreht; 0 mm² über 45,5° | keine | Deckelwand an den Rillen 1,653 mm, Decke 2,400 mm |
| `lid-d16` / `-d20` / `-d24` | Steigung 3 | 2 | 0; radial 0,300, axial 0,331 mm | 46,2° / 46,3° / 46,4°; 292 / 359 / 427 mm² (Hals + Deckel) | keine | 1,65 mm |
| `lid-d25` / `-d77` / `-d78` / `-d200` | Steigung 4 / 4 / 5 / 5 | 2 | 0; 0,300 mm | 45,3° / 45,7° / 45,7° / 46,6° (jeweils am Kegel der Deckelkante); 0 / 55,8 / 61,0 / 516,4 mm² (bei Ø 200 davon 284,7 mm² Gewindeflanke im Deckel mit 45,57°) | keine | – |
| `lid-d40-starts2` / `-starts3` / `-gap02` / `-gap06` | 2 und 3 Gänge; Spalt 0,2 / 0,6 | 2 | 0; radial 0,300 / 0,300 / 0,200 / 0,600 mm | 45,5° / 45,4° / 45,4° / 45,4° | keine | – |
| Schnapphaken `snap-default` | Wand 2, 0,5 mm über der Platte | 2 | 0,200 mm (Rast über Fensterkante; Arm–Wand 0,200) | 90° an der Rastfläche 4 mm² (0,8 × 5) und der Fensterdecke 11,2 mm² | Fenster 5,6 mm | Arm 1,500 mm; kein Fund |
| `snap-wall-1_6` / `-wall-10` / `-more-2` | Wand 1,6 / 10; 3 Haken | 2 | 0,200 mm | Fensterdecke 9,0 / 56 / 33,6 mm² | 5,6 mm | Arm 1,500 mm |
| Zapfen `peg-default` | Ø 5, Spalt 0,2 | 2 | 0 (Flächen liegen aufeinander, gewollt); um den Zapfen 0,200 mm, vor dem Zapfen 1,000 mm | Oberteil gedreht: keine. Wie konstruiert: Taschendecke Ø 5,4 = 23 mm² | 5,4 mm (wie konstruiert) | – |
| `peg-d3-gap005` / `-d20-gap05` / `-more-1` | Grenzen; 2 Zapfen | 2 | 0; 0,049 / 0,499 / 0,200 mm | wie konstruiert 0 / 346 / 46 mm² | 3,1 / 21 / 5,4 mm | – |
| Riegel `latch-default` | Breite 10, Dose 20, Deckel 10 hoch | 2 | 0 (Fuge; Haken liegt am Wulst an: `seat` 0, gewollt); Arm–Wand 1,500 mm | Deckel gedreht 45,0°, Dose 45,0°; 0 mm² | keine | Arm 1,600 mm |
| `latch-width-5` / `-width-40` | Grenzen | 2 | 0; 1,500 mm | 45,0° / 0 mm² | keine | 1,600 mm |

Abgelehnt mit zutreffender Meldung und unverändertem Modell (`unchanged: true`, Szenen `*-refused`): Scharnier Ø 3,9 /
40,1 / −6, Ø 4 liegend („0.74 mm thin over the bore's roof“), Spalt 0 / 0,19 / 1,01, Spalt 1 bei Ø 6, 1 / 4 / 11 Augen,
3 Augen auf 8,2 mm („2.467 mm per knuckle“), gleiche Körper, fehlender Körper, from = to; Führung Breite 1,9 / 60,1,
Höhe 1,4 / 20,1, Spalt 0,19 / 1,01, Linie 4,9 mm, `up` längs der Linie, `up` null; Verschluss Wand 1,5 / 10,1, Raum
19,9 / 11,9, Radius −1 / 30, `side` falsch, `up` quer, ungleiche Höhe, schräge Scharnierlinie; Schraube 1,19 mm unter
dem Kopf, M2 Senkkopf, M4 geschnitten, M8 Einsatz, M7, Griff 0,9 mm, Kopf „flat“, 41 weitere; Deckel Ø 15,9 / 200,1,
0 / 4 Gänge, Spalt 0,19 / 0,61, Name vergeben, Name = Behälter, Behälter fehlt, ohne Durchmesser; Schnapphaken Wand
1,5 / 10,1, `up` null, `to` längs `up`, 21 weitere; Zapfen Ø 2,9 / 20,1, Spalt 0,04 / 0,51, `shape` falsch, 21 weitere;
Riegel Breite 4,9 / 40,1, `up` null, `to` längs `up`. Nicht abgelehnt, obwohl unsinnig: N-mechanik-8 bis -13.

## Neue Befunde

| Kennung | Schwere | Datei:Zeile | Ist (gemessen) | Soll | Fall |
|---|---|---|---|---|---|
| N-mechanik-1 | A | packages/geometry/src/overhang.ts:86, :210-213 | Die Druckprüfung lässt eine waagrechte Decke fallen, deren Ecken alle auf gestützten Kanten liegen: Nutdecke der Führung 101,932 mm breit, 3057,96 mm²; `overhangOf` nach Winkel 3057,96 mm², mit dem Abzug kleiner Überhänge (`smallOverhangReach(0.4)` = 1,8 mm) 0 mm²; `checkPrint` → `ready`. Ebenso bei 13,932 mm (417,96 → 0) und 27,932 mm | Eine Decke, die weiter spannt als die Reichweite, bleibt Befund (Kopf von overhang.ts: „a ceiling … stays“) | `slide-max`, `slide-default`, `slide-w20-h3` (Feld `overhangRule`); O "T5" |
| N-mechanik-2 | A | apps/desktop/src/shared/mechanisms.ts:387-397 (mit :365-374); mechanismTool.ts:526 | Verschluss mit Deckelwänden: der Wulst endet auf der Wandebene der Dose (y 38,000; Lippe 37,750), Überdeckung mit der Dosenwand 0,000 mm statt 0,25 mm. Flacher Deckel (ohne Kerbe): 38,250, also 0,250 mm. Vorlage hingedBox ebenso: Wulst bis 38,600 bei Wandebene 38,600. Antwort: „a bead that snaps 0.25 mm into a rille“. Nach dem Code schneidet die Fingerkerbe (Zylinder Ø 16 ab der Wandebene) den Teil des Wulsts jenseits der Wand weg | Wulst 0,5 mm vor der Lippe, 0,25 mm in der Rille | `closure-default` (Felder `beadProfile`, `beadAlong`), `closure-flat`, `t3-template-hingedbox` (`beadReach`); O "T13", H "T3" |
| N-mechanik-3 | A | apps/desktop/src/main/agents/mechanismTool.ts:362-373, :117 | Zweites Scharnier mit dem Vorgabenamen: Antwort „Built … It turns from -145° to 67° … those are its limits now“. `joint.list`: zwei Gelenke „Hinge“, das zweite mit `limits: null`; die Zahlen stammen vom ersten (`joint.sweep` / `joint.limits` über den Namen). Derselbe Aufruf noch einmal: wieder „Built“, drittes Gelenk „Hinge“ zwischen denselben Teilen | Eindeutiger Name oder Gelenk über die Kennung ansprechen; ein zweites Gelenk zwischen denselben Teilen ablehnen | `h02-second-hinge`; H "H-02" |
| N-mechanik-4 | A | mechanismTool.ts:498; mechanisms.ts:121-143 | „… stand on webs at 45° down to their own walls, so they print without support“ – die eigene Druckprüfung meldet danach `warn`: 90 mm² (Ø 6), 121 mm² (Ø 8), 619 mm² (Ø 40), Winkel bis 89,5°. In den Schalen der Vorlage senken 5 Stege den Befund nur von 189 auf 174 mm² (je Auge 26,2 → 24,2 mm²) | Aussage nur, wenn die Prüfung nichts findet; sonst sagen, was übrig bleibt | `hinge-support-default`, `-d6`, `-d40`, `t3-tool-on-shells`; H "hinge with support", H "T3" |
| N-mechanik-5 | A | mechanisms.ts:132-134 | Der Steg läuft bis zur Wandebene, auch wo die Wand aufhört: Deckelplatte z 27…30, Stegfuß bei z 22,362, also 4,64 mm frei unter der Platte (Hüllkörper Lid z 22,362…31,5). Antwort wie N-mechanik-4 | Steg nur so tief, wie die Wand reicht; sonst kein Steg und ein Hinweis | `g1-lid-in-the-air`; H "G1" |
| N-mechanik-6 | B | mechanismTool.ts:20, :23; mechanisms.ts:216-260 | Führung „printed in one piece without support“: der Schieber liegt mit der ganzen Unterseite 0,400 mm über der Platte (602 mm² bei den Vorgaben, 1622 mm² am größten), dazu die Nutdecke; auf gemeinsamem Bett 0 mm² Auflage | Drucklage nennen oder setzen (wie die Vorlage slideStop), Aussage streichen | `slide-default`, `slide-max`; O "T5" |
| N-mechanik-7 | B | mechanisms.ts:92-101; mechanismTool.ts:20 | Stehendes Scharnier: die Stirnflächen der Augen sind waagrecht über dem Spalt: 9,4 / 8,7 mm² (Ø 4, Spalt 0,2), 23,6 / 16,8 mm² (Ø 6, Spalt 0,6), 28,9 / 21,5 mm² (Ø 7, Spalt 0,8); Druckprüfung `warn` Überhang 9 / 17 / 22 mm². Kein Hinweis in der Antwort | Hinweis oder schräge Stirnflächen | `hinge-upright-d4`, `t12-default-upright-n06`, `t12-n08-d7-upright`; H "hinge upright", H "W4" |
| N-mechanik-8 | B | mechanisms.ts:446-456, :476-483 | Schraube ohne Prüfung der Körper: Boden 5 mm bei 6,7 mm Sitz → Bohrung geht durch, Schraube ragt bis z −0,4 unter den Boden. 1 mm vom Rand: Sitz Ø 4 und Senkung Ø 6,7 brechen seitlich aus (Zylinderflächen in zwei Teile zerfallen). Antwort in beiden Fällen ohne Hinweis | Dicke und Randabstand messen, ablehnen oder warnen | `screw-base-5`, `screw-at-edge`; O "screw" |
| N-mechanik-9 | B | mechanismTool.ts:534-545 | Schraubdeckel ohne Prüfung des Halses: Behälter 8 mm hoch (nötig 14,2) → gebaut, Gewinde bis z −3,4, Deckel bis z −6,2 unter dem Boden. Hals Ø 44 statt der genannten 40 → „Built …“, Deckel und Behälter durchdringen sich (`inspect.interference` 1), nur der allgemeine Zusatz „still share volume“ | Hals messen (Durchmesser, gerade Länge), sonst ablehnen | `lid-short-jar`, `lid-wrong-diameter`; O "T6" |
| N-mechanik-10 | B | mechanismTool.ts:34, :578-583 | Riegel: „walls must be flat 8.1 mm above … and 14.1 mm below“ steht nur im Text. Deckel 6 mm hoch → Wurzel ragt 2,1 mm über die Deckeloberseite (z 28,1 statt 26); gedreht liegt der Deckel auf 5 mm². Dose 10 mm hoch → Wulst bis z −1,4, Arm bis z −4,1 unter dem Boden | vor dem Bau messen und ablehnen | `latch-lid-6`, `latch-box-10`; O "latch" |
| N-mechanik-11 | B | mechanisms.ts:654-662; mechanismTool.ts:569-571 | Schnapphaken: `wall` wird nicht gemessen. Wand 4 mm, genannt 2 → Tasche 2 mm tief statt Fenster, Antwort „window through the 2 mm wall … press each catch back through its window“. Wand nur 10 mm hoch → kein Fenster, nur 0,2 mm von der Oberkante (797,76 von 800 mm³), Antwort unverändert | Wanddicke und -höhe messen | `snap-wall-said-2-is-4`, `snap-low-wall`; O "snap" |
| N-mechanik-12 | B | mechanisms.ts:733 | Zapfen: Oberteil 6 mm bei 8,5 mm Tasche → Tasche geht durch, Zapfen ragt 1,5 mm heraus (z 17,5 gegen 16). Keine Meldung | Dicke prüfen | `peg-top-6`; O "plug with pegs" |
| N-mechanik-13 | B | mechanisms.ts:204 | Führung: `up` wird nur auf „rechtwinklig zur Linie“ geprüft. `up: [0,1,1]` auf der waagrechten Platte → „Built the guide …“ (`unchanged: false`); die Lage der Schiene ist nicht nachgemessen | `up` gegen die Flächennormale prüfen | `slide-refused` (10. Eintrag); O "T5" |
| N-mechanik-14 | C | mechanisms.ts:363 | Verschluss mit scharfen Ecken: die 45°-Schräge unter dem Fußring entsteht nur an der Wand mit dem Verschluss; an den drei anderen bleibt ein waagrechter Absatz: 184,05 mm² (Radius 0) gegen 9,02 mm² (Radius 2) | Schräge rundum (Kommentar :318) | `closure-default`, `closure-radius-2`; O "T13" |
| N-mechanik-15 | C | mechanisms.ts:48, :84-90 | Axiale Spalte durch getrenntes Runden: 0,199 mm bei `gap: 0.2` (unter der eigenen Untergrenze), 0,401 mm bei 0,4, 0,799 mm bei 0,8 | Spalt nie unter dem Sollwert | `hinge-gap02`, `hinge-d5-gap02`, `hinge-default`; H "hinge lying" |
| N-mechanik-16 | C | mechanisms.ts:67-68 | Düse 0,6, `gap: 0.5`, Ø 6: abgelehnt mit „the barrel would be 0.9 mm thin over the bore's roof“ – die Grenze ist 0,9 | Vergleich mit Toleranz, oder die Grenze in der Meldung | `w4-n06-gap05`; H "W4" |
| N-mechanik-17 | C | mechanismTool.ts:78-82, :621 | Scheitert ein Schritt, kommt SolidCrafts JSON roh beim Modell an: „Not built: {\n "applied": [],\n "completed": 0,\n "failed": { … } …“ (auf 300 Zeichen gekappt) | nur `failed.error` | `h02-one-component`; H "H-02" |
| N-mechanik-18 | C | mechanisms.ts:428 | `UNDER_HEAD` 1,2 mm fest: bei Düse 0,6 Dünnwand 1,2 < 1,35 mm unter dem Kopf (26 mm²) | zwei Bahnen der Düse | `screw-thinnest-cover`; O "screw" |
| N-mechanik-19 | C | mechanisms.ts:789-840, :723-739; mechanismTool.ts:523, :582 | Riegel, Zapfen und flacher Verschluss nennen die Drucklage nur im Text, setzen sie aber nicht (`body.print_face` nur beim Schraubdeckel). Wie konstruiert geprüft: Riegel Überhang 2400 mm² (Deckelunterseite), Zapfen Ø 20 Taschendecke 346 mm² | Druckfläche setzen wie `lidSteps` | `latch-default`, `peg-d20-gap05`; O "latch", O "plug with pegs" |
| N-mechanik-20 | C | mechanisms.ts:482 | Geschnittenes Gewinde: Flanken 60,5° (M5) und 62,1° (M10), 108,9 / 420,6 mm² über 45°; Druckprüfung ohne Befund, Antwort ohne Hinweis | Hinweis, oder Gewindeform für den Druck | `screw-m5-tapped`, `screw-m10-tapped`; O "screw" |

## Nicht messbar, weil …

- **H-02, Zeichnungsteil** („Not placed“ nach gescheitertem Zentrieren, drawingTool.ts:213, :227-232): das Harness legt
  nur `partbuddy_block` und `partbuddy_mechanism` über SolidCraft.
- **H-02, Zweige mechanismTool.ts:345 (Undo-Tiefe nicht lesbar), :359 (Körper werden keine Komponenten) und :507
  (Schieber nicht messbar)**: mit echtem SolidCraft 0.40.0-rc.4 nicht ausgelöst; der Zweig :363 (`joint.as_built`
  scheitert) ist gemessen.
- **W7, zweiter Teil** (Hautprüfung entfällt, wenn `roomDepths` null liefert): der Ausfall der Messung ließ sich nicht
  herbeiführen.
- **Ob etwas wirklich druckt** (Verschweißen bei 0,2 mm Spalt, Durchhängen der Decken, Halt des Verschlusses): nichts
  gedruckt; gemessen ist Geometrie.
- **Druckprüfung wie in der App**: `check()` des Harness läuft ohne Druckflächen, `withClearance` und `withMotion` und
  ohne das Ausblenden der Normteile. Befunde der Art „Cap:F6:top“ bzw. „Lid:F2:-z“ in den `result.json` der Deckel
  stammen aus der Lage wie konstruiert; für gedrehte Körper gelten die Werte aus `downFaces` (`up: -1`).

Lücken des Harness, in `mechanik-helpers.ts` umgangen: keine Auswertung nach Winkel, Drucklage und gemeinsamem Bett
(`downFaces`); keine Strecken eines Strahls (`segments`); `finish()` schreibt bei einem Unterordner als Fallnamen
(`mechanik/<Szene>`) an einen Pfad, den es nicht gibt – die Szenen schreiben `result.json` und `sent.json` selbst und
exportieren kein STL und kein `.sc`; `audit.batch` trägt nichts in `sent` ein (bei den Vorlagen bleibt `sent.json` leer);
ein Strahl, der im Material beginnt oder genau auf einer Dreieckskante läuft, liefert vertauschte bzw. fehlende
Strecken (die Strahlen der Szenen sind deshalb leicht aus der Symmetrie gerückt).

## Nachmessung 13.11.2026 (main `a6e52eb`, SolidCraft 0.40.1)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`a6e52eb`, alle PRs bis #367), installiertes
SolidCraft 0.40.1, ein Worker, ohne Fenster. Erster Lauf: 28 Dateien, 108 Tests, 13 rot (Erwartungen am
alten Stand bzw. 0,3-mm-Deckel jetzt `warn`); nach dem Anpassen 29 Dateien, 109 Tests grün. Werte in `tools/audit/out/…` (nicht im Repo).

| Kennung | behoben in | Urteil | gemessen am heutigen main | Fall |
|---|---|---|---|---|
| T5 | #358 | behoben bestätigt | Vorgabe: Dach 45° über der Nut, Firstbrücke 5 mm, PLA `ready`, Antwort „The two print apart …“. Breite 20 bzw. 60: Antwort „The groove's ceiling is flat and 27.9 / 101.9 mm wide, more than prints as a bridge … Print Stop turned over“, Prüfung meldet die Decke | O "T5" |
| N-mechanik-1 | #353 | behoben bestätigt | `slide-max`: `overhang` 3058 mm² (nach Winkel 3057,96 = wie geprüft) | O "T5" |
| N-mechanik-2 | #358 | behoben bestätigt | Wulst bis y 38,25 mm, über die Länge (x −6,5 … 6,5) gleich: 0,25 mm in der Rille | O "T13" |
| N-mechanik-3 | #358 | behoben bestätigt | zweites Scharnier heißt „Hinge (2)“; auf derselben Linie teilt es das Gelenk („turns about that hinge's joint“), auf einer anderen Linie „Not built: the joint "Hinge" already joins Base and Flap … on another line“ | H "H-02", `mechanik-review` "review 3" |
| N-mechanik-4 | #358 | behoben bestätigt | Scharnier mit Stegen Ø 8 / Ø 40 und auf den Schalen der Vorlage: PLA `ready` | H "hinge with support", H "T3" |
| N-mechanik-5 | #358 | behoben bestätigt | Deckelplatte ohne Wand darunter: „the 2 of Lid got no web: … there is no wall …“; die Prüfung meldet die Deckelunterseite (1253 mm²) | H "G1" |
| H-02 | #358, #364 | behoben bestätigt | beide Körper in einer Komponente: „Not built: SolidCraft refused joint.as_built: … Everything was taken back.“, Körper unverändert | H "H-02" |
| G1 | #366 | behoben bestätigt | Deckelblock z 22…31,5 (`g1-lid-underside-lowest`): `overhang` 1265 mm² inkl. Unterseite `F2:-z` (vorher als Bett gezählt) | H "G1" |
| M-1 | #364 | behoben bestätigt | 185 Körper vorab, Scharnier scheitert: alles zurückgenommen, Zeitleiste 187 Schritte vorher und nachher, Körper unverändert, aktive Komponente 0 | `mechanik-review` "review 2" |
| M-2 | #358 | behoben bestätigt | Schieber mit Knopf, Schublade, Fase: bleibt ein Körper (1 Schale), kein Dach, Antwort sagt warum; Prüfung meldet die Nutdecke 418 mm² | `mechanik-review` "review 1" |
| T3 | #358 | weiter offen (Rest) | Vorlage `hingedBox` unverändert: `warn`, `overhang` 63 mm² am Deckel (Seiten `F18`/`F20` am Verschluss `F10`/`F12`), vorher 134,86 mm² an den Augen. Dasselbe Scharnier über das Werkzeug auf den Schalen: `ready` | H "T3", `mechanik-fix` |
| N-mechanik-6 | #358 | erledigt (Text) | Antwort sagt jetzt „The two print apart, each with up pointing up“ | O "T5" |
| neu | – | neu falsch | Vorlage nach Änderung im Parameterfeld (height 24, length 80, wall 3): `block`, `thinWall` 0,26 mm auf 93 mm² am Deckel → N-nach-1. Vorlage mit height 5: `block`, „Closure ◢: the reference … no longer exists“ → N-nach-2. `joint.sweep` 0 → 180° der Vorlage stoppt bei 175,6° → N-nach-3 | `mechanik-fix`, `mechanik-review` "review 6" |
