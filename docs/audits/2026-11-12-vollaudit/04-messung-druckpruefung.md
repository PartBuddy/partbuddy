# Phase 4 – Messung Druckprüfung (`packages/geometry`, `checkPrint`)

Stand 12.11.2026. Körper von SolidCraft `0.40.0-rc.4` gebaut (ohne Fenster, über das Harness
`tools/audit/`), über den Spiegel der App geholt und mit `checkPrint` geprüft. Profil überall
`PLA_04`: Bauraum 256 × 256 × 256 mm, Düse 0,4 mm, Überhang 45° (`minimumWall` = 0,9 mm). Ein Fall
(„offen, Netz direkt“) ist ein von Hand gebautes Netz, weil SolidCraft keinen offenen Volumenkörper
ausgibt. Produktcode unverändert, App nicht gestartet.

Wiederholen (aus `apps/desktop`, Laufzeit 4,5 s bzw. 2,1 s):

```
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts druckpruefung-befunde      # = B
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts druckpruefung-gegenprobe   # = G
node ../../tools/audit/druckpruefung-show.mjs befunde        # Kurzfassung von result.json (oder: gegenprobe)
```

Alle Werte stehen in `tools/audit/out/druckpruefung/befunde/result.json` bzw.
`…/gegenprobe/result.json` unter dem Schlüssel aus der Spalte „Eingabe“ (in Klammern); je Szene liegt
dort auch die STL. Fälle: `tools/audit/cases/druckpruefung-befunde.case.ts` (B) und
`tools/audit/cases/druckpruefung-gegenprobe.case.ts` (G).

## Befunde

