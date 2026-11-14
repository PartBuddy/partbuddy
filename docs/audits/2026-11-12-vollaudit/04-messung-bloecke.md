# Phase 4 – Messung Bausteine (`partbuddy_block`, `kind: screw`)

Stand 12.11.2026. SolidCraft `0.40.0-rc.4` (portable, `mcp --headless`), kein Fenster, App nicht gestartet,
Produktcode unverändert. Alle Werte stammen aus den Läufen vom 12.11.2026 und stehen vollständig in
`tools/audit/out/bloecke/<fall>/result.json` (gesendete Befehle in `sent.json` bzw. im Feld `sent`).

Wiederholen, aus `apps/desktop` (`V` = `pnpm exec vitest run --config ../../tools/audit/vitest.config.mts`):

```
V bloecke                 # alle 39 Tests, rund 3 min
V bloecke-w1              # W1
V bloecke-w2              # W2/T4 (5 Tests)
V bloecke-findings        # W3, S-02/T8, T7, T9, W31, R54 (18 Tests); einzeln mit -t "W3:" / "S-02" / "T7" / "T9" / "W31" / "R54"
V bloecke-sizes           # jede Größe jedes Bausteins (15 Tests); einzeln mit -t "sizes: nuttrap"
node ../../tools/audit/bloecke-report.mjs [screwhole-none|screwhole-cap|…]   # Maße der sizes-Fälle als Text
```

Dateien: `tools/audit/cases/bloecke-w1.case.ts`, `bloecke-w2.case.ts`, `bloecke-findings.case.ts`,
`bloecke-sizes.case.ts`; Hilfen `tools/audit/bloecke-helpers.ts`, Auswertung `tools/audit/bloecke-report.mjs`.
Messwege: Volumen je Körper aus `inspect.measure` (exakt), Durchmesser aus `model.faces` (exakt), Tiefen und
Breiten aus den Netz-Eckpunkten je benannter Fläche, Wände per Strahl durch das Netz.

## Urteile

