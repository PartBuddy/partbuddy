# Phase 4 – Messung Normteile und Policy

Stand 12.11.2026. SolidCraft `0.40.0-rc.4` (portable, `solidcraft-cli mcp --headless`), kein Fenster, App
nicht gestartet, kein Chat-Lauf. Harness `tools/audit/` (siehe `04-messung-harness.md`), dazu die eigene
Hilfsdatei `tools/audit/normteile-policy-helpers.ts`. Alle Werte stammen aus dem Lauf vom 12.11.2026 und
stehen vollständig in `tools/audit/out/normteile-policy/<fall>/result.json`.

Wiederholen (aus `apps/desktop`; alle fünf Dateien, 16 Tests, 23 s):

```
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts normteile-policy
```

In der Tabelle steht je Zeile nur das letzte Wort des Befehls (`… normteile-policy-families` usw.).

Was „gemessen“ hier heißt: `decide()` aus `main/agents/policy.ts` wird mit genau dem Aufruf gefüttert;
ist er erlaubt, geht er an das echte SolidCraft. Danach liest `mirrorActiveDesign` der App das Design
(`structure.standardParts`), und `checkPrint` läuft so, wie `usePrintCheck.ts:28-30` es tut: auf allen
gespiegelten Körpern außer den Normteilen. Der Text „Notiz“ ist `printCheckNote(reportOf(…))`, also der
Wortlaut, den der Assistent mit der nächsten Nachricht bekäme.

## Ergebnis