| Kennung | Urteil | Fall | Eingabe | gemessen | Soll | Befehl |
|---|---|---|---|---|---|---|
| D2 | bestätigt | B | Quader 300 × 10 × 5 mm (`d2-stab-300x10x5`) | `block`, Fund `size` 300 × 10 × 5 mm, `lying: false` | kein Fund: diagonal braucht er (300 + 10)/√2 = 219,2 mm je Seite, Bett 256 mm | B |
| D2 (Kontrolle) | – | B | Quader 256 × 10 × 5 (`d2-kontrolle-256x10x5`); 370 × 10 × 5 (`d2-kontrolle-370x10x5`) | `ready`; `block` 370 × 10 × 5 | `ready`; `block` (Bedarf 268,7 mm > 256) | B |
| MG-02 | bestätigt | B | Quader 300 × 20 × 10 mm (`mg02-stab-300x20x10`) | `block`, Fund `size` 300 × 20 × 10 mm | kein Fund: Bedarf 226,3 mm je Seite | B |
| D1 | bestätigt | B | zwei Würfel 20 mm bei x = 0 und x = 300 (`d1-zwei-wuerfel-300-auseinander`) | `block`, Fund `size` 320 × 20 × 20 mm | kein Fund: jeder Körper misst 20 mm | B |
| MG-03 | bestätigt | B | zwei Platten 200 × 200 × 3 mm, 100 mm Abstand (`mg03-zwei-platten-200`) | `block`, Fund `size` 500 × 200 × 3 mm | kein Fund: jede Platte passt (200 mm) | B |
| D3 | bestätigt | B | Würfel 20 mm + Kugel Ø 20 mm (`d3-wuerfel-plus-kugel`) | kein Fund `contact`; Auflage Würfel 400 mm², Kugel 0 mm² (nur `overhang` 178 mm² an der Kugel) | `contact` für die Kugel; allein geprüft meldet dieselbe Kugel `contact` 0 mm² (`d3-kontrolle-kugel-allein`) | B |
| D3 | bestätigt | B | Würfel 20 mm + Kegel auf der Spitze, unten Ø 1 mm (`d3-wuerfel-plus-kegel-auf-spitze`) | `ready`, keine Funde; Auflage Kegel 0,78 mm² | `contact` für den Kegel; allein geprüft: `warn`, `contact` 1 mm² (`d3-kontrolle-kegel-allein`) | B |
| D4 | bestätigt | B | Platte 30 × 30 × 0,3 mm flach (`d4-boden-0.3`) | `block`, `thinWall` 0,3 mm, 1800 mm², Flächen `F1:+z`, `F1:-z` | druckbar (1 Schicht 0,3 bzw. 1–2 Schichten à 0,2): höchstens Warnung „Boden unter 4 Schichten“, keine Sperre | B |
| D4 | bestätigt | B | Platten 0,2 / 0,4 / 0,6 / 0,8 / 1,0 mm flach (`d4-boden-…`) | 0,2 `block`; 0,4, 0,6, 0,8 `warn` (`thinWall`, je 1800 mm²); 1,0 `ready` | Dicke in Z gegen Schichthöhe, nicht gegen 2 Linien (0,9 mm) | B |
| D4 (Gegenstück) | – | B | Wand 30 × 0,3 × 20 mm stehend (`d4-wand-0.3`); 0,6 mm (`d4-wand-0.6`) | `block`, `thinWall` 0,3 mm, 1200 mm²; `warn` 0,6 mm | so richtig (Wand quer zur Druckrichtung) – dieselbe Meldung wie beim Boden | B |
| D4 | bestätigt | B | Dose 30 × 30 × 20, Boden 0,3, Wand 0,3 (`d4-dose-boden-0.3-wand-0.3`) | `block`, `thinWall` 0,3 mm, 6481 mm², Boden- und Wandflächen in einem Fund | Wand: Sperre; Boden: eigener Fund nach Schichten | B |
| D6 | bestätigt | B | Wand 30 lang, 20 hoch, unten 0,2 → oben 2,5 mm (`d6-keil-unten-0.2-oben-2.5`) | kein `thinWall`; nur `contact` 6 mm² (12 Dreiecke im Netz) | `thinWall`/`block`: 182,6 mm² je Seite unter 0,9 mm, davon 52,2 mm² unter 0,4 mm, dünnste Stelle 0,2 mm | B |
| D6 | bestätigt | B | dieselbe Wand, unten 2,5 → oben 0,2 mm (`d6-keil-unten-2.5-oben-0.2`); beidseitig geneigt (`d6-keil-symmetrisch-2.5-auf-0.2`) | `ready`, keine Funde (beide) | wie oben: `thinWall`/`block`, 0,2 mm | B |
| D6 (Kontrolle) | – | B | Wand 30 × 0,2 × 20 mm gleichmäßig (`d6-kontrolle-wand-0.2-gleichmaessig`) | `block`, `thinWall` 0,2 mm, 1200 mm² | `block` | B |
| MG-01 | bestätigt | B | Hohlkasten 44 × 44 × 30, unten offen, Decke 40 × 40 mm frei (`mg01-kasten-decke-40x40`) | `ready`, keine Funde; Decke `F2:+z` 1600 mm² als „grenzwertig“ gezählt, Stützfläche 0 mm² (ohne `reach`: 1600 mm² Stütze) | `overhang` 1600 mm² | B |
| MG-01 | bestätigt | B | Brücke 40 mm zwischen zwei Wänden (`mg01-bruecke-40`) | `ready`; 800 mm² grenzwertig, Stütze 0 mm² | Brücke 40 mm melden (Maßstab: über 5 bzw. 10 mm) | B |
| MG-01 | bestätigt | B | Hohlkasten, Decke 100 × 100 mm frei (`mg01-kasten-decke-100x100`) | `ready`; 10 000 mm² grenzwertig, Stütze 0 mm² | `overhang` 10 000 mm² | B |
| MG-01 (Kontrolle) | – | B | Kragarm 40 mm (`mg01-kontrolle-kragarm-40`); Brücke 3 mm (`mg01-kontrolle-bruecke-3`) | `warn`, `overhang` 800 mm²; `ready` (60 mm² grenzwertig) | Fund; kein Fund | B |
| MG-04 | bestätigt | B | Platte 20 × 20 × 0,9 mm (`mg04-platte-0.9`); Wand 20 × 0,9 × 20 (`mg04-wand-0.9`) | `warn`, `thinWall` mit `thickness: 0.9`, `minimum: 0.9`, 800 mm² (beide) | kein `thinWall` bei genau 0,9 mm | B |
| MG-04 (Grenze ±) | – | B | 0,89 / 0,91 / 1,0 mm, Platte und Wand (`mg04-platte-…`, `mg04-wand-…`) | 0,89: `thinWall` 0,89; 0,91 und 1,0: kein `thinWall` (Wand: nur `contact` 18 bzw. 20 mm²) | 0,89 Fund, ab 0,9 keiner | B |
| G1 (Teil Druckprüfung) | bestätigt | B | Dose 40 × 30 × 30, Deckelplatte 40 × 30 × 3 auf z = 27…30 daneben (`g1-dose-und-deckel-auf-27`) | `ready`, keine Funde; Deckelunterseite 1200 mm² als Bettfläche, Stütze 0 mm²; tiefster Punkt des Deckels z = 27 mm | `overhang` 1200 mm² für den Deckel, wenn beide zusammen gedruckt werden | B |
| G1 (Kontrolle) | – | B | dieselben Quader als ein Körper (`g1-kontrolle-ein-koerper`) | `warn`, `overhang` 1200 mm² an `F2:-z` (+ SolidCrafts Warnung „in 2 separate pieces“) | Fund | B |
| G1 (mit Scharnier) | teilweise | B | `partbuddy_mechanism` hinge an dieser Szene, Linie [42,0,28.5]–[42,30,28.5] (`g1-scharnier-dose-deckel`) | `warn`, `overhang` 1198 mm² (Deckel `F2:-z` 1172,9 mm², Dose `F18:side` 24,8 mm²); der Deckel reicht mit den Stegen bis z = 22,36 mm, dort 4,87 mm² als „Bett“ gezählt | Deckelunterseite wird hier gemeldet, aber nur, weil die Stege tiefer reichen; das Bett des Deckels liegt weiter 22,36 mm über dem der Dose | B |