| Kennung | Urteil | Fall | Eingabe | gemessen | Soll | Befehl |
|---|---|---|---|---|---|---|
| W1 | bestätigt | `bloecke-w1.case.ts` | Körper A (20×40×20) und B (60×40×20, ab x = 20). `screwHole body: "A"`, Punkt `[30,10,20]` (auf B) | A −0 mm³, B −181,584 mm³; Antwort „Built screwHole on A at [30, 10, 20] …“ | Körper prüfen, Schnitt auf ihn begrenzen, sonst ablehnen | `V bloecke-w1` |
| W1 | bestätigt | wie oben | `body: "Ghost"` (gibt es nicht): screwHole, insertSeat, slot, snapFit | B −181,584 / −84,195 / −86,158 / +93,0 mm³; Antwort jeweils „Built … on Ghost“ | ablehnen | `V bloecke-w1` |
| W1 | bestätigt | wie oben | `body: "A"`, Punkt auf B: tappedHole M5, boss, nutTrap, text „H“ | B −323,946 / +353,115 / −237,735 / −7,061 mm³, A jeweils 0; Antwort „Built … on A“ | wie oben | `V bloecke-w1` |
| W1 | bestätigt | wie oben | `screwHole body: "A"`, Punkt `[20,20,20]` auf der gemeinsamen Kante | A −90,792 mm³ **und** B −90,792 mm³ (ein Loch in zwei Körpern), Antwort nennt nur A | nur der genannte Körper | `V bloecke-w1` |
| W2 (= T4) | bestätigt | `bloecke-w2.case.ts` (`w2-slot`) | Dose 60×40×30, Wand 2, oben offen; Körper `Behind` (x 70–80), `Far` (x 500–510), `Beyond` (x 1100–1110). `slot body: "Dose"`, Punkt `[0,20,15]`, `normal [-1,0,0]`, ohne `depth` | Dose −172,317 mm³ = 2 × 86,158 (beide Wände offen: Strahl auf der Achse trifft die Dose gar nicht mehr); `Behind` −430,792 mm³, `Far` −430,792 mm³ (beide ganz durchschnitten), `Beyond` 0. Antwort „Built slot on Dose …“ ohne Hinweis | nur die getroffene Wand (86,158 mm³), kein anderer Körper | `V bloecke-w2 -t "w2-slot in"` |
| W2 (Gegenprobe) | – | `bloecke-w2.case.ts` (`w2-slot-depth2`) | dasselbe mit `depth: 2` | Dose −86,158 mm³, Gegenwand 2,000 mm heil, andere Körper 0 | – | `V bloecke-w2 -t "depth2"` |
| W3 | bestätigt | `bloecke-findings.case.ts` (`w3`) | `text` ohne `text`, Würfel 80×40×20 | gebaut: „Built text on Cube …: text PartBuddy, height 5, depth 0.6 …“, −47,716 mm³; gesendet `sketch.text { text: "PartBuddy" }` | ablehnen | `V bloecke-findings -t "W3:"` |
| W3 (Gegenprobe) | – | wie oben | `text: ""` und `text: "   "` | „Not built: text: Too small: expected string to have >=1 characters“, 0 mm³ | – | wie oben |
| S-02 (= T8) | bestätigt | `bloecke-findings.case.ts` (`s02`) | `tappedHole` M2, M2.5, M3, M4 in Würfel 80×40×20 | alle gebaut, Antwort „Built tappedHole on Cube …: size M2, modeled true.“ ohne Warnung; −49,328 / −80,086 / −115,666 / −203,524 mm³; Kern-Ø 1,6 / 2,1 / 2,5 / 3,3 mm, Außen-Ø 2,0 / 2,5 / 3,0 / 4,0 mm; `checkPrint` meldet zum Gewinde nichts | unter M5 ablehnen wie `kind: screw` | `V bloecke-findings -t "S-02"` |
| S-02 (Gegenprobe) | – | wie oben | `partbuddy_mechanism kind: screw, thread: tapped`, M3 und M4 | „Not built: a printed M3 thread strips; use thread insert, or M5 and larger“ (M4 gleich) | – | wie oben |
| T1 (= MV-01) | bestätigt (Ist) | `bloecke-sizes.case.ts` (`insertseat-boss`, `screw-m2_5`) | `insertSeat` M2.5, `boss` M2.5, `kind: screw` M2.5 | Loch-Ø 3,6 mm in allen drei Wegen (`F3:bore`, `F9:hole`, `F6:bore`), Tiefe 6,700 mm | 4,0 mm (Soll aus 03-massstab-verbindungen, hier nicht nachgemessen) | `V bloecke-sizes -t "insertseat"`; `-t "screw-m2_5"` |
| R54 | bestätigt | `bloecke-findings.case.ts` (`r54-keyhole-3mm`) | Platte 60×60×3, `keyhole` (Schraube 4) | gebaut, „… The part must be at least 6.7 mm thick there.“; Strahl durch Ruhepunkt und Einführloch: keine Wand (durchgeschnitten), −312,013 mm³; `checkPrint`: `ready` | „Not built“ unter 6,7 mm | `V bloecke-findings -t "r54-keyhole"` |
| R54 | bestätigt | (`r54-magnet-2mm`, `-2_5mm`, `-edge`) | `magnet` 6×2 in Platte 2 mm; 2,5 mm; 3,5 mm vom Rand in Platte 5 mm | 2 mm: durchgeschnitten, `checkPrint` `ready`. 2,5 mm: Boden 0,300 mm (Soll laut Antwort 0,6). Rand: Wand 0,354 mm (Soll laut Antwort 1,2). Antwort jeweils „Built … Keep at least 1.2 mm … and 0.6 mm under it“ | messen und ablehnen | `V bloecke-findings -t "r54-magnet"` |
| R54 | bestätigt | (`r54-insert-edge`, `-thin`) | `insertSeat` M3 2,5 mm vom Rand; in Platte 7 mm | Wand 0,502 mm; Boden 0,300 mm; Antwort „Built insertSeat …“ ohne jede Bedingung | Wand ≥ 2 mm bzw. Herstellerwert | `V bloecke-findings -t "r54-insert"` |
| R54 | bestätigt | (`r54-woodscrew-1_5mm`, `-edge`) | `woodScrew` 4 in Platte 1,5 mm; 5 mm vom Rand | 1,5 mm: Senkung (2,05 tief) geht durch, kein Zylinder mehr, Öffnung unten Ø 5,82 mm statt 4,7; `checkPrint` `ready`. Rand: 0,700 mm Wand an der Senkung (Antwort verlangt 4 mm) | messen und ablehnen | `V bloecke-findings -t "r54-woodscrew"` |
| R54 | bestätigt | (`r54-screw-insert-edge`) | `kind: screw` M3, 2,5 mm vom Rand, Deckel 5 mm | gebaut; Einsatzsitz mit 0,506 mm Wand; die Kopfsenkung (Ø 6,7) bricht seitlich aus dem Deckel (bei z = 13 fehlt das Material von x = 0 bis 5,846) | „at least 2 mm of plastic around each insert“ prüfen | `V bloecke-findings -t "r54-screw"` |
| T7 | bestätigt | `bloecke-findings.case.ts` (`t7-M3-3`, `t7-M4-3_6`, `t7-M6-4_8`) | `kind: screw`, `head: countersunk`, Deckel genau so dick wie die Prüfung verlangt | Rest unter dem Kegel (Höhe von `F3:bore:side:0`): M3/3,0 mm → 1,04 mm; M4/3,6 → 1,07 mm; M6/4,8 → 1,08 mm; Kegeltiefe 1,96 / 2,53 / 3,72 mm | 1,2 mm (`UNDER_HEAD`) | `V bloecke-findings -t "T7"` |
| T7 (Grenze) | – | (`t7-M3-2_9`, `t7-M5-4_2`) | M3 Deckel 2,9; M5 Deckel 4,2 | M3: „… leaves 1.1 mm under the countersink; make it at least 3 mm thick“. M5 bei 4,2: ebenfalls abgelehnt → N-bloecke-7 | – | wie oben |
| T8 | bestätigt | siehe S-02 | `tappedHole` M2 | gebaut, Außen-Ø 2,0 mm, Kern-Ø 1,6 mm | siehe S-02 | siehe S-02 |
| T9 | bestätigt | `bloecke-findings.case.ts` (`t9`) | `featureBlockSchema` + `stepsOf` (Weg der Oberfläche): boss M10, insertSeat M8, screwHole M2 / M2.5 `countersunk` | Schema nimmt alle vier an. boss M10: Dom Ø 8, Loch Ø 4,0 × 6,7 (M3-Werte); insertSeat M8: Ø 4,0 × 6,7; Senkung M2: Ø 4,4 (= Zylinderkopf 3,8 + 0,6), 1,0 tief; M2.5: Ø 5,1, 1,1 tief | ablehnen, kein Rückfall auf M3 | `V bloecke-findings -t "T9"` |
| T9 (Werkzeug) | – | wie oben | dieselben Größen über `partbuddy_block` | „Not built: boss has no size M10; it has M2, M2.5, M3, M4, M5, M6“ (insertSeat, Senkkopf M2 sinngemäß) | – | wie oben |
| W31 | bestätigt | `bloecke-findings.case.ts` (`w31`) | `snapFit length: 3` / `4` / Vorgabe 12 | gebaut (+25,5 / +33,0 / +93,0 mm³); `snapStrain` 35,6 % / 17,0 % / 1,42 %; Antwort ohne Dehnung | Dehnungsgrenze je Material im Werkzeug | `V bloecke-findings -t "W31"` |
| W31 | bestätigt | wie oben | `text height: 0.5`; `insertSeat diameter: 0.01, depth: 0.01`; `slot width: 0.05, length: 0.05`; `nutTrap flats: 0.1, depth: 0.1`; `text depth: 500` | alle „Built“: −0,097 mm³; −0,000 mm³ (nichts messbar entfernt); −0,005 mm³; −180,677 mm³ (nur das Durchgangsloch); −321,799 mm³ (Schrift durch den ganzen 20-mm-Würfel) | FDM-Grenzen (Mindestdetail, Wand) | wie oben |
| W31 | bestätigt | wie oben | `insertSeat diameter: 500, depth: 500` | „Built insertSeat on Cube …“; −143 623 mm³: der Würfel 120×60×20 ist weg, übrig sind drei Körper `Cube`, `Cube (1)`, `Cube (2)` (die drei Schnapphaken, 25,5 / 93 / 33 mm³) | ablehnen → N-bloecke-4 | wie oben |
| W31 (Grenze) | – | wie oben | `snapFit length: 501` | „Not built: length: Too big: expected number to be <=500“ | – | wie oben |
| MV-02 | bestätigt (Ist) | `bloecke-sizes.case.ts` (`insertseat-boss`) | `boss` M2 … M6, Vorgaben | Dom-Ø / Loch-Ø: 7,2/3,2 · 7,6/3,6 · 8/4 · 9,6/5,6 · 10,4/6,4 · 12/8 → Wand 2,000 mm bei jeder Größe | M4 2,1, M5 2,6, M6 3,3 mm (Soll aus 03-massstab-verbindungen) | `V bloecke-sizes -t "insertseat"` |