| Kennung | Urteil | Fall (`tools/audit/cases/`) | Eingabe | gemessen | Soll | Befehl zum Wiederholen |
|---|---|---|---|---|---|---|
| S-01 | bestätigt | `normteile-policy-families.case.ts` | `parts.insert` je Familie aus `parts.library` (13 Familien, Größe M3 bzw. die erste der Familie) | 12 von 13 als Normteil erkannt. Nicht erkannt: `countersunk_socket_screw`, Beschreibung „Countersunk socket screw M3x8“ → `isLibraryPart` = false, Körper `Body3` nicht in `structure.standardParts`. Er geht in die Druckprüfung (Fund `contact`, 7 mm² Auflage, Status `warn`) und in die Exportliste: 75,780 mm³ Stahlschraube. | 13 von 13 erkannt, 0 mm³ Normteil im Export | `… normteile-policy-families` |
| S-01 / G2 (Werkzeugweg) | bestätigt | `normteile-policy-screw.case.ts` | Block 60 × 40 × 20, Platte 60 × 40 × 6; `partbuddy_mechanism {kind: screw, head: countersunk, size: M3, from [10,10,26], to [10,10,20], more [[50,30,26]]}` | Antwort: „… 2 × M3×10 countersunk screws (ISO 10642) …; the screws are in the design as standard parts“. `structure.standardParts` = [] (0 von 2). Gedruckt/exportiert: `Block`, `Plate`, `Body1`, `Body2`. STL der Exportliste 6084 Dreiecke, Block + Platte allein 1364; die zwei Schrauben 179,834 mm³. Druckprüfung nennt die Schrauben nicht (einziger Fund `separate` Block/Plate). | `standardParts` = 2 Körper, Export nur Block + Platte | `… normteile-policy-screw` |
| G2 (Gegenprobe Zylinderkopf) | – (in Ordnung) | `normteile-policy-screw.case.ts` | wie oben, `head: cap` | Beschreibung „Socket head cap screw M3x8“, `standardParts` = [`Body1`, `Body2`], STL der Exportliste 1456 = Block + Platte 1456 Dreiecke | wie gemessen | `… normteile-policy-screw` |
| G2 (Teilaussage „Gewinde als dünne Wand geprüft“) | widerlegt | `normteile-policy-screw.case.ts`, `normteile-policy-families.case.ts` | Senkschraube M3×10 bzw. M3×8 in `checkPrint` (Düse 0,4) | kein Fund `thinWall` an der Schraube (0 Funde am Schraubenkörper im Werkzeugweg; allein eingesetzt nur `contact` 7 mm²). SolidCraft modelliert das Gewinde der Schraube nicht (11 Flächen: 1 Kegel, 1 Zylinder, 9 Ebenen). | – | wie oben |
| H-01 / X1 | bestätigt | `normteile-policy-metadata.case.ts` | Box 40 × 30 × 20 und Deckel 40 × 30 × 0,3 mm; `execute component.from_bodies {bodies: ["Deckel"]}`, dann `execute component.metadata.set {component: "Deckel", description: "Hex nut M3"}` | `decide()` = allow für beide. SolidCraft: `changed: ["description"]`. Vorher: Status `block`, „walls down to 0.3 mm, thinner than the 0.4 mm nozzle“ (2400 mm²). Nachher: `standardParts` = [`Deckel`], gedruckt nur `Box`, Status `ready`, Notiz „ready to print, nothing found.“ Nach `undo` wieder `block`. | Aufruf abgelehnt, oder Körper bleibt Druckkörper; Status bleibt `block` | `… normteile-policy-metadata` |
| H-01 (andere Formen) | bestätigt | `normteile-policy-metadata.case.ts` | `component.metadata.set` mit `values: {description}`, als Batch-Schritt, mit `part_number`/`bom_type`; `document.metadata.set` mit PartBuddys Schlüssel `…partbuddy.standard-parts` | allow / allow / allow; `document.metadata.set` mit `key` oder `values` auf den Schlüssel: deny, mit `properties: {<Schlüssel>: …}`: allow | deny für jede Form, die einen Körper zum Normteil macht | `… normteile-policy-metadata` |
| W37 / W17 | bestätigt | `normteile-policy-decide.case.ts` | Würfel 20 mm; `partbuddy_plan` (offen); dann `execute`, `batch`, `partbuddy_block`, `partbuddy_place_drawing` (deboss 0,6 mm, 10 mm breit), `partbuddy_move_drawing {by: [2, 0]}` über `Questions.tools(withDrawings(…))` wie in `main/index.ts:583-600` | `execute`, `batch`, `partbuddy_block`: abgelehnt („The user has not answered your plan yet …“). `partbuddy_place_drawing`: „Placed "SVG-Logo Badge" on Cube (engraved 0.6 mm, 10 mm wide).“; `partbuddy_move_drawing`: „Moved … by 2 mm …“. Würfel 8000 → 7940 mm³ bei offenem Plan. Beide Werkzeuge nicht in `CHANGING_TOOLS` (7 Einträge). | beide abgelehnt, Volumen 8000 mm³ | `… normteile-policy-decide` |
| W42 (a) | teilweise | `normteile-policy-decide.case.ts` | `execute {command: "execute", params: file.export}`; `execute {command: "batch", …}`; Batch-Schritt `batch`; Batch-Schritt `execute` mit innerem `execute`; `execute {command: "save"}` | `decide()` = allow für alle fünf (Inhalt nicht gelesen). SolidCraft rc.4 lehnt alle ab, 0 Dateien geschrieben: „unknown command `execute`: `execute` is an MCP tool, not an engine command id …“, „batches don't nest: put the steps in this batch“, „an `execute` step runs an engine command, not the `execute` tool“. Direkt (`execute file.export`, Batch-Schritt `file.export`, Batch-Schritt `execute` → `file.export`, Batch-Schritt `export`): deny. | deny schon in der Policy | `… normteile-policy-decide` |
| W42 (b) | bestätigt | `normteile-policy-decide.case.ts` | `screenshot {path: <out>\shot.png}`; `compare_picture {reference: <Datei>}`; Batch-Schritt `screenshot {path}` | `screenshot` mit `path`: allow, SolidCraft schreibt die Datei (442 140 Bytes, 960 × 600). `compare_picture {reference}`: allow, SolidCraft öffnet die Datei („… Das System kann die angegebene Datei nicht finden. (os error 2)“). Als Batch-Schritt: deny. Außerhalb von `--allow-path` lehnt SolidCraft ab („outside the folders this agent may use …“), 0 Bytes. | deny bzw. Dateiargument geprüft; `toolNotes.ts:12-13` sagt „every command given a file `path` are refused“ | `… normteile-policy-decide` |
| R2 | bestätigt | `normteile-policy-decide.case.ts`, `normteile-policy-raw.case.ts` | `execute` / `batch` mit `solid.hole` (roh, `thread` + `modeled`), `solid.shell`, `solid.thread`, `plastic.snap_fit`, `plastic.boss`, `plastic.lip`, `joint.as_built`, `parts.insert`, `parts.resize` | allow in 10 von 10 Aufrufen; SolidCraft baut jeden der sechs ausgeführten (siehe die Zeilen „roh“ unten) | deny mit Verweis auf `partbuddy_block` / `partbuddy_mechanism` | `… normteile-policy-decide` |
| roh: Schale 0,2 mm | Prüfung meldet | `normteile-policy-raw.case.ts` | `execute solid.shell {faces: [[10,10,20]], thickness: "0.2 mm"}` am Würfel 20 mm | allow, gebaut; Wand 0,200 mm (Strahl 1,0 → 1,2). Druckprüfung `block`: `thinWall` 0,2 mm, 3936 mm². Die Antwort von SolidCraft selbst: `warning: null`. | Ablehnung oder Meldung vor „fertig“ | `… normteile-policy-raw` |
| roh: Loch 0,1 mm vom Rand | Prüfung meldet | `normteile-policy-raw.case.ts` | `execute solid.hole {position: [1.8,10,20], diameter: "3.4 mm"}` | allow, gebaut; Restwand 0,102 mm (Strahl 1,0 → 1,102). Druckprüfung `block`: `thinWall` 0,1 mm, 10 mm². | wie oben | `… normteile-policy-raw` |
| roh: Loch bricht aus der Wand | bestätigt (nichts hält auf) | `normteile-policy-raw.case.ts` | `execute solid.hole {position: [1,10,20], diameter: "3.4 mm"}` | allow, gebaut; die Wand ist auf ganzer Höhe offen (Strahl von außen trifft zuerst die Bohrung bei 3,699 mm, keine Außenfläche). Druckprüfung `ready`, 0 Funde. | Meldung: Loch schneidet die Außenwand | `… normteile-policy-raw` |
| roh: Gewinde M2 modelliert (W2) | bestätigt (nichts hält auf) | `normteile-policy-raw.case.ts` | `execute solid.hole {position: [10,10,20], thread: "M2", modeled: true, depth: "8 mm"}` | allow, gebaut in 1,7 s; Kernloch 1,6 mm (`model.faces`), Gewindegrund im Netz 1,739 mm weit. Druckprüfung `ready`, 0 Funde. | deny bzw. Fund; PartBuddys eigene Grenze ist M5 (`mechanisms.ts:425,450`: „a printed M2 thread strips“) | `… normteile-policy-raw` |
| roh: Gewinde M3 modelliert (W2) | bestätigt (nichts hält auf) | `normteile-policy-raw.case.ts` | wie oben mit `thread: "M3"` | allow, gebaut; Kernloch 2,5 mm, Gewindegrund im Netz 2,674 mm. Druckprüfung `ready`, 0 Funde. | wie oben | `… normteile-policy-raw` |
| roh: Schnapphaken (W3) | bestätigt (nichts hält auf) | `normteile-policy-raw.case.ts` | `execute plastic.snap_fit {length: 4, thickness: 2, width: 5, catch_depth: 1, catch_length: 1.5 mm}` | allow, gebaut (`SnapFit1`, `warning: null`). Dehnung nach PartBuddys eigener Formel `snapStrain` (`shared/blocks.ts:105-108`): 28,4 %. Druckprüfung `ready`, 0 Funde. | Ablehnung über der zulässigen Dehnung des Materials | `… normteile-policy-raw` |
| roh: Dom mit 0,2 mm Wand | Prüfung meldet | `normteile-policy-raw.case.ts` | `execute plastic.boss {diameter: 3, height: 10, hole_diameter: 2.6 mm}` | allow, gebaut. Druckprüfung `block`: `thinWall` 0,2 mm, 176 mm². | – | `… normteile-policy-raw` |
| Körper verstecken (09 Abschnitt 4, letzter Absatz) | bestätigt | `normteile-policy-raw.case.ts` | Würfel und Platte 40 × 30 × 0,3 mm (`Thin`); `execute browser.visibility {visible: false, items: ["Thin"]}` | allow. Vorher `block`; nachher gespiegelt nur `Cube`, Status `ready`, Notiz „ready to print, nothing found.“ | versteckter Körper bleibt in Prüfung und Export, oder deny | `… normteile-policy-raw` |
| X3 / H-03 | bestätigt | `normteile-policy-raw.case.ts` | Würfel mit Parameter `side`, Loch `Round` bei [15,15,20], `side` 20 → 6 mm; dann `execute timeline.suppress {feature: "Round"}` | Vorher `warn`: „feature Round: the hole's position [15, 15, 20] is no longer on face `F1:+z` … the hole removes no material“. `timeline.suppress`: allow. Nachher `ready`, 0 Funde, das Loch fehlt. Regel allein: `checkPrint` mit einem fehlgeschlagenen Feature = `block`, dasselbe unterdrückt = `ready`. | Fund bleibt („Feature unterdrückt“) oder deny | `… normteile-policy-raw` |
| S-18 (`solid.scale` nach Baustein) | bestätigt | `normteile-policy-raw.case.ts` | `partbuddy_block screwHole M3, head none`, dann `execute solid.scale {bodies: ["Cube"], factor: 0.5}` | allow; Loch 3,4 → 1,7 mm (`model.faces`; Strahl 5,151 → 6,849). Druckprüfung `ready`, 0 Funde. | Meldung: Durchgangsloch M3 passt nicht mehr | `… normteile-policy-raw` |
| W14 | bestätigt | `normteile-policy-raw.case.ts` | Parameter `wand` = 2 mm treibt die Breite; `set_parameter {name: "wnad", value: "6 mm"}` | allow; Antwort ohne Fehler: `{name: "wnad", value: 6, recomputed: 0, errors: []}`; Breite bleibt 2 mm (Bounding Box 20 × 2 × 20); neuer Parameter `wnad` mit `used_by: []`. | Fehler „kein Parameter dieses Namens“ | `… normteile-policy-raw` |
| W1, W9, W10, W11, W13, W15, W16, W19–W22, X5, X6, X11, X12 | nicht messbar | – | – | – | – | siehe „Nicht messbar“ |
| W4–W7, W12, W18, X2, X7–X10 | nicht gemessen (andere Messgruppe) | – | – | – | – | siehe „Nicht messbar“ |
| W8 / X4 | teilweise | `normteile-policy-decide.case.ts` | `execute joint.as_built {type: "revolute", a: 1, b: 2}` ohne `limits` | `decide()` = allow. Nicht gebaut: kein Gelenk von Hand modelliert, kein Sweep gefahren. | deny bzw. Fund „Gelenk ohne Grenzen“ | `… normteile-policy-decide` |