## Gegenprobe (Phase 4 Punkt 5)

Fehlerhafte Körper – jeder muss gemeldet werden:

| Kennung | Urteil | Fall | Eingabe | gemessen | Soll | Befehl |
|---|---|---|---|---|---|---|
| Wand zu dünn | gemeldet | G | Dose, Wand 0,3 mm (`fehler-wand-0.3`); 0,6 mm (`fehler-wand-0.6`) | `block`, `thinWall` 0,3 mm, 4634 mm²; `warn`, 0,6 mm, 4589 mm² | Sperre; Warnung | G |
| Überhang 60° | gemeldet | G | Prisma, eine Seite 60° aus der Senkrechten, 400 mm² (`fehler-ueberhang-60`) | `warn`, `overhang` 400 mm² | Fund | G |
| Überhang 44…50° | Grenze bei 46° statt 45° (D19 gemessen) | G | dasselbe Prisma mit 44, 45, 46, 47, 50° (`fehler-ueberhang-…`) | 44°, 45°, 46°: `ready` (278,0 / 282,8 / 287,9 mm² grenzwertig); 47°: `overhang` 293 mm²; 50°: 311 mm² | 46° ist über dem Limit 45° und bleibt ohne Fund | G |
| Schwebend, eigener Körper | **nicht gemeldet** | G | Würfel 20 mm auf z = 10…30 neben einem Würfel auf dem Bett (`fehler-schwebend-eigener-koerper`); allein (`fehler-schwebend-allein`) | `ready`, keine Funde; Unterseite 400 mm² als Bettfläche | Fund (folgt aus G1: jeder Körper auf seinem eigenen tiefsten Punkt) | G |
| Schwebend, im selben Körper | gemeldet | G | ein Körper aus zwei Stücken, eines 10 mm über dem Bett (`fehler-schwebend-im-selben-koerper`) | `warn`: `overhang` 400 mm² an `F2:-z` und SolidCrafts Warnung „in 2 separate pieces“ | Fund (als Überhang, nicht als „schwebt“) | G |
| Offener Körper | **nicht gemeldet** | G | SolidCraft-Fläche: Rechteck als vier Wände hochgezogen (`fehler-offen-solidcraft-rohr`), `closed: false`, Volumen 0 | `warn`, einziger Fund `contact` 0 mm² ohne Ortsangabe; nichts zu „offen“ | Sperre „nicht geschlossen“ | G |
| Offener Körper | **nicht gemeldet** | G | Würfel 20 mm, Deckfläche gelöst (`fehler-offen-solidcraft-flaeche-weg`): 2 Flächenkörper, beide `closed: false` | `warn`, einziger Fund `separate` (Offen, Body1) | Sperre „nicht geschlossen“ | G |
| Offener Körper | **nicht gemeldet** | G | Netz direkt: Würfel aus fünf Flächen (`fehler-offen-netz`), `deriveEdges` zählt 4 offene Kanten | `ready`, keine Funde | Sperre (D12 gemessen) | G |
| Durchdringung | gemeldet | G | zwei Würfel 20 mm, 10 mm versetzt, 4000 mm³ gemeinsam (`fehler-durchdringung-10`); Würfel 10 mm ganz in Würfel 30 mm (`fehler-durchdringung-innen`) | `checkPrint`: `warn`, `separate`; mit `inspect.clearance` + `withClearance` zusätzlich `overlap` 4000 bzw. 1000 mm³ | Fund | G |
| Durchdringung über Kreuz | nur über SolidCrafts Messung gemeldet | G | zwei Stäbe 60 × 10 × 10 über Kreuz, 1000 mm³ gemeinsam (`fehler-durchdringung-kreuz`) | `checkPrint` allein: `ready`, keine Funde; mit `withClearance`: `warn`, `overlap` 1000 mm³ | Fund auch ohne die Nachmessung (D41 gemessen) | G |

