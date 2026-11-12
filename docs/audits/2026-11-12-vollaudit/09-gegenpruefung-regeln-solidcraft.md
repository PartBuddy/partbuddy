# 09 – Gegenprüfung KI-Regeln und SolidCraft-Abgleich (Präfix H)

Stand 12.11.2026, Zweig `docs/vollaudit-2026-11` (HEAD e29171c). Nur gelesen; nichts gebaut, nichts gestartet,
kein Test, kein SolidCraft-Aufruf. Alle Aussagen über Verhalten sind **aus dem Quelltext hergeleitet**, nicht gemessen.
Pfade ohne Präfix liegen unter `apps/desktop/src/`. Maßstab: [AUFTRAG.md](AUFTRAG.md).

Reihenfolge der Arbeit: erst der Code (eigene Suche nach allen Texten an das Modell und allen erreichbaren
SolidCraft-Werkzeugen), danach `05-ki-regeln.md` und `02-solidcraft-abgleich.md`, zuletzt die beiden Maßstab-Dateien.

Vollständig gelesen: `main/agents/` (alle 24 Dateien außer `assistantSettings.ts`, `modelChoice.ts`),
`main/print/printCheckNote.ts`, `main/print/printProfiles.ts`, `main/chat/chatArchive.ts`, `shared/standards.ts`,
`shared/mechanisms.ts`, `shared/designFit.ts`, `packages/geometry/src/printCheck.ts`,
`renderer/src/print/usePrintCheck.ts`, `main/index.ts` Z. 340–769; in Ausschnitten: `shared/blocks.ts` (50–112,
212–241), `shared/wallMount.ts`, `shared/magnet.ts`, `shared/knob.ts`, `shared/materialCatalog.ts`,
`main/solidcraft/standardParts.ts`, `main/solidcraft/mirror.ts` (55–80), `main/chatgpt/chatgptAgent.ts` (150–215),
`main/solidcraft/headless.ts` (130–160), `main/notes/notesService.ts` (190–215).
Ergebnisdateien: `05-ki-regeln.md` ganz; `02-solidcraft-abgleich.md` Z. 1–82 und 718–776 ganz, Tabelle 3 (633 Zeilen)
maschinell ausgezählt und in 45 Zeilen gelesen; `03-massstab-geometrie.md` Z. 1–11, 50–218;
`03-massstab-verbindungen.md` Z. 57–161, 197–375.

## Ergebnis in Kürze

Beide Ergebnisdateien halten der Stichprobe stand: von 46 nachgeprüften Urteilen sind 41 bestätigt (3 davon mit
ungenauer Zeilenangabe), 3 gelten nur bedingt (Nr 34–36) und 2 sind in der Sache anders zu beurteilen (H-01, H-24).
**Neu** sind 33 Befunde (A 2, B 19, C 12): 13 weitere Wege bzw. Prüflücken, auf denen ein schlechtes oder falsch
gemeldetes Modell durchgeht (H-01 bis H-13), 13 Abweichungen der Regeltexte vom Maßstab oder voneinander, die weder
05 noch die 03-Dateien führen (die 03-Dateien haben `printProfiles.ts` und die Werkzeugtexte ausdrücklich nicht
gegengehalten), und 7 Lücken bzw. Fehlurteile in den Ergebnisdateien und der Policy (H-24 bis H-30).

## 1 – Was in `05-ki-regeln.md` fehlt (Texte ohne Zeile)

Eigene Suche: `description:`, Template-Strings, `[PartBuddy:`, `GUIDANCE`, `NOTE`, `throw new Error(`, `return '…'`
in `main/` und `shared/`. 05 führt 240 Zeilen; ohne Zeile sind:

| Nr | Fundstelle | Text an das Modell | Warum es zählt |
|---|---|---|---|
| F1 | main/agents/mechanismTool.ts:359 | „the solids are built, but the bodies did not become components; join them with joint.as_built“ | kommt mit dem Vorsatz „Not built:“ (:621) beim Modell an und schickt es auf den rohen Weg → H-02 |
| F2 | main/agents/mechanismTool.ts:507 | „the guide is built, but the moving body could not be measured; join the bodies with joint.as_built {type: slider}“ | wie F1 → H-02 |
| F3 | main/agents/mechanismTool.ts:345 | „… Undo what was built, then call again.“ (Zweig ohne lesbare Undo-Tiefe) | 05 Nr 177 nennt nur den Zweig „Everything was taken back“ → H-02 |
| F4 | main/agents/mechanismTool.ts:144–155, :180, :190, :199–202, :213, :232–238, :596, :608 | Fehlertexte von `lipOf`, `pegOf`, `latchOf`, `snapOf`, `lidOf`, `screwOf`, „shape must be …“, „kind must be …“ | 05 Nr 173 nennt nur :100/:102 |
| F5 | shared/mechanisms.ts:550–553, :629–634, :712–715, :776–780 | `lidProblem`, `snapProblem`, `pegProblem`, `latchProblem` | 05 Nr 174/175 führt nur hinge, slide, closure, screw |
| F6 | shared/wallMount.ts:59–64; shared/magnet.ts:41–46; shared/knob.ts:69–78 | `keyholeProblem`, `magnetProblem`, `knobProblem` (u. a. „height must be 9–60 mm: the shaft goes in 6 mm at the least“) | 05 Nr 148 führt nur den Abflachungs-Satz aus blockTool.ts:183 |
| F7 | main/notes/notesService.ts:121, :136, :146, :158 | „added a note on …: «…»“, „changed note … to «…»“, „deleted note …“, „accepted note … from the design file: «…»“ (über `workLog.mention` in die Notiz „since your last turn …“) | 05 Nr 224/226 führt workLog und notesService.ts:206, diese vier nicht; der vierte trägt Text aus fremden Dateien zum Modell (entschärft durch `quoteForModel`) |
| F8 | main/agents/viewContext.ts:146 | „n note(s) from the design file are not shown until the user accepts them“ | Teil der `partbuddy_view`-Antwort |
| F9 | main/chatgpt/chatgptAgent.ts:177 | Namensraum-Beschreibung „SolidCraft CAD: inspect and change the open design.“ | 05 Nr 5 nennt nur den Namen; der Text stellt auch `partbuddy_*` unter „SolidCraft CAD“ |
| F10 | main/agents/drawingTool.ts:231, :238 | Vorsätze „Not placed: …“, „Not moved: …“ | „Not placed“ kommt auch, wenn platziert und nur das Zentrieren gescheitert ist (:213) → H-02 |
| F11 | shared/contract.ts (`featureBlockSchema`), über blockTool.ts:96 | zod-Standardmeldungen je Feld | 05 Nr 142 fasst sie zusammen; die Grenzen selbst (0 < x ≤ 500) stehen in R6 |
| F12 | SolidCraft selbst: Server-Anweisungen, 22 Werkzeugbeschreibungen, `skill_reference`, `list_commands`/`describe_command` (633 Befehlsdokus), Fehlermeldungen und `warning`-Felder | geht wörtlich an das Modell (gateProxy.ts:149, :151; loop.ts:75, :96; blockTool.ts:251–255) | 05 erklärt es für nicht geprüft, 02 liest es inhaltlich (S-04, S-05), eine Satz-für-Satz-Tabelle der Server-Anweisungen gibt es in keiner Datei. Offene Lücke von Phase 5 |
| F13 | shared/stepPhrases.ts (englische Phrasen) | in Arbeitslog-Notiz und Chat-Zusammenfassung | 05 erklärt es für nicht gelesen; hier ebenfalls nicht gelesen |

