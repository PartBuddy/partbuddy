# Phase 4 – Mess-Harness und drei Beweisfälle

Stand 12.11.2026. Harness: `tools/audit/` (Beschreibung und Stolperfallen in `tools/audit/README.md`).
SolidCraft `0.40.0-rc.4` (portable, `solidcraft-cli mcp --headless`), kein Fenster, App nicht gestartet.
Alle Werte unten stammen aus dem Lauf vom 12.11.2026 und stehen vollständig in
`tools/audit/out/<fall>/result.json`; die von den PartBuddy-Werkzeugen gesendeten Befehle in `sent.json`.

Wiederholen (aus `apps/desktop`):

```
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts                   # alle drei, 4,2 s
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts cube-screwhole
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts hinge
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts insertseat
```

## Was das Harness tut

- Startet `HeadlessEngine` (`apps/desktop/src/main/solidcraft/headless.ts`) mit der rc.4 und legt
  `withBlockTool` und `withMechanismTool` der App darüber. Ein Fall ruft `partbuddy_block` bzw.
  `partbuddy_mechanism` mit denselben Argumenten wie das Modell; die Schritte entstehen in
  `blocks.ts` / `mechanisms.ts`, nichts ist nachgebaut.
- Holt die Körper über `mirrorActiveDesign` der App (`3mf-tagged` + `model.faces`) und misst mit
  `parseTagged3mf`, `meshMetrics`, `overhangOf`, `checkPrint`; dazu SolidCrafts `inspect.measure`,
  `inspect.clearance`, `inspect.interference`, `joint.list` und ein Strahl durch das Netz.
- Verweigert ein Werkzeug den Bau, ist sein Wortlaut das Ergebnis (`{ text, isError }`).

## Fall a – Würfel 20 mm, `screwHole` M3, `head: none`

Aufruf: `partbuddy_block { block: 'screwHole', body: 'Cube', point: [10,10,20], size: 'M3', head: 'none' }`.
Gesendet: `solid.hole { position: [10,10,20], clearance: 'M3', fit: 'normal' }`.

| Größe | Soll | Ist | Quelle des Ist |
|---|---|---|---|
| Lochdurchmesser | 3,4 mm (`CLEARANCE_NORMAL.M3`, `screwSizes.ts`) | 3,4 mm | `model.faces`, Zylinder `F2:bore:side:0`, Radius × 2 |
| Lochdurchmesser im Netz | 3,4 mm | 3,396 mm (X und Y) | Strahl auf halber Höhe, Austritt 9,302 / Eintritt 12,698 |
| Durchgang | durch | kein Treffer | Strahl entlang der Achse von z = 25 nach unten |
| Entferntes Volumen | 181,584 mm³ (π · 1,7² · 20) | 181,584 mm³ | `inspect.measure` vorher 8000, nachher 7818,416 |
| Entferntes Volumen im Netz | 181,584 mm³ | 181,291 mm³ | `meshMetrics` vorher 8000,000, nachher 7818,709 |
| Körper, geschlossen | 1, ja | 1, `closed: true`, 7 Flächen (6 eben, 1 Zylinder) | `inspect.measure` |
| Bounding Box | 0…20 in X, Y, Z | 0…20; Z max `20.000000000000014` | `inspect.measure` |
| Druckprüfung (Bett 256³, Düse 0,4, 45°) | – | `ready`, keine Funde | `checkPrint` |
| Ablehnung `size: 'M1'` | Meldung, nichts gebaut | „Not built: screwHole with head none has no size M1; it has M2, M2.5, M3, M4, M5, M6, M8, M10“ | Werkzeugantwort, `isError: true` |

## Fall b – Standardscharnier (`partbuddy_mechanism`, `kind: hinge`, alle Vorgaben)

Szene wie in `apps/desktop/test/fakeClaude.mjs`: Platten `Base` und `Flap` je 40 × 30 × 4 mm, 4 mm
Abstand, Linie `[42,0,3]`–`[42,30,3]`. Vorgaben: Hülse 6 mm, Spalt 0,4 mm (Düse 0,4), 3 Gelenkaugen.

Antwort des Werkzeugs: „Built the hinge "Hinge" between Base (stays) and Flap (turns): 3 knuckles,
barrel 6 mm, pin 3 mm, gap 0.4 mm everywhere. It turns from -145° to 67° before the bodies meet … The
knuckles' rooms go 1.4 mm into Base and 1.4 mm into Flap …“. Kein Steg (◣) gebaut; die Hülse liegt auf dem Bett.