## Jede Größe gegen die Tabelle (`bloecke-sizes.case.ts`)

Alle Körper `closed: true`, 1 Schale. „✓“ = jeder gemessene Wert gleich dem Tabellenwert (exakt aus `model.faces`
bzw. auf 0,001 mm aus den Flächengrenzen). Befehl je Zeile: `V bloecke-sizes -t "sizes: <fall>"`, danach
`node ../../tools/audit/bloecke-report.mjs <fall>`.

| Baustein | Fall | gebaut | gemessen | Soll (Tabelle) | Ergebnis |
|---|---|---|---|---|---|
| screwHole `head: none` | `screwhole-none` | M2 … M10 × close/normal/loose (24 Löcher) | close 2,2 / 2,7 / 3,2 / 4,3 / 5,3 / 6,4 / 8,4 / 10,5; normal 2,4 / 2,9 / 3,4 / 4,5 / 5,5 / 6,6 / 9 / 11; loose 2,6 / 3,1 / 3,6 / 4,8 / 5,8 / 7 / 10 / 12 mm | ISO 273 fein/mittel/grob; `CLEARANCE_NORMAL` | ✓ |
| screwHole `head: cap` | `screwhole-cap` | M2 … M10 | Senkung Ø 5,0 / 5,7 / 6,7 / 8,2 / 9,7 / 11,2 / 14,2 / 17,2; Tiefe 2,4 / 2,9 / 3,4 / 4,4 / 5,4 / 6,4 / 8,4 / 10,4 mm | `CAP_HEAD` + 2 × 0,6 und + 0,4 | ✓ |
| screwHole `head: countersunk` | `screwhole-countersunk` | M3 … M10 | Senkung Ø 7,32 / 9,56 / 11,8 / 14,04 / 18,52 / 23,0; Tiefe 1,96 / 2,53 / 3,15 / 3,72 / 4,76 / 6,0 mm (90°) | `COUNTERSUNK_HEAD` + 0,6 | ✓ |
| tappedHole | `tappedhole` | M2, M5, M10 durch; M5 `depth: 8` | Außen-Ø 2,0 / 5,0 / 10,0 mm (genau Nennmaß); Sackloch z = 12 … 20 (8,0 mm) | – (keine Tabelle in PartBuddy) | Nennmaß ohne Aufmaß → N-bloecke-9 |
| insertSeat | `insertseat-boss` | M2 … M6 | Ø 3,2 / 3,6 / 4 / 5,6 / 6,4 / 8; Tiefe 5,0 / 6,7 / 6,7 / 9,1 / 10,5 / 13,7 mm; Boden eben | `INSERT`, Länge + 1 | ✓ (M2.5 → T1) |
| boss | `insertseat-boss` | M2 … M6 | Dom Ø 7,2 … 12, Höhe 7,0 / 8,7 / 8,7 / 11,1 / 12,5 / 15,7; Loch wie insertSeat, Lochboden 2,0 mm über der Fläche | Loch + 4, Länge + 3 | ✓ (Wand → MV-02) |
| nutTrap | `nuttrap` | M2 … M10 | Schlüsselweite 4,3 / 5,3 / 5,8 / 7,3 / 8,3 / 10,3 / 13,3 / 16,3; Tiefe 2,0 / 2,4 / 2,8 / 3,6 / 5,1 / 5,6 / 7,2 / 8,8; Loch 2,4 … 11 mm | `NUT` + 0,3 / + 0,4; `CLEARANCE_NORMAL` | ✓ |
| slot | `slot` | M2 und M10 `depth: 3`; M3 durch; `along: y`, 20 × 4 × 2 | Breite 2,4 / 11 / 3,4 / 4,0; Tiefe 3,0 / 3,0 / durch / 2,0; Gesamtlänge 12,4 / 21,0 / 13,4 / 24,0 mm | Breite `CLEARANCE_NORMAL` | Breite ✓; Länge = Mittenabstand → N-bloecke-8 |
| text | `text` | „H“ Vorgabe (5 mm, 0,6 tief, graviert); erhaben 10 mm, 1 mm | Versalhöhe 5,000 / 10,000 mm; Tiefe 0,6 / Höhe 1,0 mm; Strichbreite 1,01 / 2,02 mm | Eingabe | ✓ |
| lip | `lip` | Dose 60×40×30, Wand 2: `lip` und `groove`, Vorgaben | Lippe 1,2 breit, 2,0 hoch, innen bündig; Rille 1,4 breit (1,2 + 0,2), 2,2 tief; Wand außen neben der Rille 0,6 mm; `checkPrint`: `warn`, `thinWall` 0,6 < 0,9 mm, 429 mm² | Eingabe | Maße ✓; Restwand → N-bloecke-5 |
| snapFit | `snapfit` | Vorgaben, `hook` y+ und x− | Arm 12,0 hoch, 1,5 dick, 5,0 breit; Nase 0,8 tief, 1,5 lang, Unterseite waagrecht | Eingabe | ✓ |
| keyhole | `keyhole` | Schraube 3,5 / 4 / 4,5 / 5 | Einführloch Ø 8 / 9 / 10 / 11; Schlitz 4 / 4,5 / 5 / 5,5; Lippe 2,0; Tasche 3,0 / 3,5 / 3,8 / 4,2 tief, 8,0 Weg | `WALL`, `KEYHOLE` | ✓ |
| woodScrew | `woodscrew` | Schraube 3,5 / 4 / 4,5 / 5 | Durchgang 4,1 / 4,7 / 5,2 / 5,7; Senkung Ø 7,8 / 8,8 / 9,7 / 10,6; Tiefe 1,85 / 2,05 / 2,25 / 2,45 mm | `WALL` | ✓ (Antworttext rundet → N-bloecke-10) |
| magnet | `magnet` | 6×2 glue, 6×2 press, 2×1, 40×20 | Ø 6,3 / 6,1 / 2,3 / 40,3; Tiefe 2,2 / 2,2 / 1,2 / 20,2; Fase 0,4 (Mund Ø + 0,8) | `MAGNET` | ✓ |
| magnet, knapp außerhalb | `magnet` | Ø 1,9; Ø 40,1; Höhe 0,9; Höhe 20,1 | „Not built: diameter must be 2–40 mm (the magnet)“ / „height must be 1–20 mm (the magnet)“, 0 mm³ | Ablehnung | ✓ |
| knob | `knob` | Vorgaben, Welle d / knurl / round | Ø 25, Höhe 16; Bohrung 6,2 (d, round) / 6,0 (knurl), 11 tief; D-Fläche bei 4,7 (4,5 + 0,2) über 7,0 mm; Zeiger 1,2 × 0,6 | `KNOB`, `KNOB_CLEARANCE` | ✓ |