## 2 – Was in `02-solidcraft-abgleich.md` fehlt oder anders zu beurteilen ist

| Nr | Stelle in 02 | Befund der Gegenprüfung | Beleg |
|---|---|---|---|
| G1 | Tabelle 3, `component.metadata.set`: „**b** – PartBuddys Schlüssel gesperrt“ | Falsch beurteilt. Die Sperre prüft `key`/`keys`/`values` (policy.ts:100–106); der Befehl nimmt `description` direkt. Eine Beschreibung, die mit einem Familiennamen beginnt, macht alle Körper der Komponente zu Normteilen → H-01 | main/solidcraft/mirror.ts:74–76; main/solidcraft/standardParts.ts:52–70; renderer/src/print/usePrintCheck.ts:28–29 |
| G2 | S-03, `timeline.suppress`, `timeline.rollback`, `timeline.roll_to`: „keine FDM-Prüfung der Folgen“ | Die Folge ist härter als genannt: unterdrückte und zurückgerollte Features überspringt die Druckprüfung ausdrücklich → H-03 | packages/geometry/src/printCheck.ts:332 |
| G3 | S-06, S-07 (Argumente, die die Policy nicht ansieht) | Fehlt: die Policy ist bei unlesbarer Form offen. `params` als Text → `{}`, `commands` als Text → leere Liste, Schritt `batch` in `batch` → wie ein Engine-Befehl ohne Datei → erlaubt → H-30 | main/agents/policy.ts:113–115, :150, :155, :170 |
| G4 | Tabelle 2, partbuddy_mechanism: „Rücknahme bei losen Stücken“ | Nur lose Stücke werden zurückgenommen. Scheitert nach dem Bau das Verbinden oder Messen, bleibt die Geometrie stehen und die Antwort lautet „Not built“ → H-02; andere SolidCraft-Warnungen wirft das Werkzeug weg → H-09 | main/agents/mechanismTool.ts:333–336, :359, :492, :507, :619–621 |
| G5 | „In Ordnung befunden“, letzter Punkt (Abstand über `inspect.clearance`) | Stimmt, aber: schlägt die Messung fehl, fällt der Befund still aus (H-05); Gelenke ohne Grenzen werden nie gefahren (H-04); Farbkörper werden nach Namensmuster ausgelassen (H-27) | renderer/src/print/usePrintCheck.ts:37, :61, :68, :73 |
| G6 | Tabelle 1, `execute`: „`expect` prüft Volumen/Box“ | SolidCrafts eigene Nachprüfung nutzt kein PartBuddy-Werkzeug; Erfolgstexte stammen aus der Anfrage, nicht aus dem Körper → H-09 | main/agents/mechanismTool.ts:495–605; main/agents/blockTool.ts:212–220 |
| G7 | Zählungen | bestätigt: Tabelle 3 hat 633 Zeilen ohne Doppelte; a 549, b 36, c 12, d 36; 33 Befehle unter `file.`/`doc.`/`settings.`/`diagnostics.`; einziges „d“ außerhalb der Präfixe ist `component.insert_design` (über die path-Regel) | Auszählung der Tabelle per Skript |

Kein SolidCraft-Werkzeug der 22 fehlt in Tabelle 1; die Kette in index.ts:583–600 ist richtig wiedergegeben.

## 3 – Stichprobe: 46 Urteile nachgeprüft

„✓“ = am Code bestätigt. Rechnungen sind nachgerechnet.