| Größe | Soll | Ist | Quelle des Ist |
|---|---|---|---|
| Körperzahl | 2 | 2 (`Base`, `Flap`), beide `closed: true`, je 1 Schale | Spiegel + `inspect.measure` |
| Volumen | – | Base 5333,728 mm³, Flap 4855,691 mm³ (Netz 5331,799 / 4855,855) | `inspect.measure` / `meshMetrics` |
| Kleinster Spalt Base–Flap | 0,4 mm | 0,400 mm (`0.3999999999999856`), bei `[44.63, 0, 1.55]`–`[44.98, 0, 1.36]` | `inspect.clearance { clearance: 2 }` |
| Durchdringung | 0 | `count: 0`, `overlaps: []` | `inspect.interference`, `inspect.clearance` |
| Axialer Spalt 1 / 2 | 0,4 / 0,4 mm | 0,400 / 0,401 mm | Strahl längs der Linie bei z = 5,45: 10,733→11,133 und 20,866→21,267 |
| Länge der Gelenkaugen | 9,7333 mm | 9,733 / 9,733 / 9,733 mm | derselbe Strahl |
| Radialer Spalt Stift–Bohrung | 0,4 mm | 0,399 mm (unten, zu beiden Seiten) | Strahl aus der Stiftmitte: Stift 1,4956, Bohrung 1,8948 / 1,895 |
| Dach der Bohrung über der Achse | 1,995 mm (1,9 · `ROOF_TOP` 1,05) | 1,995 mm | Strahl nach oben |
| Hülse über dem Dach | ≥ 0,9 mm (`hingeProblem`) | 1,0025 mm | Strahl nach oben: 1,995→2,9975 |
| Raum um das Auge in Base | 0,4 mm | 0,398 mm | Strahl zur Base: 2,9984→3,3963 |
| Stiftdurchmesser im Netz | 3 mm | 2,991 mm (2 × 1,4956) | Strahl, Netz liegt innerhalb der Rundung |
| Gelenk | revolute, Grenzen gesetzt | `Hinge`, revolute, −145° … 67°, Wert 0 | `joint.list` |
| Überhang > 45°, nur nach Winkel | – | Base 113,17 mm² (`F6:side#[F1:+x]` 44,20, `F8:side#[F1:+x]` 44,20, `F12:side` 24,78); Flap 55,92 mm² (`F7:side#[F2:-x]` 42,45, `F11:side:l3` 13,47) | `overhangOf`, Reichweite 0 |
| Überhang > 45°, ohne kleine (Reichweite 1,8 mm) | – | Base 113,17 mm²; Flap 42,45 mm² (nur `F7:side#[F2:-x]`) | `overhangOf`, `smallOverhangReach(0.4)` |
| Grenzbereich 35–45° | – | Base 14,20 mm²; Flap 31,44 mm² (44,91 ohne kleine) | `overhangOf` |
| Auflage auf dem Bett | – | je 1200 mm² | `overhangOf` |
| Druckprüfung (Bett 256³, Düse 0,4, 45°) | – | `warn`: ein Fund `overhang`, `area: 156`, Flächen Base `F6:side#[F1:+x]`, `F8:side#[F1:+x]`, `F12:side`, Flap `F7:side#[F2:-x]` | `checkPrint` |

Beobachtungen aus diesem Fall (noch nicht eingestuft, für `BEFUNDE.md`):

1. Das Standardscharnier mit allen Vorgaben ergibt in PartBuddys eigener Druckprüfung `warn` (Überhang),
   während die Werkzeugbeschreibung „printed in one piece without support“ sagt
   (`mechanismTool.ts:20`). Betroffen sind die Unterseiten der Hülsen (F6, F8, F7) und der Stift (F12).
2. Der zweite axiale Spalt ist 0,401 statt 0,400 mm: `hingeSteps` rundet Start und Höhe jedes Zylinders
   getrennt auf 0,001 mm (`mechanisms.ts:48,84-90`).
3. Die Grenzen −145° … 67° gelten für diese Szene (Platten 4 mm hoch, Linie auf z = 3).

## Fall c – Würfel 20 mm, `insertSeat` M2.5 (Vorgaben)

Aufruf: `partbuddy_block { block: 'insertSeat', body: 'Cube', point: [10,10,20], size: 'M2.5' }`.
Gesendet: `solid.hole { position: [10,10,20], diameter: '3.6 mm', depth: '6.7 mm' }`.
Antwort: „Built insertSeat on Cube at [10, 10, 20]: size M2.5, diameter 3.6, depth 6.7.“