Saubere Körper – keiner darf gemeldet werden:

| Kennung | Urteil | Fall | Eingabe | gemessen | Soll | Befehl |
|---|---|---|---|---|---|---|
| Würfel | in Ordnung | G | Würfel 20 mm (`gut-wuerfel`) | `ready`, keine Funde; Auflage 400 mm² | `ready` | G |
| Dose | in Ordnung | G | 40 × 30 × 20, Wand/Boden 2 mm, `solid.shell` (`gut-dose`), Volumen 7152 mm³ | `ready`, keine Funde; Auflage 1200 mm² | `ready` | G |
| Winkel mit 45°-Fase | in Ordnung | G | Fuß 40 × 20 × 4, Schenkel, Kopf mit 10 mm × 45° gefaster Unterkante (`gut-winkel-45-fase`) | `ready`, keine Funde; Fase 282,84 mm² grenzwertig, Stütze 0 mm² | `ready` | G |
| Zylinder stehend | in Ordnung | G | Ø 20 × 30 mm (`gut-zylinder-stehend`) | `ready`, keine Funde; Auflage 314,03 mm² (Netz) | `ready` | G |
| Platte mit Loch | in Ordnung | G | 40 × 40 × 4, Loch Ø 10 (`gut-platte-mit-loch`) | `ready`, keine Funde; Auflage 1521,59 mm² | `ready` | G |

Ergebnis der Gegenprobe: 5 von 5 sauberen Körpern ohne Fund. Von den fehlerhaften werden zu dünne
Wand, 60°-Überhang und Durchdringung gemeldet; der schwebende eigene Körper und der offene Körper
werden nicht gemeldet.

## Neue Befunde