### `decide()` je Aufruf

41 Aufrufe, vollständig in `tools/audit/out/normteile-policy/decide/result.json` (`table`) und als Tabelle in
`…/decide/table.md`. „SolidCraft“ steht nur, wo der erlaubte Aufruf auch gesendet wurde.

| Aufruf | Werkzeug | decide | SolidCraft rc.4 |
|---|---|---|---|
| `file.export {path}` | execute | deny | – |
| `file.export {path}` als Schritt | batch | deny | – |
| `execute` in `execute` (innen `file.export`) | execute | **allow** | abgelehnt: „unknown command `execute` …“, keine Datei |
| `batch` als Kommando von `execute` | execute | **allow** | abgelehnt: „unknown command `batch` …“, keine Datei |
| `batch` als Schritt von `batch` | batch | **allow** | abgelehnt: „batches don't nest …“, keine Datei |
| `execute` als Schritt (innen `file.export`) | batch | deny | – |
| `execute` in `execute` als Schritt | batch | **allow** | abgelehnt: „an `execute` step runs an engine command …“ |
| `export {path}` als Schritt | batch | deny | – |
| `save` als Kommando von `execute` | execute | **allow** | abgelehnt: „unknown command `save` …“ |
| `screenshot {path}` | screenshot | **allow** | Datei geschrieben, 442 140 Bytes |
| `screenshot {path}` als Schritt | batch | deny | – |
| `compare_picture {reference: Datei}` | compare_picture | **allow** | liest die Datei (hier: nicht vorhanden, os error 2) |
| `timeline.export_script {path: [Datei]}` (Liste) | execute | **allow** | abgelehnt: „`path` must be a file path“ |
| `timeline.export_script {path: "ab12"}` | execute | **allow** | abgelehnt: „ab12: outside the folders this agent may use“ |
| `sketch.insert_svg {path}` | execute | deny | – |
| `sketch.insert_svg {text}` | execute | allow | – |
| `sketch.replace {from, file: Design}` | execute | **allow** | „no sketch is being edited“ (Dateizugriff nicht erreicht) |
| `timeline.export_script {}` | execute | allow | – |
| `document.units` | execute | **allow** | – |
| `doc.recovery_list` | execute | deny | – |
| `new_design`, auch als Schritt | new_design / batch | deny | – |
| `edit.restore_checkpoint` | execute | deny | – |
| `solid.hole` roh | execute | **allow** | gebaut |
| `solid.hole {thread: "M2", modeled: true}` | execute | **allow** | gebaut |
| `solid.hole {thread: "M3", modeled: true}` als Schritt | batch | **allow** | gebaut (als execute) |
| `solid.shell {thickness: "0.2 mm"}` | execute | **allow** | gebaut |
| `plastic.snap_fit` | execute | **allow** | gebaut |
| `plastic.boss` | execute | **allow** | gebaut |
| `plastic.lip` | execute | **allow** | – |
| `solid.thread` | execute | **allow** | – |
| `joint.as_built` ohne Grenzen | execute | **allow** | – |
| `parts.insert` (Senkschraube) | execute | **allow** | eingesetzt |
| `parts.resize` | execute | **allow** | – |
| `component.metadata.set {description}` | execute | **allow** | gesetzt |
| `timeline.suppress` | execute | **allow** | unterdrückt |
| `timeline.delete` | execute | **allow** | – |
| `browser.visibility {visible: false}` | execute | **allow** | versteckt |
| `solid.scale` | execute | **allow** | skaliert |
| `body.print_face` | execute | allow | – |
| `set_parameter` mit unbekanntem Namen | set_parameter | **allow** | neuer Parameter, `recomputed: 0` |