| Größe | Soll | Ist | Quelle des Ist |
|---|---|---|---|
| Lochdurchmesser | 3,6 mm (`INSERT['M2.5'].diameter`) | 3,6 mm | `model.faces`, Zylinder `F2:bore:side:0` |
| Lochdurchmesser im Netz | 3,6 mm | 3,5958 mm | Strahl 2 mm unter der Fläche: 9,2021 / 12,7979 |
| Tiefe | 6,7 mm (Länge 5,7 + 1) | 6,700 mm | Strahl entlang der Achse: Boden bei z = 13,3 |
| Lochboden | – | eben (`F2:bore:base`, Normale +Z, 9,918 mm²), kein Bohrkegel | `model.faces` |
| Volumen | 8000 − π · 1,8² · 6,7 = 7931,802 mm³ | 7931,802 mm³ (Netz 7931,913) | `inspect.measure` / `meshMetrics` |
| Körper, geschlossen | 1, ja | 1, `closed: true`, 8 Flächen | `inspect.measure` |
| Druckprüfung (Bett 256³, Düse 0,4, 45°) | – | `ready`, keine Funde | `checkPrint` |

## Genauigkeit der Messwege

- `model.faces` / `inspect.*`: exakt aus dem Kern; Abweichungen nur im letzten Bit.
- Netz (`3mf-tagged`, Qualität `standard`): liegt innerhalb gekrümmter Flächen. Gemessen: Loch 3,4 mm →
  3,396 mm, Loch 3,6 mm → 3,5958 mm, Stift 3 mm → 2,991 mm, Bounding Box der Base in X 44,9958 statt 45.
  Ebene Flächen treffen auf 0,0001 mm (Rundung des Strahls).

## Nicht abgedeckt

- Wiedereinlesen von STL/3MF/STEP (Phase 4, Punkt 4): `packages/geometry` liest nur das
  flächenmarkierte 3MF; ein STL-Leser wäre neuer Code.
- `withClearance`, `withMotion` und SolidCrafts Druckflächen fließen nicht in `check()` ein; die
  Druckprüfung läuft auf den Körpern wie konstruiert.
- Nur `partbuddy_block` und `partbuddy_mechanism` liegen über SolidCraft; `partbuddy_standard`,
  Baugruppen-, Design-, Zeichnungs- und Ansichtswerkzeug sowie `guardNotes` nicht.
- Der Strahl misst entlang einer vorgegebenen Linie; die dünnste Wand eines Körpers sucht er nicht
  (das tut `checkPrint` mit seinem Fund `thinWall`), den kleinsten Spalt liefert `inspect.clearance`.
- Kollision über den Bewegungsweg: nur das Ergebnis von SolidCrafts `joint.sweep`, wie das Werkzeug es
  einträgt; das Harness fährt kein Gelenk selbst.
- `wallMount.ts`, `magnet.ts`, `knob.ts` laufen über denselben `partbuddy_block`-Aufruf, `templates.ts`
  ließe sich über `audit.batch(...)` einspielen – beides in diesem Lauf nicht gebaut.

## Nachmessung 14.11.2026 (SolidCraft 0.41.0)

Harness auf dem Audit-Zweig nach dem Merge von `origin/main` (`35653de`, alle PRs bis #405), installiertes
SolidCraft 0.41.0, ein Worker, ohne Fenster. Erster Lauf (`tools/audit/phase4-2026-11-14.log`): 29 Dateien, 109 Tests,
13 rot, alle 13 wegen Erwartungen am Stand vor den BC-Paketen; kein Fehler von SolidCraft 0.41.0. Die betroffenen Fälle
sind angepasst und einzeln nachgefahren, grün. Verglichen ist mit den Werten der Nachmessung 13.11. (bei Fällen ohne
Zeile dort mit der Tabelle oben). Werte in `tools/audit/out/…` (nicht im Repo).

| Fall / Wert | 12.11. | 14.11. | Grund |
|---|---|---|---|
| a: Lochdurchmesser `screwHole` M3 | 3,4 mm | gezeichnet 3,55 mm (3,4 + PLA-Aufmaß 0,15), Strahl 3,546 mm; Mündungsfase 0,5 mm | BC-16 (#398), BC-12 (#387) |
| a: entferntes Volumen | 181,584 mm³ | 199,485 mm³ (Netz 199,141) | wie oben |
| b: Standardscharnier | 3 Augen à 9,733 mm; Base 5333,728 / Flap 4855,691 mm³; `warn` `overhang` 156 mm² | 5 Augen à 5,68 mm; Base 5270,199 / Flap 4885,281 mm³; `warn` `overhang` 53 mm²; Grenzen weiter −145° … 67°, Spalt 0,400 mm | BC-10 (#382) |
| c: `insertSeat` M2.5 | 3,6 mm | 4,0 mm | #347 (T1, schon 13.11.) |

**Angepasste Fälle.** `cube-screwhole-m3`: erwartet das gezeichnete Maß `drawnHole(CLEARANCE_NORMAL.M3)` = 3,55 mm.
Das Feld `expected` in `hinge-standard` nennt weiter 3 Augen; es wird nicht geprüft, nur ausgegeben.

**Echte Fehler:** keine.