| Kennung | Schwere | Datei:Zeile | Ist (gemessen) | Soll | Fall |
|---|---|---|---|---|---|
| N-druckpruefung-1 | A | `packages/geometry/src/printCheck.ts:344-351`; `apps/desktop/src/main/print/printProfiles.ts:283` | Eine Dose mit Boden 0,8 mm (das Mindestmaß, das die Entwurfsregel dem Assistenten vorgibt: „floors and lids at least max(0.8, 4 layers)“) und Wand 1,35 mm ergibt `warn`, `thinWall` 0,8 mm, 1645 mm² an `F1:-z`, `F2:-z`. Regel und Prüfung widersprechen sich am selben Maß. | Regelkonformer Boden ohne Fund (gehört zur Behebung von D4) | B, `d4-dose-boden-0.8-wand-1.35` |
| N-druckpruefung-2 | A | `packages/geometry/src/printCheck.ts:337`; `apps/desktop/src/main/solidcraft/mirror.ts:266-268` | SolidCrafts Flächenkörper (`closed: false`, Volumen 0) laufen als druckbare Teile durch die Prüfung: vier Wände ohne Boden → einziger Fund `contact` 0 mm²; Würfel mit gelöster Deckfläche → einziger Fund `separate`. Kein Fund sagt, dass der Körper offen ist. Geht über D12 (importierte Netze, B) hinaus: betrifft Körper, die der Assistent mit `surface.*` selbst baut. | Körper mit `closed: false` bzw. offenen Netzkanten sperren | G, `fehler-offen-solidcraft-rohr`, `fehler-offen-solidcraft-flaeche-weg`, `fehler-offen-netz` |
| N-druckpruefung-3 | B | `packages/geometry/src/printCheck.ts:234-258, 446` | Zwei Stäbe über Kreuz aufeinander (Berührfläche 100 mm², kein Eckpunkt des einen am anderen): `checkPrint` `ready`; `inspect.clearance` liefert `near` mit `distance_mm: 0`, das `withClearance` als Berührung überspringt (`< CONTACT`) → auch danach `ready`. Die eigene Regel „bodies that touch fall apart in the slicer“ (Z. 353) greift nicht. D41 nennt nur den Fall mit Überlappung, den SolidCrafts Messung auffängt; diesen fängt nichts auf. | `separate` für sich berührende Körper auch ohne Eckpunkt in Reichweite (z. B. aus `near` mit Abstand 0) | G, `fehler-beruehrung-kreuz-gestapelt` |
| N-druckpruefung-4 | B | `packages/geometry/src/printCheck.ts:14-17, 304-308, 385` | Ein einzelner Körper, der 10 mm über z = 0 konstruiert ist, ist `ready`; seine Unterseite zählt als Bettfläche (400 mm²). Allein ist das durch das Auflegen im Slicer gedeckt; neben einem zweiten Körper auf dem Bett (G1) und nach einem Gelenk nicht. Mit Scharnier zählt die Prüfung 4,87 mm² Stegfuß auf z = 22,36 mm als Bett. | wie G1: gemeinsames Bett für Körper, die zusammen gedruckt werden; Abstand zum gemeinsamen Bett melden | G, `fehler-schwebend-eigener-koerper`; B, `g1-scharnier-dose-deckel` |
| N-druckpruefung-5 | B | `apps/desktop/src/main/agents/mechanismTool.ts` (Antworttext „stand on webs at 45° … so they print without support“); `packages/geometry/src/printCheck.ts:406-409` | Das Scharnier zwischen Dose und Deckel auf z = 27 meldet in der Antwort „print without support“, die Druckprüfung derselben Körper ergibt `warn`, `overhang` 1198 mm² (davon Dose `F18:side` 24,8 mm² am Scharnier selbst). Wie Beobachtung 1 in `04-messung-harness.md`, hier an einem zweiten Aufbau. | Werkzeugtext und Prüfung stimmen überein | B, `g1-scharnier-dose-deckel` |
| N-druckpruefung-6 | C | `packages/geometry/src/printCheck.ts:410-413` | Der Fund `contact` einer Kugel bzw. eines offenen Rohrs hat `places: []` und `area: 0`: kein Körper, keine Fläche, auf die die Oberfläche zeigen kann. | Körper nennen, auch wenn keine Fläche aufliegt | B, `d3-kontrolle-kugel-allein`; G, `fehler-offen-solidcraft-rohr` |
| N-druckpruefung-7 | C | `packages/geometry/src/printCheck.ts:346-350` | Boden und Wand stehen in einem Fund mit einer Dicke und einer Fläche (Dose 0,3/0,3: 6481 mm², zehn Flächen); bei Boden 0,3 und Wand 0,6 wäre nicht erkennbar, welche Fläche sperrt. Die Sperre hängt an der Summe der Flächen unter Düsenbreite, gemeldet werden alle Flächen unter 0,9 mm. | Sperrende und nur gewarnte Flächen getrennt ausweisen | B, `d4-dose-boden-0.3-wand-0.3` |