| Nr | Urteil (Datei, Zeile/Kennung) | Geprüft an | Ergebnis |
|---|---|---|---|
| 1 | 05 Nr 4: nur partbuddy-Werkzeuge, erzwungen | main/agents/claudeCode.ts:352–355 | ✓ |
| 2 | 05 Nr 3 / R21: „SolidCraft is open“ veraltet | main/agents/loop.ts:22 | ✓ |
| 3 | 05 Nr 9 / R38: englische Namen aus den Werkzeugen | main/agents/blockTool.ts:117, :125, :151; mechanismTool.ts:117–229 | ✓ |
| 4 | 05 Nr 12 / R19: Kürzung 12/4/6 ohne Hinweis | main/print/printCheckNote.ts:11–13, :63 | ✓ |
| 5 | 05 Nr 13 / R1: Prüfung nur erbeten | main/agents/viewContext.ts:197–198; main/index.ts:737 | ✓; zusätzlich H-06 |
| 6 | 05 Nr 14 / R24: Bilder „[image omitted]“ | main/agents/loop.ts:79–83 | ✓ |
| 7 | 05 Nr 16 / R23: drei Texte zum Scharnier | main/agents/assemblyTool.ts:107–110; mechanismTool.ts:628; main/print/printProfiles.ts:275 | ✓ |
| 8 | 05 Nr 21 / R39: Kerbe geht durch die Deckelwand | shared/mechanisms.ts:387–398 (Zylinder, Höhe = `wall`) | ✓ |
| 9 | 05 Nr 25 / R40: latch widerspricht „no hinge“ | shared/mechanisms.ts:757–766 | **anders**, siehe H-24 |
| 10 | 05 Nr 27 / R7: Durchgangsmaß aus SolidCraft | shared/blocks.ts:219–220 (`clearance: block.size, fit`) | ✓ |
| 11 | 05 Nr 29 / R15: Magnet still 6 × 2 | main/agents/blockTool.ts:151 | ✓ |
| 12 | 05 Nr 35 / R13: Sperre fällt mit jeder Nachricht | main/agents/questions.ts:189 vor :192–199 | ✓ |
| 13 | 05 Nr 46 / R42: „document commands“ falsch | main/agents/policy.ts:88; `doc.open`, `doc.recover` … stehen in 02 Tabelle 3 | ✓ |
| 14 | 05 Nr 55 / R18: ohne Bericht kein Prüftext | main/index.ts:373 | ✓ |
| 15 | 05 Nr 60 / R12: Zeichnungs-Werkzeuge nicht gesperrt | main/agents/workLog.ts:24 | ✓ |
| 16 | 05 Nr 102 / R5: drei Linien = 1,35 mm | shared/standards.ts:69; shared/designFit.ts:20–22 | ✓ |
| 17 | 05 Nr 109 / R4: 2,25/2,75 gegen 2,0/2,5 | shared/standards.ts:81 | ✓ |
| 18 | 05 Nr 118 / R47: nutTrap M2–M10 | shared/blocks.ts:60–64 | ✓ |
| 19 | 05 Nr 122 / R10: tappedHole ohne M5-Grenze | shared/blocks.ts:60–64, :218; shared/mechanisms.ts:426, :450 | ✓; 05 nennt :427, :444 (ungenau) |
| 20 | 05 Nr 133 / R48: `more`-Grenzen uneinheitlich | main/agents/blockTool.ts:94, :110; shared/wallMount.ts:63; shared/magnet.ts:45 | ✓ |
| 21 | 05 Nr 141: Fehlertext nennt vier Blöcke nicht | main/agents/blockTool.ts:81, :229 | ✓ |
| 22 | 05 Nr 156 / R11: Hautprüfung nur mit `wall` | main/agents/mechanismTool.ts:488 | ✓ |
| 23 | 05 Nr 164 / R50: 8,1 und 14,1 | shared/mechanisms.ts:769–772 (5 + 1,5 + 1,6; 12 − 1 + 1,1 + 2) | ✓ |
| 24 | 05 Nr 169 / R51: `more` 40 gegen 20 | shared/mechanisms.ts:634, :715 | ✓ |
| 25 | 05 Nr 170, 174 / R20: Rat führt in die nächste Ablehnung | shared/mechanisms.ts:63–68: d 4 → Wand 0,6; d 5 → Dach 2,5 − 1,65 · 1,05 = 0,77; 0,6-Düse, d 6 → 3 − 2,1 · 1,05 = 0,795 | ✓ |
| 26 | 05 Nr 172 / R30: `gap`-Text falsch für lid | main/agents/mechanismTool.ts:64, :221; shared/mechanisms.ts:553, :714 | ✓ |
| 27 | 05 Nr 186: 1,42 % | shared/blocks.ts:107–110: 150 · 1,5 · 0,8 / 11,25² | ✓ |
| 28 | 05 Nr 187: 1,33 % | 1,5 · 1,6 · 0,8 / 12² | ✓ |
| 29 | 05 Nr 191 / R32: push unskaliert | renderer/src/print/usePrintCheck.ts:54, :59, :62 | ✓ |
| 30 | 05 Nr 193 / R55: `supportFree` nicht in der Prüfung | renderer/src/print/usePrintCheck.ts:30 | ✓ |
| 31 | 05 Nr 204 / R36: Texttiefe fest 0,6 | shared/blocks.ts:79 | ✓; 05 nennt :77 (ungenau) |
| 32 | 05 Nr 213: Sperre erst ab 5 mm² | packages/geometry/src/printCheck.ts:100, :349 | ✓ |
| 33 | 05 Nr 216 / R37: Auflage über alle Körper | packages/geometry/src/printCheck.ts:371, :389, :410 | ✓ |
| 34 | 05 Nr 217: overlap „ok“ | packages/geometry/src/printCheck.ts:442 (`warn`); main/print/printCheckNote.ts:62, :64 | Text stimmt; Einstufung fehlt → H-12 |
| 35 | 05 Nr 155: Stege „ok“ | shared/mechanisms.ts:123; main/agents/mechanismTool.ts:428, :433–437 | nur bedingt → H-07, H-08 |
| 36 | 05 Nr 192: „(its print face is set)“ „ok“ | main/index.ts:574–577 | nur mit Projektordner → H-13 |
| 37 | 05 Nr 231 / R58: Notiz ohne Bild | main/local/localAgent.ts:262–265; main/index.ts:741–743 | ✓ |
| 38 | 05 Nr 237 / R57: 25 Runden, Ende „ok“ | main/chatgpt/chatgptAgent.ts:180, :205; main/agents/loop.ts:38 | ✓; 05 nennt :181, :206 (ungenau) |
| 39 | 05 Nr 152 / R49: erster Satz gilt nur für hinge/slide | main/agents/mechanismTool.ts:20 | ✓ |
| 40 | 02 Policy-Zählung: 16 erlaubt, 4 mit Grund abgelehnt | main/agents/policy.ts:14–29, :56–61 | ✓ |
| 41 | 02 S-01: 12 Familien, Senkschraube fehlt | main/solidcraft/standardParts.ts:52–65; shared/mechanisms.ts:470 | ✓ (Code); Beschreibungstext der Senkschraube nicht gemessen |
| 42 | 02 S-03: Negativliste | main/agents/policy.ts:118–147 | ✓ |
| 43 | 02 S-04: Werkzeugliste ungefiltert | main/agents/gateProxy.ts:151; main/agents/loop.ts:96 | ✓ |
| 44 | 02 S-06: `batch {path}` ungeprüft | main/agents/policy.ts:150 | ✓ (Policy-Seite); SolidCraft-Seite nicht geprüft |
| 45 | 02 S-07: `screenshot {path}` ungeprüft | main/agents/policy.ts:166–173 | ✓ |
| 46 | 02 `component.metadata.set` = b | main/solidcraft/mirror.ts:74–76 | **falsch**, siehe H-01 |

## 4 – Weitere Wege zu einem schlechten Modell, das als fertig gemeldet wird

05 Teil 3 führt W1–W22. Zusätzlich gefunden (keiner davon steht dort):

| Weg | Werkzeugfolge | Was passiert (nach Code) | Befund |
|---|---|---|---|
| X1 | `execute component.metadata.set {component: "Deckel", description: "Hex nut M3"}` | Körper gilt als Normteil: aus Druckprüfung, Größenliste und Export heraus; Prüfung meldet „ready“ | H-01 |
| X2 | `partbuddy_mechanism hinge` → Knöchel gebaut → `joint.as_built` scheitert (Name vergeben, Komponente) → „Not built: SolidCraft refused …“ → Modell ruft erneut auf | Knöchel, Räume und Stift doppelt; oder das Modell meldet „nicht gebaut“, obwohl gebaut ist | H-02 |
| X3 | Feature schlägt fehl (Prüfung „blocks printing: feature … reports …“) → `execute timeline.suppress` | Befund verschwindet, Prüfung „ready“, das Feature fehlt am Teil | H-03 |
| X4 | Gelenk von Hand (`joint.as_built`) ohne `joint.limits`, oder Mechanik mit „no limits are set“ | kein Sweep in der Prüfung; Kollision über den Weg wird nie gemeldet | H-04 |
| X5 | Zwei Körper überlappen; `inspect.clearance` läuft in eine Zeitgrenze | Messung fällt still aus; Notiz „ready to print, nothing found“ | H-05 |
| X6 | Nutzer ändert in der Oberfläche und schreibt sofort; Messung des neuen Stands läuft noch | Notiz „of the part as it is now“ beschreibt den alten Stand | H-06 |
| X7 | `partbuddy_mechanism hinge` mit geneigter Linie (z. B. 30° zur Ebene) | kein Dach, keine Stege, keine Ablehnung; Antwort „Built the hinge …“ | H-07 |
| X8 | Scharnier, Probe-Batch scheitert (SolidCraft liefert keine Teilergebnisse) | keine Stege, keine Hautprüfung, kein Wort davon | H-08 |
| X9 | `partbuddy_mechanism snap` mit `from` neben der Wand, oder `screw` mit `to` vor der Fuge | Fenster bzw. Loch trifft nichts oder endet im Teil; Antwort nennt „its window through the wall“ | H-09 |
| X10 | Deckel offen neben der Box gebaut, `closure` ohne Scharniergelenk | geschlossener Zustand wird nie geprüft (kein Gelenk, keine Überschneidung im offenen Zustand) | H-10 |
| X11 | Langes Gespräch mit Claude Code, Kontext wird verdichtet | Druckprofil und Konstruktionsregeln stehen nur in der ersten Nutzernachricht und werden nicht erneut gesendet | H-11 |
| X12 | Baugruppe mit überlappenden Teilen | nur Warnung; Schlusssatz verlangt nur das Beheben von Sperren; Status „prints, with warnings“ | H-12 |