Hält eine Prüfung das nicht druckbare Ergebnis vor dem „fertig“ auf? Gemessen ist nur, was `checkPrint`
findet: Schale 0,2 mm, Loch 0,1 mm vom Rand und Dom 0,2 mm ergeben `block`; ausgebrochenes Loch, Gewinde
M2/M3, Schnapphaken mit 28,4 % Dehnung, halbiertes Schraubenloch, verstecktes oder als Normteil
beschriebenes Teil und unterdrücktes Feature ergeben `ready`. Kein Werkzeugaufruf wurde wegen eines Fundes
abgelehnt; die Antwort jedes rohen Befehls trug `warning: null`. Ob der Assistent den `block`-Fund vor
seinem Schlusssatz zu sehen bekommt, ist hier nicht messbar (R1, kein Chat-Lauf).

## Neue Befunde

| Kennung | Schwere | Datei:Zeile | Ist (gemessen) | Soll | Fall |
|---|---|---|---|---|---|
| N-normteile-policy-1 | A | `apps/desktop/src/main/agents/mechanismTool.ts:559`; `apps/desktop/src/main/solidcraft/standardParts.ts:52-65` | `partbuddy_mechanism screw, head countersunk` antwortet „the screws are in the design as standard parts“; gemessen `structure.standardParts` = [] und beide Schrauben in der Exportliste (STL 6084 statt 1364 Dreiecke, 179,834 mm³). Falsche Aussage des Werkzeugs an den Assistenten und damit an den Nutzer. | Satz nur, wenn die Körper nach dem Bau in `standardParts` stehen; Werkzeug trägt sie selbst ein (wie `supervisor.ts:529-530`). | `normteile-policy-screw.case.ts` |
| N-normteile-policy-2 | A | `packages/geometry/src/printCheck.ts:167-190, 340-352` | Ein 3,4-mm-Loch, 1 mm neben der Außenwand gebohrt, schneidet die Wand auf 20 mm Höhe auf; Druckprüfung `ready`, 0 Funde (bei 0,1 mm Restwand: `block`). Der schlimmere Fall wird nicht gemeldet. | Fund, wenn ein Loch oder Schnitt eine Außenwand öffnet (Flächenname `…bore:side…#1` zeigt die geteilte Bohrung). | `normteile-policy-raw.case.ts` (hole-out) |
| N-normteile-policy-3 | B | `apps/desktop/src/main/agents/policy.ts:88`; `apps/desktop/src/main/agents/toolNotes.ts:11-13` | `FILE_COMMANDS` = `/^(file\|doc\|settings\|diagnostics)\./` trifft `doc.*`, nicht `document.*`: `document.units`, `document.metadata.set` (fremde Schlüssel) = allow. TOOL_NOTES sagt dem Assistenten „file, document and settings commands … are refused“. | Text und Regel gleichziehen; `document.units` gehört abgelehnt oder geprüft (S-22). | `normteile-policy-decide.case.ts` |
| N-normteile-policy-4 | B | `apps/desktop/src/main/agents/policy.ts:140` | Die Dateisperre greift nur bei einem Text in `path`. Gemessen allow: `path` als Liste, `path: "ab12"` (gilt als Kurven-Id), `sketch.replace {file: <Design>}`, `screenshot {path}`, `compare_picture {reference}`. Bei den ersten beiden hielt nur SolidCraft selbst auf (Typprüfung, `--allow-path`), `screenshot` schrieb 442 140 Bytes. | Dateiargumente je Befehl aus einer Liste (`path`, `file`, `reference`), nicht aus einem Namen; Schutz nicht SolidCrafts `--allow-path` überlassen (in der App sind die Projektordner erlaubt). | `normteile-policy-decide.case.ts` |
| N-normteile-policy-5 | B | `apps/desktop/src/main/agents/policy.ts:100-106` | `document.metadata.set {properties: {"io.github.manuelstaggl.partbuddy.standard-parts": …}}` = allow; `metadataKeys` liest `key`, `keys`, `values`, nicht `properties`. Ob SolidCraft damit PartBuddys Schlüssel überschreibt: nicht gesendet. | `properties` mitprüfen. | `normteile-policy-metadata.case.ts` |
| N-normteile-policy-6 | B | `apps/desktop/src/main/solidcraft/mirror.ts:268-270`; `apps/desktop/src/main/agents/policy.ts:118-147` | `execute browser.visibility {visible: false, items: ["Thin"]}` = allow; der Körper mit 0,3 mm Wand fällt aus Spiegel und Prüfung, Status `block` → `ready`. In 09 Abschnitt 4 nur als Satz genannt, ohne Kennung. | Versteckte Körper in Prüfung und Notiz nennen („1 Körper versteckt, nicht geprüft“) oder den Befehl für Körper ablehnen. | `normteile-policy-raw.case.ts` (hidden) |
| N-normteile-policy-7 | B | `packages/geometry/src/printCheck.ts:340-352` | Modelliertes Innengewinde M2 (Kern 1,6 mm) und M3 (Kern 2,5 mm): Druckprüfung `ready`, 0 Funde. PartBuddys eigene Regel nennt M5 als Untergrenze (`shared/mechanisms.ts:425,450`); sie gilt nur im Zweig `tapped` des Mechanismus. | Fund aus `model.threads` bzw. dem Feature: modelliertes Gewinde unter M5. (`model.threads` lieferte hier `{threads: []}`, obwohl das Gewinde geschnitten ist – die Quelle des Funds ist zu klären.) | `normteile-policy-raw.case.ts` (thread-m2, thread-m3) |
| N-normteile-policy-8 | C | `apps/desktop/src/main/solidcraft/standardParts.ts:68-70` | `isLibraryPart` prüft `startsWith("<Familie> ")`: „Hex nut (inch) 1/4-20 UNC“ wird schon vom Eintrag „Hex nut“ getroffen. Jede künftige Familie, deren Name mit einem der 12 beginnt, gilt ungeprüft als erkannt; umgekehrt genügt jeder freie Text mit diesem Anfang (H-01). | Abgleich gegen `parts.library` bzw. eigene Markierung. | `normteile-policy-families.case.ts` |