Mitgemessen, schon als Befund geführt: D12 (offenes Netz `ready`), D19 (46° ohne Fund, 47° mit),
D41 (Stäbe über Kreuz ohne `separate`).

## Nicht messbar, weil …

- **Lage auf der Druckfläche (`printFace`, `laid`)**: Das Harness reicht SolidCrafts Druckflächen
  nicht an `check()` durch (README „What it does not do“). D1/MG-03 nennt die gemeinsame Ausdehnung
  nach dem Drehen einzelner Körper; gemessen ist nur die Lage wie konstruiert.
- **Aussage „die Plattenansicht legt den Stab schräg“ (D2)**: `renderer/viewer/nesting.ts` gehört zur
  Oberfläche; ohne App nicht gebaut. Gemessen ist nur, dass `checkPrint` sperrt und der Stab
  rechnerisch diagonal passt.
- **Wortlaut der Meldungen an Nutzer und Assistent** (`printCheckNote.ts`, `de.json`: „werden nicht
  gedruckt“ bei D4): hier nur die Funde von `checkPrint` (Art, Schwere, Zahl), nicht der daraus
  erzeugte Text.
- **G1 über `structure.joints`**: ob die App Gelenkpartner erkennt, betrifft `usePrintCheck.ts`
  (Renderer); gemessen sind `checkPrint` und das Werkzeug `partbuddy_mechanism`.
- **Selbstdurchdringung innerhalb eines Körpers**: SolidCraft vereinigt sich durchdringende Stücke
  beim `join`; ein sich selbst durchdringender Volumenkörper ließ sich so nicht herstellen. Nicht
  versucht: ein von Hand gebautes Netz dafür.

## Lücken im Harness (nicht geändert)

- `openAudit` baut ein Design je SolidCraft-Sitzung, und `finish()` schreibt `<name>.stl` in den
  Ordner des Falls, was mit einem Unterordner im Namen (`druckpruefung/befunde`) nicht geht. Eigene
  Hilfsdatei `tools/audit/druckpruefung-helpers.ts`: `scene()` (neues Design über SolidCrafts
  `new_design`, bauen, spiegeln, prüfen, STL je Szene), `brief()`, `writeResult()`, `quadBody()`
  (Netz direkt, mit Zahl der offenen Kanten). `tools/audit/druckpruefung-show.mjs` druckt die
  Ergebnisse in Kurzform.
- `check()` des Harness enthält weder `withClearance` noch Druckflächen; die Durchdringungsfälle
  rufen `inspect.clearance` selbst und geben das Ergebnis durch `clearanceOf` (App) und
  `withClearance`, Presspassung 0,15 mm (PLA, `printProfiles.ts:53`).