Aus 02 bekannt und hier nur als Weg benannt: `browser.visibility {visible: false}` nimmt einen Körper aus Spiegel,
Prüfung und Export (02 Tabelle 3, unter S-03); `solid.scale` nach einem Baustein (S-18); `document.units` (S-22).

## 5 – Zahlen der Regeltexte gegen den Maßstab

MG = `03-massstab-geometrie.md` (S1–S35), MV = `03-massstab-verbindungen.md`. Geprüft sind die Zahlen, die im Text an
das Modell stehen; Zahlen, die 05/03 schon als Befund führen, sind mit deren Kennung vermerkt.

| Nr | Regeltext (Fundstelle) | Zahl im Text | Maßstab | Ergebnis |
|---|---|---|---|---|
| Z1 | main/print/printProfiles.ts:301 | Wand unter 2 Linien (0,9 mm) „print poorly“ | MG S3–S5: 1 Linie druckbar; 1,0 mm gestützt, 1,2 mm frei | Abweichung, in MG-08 |
| Z2 | printProfiles.ts:265, :283, :301 | Detail mindestens Düse (0,4 mm) | MG S3/S27: Linienbreite 0,45; 0,5 kleinstes Merkmal; 1,0 haltbar | Abweichung → H-23 (Code: MG-11) |
| Z3 | printProfiles.ts:302 | Überhang PLA 45°, PETG 40°, TPU 35° | MG S6 45°; S7 keine Gradzahl je Material | PLA ✓; PETG/TPU ohne Quelle (MG-30) |
| Z4 | printProfiles.ts:302 | Löcher „about 0.15 mm smaller“ (PLA) | MG S10: kein allgemeiner Betrag, ein Messwert 0,1; MV: + 0,25 mm Ø (HU-E) | Abweichung → H-32 |
| Z5 | printProfiles.ts:53–57, :302 | Startwerte PETG 0,2; PETG-CF 0,2; ASA 40°/0,2; TPU 0,25 | shared/materialCatalog.ts: 0,15; 0,1; 45°/0,15; 0,1 | zwei Tabellen → H-14 |
| Z6 | printProfiles.ts:303 | Spiel je Seite PLA 0,05/0,15/0,25/0,3 | MV: Schiebesitz 0,1–0,2 ✓; Gleit 0,20–0,30 ✓; beweglich ≥ 0,3 (konservativ 0,5) | push, slide ✓; turn an der Untergrenze |
| Z7 | printProfiles.ts:266 | „press fit“ = + 0,05 mm Spiel | MV: Presssitz = Übermaß 0,05–0,15 | Abweichung → H-20 |
| Z8 | printProfiles.ts:303, :266 | Spiel × Düse / 0,4 | MG: keine Quelle skaliert | in MG-12 |
| Z9 | printProfiles.ts:230 | Bettkante 45°-Fase statt Rundung | MG S14 | ✓ |
| Z10 | printProfiles.ts:231 | liegende Löcher „up to about 10 mm“ rund | MG S13: 8 mm (eine Quelle); S9: 5 mm sauber | Abweichung → H-15 |
| Z11 | printProfiles.ts:232 | Decken bis 10 mm überbrückt | MG S9: 5 mm sauber, 10 mm Obergrenze | Abweichung, in R9 / MG-24 |
| Z12 | printProfiles.ts:232 | Absätze bis 1,5 mm | MG S8: 1,2 mm; Prüfung 1,8 mm (overhang.ts:71–73) | Abweichung → H-16 |
| Z13 | printProfiles.ts:265 | Spalt unter 0,2 mm „under what prints“ | MG S34: ≥ 0,3, konservativ 0,5 | Abweichung, in MG-07 |
| Z14 | printProfiles.ts:271 | Bettfase 2–3 Schichten (0,4–0,6 mm) | MG S15: ≥ 0,25 mm | ✓ |
| Z15 | printProfiles.ts:271 | Innenradius ≥ halbe Wand, ≥ max(1; 2 × Düse) | MG S26: ≥ ¼ Wand | ✓ (strenger) |
| Z16 | printProfiles.ts:271 | Außenradien 1/2/3 mm | kein Maßstab | eigene Wahl, nicht prüfbar |
| Z17 | printProfiles.ts:275 | Print-in-place-Spalt max(0,3; Düse) | MV 0,30–0,40 je Seite; MG S34 konservativ 0,5 | innerhalb MV; in MG-06 |
| Z18 | printProfiles.ts:275 | Schnapparm ≥ 5 × Dicke | MV: ε = 1,5 · h · y / l² (Bayer) | Abweichung → H-17 |
| Z19 | printProfiles.ts:275 | Einlauf 30–45° | kein Maßstab | nicht prüfbar |
| Z20 | printProfiles.ts:279 | Schrift ≥ max(0,6; 3 Schichten) tief | MG S29/S30: 0,5 mm | ✓ |
| Z21 | printProfiles.ts:279 | Strich ≥ 2 × Düse (0,8 mm) | MG S29/S30: konservativ 1,0 mm | Abweichung → H-18 |
| Z22 | printProfiles.ts:283 | Böden/Deckel ≥ max(0,8; 4 Schichten) | MG S4: 0,8–1,0, konservativ 1,0 | Abweichung → H-22 |
| Z23 | main/agents/mechanismTool.ts:32 | Zapfen: 0,2 je Seite „to slide and glue“ | MV Schiebesitz 0,1–0,2 | ✓ |
| Z24 | mechanismTool.ts:32, :64 | Zapfen: 0,1 je Seite „to press“ | MV: Presssitz = Übermaß | Abweichung → H-20 |
| Z25 | mechanismTool.ts:64 | hinge/slide ab 0,2 mm | MV: ≥ 0,3 | in MV-03 |
| Z26 | mechanismTool.ts:221, :64 | Schraubdeckel 0,3 mm radial (0,75 × Düse) | MV gedruckte Gewinde 0,10–0,20 radial | Abweichung → H-31 |
| Z27 | mechanismTool.ts:29, :53; blockTool.ts:32 | modelliertes Gewinde „from M5“ | MV: M6 (konservativ) | in MV-06 |
| Z28 | mechanismTool.ts:560 | „at least 2 mm of plastic around each insert“ | MV ruthex W min: M4 2,1; M5 2,6; M6 3,3 | Abweichung → H-19 |
| Z29 | mechanismTool.ts:558 | Einsatzsitz Länge + 1 mm | MV (HH) | ✓ |
| Z30 | mechanismTool.ts:571 | stehender Arm bricht „at about half the strain“ | MG S16: Z-Zug ≤ 25–33 % von XY | Abweichung → H-21 |
| Z31 | mechanismTool.ts:571, :582 | „PETG or ABS rather than PLA“ | MV (HU-S, SO-S) | ✓ |
| Z32 | mechanismTool.ts:604 | Zapfen unter 5 mm stehend schwach | MV (HU-F) | ✓ |
| Z33 | main/agents/blockTool.ts:134 | Schlüsselloch: Brücke 8–11 mm „without support“ | MG S9: 5 mm | in MV-13 / R9 |
| Z34 | blockTool.ts:162 | Magnet: 1,2 mm Rand | MG S5: 1,2 mm | ✓ |
| Z35 | blockTool.ts:162 | Magnet: 0,6 mm Boden | MG S4: 0,8–1,0 mm | Abweichung → H-22 |
| Z36 | blockTool.ts:62, :161 | Magnet: + 0,3 Ø Kleben, + 0,1 Ø Pressen | MV: Kleben 0,2–0,5 ✓; Pressen = Übermaß | Pressen in MV-17 |
| Z37 | blockTool.ts:118 | Holzschraube: Durchgang und Senkung | MV DIN 74 Form A + 0,2 | ✓ |
| Z38 | shared/standards.ts:18 | Schiebedeckel 0,3 je Seite | MV Gleit 0,20–0,30 | ✓ |
| Z39 | standards.ts:40 | Bettfase 0,4 mm | MG S15 ≥ 0,25 | ✓ |
| Z40 | standards.ts:49 | Hakenradius ≥ Hakendicke | MG S26 | ✓ (strenger) |
| Z41 | standards.ts:51 | Ösen „0.2 mm more for print“ | MV + 0,25 Ø | knapp darunter; siehe H-32 |
| Z42 | standards.ts:69 | Stege ≥ 1,2 mm; liegender Schlitz bis 5 mm | MG S5 1,2; S9 5 mm | ✓ (Linienzahl falsch: R5) |
| Z43 | standards.ts:82 | Stifte 0,3 mm unter Lochmaß (2,4 mm bei Pi); Haken 1 mm am Fuß | MG S28: konservativ 3 mm; MV (JLC): Schnappformen > 1,5 mm | Abweichung → H-33 |
| Z44 | standards.ts:80, :81, :94, :95 | Abstandshalter, Kernloch, Sechskant, Muttern | MV | in MV-27, MV-18, ✓, MV-22 |
| Z45 | standards.ts:37, :47–48, :58–62, :71–72 | 3M, CNC Kitchen, Kabel, EN 60423, IP, Lüfter | in keinem Maßstab | nicht prüfbar (siehe unten) |