## Nicht messbar, weil …

- **W1, W9, W10, W15, W16, W20, W21, W22, X11 (Verhalten des Assistenten im Zug):** verlangen einen echten
  Chat-Lauf (Phase 7); dieser Lauf durfte keinen starten. Gemessen ist jeweils nur die Werkzeugseite, soweit
  oben genannt.
- **X5, X6, X12, W13 (`withClearance`, Zeitgrenze von `inspect.clearance`, alter Stand der Notiz):** laufen im
  Renderer der App (`usePrintCheck.ts:52-…`); das Harness füttert `withClearance` und `withMotion` nicht ein
  (README „What it does not do“). Für die Senkschrauben heißt das: ob die App zusätzlich einen Fund `tight`
  (gemessener Spalt Platte–Schraube 0,200 mm) meldet, ist offen.
- **W4–W7, W12, W18, X2, X7–X10 (Bausteine und Mechanismen mit Grenzmaßen), W11, W19:** gehören zu den
  Messgruppen Bausteine/Mechanismen/Druckprüfung; hier nicht gebaut.
- **W8 / X4 (Gelenk von Hand, ohne Grenzen):** nur `decide()` gemessen. Ein Sweep über den Weg wurde nicht
  gefahren; das Harness fährt kein Gelenk.
- **Export als 3MF/STEP wieder einlesen:** `packages/geometry` liest nur das flächenmarkierte 3MF. Ersatz hier:
  Dreieckszahl einer binären STL der Körper, die `supervisor.exportDesign` exportieren würde (alle gespiegelten
  ohne `standardParts`, `supervisor.ts:222-223`), und `inspect.measure` dieser Körper. `exportDesign`,
  `sendToSlicer` und `bodySizes` selbst liefen nicht (sie hängen am `Supervisor` der App).