## Nachmessung 13.11.2026 (main `a6e52eb`, SolidCraft 0.40.1)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`a6e52eb`, alle PRs bis #367), installiertes
SolidCraft 0.40.1, ein Worker, ohne Fenster. Erster Lauf: 28 Dateien, 108 Tests, 13 rot (Erwartungen am
alten Stand bzw. 0,3-mm-Deckel jetzt `warn`); nach dem Anpassen 29 Dateien, 109 Tests grün. Werte in `tools/audit/out/…` (nicht im Repo). Die Harness reicht seit dieser Messung die Druckgruppen (`structure.printGroups`, PR #366) an `checkPrint` weiter wie `usePrintCheck.ts`.

| Kennung | behoben in | Urteil | gemessen am heutigen main | Fall |
|---|---|---|---|---|
| D1 / MG-03 | #353 | behoben bestätigt | zwei Würfel 300 mm auseinander und zwei Platten 200 mm: `ready` | B |
| D2 / MG-02 | #353 | behoben bestätigt | Stab 300 × 10 × 5 und 300 × 20 × 10: `ready`; Kontrolle 370 × 10 × 5: `block` `size` | B |
| D3 | #353 | behoben bestätigt | Würfel + Kugel: `contact` 0 mm² an der Kugel; Würfel + Kegel auf der Spitze: `contact` 1 mm² am Kegel | B |
| D4 | #353 | behoben bestätigt | Boden 0,2 / 0,3 / 0,4 / 0,6 mm flach: `warn`, `thinWall` mit `floor: true`, Minimum 0,8 mm (4 Schichten); 0,8 und 1,0: `ready`. Stehende Wand 0,3: `block`, 0,6: `warn` (Minimum 0,9) | B |
| D6 | #353 | behoben bestätigt | alle drei Keile 0,2 ↔ 2,5 mm: `block`, `thinWall` 0,2 mm auf 363–364 mm² | B |
| MG-01 | #353, #363 | behoben bestätigt | Decke 40 × 40: `overhang` 1600 mm²; Brücke 40 mm: 800 mm²; Decke 100 × 100: 10 000 mm²; Kontrolle Brücke 3 mm: `ready` | B |
| MG-04 | #353 | behoben bestätigt | Wand und Platte 0,9 mm: kein `thinWall`; Wand 0,89: `thinWall` 0,89; Platte 0,89 flach: `ready` (Boden ≥ 0,8) | B |
| N-druckpruefung-1 | #353 | behoben bestätigt | Dose Boden 0,8 / Wand 1,35: `ready` | B |
| N-druckpruefung-2 | #353 | behoben bestätigt | Rohr aus Flächen, Würfel mit gelöster Fläche, gelöste Flächen, offenes Netz: jeweils `block`, `open` | G |
| G1 | #366 | behoben bestätigt | Dose und Deckel mit Scharnier (`g1-scharnier-dose-deckel`): Deckel `overhang` 1253 mm² inkl. Unterseite `F2:-z` (gemeinsames Bett). Ohne Gelenk (`g1-dose-und-deckel-auf-27`) weiter `ready` – gewollt, gruppiert werden nur die Paare der Mechanik-Werkzeuge | B |
| D19 | – | weiter offen | Prisma 46°: `ready` (287,9 mm² grenzwertig) | G |
| N-druckpruefung-4 | – | weiter offen | Würfel 10 mm über dem Bett, eigener Körper: `ready` | G |
| N-druckpruefung-3 / D41 | – | weiter offen | Stäbe über Kreuz (gestapelt und durchdrungen): `checkPrint` allein `ready` | G |

## Nachmessung 14.11.2026 (SolidCraft 0.41.0)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`35653de`, alle PRs bis #405), installiertes
SolidCraft 0.41.0, ein Worker, ohne Fenster. Erster Lauf (`tools/audit/phase4-2026-11-14.log`): 29 Dateien, 109 Tests,
13 rot, alle 13 wegen Erwartungen am Stand vor den BC-Paketen; kein Fehler von SolidCraft 0.41.0. Die betroffenen Fälle
sind angepasst und einzeln nachgefahren, grün. Verglichen ist mit den Werten der Nachmessung 13.11. (bei Fällen ohne
Zeile dort mit der Tabelle oben). Werte in `tools/audit/out/…` (nicht im Repo).

| Kennung / Wert | 13.11. | 14.11. | Grund |
|---|---|---|---|
| D19: Prisma 46° | `ready` (287,9 mm² grenzwertig) | `warn`, `overhang` 288 mm²; 45° und 44° `ready` | BC-19 (#391): ebene Flächen ab Grenze + 0,1° |
| N-druckpruefung-3 / D41: Stäbe über Kreuz | `checkPrint` allein `ready` | gestapelt: `warn` `separate` („touch but are separate“); durchdrungen: `separate`, mit Abstandsmessung zusätzlich `overlap` 1000 mm³ | BC-02 (#371) |

Unverändert: D1, D2 (Kontrolle 370 × 10 × 5 `block`), D3, D4, D6 (363–364 mm²), MG-01 (1600 / 800 / 10 000 mm²,
Brücke 3 mm `ready`), MG-04, N-druckpruefung-1, N-druckpruefung-2 (`open`, `block`), G1 (1253 mm²),
N-druckpruefung-4 (Würfel über dem Bett `ready`, Status „widerlegt“). Ungeklärte Änderungen: keine.

**Angepasste Fälle:** keine. **Echte Fehler:** keine.