## Befunde

| Kennung | Schwere | Datei:Zeile | Ist | Soll (mit Quelle/Begründung) | Nachstellen |
|---|---|---|---|---|---|
| H-01 | A | main/solidcraft/mirror.ts:74–76; main/solidcraft/standardParts.ts:52–70; main/agents/policy.ts:98–106, :125; renderer/src/print/usePrintCheck.ts:28–29 | Ob ein Körper Normteil ist, entscheidet der Beschreibungstext seiner Komponente (`description` beginnt mit „Hex nut “, „Plain washer “ …). `component.metadata.set {component, description}` ist für den Assistenten offen: die Sperre sieht nur `key`/`keys`/`values`. Ein so beschriebener Druckkörper fällt aus Druckprüfung, Größenliste (supervisor.ts:307–309) und Export; die Prüfung meldet „ready to print“. 02 stuft den Befehl als „b – geschützt“ ein. | Normteil ist nur, was `parts.insert` erzeugt hat: Markierung im eigenen Metadaten-Schlüssel beim Einsetzen (wie supervisor.ts:529–530) bzw. Abgleich mit `parts.library`; `component.metadata.set` mit `description`/`part_number` für den Assistenten ablehnen. AUFTRAG Schwere A: falsche Aussage an den Nutzer. | Zwei Körper als Komponenten, `execute component.metadata.set {component: "<Name>", description: "Hex nut M3"}`; `structure.standardParts` lesen, Druckprüfung und 3MF-Körperzahl ansehen. Aus dem Code hergeleitet, nicht gebaut. |
| H-02 | A | main/agents/mechanismTool.ts:345, :359, :492, :507–508, :619–621; main/agents/drawingTool.ts:213, :227–232 | Fehler **nach** dem Bau werden als „Not built: …“ gemeldet, die Geometrie bleibt: scheitert `join` (`component.from_bodies`, `joint.as_built`, `joint.limits`) oder die Messung der Führung, steht alles im Modell. Drei Texte widersprechen sich im selben Satz („Not built: the guide is built, but …“) und schicken das Modell auf `joint.as_built`. Ebenso „Not placed: …“, wenn das Logo platziert und nur das Zentrieren gescheitert ist. Ein zweiter Aufruf baut doppelt. | Nach dem Bau gibt es zwei Zustände: zurückgenommen (Undo bis `before.undo` wie :346) und dann „Not built“, oder gebaut und dann ein Erfolgstext mit dem, was fehlt („Built the hinge; the joint could not be made: …“). Nie beides. Harte Prüfung im Werkzeug vor Prompt-Zeile (AUFTRAG Phase 5). | Phase 4: zwei Scharniere mit Vorgabenamen „Hinge“ nacheinander bauen (Gelenkname doppelt) und Antwort gegen `inspect_design` halten; Logo mit `centre` auf einer Fläche, an der `planLogoMove` scheitert. |
| H-03 | B | packages/geometry/src/printCheck.ts:332; main/agents/policy.ts:146 | Unterdrückte und zurückgerollte Features überspringt die Prüfung. `timeline.suppress`, `timeline.rollback`, `timeline.roll_to` sind offen. Ein Feature mit Fehler wird durch Unterdrücken „behoben“; ein zurückgerollter Verlauf zeigt und prüft ein unvollständiges Teil ohne Hinweis. | Befundart „suppressed/rolled back: n features are not part of the part as checked“ (Warnung), und nach einem Zug des Assistenten mit zurückgerolltem Verlauf Sperre. | Feature mit Fehler erzeugen (Fase größer als die Wand), `timeline.suppress`, Notiz der Prüfung lesen. |
| H-04 | B | renderer/src/print/usePrintCheck.ts:66–70; main/agents/mechanismTool.ts:456–457, :493 | Gefahren werden nur Gelenkwerte mit Grenzen (`limit !== null`), höchstens 40. Ein Gelenk ohne Grenzen (von Hand gebaut, oder Mechanik mit „no limits are set“) wird nie auf Kollision geprüft; nichts meldet „Gelenk ohne Grenzen“. | Befundart „joint … has no limits: its range was not checked“; bei mehr als 40 Fahrten sagen, wie viele entfielen. | Zwei Körper, `joint.as_built` ohne `joint.limits`, Körper so, dass sie bei 20° kollidieren; Prüfung zeigt nichts. |
| H-05 | B | renderer/src/print/usePrintCheck.ts:56–62, :71–77; main/print/printCheckNote.ts:61 | Scheitert `design.clearance` oder `design.sweepJoints` (`catch → null` bzw. `[]`), fallen Überlappung, Enge und Gelenkbefunde still aus; die Notiz lautet dann „ready to print, nothing found“. | Bericht trägt, was nicht gemessen werden konnte; Notiz: „clearance between the bodies could not be measured“ und kein „ready“. | Messung mit vielen Körpern in die Zeitgrenze laufen lassen (oder im Test `clearance` ablehnen) und Notiz lesen. |
| H-06 | B | main/index.ts:737 gegen :372–377; renderer/src/print/usePrintCheck.ts:39–48, :82–86 | Bei mehreren Körpern oder Gelenken geht der Bericht erst nach den Messungen an den Hauptprozess. `partbuddy_view` vergleicht die Revision („still running“), die Notiz zur nächsten Nutzernachricht nicht: sie nennt einen älteren Stand „the part as it is now“. | Dieselbe Revisionsprüfung in :737; bei Abweichung die Zeile „check of the latest change is still running“. | Lesen; Phase 4: großen Mehrkörper ändern und sofort senden. |
| H-07 | B | shared/mechanisms.ts:66, :123, :158; main/agents/mechanismTool.ts:20–22, :495–498 | Dach der Bohrung und Stege gibt es nur bei waagrechter Linie. Jede andere Linie (geneigt, senkrecht) wird ohne Dach, ohne Stege und ohne Hinweis gebaut; die Beschreibung verspricht „printed in one piece without support“. Bei senkrechter Linie liegt die flache Unterseite jedes oberen Knöchels einen Spalt (0,3–0,4 mm) über dem unteren. | Geneigte Linien ablehnen („the hinge line must be level or upright“); für senkrechte Linien die Knöchelenden als 45°-Kegel oder im Ergebnis ehrlich sagen, was Stütze braucht (MG S6, S34). | Phase 4: Scharnier mit Linie [0,0,0]–[20,0,10] und mit [0,0,0]–[0,0,20] bauen, Überhang in der Druckprüfung lesen. |
| H-08 | B | main/agents/mechanismTool.ts:386–438 (:428, :431–437), :478–481, :498 | Die Stege und die Hautprüfung hängen an einem Probe-Batch, der absichtlich fehlschlägt. Liefert er nichts (`catch → null`), liegt ein Körper über/unter der Linie (`side → null`) oder fehlt die Box, baut das Werkzeug ohne Stege und ohne Hautprüfung und sagt es nicht. Das Bett ist der tiefste Punkt in Konstruktionslage; eine gesetzte Druckfläche bleibt unbeachtet. | Im Ergebnis sagen, was nicht gemessen wurde („walls and bed could not be measured: no webs were added; check that the knuckles start on the bed“), Bett aus der Druckfläche des Körpers. | Test: `roomDepths` mit einem Upstream, dessen Batch-Fehler keine `results` trägt → Antworttext lesen. |
| H-09 | B | main/agents/mechanismTool.ts:333–336, :495–605; main/agents/blockTool.ts:212–220 | Das Mechanik-Werkzeug wertet aus SolidCrafts Antworten nur „separate pieces“ aus; jede andere Warnung fällt weg (der Block gibt sie weiter, blockTool.ts:251–255). Erfolgstexte nennen die angefragten Maße, nicht die gebauten: ein Schnitt, der nichts trifft (Fenster neben der Wand, Schraubenloch vor der Fuge, Rille außerhalb der Wand), wird als „Built … its window through the wall“ gemeldet. `execute`s `expect` (Volumen/Box) wird nicht genutzt. | Je Schritt Volumen vor/nach prüfen (ein Schnitt muss abtragen, ein Anfügen zulegen), sonst zurücknehmen und sagen, welcher Schritt nichts traf; alle Warnungen weitergeben. | Phase 4: `snap` mit `from` 5 mm neben der Wand; Antwort gegen Volumen des Körpers halten. |
| H-10 | B | main/agents/mechanismTool.ts:26–27, :518–528; shared/mechanisms.ts:352–359, :376–386 | `closure` macht kein Gelenk und prüft nur die Überschneidung im gebauten Zustand. Ist der Deckel offen neben der Box gebaut, wird der geschlossene Zustand nie geprüft: Lippe gegen Boxwand (Innenraum der Box ungleich dem des Deckels), Lage der Rille. Ohne `hinge_from`/`hinge_to` landet die Rille an der offenen Lage. | Bei offen gebautem Deckel die Scharnierlinie verlangen und den geschlossenen Zustand auf Probe prüfen (Gelenk auf Anschlag, `inspect.interference`, zurück). | Phase 4: Box mit 3 mm Wand, Deckel mit 2 mm Wand, offen gebaut, `closure`; Gelenk schließen, Überschneidung messen. |
| H-11 | B | main/print/printProfiles.ts:315–328; main/index.ts:736; main/agents/claudeCode.ts:345–360 | Druckprofil und alle Konstruktionsregeln (`printNote`) gehen einmal je Gespräch als Teil der Nutzernachricht. Verdichtet Claude Code seinen Kontext in einem langen Gespräch, sind sie weg; `ProfileNote.take` sendet nur bei geändertem Text erneut. | Regeln, die immer gelten, in den Systemteil (`--append-system-prompt` bzw. `instructions`); das Profil bei jeder n-ten Nachricht oder nach einem Verdichtungs-Ereignis erneut. | Nicht gemessen: Verhalten von Claude Code bei vollem Kontext (Phase 7, langer Lauf; Trace über `PARTBUDDY_CLAUDE_TRACE`). |
| H-12 | B | packages/geometry/src/printCheck.ts:365, :442, :449, :470; main/print/printCheckNote.ts:43, :62, :64 | Überlappende Körper („as separate parts they do not go together“), blockierte Gelenke und berührende Körper sind Warnungen; der Status heißt „prints, with warnings“, der Schlusssatz verlangt nur das Beheben von Sperren. Eine Baugruppe, die sich nicht fügen lässt, gilt als druckfertig. | Schlusssatz: „Fix what blocks printing, and either fix or name to the user every warning about parts that overlap, are too tight or stop a joint.“ Überlappung zwischen Körpern mit Gelenk oder Montageschritt als Sperre. | Zwei Körper mit 1 mm³ Überlappung; Notiz lesen. |
| H-13 | B | main/index.ts:574–577; main/agents/blockTool.ts:201, :249–250; main/agents/mechanismTool.ts:537–543 | PartBuddy merkt sich die Druckfläche nur mit offenem Projektordner (`if (!folder) return`). Ohne ihn sagt das Werkzeug weiter „(its print face is set)“, Prüfung und Plattenansicht legen den Knopf oder Deckel aber wie konstruiert. | Ohne Ablage die Aussage weglassen oder die Druckfläche im Speicher halten, bis das Design eine Datei hat (wie `PrintProfiles.pending`). | Design außerhalb des Projektordners öffnen, `partbuddy_block knob`, `print-faces.json` und Prüfung ansehen. Wie oft der Fall eintritt, ist nicht geprüft. |
| H-14 | B | main/print/printProfiles.ts:53–57 gegen shared/materialCatalog.ts:27–43 | Zwei Tabellen für dieselben Werkstoffe: Startprofil PETG Lochaufmaß 0,2, PETG-CF 0,2, ASA 40°/0,2, TPU 0,25; Katalog 0,15, 0,1, 45°/0,15, 0,1. Welche Zahl im Regeltext steht („holes come out about … smaller“), hängt davon ab, ob der Nutzer das Material je aus dem Katalog gewählt hat. | Eine Quelle: das Startprofil aus `MATERIAL_CATALOG` erzeugen. | Frische Installation: `printNote` für PETG lesen (0,2 mm); PETG aus dem Katalog wählen (0,15 mm). |
| H-15 | B | main/print/printProfiles.ts:231 | „Holes lying across the layers: up to about 10 mm wide the slicer bridges them.“ | MG S13: rund ohne Stütze bis Ø 8 mm, darüber Tropfen/Raute (eine Quelle); MG S9: Brücke 5 mm sauber. Konservativ 8 mm; eine Konstante mit R9. | Lesen. |
| H-16 | C | main/print/printProfiles.ts:232; packages/geometry/src/overhang.ts:71–73 | „ledges up to 1.5 mm out from a wall print“; die Prüfung lässt 1,8 mm durch. | MG S8: 1,2 mm (eine Quelle mit Maß). Ein Wert für Text und Prüfung. | Lesen. |
| H-17 | B | main/print/printProfiles.ts:275; shared/blocks.ts:107–110; shared/mechanisms.ts:625 | „Snap arms at least five times as long as thick.“ Mit dem Haken des eigenen Bausteins (1,5 dick, Nase 0,8) ergibt Länge 7,5 mm 1,5 · 1,5 · 0,8 / 7,5² = 3,2 % (nach `snapStrain` mit Hebel 6,75 mm: 3,95 %). Das eigene Werkzeug baut 12 mm (8 ×, 1,4 %). | MV: ε = 1,5 · h · y / l² (Bayer); zulässige Dehnung je Werkstoff fehlt (MV-12). Regel als Dehnung statt als Verhältnis: „long enough that the root bends by at most 1.5 %“, oder Verweis auf das Werkzeug. | Rechnung. |
| H-18 | C | main/print/printProfiles.ts:279 | Schrift „2 × nozzle wide per stroke“ = 0,8 mm. | MG S29/S30: konservativ 1,0 mm Strich. | Lesen. |
| H-19 | B | main/agents/mechanismTool.ts:560 | „Leave at least 2 mm of plastic around each insert“ für jede Größe. | MV (ruthex, CNC Kitchen): Wand mindestens M4 2,1, M5 2,6, M6 3,3 mm. Wert aus der Tabelle je Größe (zusammen mit MV-02). | `partbuddy_mechanism screw` M6: Antworttext lesen. |
| H-20 | B | main/agents/mechanismTool.ts:32, :64; main/print/printProfiles.ts:266 | „0.1 to press“ ist 0,1 mm **Spiel** je Seite; „press fit“ im Profil ist + 0,05 mm Spiel je Seite. Ob das Lochaufmaß dazukommt, sagt kein Text. | MV: Presssitz ist Übermaß 0,05–0,15 mm. Wort und Wert angleichen („snug“ statt „press“) oder mit Lochaufmaß rechnen und es sagen. | Lesen; Phase 4: Zapfen mit `gap: 0.1` drucken. |
| H-21 | C | main/agents/mechanismTool.ts:571 | „breaks along its layers at about half the strain“. | MG S16: Festigkeit quer zu den Schichten 20–33 % der liegenden. „about a quarter to a third of the strength“ oder ohne Zahl (ergänzt R31). | Lesen. |
| H-22 | C | main/agents/blockTool.ts:162; main/print/printProfiles.ts:283 | Magnet: „0.6 mm under it“; Böden und Deckel „at least 0.8 mm“ (bei 0,2 mm Schicht). | MG S4: 0,8–1,0 mm, konservativ 1,0 mm. | Lesen. |
| H-23 | C | main/print/printProfiles.ts:265, :283, :301 | Mindestdetail im Text = Düsendurchmesser. | MG S3/S27: Linienbreite; haltbar 1,0 mm (Code: MG-11). | Lesen. |
| H-24 | C | 05-ki-regeln.md R40, Nr 25; shared/mechanisms.ts:757–766; main/agents/mechanismTool.ts:34 | R40 liest den Kommentar „decided 2026-11-11: no hinge, whose play is larger than any catch“ als „kein Riegel an Deckeln mit Scharnier“. Der Kommentar beschreibt den Riegel selbst (ein Schnapparm statt eines Riegels mit eigenem Gelenk); „Opposite the lid's hinge“ widerspricht dem nicht. Zeilenangaben in 05 ungenau: mechanisms.ts:427/:444 (richtig :426/:450), blocks.ts:77 (richtig :79), chatgptAgent.ts:181/:206 (richtig :180/:205). | R40 als Messfrage führen, nicht als Widerspruch: hält der Riegel bei 0,4 mm Scharnierspiel (Überdeckung 0,8 mm)? Kommentar eindeutig fassen. | Phase 4: Scharnier + latch bauen, Gelenk schließen, Überdeckung messen. |
| H-25 | C | 05-ki-regeln.md Teil 1 | 13 Textquellen ohne Zeile (Abschnitt 1, F1–F13), darunter drei, die auf `joint.as_built` verweisen, und die vier Notiz-Meldungen. | Zeilen nachtragen; F12 (SolidCrafts Server-Anweisungen Satz für Satz) mit laufendem SolidCraft mitschneiden. | – |
| H-26 | B | main/agents/mechanismTool.ts:359, :457, :507 | Drei Werkzeugtexte fordern das rohe `joint.as_built` bzw. `joint.limits` „yourself“, während MECHANISM_GUIDANCE (:628) genau das untersagt. | Das Werkzeug schließt selbst ab oder nimmt zurück (H-02); kein Verweis auf den rohen Weg. | Lesen. |
| H-27 | C | shared/drawingPlacement.ts:46–48; renderer/src/print/usePrintCheck.ts:37; main/agents/drawingTool.ts:242–247 | Farbkörper eines Logos erkennt PartBuddy am Namen (`… <6 Hex-Zeichen> <Zahl>`); solche Körper werden nicht auf Überlappung und Enge gemessen. Geschützt ist nur `params.name` mit dem Logo-Vorsatz, nicht `body_name` oder `body.rename`. Ein Körper „Front facade 1“ fällt aus der Messung. | Markierung im eigenen Metadaten-Schlüssel statt Namensmuster. | `solid.box {body_name: "Teil decade 1"}` neben einem zweiten Körper mit Überlappung; kein Befund. |
| H-28 | C | main/agents/designTool.ts:17–20, :36–44 | „Only for what the user said“ ist eine Bitte. Der Assistent kann Regelgruppen selbst abschalten; die nächste Profil-Notiz sagt dann „The user turned off …“ (printProfiles.ts:286). | Karte zur Bestätigung (wie `partbuddy_ask`) oder die Notiz ehrlich: „turned off in the chat“. | Lesen. |
| H-29 | B | main/print/printCheckNote.ts:60–64; packages/geometry/src/printCheck.ts:286–287 | Kopfzeile „each body lying on its print face when it has one“: gibt es die gemerkte Fläche nicht mehr (Name geändert, Körper umbenannt), legt die Prüfung still „wie konstruiert“ (in 01-inventur-druck-export-ui Zeile 26 als D20 vermerkt); der Text an das Modell sagt es nicht. | Befund „print face of … no longer exists: checked as designed; set it again“. | Druckfläche setzen, Fläche durch Fase ändern, Notiz lesen. |
| H-30 | B | main/agents/policy.ts:113–115, :150–156, :170 | Die Policy ist bei unlesbarer Form offen: `params` als Text oder Liste wird zu `{}` (keine Pfad- und Metadatenprüfung), `commands` als Text zu einer leeren Schrittliste, ein Schritt `{command: "batch", params: {commands: […]}}` wird wie ein Engine-Befehl behandelt und nicht hineingesehen. Ob SolidCraft solche Formen annimmt, ist nicht geprüft. | Was die Policy nicht lesen kann, lehnt sie ab („params must be an object“, „commands must be a list“, „batch cannot be a batch step“). ADR 0010: jede Änderung läuft durch die Policy. | `decide("execute", {command: "sketch.insert_svg", params: "{\"path\":\"/abs/x.svg\"}"})` → `allow: true`; Wirkung in SolidCraft in Phase 4. |
| H-31 | C | main/agents/mechanismTool.ts:221; shared/mechanisms.ts:553 | Schraubdeckel: Vorgabespalt 0,3 mm radial (0,75 × Düse, bis 0,6). | MV: gedruckte Gewinde 0,10–0,20 mm radial; für Deckel großer Dosen nennt der Maßstab keinen eigenen Wert. Anwendbarkeit offen: Wert in Phase 4 am Druck belegen oder Quelle nachtragen (MV „nicht geprüft: Schraubdeckel“). | Deckel Ø 60 drucken, Spiel prüfen. |
| H-32 | C | main/print/printProfiles.ts:302; shared/standards.ts:51 | „holes come out about 0.15 mm smaller“ (PLA), Ösen „0.2 mm more for print“. | MV: + 0,25 mm Ø für gedruckte Durchgangslöcher (Hubs); MG S10: kein allgemeiner Betrag, durchmesserabhängig (MG-26). Text als Richtwert kennzeichnen und auf die Lochplatte verweisen. | Lesen. |
| H-33 | C | shared/standards.ts:82 | Platinenhalter: Stifte 0,3 mm unter dem Loch (2,4 mm beim Pi), Schnapphaken 1 mm am Fuß. | MG S28: Zapfen konservativ 3 mm, unter 5 mm schwach; MV (JLC): Schnappformen > 1,5 mm. Im Text sagen, dass die Stifte nur führen, und den Haken über den Baustein (R46). | Lesen. |