## Neue Befunde

| Kennung | Schwere | Datei:Zeile | Ist (gemessen) | Soll | Fall |
|---|---|---|---|---|---|
| N-bloecke-1 | A | `shared/blocks.ts:218`, `:229` (kein `depth`, kein `targets`) | `screwHole` (`head: none`) und `tappedHole` M5 in der Seitenwand der Dose: beide Wände der Dose durchbohrt (−36,317 mm³ = 2 × 18,158 bzw. −64,789) **und** der 10 mm dahinter stehende Körper `Behind` ganz durchbohrt (−90,792 bzw. −161,973 mm³); `Far` bei x = 500 bleibt heil. Antwort „Built screwHole on Dose …“ | Loch nur durch die getroffene Wand, nur im genannten Körper | `bloecke-w2.case.ts` (`w2-screwhole`, `w2-tappedhole`) |
| N-bloecke-2 | A | `main/agents/blockTool.ts:255`; `shared/magnet.ts:58`; `shared/wallMount.ts:110` | `magnet body: "A"` und `woodScrew body: "A"` mit Punkt auf B: A 0 mm³, B 0 mm³, es entsteht nichts; Antwort trotzdem „Built 1 pocket for 6 × 2 mm disc magnets in A …“ bzw. „Built 1 countersunk hole … in A … SolidCraft warns: 2 of 2 holes remove no material“ | Wenn kein Material entfernt wurde: „Not built“ | `bloecke-w1.case.ts` (Aufrufe 11 und 13) |
| N-bloecke-3 | B | `main/agents/blockTool.ts:207`, `:257` | SolidCrafts Ablehnung kommt als rohes JSON beim Assistenten an: „Not built: {\n "applied": [],\n "completed": 0,\n "failed": {\n "command": "solid.cylinder",\n "error": "`targets` must list existing bodies", …“ (magnet/woodScrew mit `Ghost`; boss Ø 1; nutTrap in 2-mm-Wand, dort nach 300 Zeichen mitten im JSON abgeschnitten) | ein Satz in Klartext: was fehlt und was zu tun ist | `bloecke-w1.case.ts`, `bloecke-w2.case.ts` (`w2-nuttrap`), `bloecke-findings.case.ts` (`w31`) |
| N-bloecke-4 | A | `shared/contract.ts:804`, `:812` | `insertSeat diameter: 500, depth: 500`: der ganze Träger (143 623 mm³) wird weggebohrt, drei lose Reste bleiben; Antwort „Built insertSeat on Cube …“. `insertSeat diameter: 0.01, depth: 0.01`: „Built“, entferntes Volumen 0,0000 mm³ | Grenzen aus der Einsatz-Tabelle (z. B. ± 20 %) bzw. gegen den Körper; nach dem Bau Körperzahl und Volumen prüfen | `bloecke-findings.case.ts` (`w31`) |
| N-bloecke-5 | B | `shared/blocks.ts:90`, `:200` | `lip type: groove` mit Vorgaben in einer 2-mm-Wand: außen bleiben 0,6 mm stehen; PartBuddys eigene Prüfung: `warn`, `thinWall` 0,6 < 0,9 mm auf 429 mm². Antwort „Built lip on Lid …“ ohne Hinweis | Rille gegen die Wanddicke prüfen (Rest ≥ 2 Linien) oder Maße aus Wand und Düse ableiten | `bloecke-sizes.case.ts` (`lip`) |
| N-bloecke-6 | B | `shared/blocks.ts:157-162` | `nutTrap` M3 (Tasche 2,8 tief) in 2-mm-Wand: SolidCraft lehnt das Loch ab („`position` [2.8, 20, 15] is not on a face of a body“), alles zurückgerollt, 0 mm³; der Assistent sieht nur das abgeschnittene JSON | vorher messen: „die Wand ist 2 mm dick, die Mutterntasche braucht 2,8 mm + Boden“ | `bloecke-w2.case.ts` (`w2-nuttrap`) |
| N-bloecke-7 | C | `shared/mechanisms.ts:452-453` | `kind: screw` M5 `countersunk`, Deckel 4,2 mm (`from` z = 24,2, `to` z = 20): „Not built: the moving body is 4.2 mm thick there, which leaves 1.2 mm under the countersink; make it at least 4.2 mm thick“ – die Meldung widerspricht sich (Gleitkomma: 4,2 − 3,0 < 1,2) | Vergleich mit Toleranz (gerundete Werte) | `bloecke-findings.case.ts` (`t7-M5-4_2`) |
| N-bloecke-8 | C | `main/agents/blockTool.ts:56`; `shared/blocks.ts:166-170` | `slot length: 10`: gebaut 12,4 mm (M2), 13,4 mm (M3), 21,0 mm (M10) lang; `length` ist der Mittenabstand, Beschreibung und Antwort sagen „its length“ / „length 10“ | Gesamtlänge bauen oder „Verstellweg“ nennen | `bloecke-sizes.case.ts` (`slot`) |
| N-bloecke-9 | B | `shared/blocks.ts:218` | modelliertes Gewinde genau auf Nennmaß: Außen-Ø 2,0 / 2,5 / 3,0 / 4,0 / 5,0 / 10,0 mm, Kern-Ø M2–M4 1,6 / 2,1 / 2,5 / 3,3 mm; kein Aufmaß für den Druck (Löcher drucken kleiner, vgl. `HEAD_ALLOWANCE`) | Gewindespiel für FDM (deckt sich mit S-09) | `bloecke-sizes.case.ts` (`tappedhole`), `bloecke-findings.case.ts` (`s02`) |
| N-bloecke-10 | C | `main/agents/blockTool.ts:118` | woodScrew-Antwort nennt die Senktiefe „2.1 mm“ (Schraube 4) und „1.9 mm“ (3,5); gemessen 2,05 und 1,85 mm | eine Nachkommastelle mehr oder aufrunden mit „mindestens“ | `bloecke-sizes.case.ts` (`woodscrew`) |
| N-bloecke-11 | C | `shared/blocks.ts:80` | Die Vorgabe des Textbausteins selbst („PartBuddy“, 5 mm, fett, 0,6 tief graviert) ergibt in der eigenen Prüfung `warn`: `thinWall` 0,68 < 0,9 mm (3 mm², zwischen Buchstaben) | Vorgabehöhe, bei der die Stege ≥ 2 Linien bleiben | `bloecke-findings.case.ts` (`w3`) |

## Nicht messbar, weil …

- **Soll-Werte von T1/MV-01 (4,0 mm) und MV-02 (Herstellerwand)**: gemessen ist nur PartBuddys Ist; das Soll stammt aus den Quellen der Phase 3 und wurde hier nicht an einem Einsatz nachgemessen.
- **Druckbarkeit** (Gewinde M2–M4 reißt aus, Schnapphaken mit 35 % Dehnung bricht, Einsatz in 3,6 mm): nichts gedruckt; gemessen sind Geometrie und `snapStrain`.
- **Weg der Oberfläche (BlockPanel, IPC)**: App nicht gestartet. T9 ist über `featureBlockSchema` + `stepsOf` nachgestellt, nicht über das Formular.
- **Druckfläche (`keepFace`, print-faces.json)**: das Harness reicht SolidCrafts Druckflächen nicht in `check()` weiter. Die Überhang-Warnungen bei `keyhole` (204 mm², Taschendächer) und `knob` (58 mm², Bohrungsdach bei knurl/round) gelten für die Lage wie konstruiert, nicht für die vom Werkzeug gesetzte bzw. genannte Drucklage – nicht bewertet.
- **Knopf, kleinste und größte Größe; lip/snapFit/text an ihren Grenzen**: nur Vorgaben (und die W31-Extremwerte) gebaut; `knobProblem`-Grenzen nicht abgefahren.
- **Jeder Grenzwert ± 1 Schritt**: nur bei `magnet` (vier Werte knapp außerhalb) und über die Größenliste (`M10` bei boss/insertSeat, `M2` beim Senkkopf, 501 mm). Die übrigen Maße haben im Werkzeug keine Grenze außer 0 < x ≤ 500 (W31).
- **Warum `solid.hole` ohne Tiefe `Behind` (10 mm entfernt) durchbohrt, `Far` (440 mm entfernt) aber nicht**: nur das Ergebnis gemessen, die Reichweite nicht eingegrenzt.
- **Export** (STL/3MF/STEP wieder einlesen): vom Harness nicht abgedeckt.

Lücke im Harness: `openAudit('bloecke/<fall>')` scheitert in `finish()` am Export (`…\bloecke\w1\bloecke\w1.stl: its folder does not exist`), weil STL und `.sc` nach dem ganzen Fallnamen benannt werden. `openBlockAudit` in `tools/audit/bloecke-helpers.ts` legt den Unterordner an; die Dateien liegen deshalb unter `out/bloecke/<fall>/bloecke/<fall>.stl`.

## Nachmessung 13.11.2026 (main `a6e52eb`, SolidCraft 0.40.1)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`a6e52eb`, alle PRs bis #367), installiertes
SolidCraft 0.40.1, ein Worker, ohne Fenster. Erster Lauf: 28 Dateien, 108 Tests, 13 rot (Erwartungen am
alten Stand bzw. 0,3-mm-Deckel jetzt `warn`); nach dem Anpassen 29 Dateien, 109 Tests grün. Werte in `tools/audit/out/…` (nicht im Repo).

| Kennung | behoben in | Urteil | gemessen am heutigen main | Fall |
|---|---|---|---|---|
| W1 | #348 | behoben bestätigt | `body: "A"`, Punkt auf B: alle Bausteine „Not built: it would change nothing on A …“ oder SolidCrafts Ablehnung als Satz, A und B je 0 mm³; `body: "Ghost"`: „there is no body named Ghost; the design has A, B“; Loch auf der gemeinsamen Kante: nur A −90,792 mm³, B 0 | `bloecke-w1` |
| N-bloecke-2 | #348 | behoben bestätigt | `magnet`/`woodScrew` mit `body: "A"`, Punkt auf B: abgelehnt, 0 mm³ | `bloecke-w1` |
| W2 / T4 / N-bloecke-1 | #365 | behoben bestätigt | Langloch ohne `depth` in der Dosenwand: Dose −86,158 mm³ (eine Wand), Gegenwand 2,000 mm heil, `Behind`/`Far`/`Beyond` 0. `screwHole` −18,158, `tappedHole` M5 −32,395 mm³, je nur die getroffene Wand. Antwort: „… not on through a far wall; give through body to go through all of Dose“ | `bloecke-w2` |
| W3 | #355 | behoben bestätigt | `text` ohne Text, `""`, `"   "`: „Not built: text needs text: the words to write“, 0 mm³ | `bloecke-findings -t "W3:"` |
| S-02 / T8 | #355 | behoben bestätigt | `tappedHole` M2, M2.5, M3, M4: „Not built: a printed M2 thread strips; use insertSeat … or tappedHole from M5“, 0 mm³ | `bloecke-findings -t "S-02"` |
| N-bloecke-4 | #355 | behoben bestätigt | `insertSeat diameter: 0.01` und `500`: „Not built: the hole for an M3 insert is 4 mm wide; diameter may differ by a tenth of that (3.6 to 4.4 mm)“; `boss diameter: 1`: „at least 7.2 mm wide“ | `bloecke-findings -t "W31"` |
| T1 / MV-01 | #347 | behoben bestätigt | Loch Ø 4,0 mm (`model.faces`) bei `insertSeat` M2.5, `boss` M2.5 und `kind: screw` M2.5 | `bloecke-sizes -t "insertseat"`, `-t "screw-m2_5"` |
| MV-02 | #347 | behoben bestätigt | Dom-Wand M2 … M6: 2,0 / 2,0 / 2,0 / 2,1 / 2,6 / 3,3 mm (Dom Ø 7,2 / 8 / 8 / 9,8 / 11,6 / 14,6, Loch 3,2 / 4 / 4 / 5,6 / 6,4 / 8) | `bloecke-sizes -t "insertseat"` |
| R54 | #357, #364, #365 | behoben bestätigt | Alle neun Fälle vom 12.11. abgelehnt mit dem gemessenen Material („Plate has 3 mm of plastic where 6.7 mm are needed …“), 0 mm³ entfernt, auch `kind: screw` am Rand („the counterbore … must lie wholly inside Cover“). Neue Fälle `r54-probe`: 8 von 8 guten (eben, 45°-Schräge, Stab Ø 40) gebaut, 10 von 10 schlechten abgelehnt; `r54-review2`: 6 von 6 wie verlangt (Fase, Stufe, Lasche, Tasche von unten) | `bloecke-findings -t "R54"`, `r54-probe`, `r54-review2` |
| N-bloecke-3 | – | teilweise | SolidCrafts Ablehnung kommt als Satz („Not built: SolidCraft refused solid.hole: invalid parameters …“), nicht mehr als JSON | `bloecke-w1`, `bloecke-w2` |
| N-bloecke-6 | – | weiter offen | `nutTrap` M3 in 2-mm-Wand: „Not built: SolidCraft refused solid.hole: … `position` [2.8, 20, 15] is not on a face …“ – die Ursache (Tasche tiefer als die Wand) wird nicht genannt | `bloecke-w2` |
| N-bloecke-7 | – | weiter offen | M5 Senkkopf, Deckel 4,2 mm: „leaves 1.2 mm under the countersink; make it at least 4.2 mm thick“ | `bloecke-findings -t "T7"` |
| W31 | – | weiter offen | `text height: 0.5` (−0,097 mm³), `slot` 0,05 × 0,05, `text depth: 500` (−321,8 mm³, durch den ganzen Würfel), `nutTrap flats: 0.1` – alle „Built“ | `bloecke-findings -t "W31"` |

## Nachmessung 14.11.2026 (SolidCraft 0.41.0)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`35653de`, alle PRs bis #405), installiertes
SolidCraft 0.41.0, ein Worker, ohne Fenster. Erster Lauf (`tools/audit/phase4-2026-11-14.log`): 29 Dateien, 109 Tests,
13 rot, alle 13 wegen Erwartungen am Stand vor den BC-Paketen; kein Fehler von SolidCraft 0.41.0. Die betroffenen Fälle
sind angepasst und einzeln nachgefahren, grün. Verglichen ist mit den Werten der Nachmessung 13.11. (bei Fällen ohne
Zeile dort mit der Tabelle oben). Werte in `tools/audit/out/…` (nicht im Repo).

| Kennung / Wert | 13.11. (bzw. Tabelle oben) | 14.11. | Grund |
|---|---|---|---|
| Lochmaße aller Bausteine | gezeichnet = Tabellenmaß | gezeichnet = Tabellenmaß + Lochaufmaß des Materials (PLA 0,15 mm, ab Ø 8 0,16–0,18): screwHole M3 3,55; Langloch 3,55; nutTrap M3 Schlüsselweite 5,8, gezeichnet 5,95; Holzschraube 4 → 4,65 / Senkung 8,75; Magnet 6 × 2 → 6,45 (glue) / 6,05 (press, gedruckt 5,9); Einsatzsitze weiter ohne Aufmaß (M2.5/M3 4,0) | BC-16 (#398), BC-20 (#392) |
| W1: Loch auf der gemeinsamen Kante | A −90,792 mm³, B 0 | A −99,742 mm³, B 0 | Loch 3,55 statt 3,4 (BC-16) und Mündungsfase 0,5 mm (BC-12, #387) |
| W2: Langloch / screwHole / tappedHole M5 in der Dose | −86,158 / −18,158 / −32,395 mm³ | −90,796 / −21,321 / −37,850 mm³; Gegenwand weiter 2,000 mm, `Behind`/`Far`/`Beyond` 0 | wie W1; Gewinde M5.3 × 0,8, gebohrt 4,5 (BC-12) |
| MV-02: Dom M2 … M6 | Ø 7,2 / 8 / 8 / 9,8 / 11,6 / 14,6, Wand 2,0 / 2,0 / 2,0 / 2,1 / 2,6 / 3,3 | Ø 7,7 / 8,5 / 8,5 / 10,1 / 11,8 / 15,2, Wand 2,25 / 2,25 / 2,25 / 2,25 / 2,7 / 3,6 | Wand auf ganze Bahnen (`snapSize('wall')`, BC-12) |
| N-bloecke-6: `nutTrap` M3 in 2-mm-Wand | SolidCrafts „position … is not on a face“ | „Dose is 2 mm thick …; the pocket of an M3 nut trap is 2.8 mm deep and needs 0.9 mm of plastic under it …, 3.7 mm in all“ | BC-03 (#369) |
| N-bloecke-7 / T7: M5 Senkkopf, Deckel 4,2 | „leaves 1.2 mm …; at least 4.2 mm“ | „leaves 1.05 mm under the countersink; make it at least 4.35 mm thick“ | BC-07 (#378); Senkung mit Aufmaß (BC-16): 4,2 − 3,15 = 1,05 |
| W31 | text 0,5 hoch, slot 0,05, text 500 tief, nutTrap flats 0,1 gebaut | alle abgelehnt mit Grund (Strich 0,1 < 0,8 mm; „an M3 screw … would not pass“; „500.9 mm in all“; „an M3 nut … would not go in“), 0 mm³; snapFit 3 / 4 mm lang abgelehnt (35,56 / 17,05 % Dehnung) | BC-03 (#369), BC-11 / BC-17 |
| N-bloecke-5: `lip` `groove` am Deckel, Rand 2 mm | gebaut, Restwand 0,6 mm | abgelehnt: „a groove 1.45 mm wide … leaves 0.55 mm of wall beside it“ | BC-03 (#369) |
| N-bloecke-8: Langloch | Länge = Mittenabstand, nicht gesagt | „The length is centre to centre …: the slot is 13.4 mm long“ | BC-03 (#369) |
| N-bloecke-9: `tappedHole` | Nennmaß 2,0 / 5,0 / 10,0 | M2 abgelehnt; M5.3 / M10.3, gebohrt 4,5 / 8,8 | BC-12 (#387) |
| knob | Bohrung 6,2 / 6,0 (knurl); Überhang 58 mm² | gedruckt 6,1 / 6,0, gezeichnet 6,25 / 6,15; Stellschraube M3 in 2,55 mm; Prüfung `ready` | BC-12 (#387), BC-16 |
| R54 | 8 / 8 gut gebaut, 10 / 10 schlecht abgelehnt, review2 6 / 6 | unverändert (nach dem Anpassen der Eingaben, siehe unten) | – |
| N-bloecke-2 | Magnet/Holzschraube auf A, Punkt auf B: abgelehnt, 0 mm³ | Magnet: „A has less than 0.5 mm of plastic where 3.1 mm are needed“; Holzschraube: „it would change nothing on A“; 0 mm³ | – |

Ungeklärte Änderungen: keine.

**Angepasste Fälle.** `bloecke-sizes` „knob“: `shaft` und `shaftDiameter: 6` (seit BC-03 Pflicht, vorher brach der Fall
mit „nothing to export“ ab). Dazu, ohne roten Test: seit BC-03 verlangen `magnet` Durchmesser und Höhe und
`keyhole`/`woodScrew` die Schraube. `bloecke-sizes` „magnet“ (#2, #3), `bloecke-w1`, `bloecke-findings` (R54),
`r54-probe` und `r54-review2` riefen sie ohne diese Angaben und maßen damit nur die Ablehnung „needs diameter and
height“; sie bekommen jetzt die früheren Vorgaben (6 × 2 mm, Schraube 4).

**Echte Fehler:** keine.