- **Größenliste und Plattenansicht:** nicht gestartet (Oberfläche). Belegt ist nur ihre Eingabe
  `structure.standardParts`.
- **W42 (a) in SolidCraft 0.30.1:** nur rc.4 gemessen (Vorgabe). Ob die Mindestversion verschachtelte Formen
  annimmt, ist offen.
- **`compare_picture` mit vorhandener Datei, `sketch.replace {file}` bis zum Dateizugriff:** die Antworten
  zeigen nur, dass SolidCraft die Datei zu öffnen versucht bzw. vorher an „no sketch is being edited“ endet.
- **`plastic.lip`, `solid.thread`, `parts.resize`, `timeline.delete`, `joint.as_built`:** nur `decide()`; kein
  Bau.

## Lücken des Harness (eigene Hilfsdatei)

`tools/audit/normteile-policy-helpers.ts` ergänzt, ohne die gemeinsamen Dateien zu ändern:

- `appState()`: `Audit.measure()` gibt `structure` des Spiegels nicht heraus und prüft alle Körper; die App
  nimmt die Normteile vorher heraus. Der Helfer ruft `mirrorActiveDesign` über `audit.batch` und rechnet
  `checkPrint` und `printCheckNote` wie die App.
- `upstreamOf()`: macht aus `audit.tool` ein `UpstreamTools`, damit `Questions` und `withDrawings` der App
  darüber gelegt werden können (das Harness stapelt nur Baustein und Mechanismus).
- `finish()`: `audit.finish` scheitert bei einem Fallnamen mit Ordner (`normteile-policy/<fall>`), weil der
  Unterordner für STL und `.sc` fehlt; der Helfer legt ihn an. Die Dateien liegen deshalb unter
  `out/normteile-policy/<fall>/normteile-policy/`.
- Das Harness legt die Policy (`decide`) nicht vor die Werkzeuge; die Fälle rufen sie selbst auf und senden
  nur, was sie erlaubt.