Zählung: A 2 · B 19 · C 12.

## Nicht geprüft, weil …

- **Nichts gebaut, nichts gemessen:** alle Wege X1–X12 und H-01 bis H-13 sind aus dem Code hergeleitet. Offen ist
  insbesondere, welche Beschreibung SolidCraft bei `component.metadata.set` annimmt (H-01), ob `joint.as_built` an
  einem doppelten Namen scheitert (H-02), und ob der Probe-Batch Teilergebnisse liefert (H-08).
- **SolidCraft wurde nicht aufgerufen** (auch nicht `solidcraft-cli commands`): die Aussagen von 02 über Parameter
  einzelner Befehle (S-06 `batch {path}`, S-07, S-08) sind nur auf der Policy-Seite gegengeprüft. Für H-30 fehlt, ob
  SolidCraft `params` als Text, Befehlskennungen in anderer Schreibweise oder mit Leerzeichen und verschachtelte
  `batch`-Schritte annimmt.
- **SolidCrafts eigene Texte** (Server-Anweisungen, Werkzeugbeschreibungen, Skills, Befehlsdoku): liegen nicht im
  Repository; nicht gelesen (F12).
- **Claude Codes Verhalten bei vollem Kontext** (H-11) und sein eigener Systemprompt: fremdes Programm.
- **`shared/stepPhrases.ts`, `shared/contract.ts` (`featureBlockSchema`), `shared/svgDrawing.ts`,
  `main/solidcraft/logoMove.ts`, `main/solidcraft/supervisor.ts`, `main/local/localAgent.ts` außer den per Suche
  gefundenen Stellen, `shared/blocks.ts` Z. 113–211 und 242–345, `shared/screwSizes.ts`, `shared/templates.ts`:**
  nicht oder nur in Ausschnitten gelesen.
- **Text, den der Renderer baut:** die Elementliste einer Skizze (`sketchElements`, an sketchNote.ts:15 übergeben)
  und die Antwortzeilen einer Fragekarte entstehen im Renderer; die Stelle wurde nicht gefunden und nicht gelesen.
- **`02-solidcraft-abgleich.md` Tabelle 3:** 633 Zeilen ausgezählt, 45 gelesen; die übrigen Einstufungen sind nicht
  einzeln nachgeprüft.
- **Die drei `01-inventur-*`-Dateien:** nur per Suche nach sieben Stichwörtern gegengehalten (Treffer zu H-27 und
  H-29 sind dort als Prüflistenzeile ohne Befund vermerkt); eine vollständige Entdoppelung gegen 01 steht aus.
- **Zahlen ohne Maßstab** (Z16, Z19, Z45: Außenradien, Einlaufwinkel, 3M-Füße, CNC-Kitchen-Lasten, Kabel,
  EN 60423, IP-Grade, Lüfter): in keiner der beiden Maßstab-Dateien belegt; nicht selbst recherchiert.
- **`03-massstab-geometrie.md` Z. 12–49 und `03-massstab-verbindungen.md` Z. 1–56, 162–196** (Quellenlisten und der
  Abgleich von `screwSizes.ts`, `blocks.ts`): nicht gelesen; die Soll-Werte sind aus den Maßstab-Tabellen genommen.
