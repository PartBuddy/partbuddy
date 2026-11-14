# Vollaudit – Arbeitspakete B und C

Stand 13.11.2026, Zweig `docs/vollaudit-2026-11` (main `a6e52eb` hineingemergt, PRs #346–#367). Quelle: [BEFUNDE.md](BEFUNDE.md)
(Status 13.11.), Maßstab [AUFTRAG.md](AUFTRAG.md). Nur geplant, kein Code geändert.

## Zahlen

- Offen oder teilweise, ohne A: **358 Kennungen**.
- Davon **vermutlich erledigt, nachmessen: 34 Kennungen** (25 Befunde) – Code gelesen oder Dublette eines behobenen Befunds.
- Nach Dubletten **260 Befunde**; ohne die vermutlich erledigten bleiben **235** (B 141, C 94; ein Befund ist B, wenn eine seiner Kennungen B ist):
  231 in **25 Paketen**, 4 außerhalb von PRs (Testdruck, Audit-Dokumente).
- Rest-A **T3** (hingedBox, 63 mm² Überhang am Deckel) steckt in BC-01, **N-nach-1 … 4** in BC-01 und BC-04.

Dubletten-Schreibweise: `A+B` = ein Befund, die erste Kennung führt. Pfade: `G/` = `packages/geometry/src`, `M/` =
`apps/desktop/src/main`, `S/` = `…/shared`, `R/` = `…/renderer/src`. Zu jeder Quelldatei gehören ihre Tests.

## Spuren – was parallel laufen kann

Jede Datei gehört genau einer Spur. Pakete **verschiedener** Spuren berühren keine gemeinsame Datei und laufen parallel in
eigenen Worktrees; Pakete **derselben** Spur laufen nacheinander (das nächste startet auf main nach dem Merge des vorigen).
BC-16 und BC-17 belegen L2 **und** L3 zugleich. Ausnahmen, die beim Nachziehen von main aufzulösen sind: `R/i18n/{de,en}.json`
(gehört L8; andere Pakete ergänzen nur eigene Schlüssel) und `M/index.ts` in BC-16 (erst nach BC-04).

| Spur | Dateien |
|---|---|
| L1 | Druckprüfung – G/printCheck.ts, overhang.ts, analysis.ts, tagged3mf.ts, edges.ts, renderMesh.ts; M/print/printCheckNote.ts; R/print/usePrintCheck.ts, report.ts |
| L2 | Mechanik – S/mechanisms.ts, M/agents/mechanismTool.ts, S/templates.ts |
| L3 | Bausteine – S/blocks.ts, M/agents/blockTool.ts, S/screwSizes.ts, magnet.ts, wallMount.ts, knob.ts; R/viewer/BlockPanel.tsx |
| L4 | Maße und Tabellen – S/designFit.ts, tolerances.ts, materialCatalog.ts, printerCatalog.ts, testPieces.ts, contract.ts; M/solidcraft/standardParts.ts; R/print/PrintProfilesEditor.tsx |
| L5 | Texte an den Assistenten – M/print/printProfiles.ts, S/standards.ts, M/agents/{questions,loop,claudeCode,viewContext,research,designTool,standardTool,sketchNote,photoNote,workLog}.ts, M/chatgpt/, M/local/ |
| L6 | Policy – M/agents/policy.ts, toolNotes.ts, gateProxy.ts, assemblyTool.ts |
| L7 | Auswahl und Logos – M/solidcraft/actions.ts, dimensions.ts, logoMove.ts; M/agents/drawingTool.ts; S/drawing*.ts, svgDrawing.ts; R/viewer/SelectionActions.tsx |
| L8 | Export und Spiegel – M/solidcraft/supervisor.ts, mirror.ts, partReference.ts; M/index.ts; M/projects/; M/share/; R/shell/DesignActions.tsx |
| L9 | Doku – docs/*.md |

Reihenfolge innerhalb der Spuren: L1 02 → 06 → 19 → 24 · L2 01 → 07 → 10 → 11 → 15 → (16 → 17) · L3 03 → 12 → (16 → 17) ·
L4 14 → 20 · L5 05 → 18 → 21 → 22 · L6 09 → 13 · L7 08 → 23 · L8 04 · L9 25.
Wegen der CI-Last (PLAN: Vertragstests nur einzeln) höchstens zwei, drei Pakete gleichzeitig; Vorschlag erste Welle: BC-01, BC-02, BC-03.

## Reihenfolge nach Nutzen

1–7 erzeugen falsche oder schlecht druckbare Modelle oder sagen dem Nutzer/Assistenten Falsches; 8–17 Bedienung und
Werkzeuge, die rohe Wege offen lassen; 18–25 Abläufe, Texte, Kosmetik, Erweiterung, Doku.

| Nr | Spur | Paket | Befunde | B/C |
|---|---|---|---|---|
| BC-01 | L2 | Vorlage Scharnierdose und Deckelverschluss | 10 | 7+A/2 |
| BC-02 | L1 | Druckprüfung: falsches „bereit“ | 11 | 10/1 |
| BC-03 | L3 | Bausteine: ungeprüfte Maße, stumme Annahmen | 14 | 9/5 |
| BC-04 | L8 | Export, Drucklage, versteckte Körper | 11 | 7/4 |
| BC-05 | L5 | Regeltexte: Zahlen gegen Code und Maßstab | 10 | 6/4 |
| BC-06 | L1 | Passungsschwelle und Gelenkläufe der Prüfung | 3 | 3/0 |
| BC-07 | L2 | Schraube, Schraubdeckel, Zapfen, Vorlagen-Rest | 15 | 7/8 |
| BC-08 | L7 | Auswahlaktionen und Gelenkprobe | 7 | 5/2 |
| BC-09 | L6 | Policy: Form, Schreibweisen, Dateien | 8 | 5/3 |
| BC-10 | L2 | Scharnier | 13 | 9/4 |
| BC-11 | L2 | Riegel und Schnapphaken der Mechanik | 7 | 4/3 |
| BC-12 | L3 | Bausteine: Löcher, Gewinde, Normmaße | 15 | 8/7 |
| BC-13 | L6 | Rohe SolidCraft-Befehle: FDM-geprüft oder gesperrt | 12 | 11/1 |
| BC-14 | L4 | Raster, Spalte, Spiel (designFit) | 14 | 10/4 |
| BC-15 | L2 | Führung und Antworten des Mechanik-Werkzeugs | 12 | 8/4 |
| BC-16 | L2+L3 | Druckprofil in die Werkzeuge | 5 | 4/1 |
| BC-17 | L2+L3 | Schnapphaken je Material | 4 | 2/2 |
| BC-18 | L5 | Ablauf erzwingen statt bitten | 8 | 6/2 |
| BC-19 | L1 | Aussagen der Druckprüfung | 6 | 4/2 |
| BC-20 | L4 | Material- und Druckerkatalog, Testteile | 12 | 3/9 |
| BC-21 | L5 | Rollentexte je Route | 9 | 4/5 |
| BC-22 | L5 | Normtexte (standards.ts) | 7 | 1/6 |
| BC-23 | L7 | Logos und Zeichnungen | 7 | 2/5 |
| BC-24 | L1 | Neue Prüfungen (Erweiterung) | 3 | 3/0 |
| BC-25 | L9 | Doku an Code | 9 | 1/8 |

## Pakete

### BC-01 Vorlage Scharnierdose und Deckelverschluss (L2)

- **Kennungen:** T3 (Rest-A), `N-nach-1`, `N-nach-2`, `N-nach-3`, `T13+MV-19`, `T14`, `T15+N-mechanik-14`, `W17`, `H-10`, `R39`
- **Dateien:** S/templates.ts (+ `tools/templates/`), S/mechanisms.ts (`lipSteps`, Verschluss), M/agents/mechanismTool.ts (closure)
- **Worum:** Die Vorlage hingedBox druckt nach jeder Parameteränderung ohne Überhang und Sperre (63 mm² am Deckel, Restwand 0,26 mm, verlorene Referenz bei height 5), und der Verschluss prüft Dosenwand, Rille, Ecken und den geschlossenen Zustand.
- **Prüfweg:** Unit; Harness `mechanik-fix`, `mechanik-review` („review 6“), H „T3“; Vertragstests (Vorlage über `solidcraft-cli run`)
- **Risiko:** mittel – Vorlagen-Skript und Vorschaubilder neu; geänderte Verschlussmaße wirken auch auf das Werkzeug

### BC-02 Druckprüfung: falsches „bereit“ (L1)

- **Kennungen:** `N-druckpruefung-3+MG-19+D41`, `N-druckpruefung-4`, `N-normteile-policy-7`, `H-03`, `D12`, `D30`, `D7`, `D39`, `D40+MG-18`, `MG-16`, `D17+MG-20`
- **Dateien:** G/printCheck.ts, G/overhang.ts, G/tagged3mf.ts, G/edges.ts, G/renderMesh.ts (+ Tests, `G/overhangCases.test.ts`)
- **Worum:** Was die Prüfung heute grün lässt, wird gemeldet: Stäbe über Kreuz, schwebender Einzelkörper, feines modelliertes Gewinde, unterdrückte/zurückgerollte Features, Selbstdurchdringung, still übersprungene Dreiecke, viele kleine dünne Flächen, Stichproben über 40 000 Dreiecken, Kippgefahr statt fester 25 mm².
- **Prüfweg:** Unit (Geometrie, `overhangCases` ohne neue `OPEN`-Fälle); Harness `druckpruefung`; Laufzeittest
- **Risiko:** hoch – Fehlalarme und Laufzeit im UI-Thread; jede Prüfungs-PR brauchte bisher 2–4 Reviews

### BC-03 Bausteine: ungeprüfte Maße, stumme Annahmen (L3)

- **Kennungen:** `W31+R6`, `N-bloecke-5`, `N-bloecke-6`, `N-bloecke-3`, `N-bloecke-11`, `T30`, `T44+N-bloecke-8`, `W30+R28`, `W33`, `W34`, `R15`, `W32`, `T45+R48`, `R38`
- **Dateien:** S/blocks.ts, M/agents/blockTool.ts, R/viewer/BlockPanel.tsx (Grenzen in `blockOf`; das Formular-Schema `featureBlockSchema` in S/contract.ts gehört L4 und wird nur mitgezogen, wenn BC-14 nicht gleichzeitig läuft)
- **Worum:** `partbuddy_block` baut nur, was es gemessen hat, und sagt es: Grenzen je Maß (Text 0,5 mm, Schlitz 0,05 mm, Tiefe 500 mm), Rillen- und Mutterntasche gegen die Wand, verworfene Angaben, Druckfläche nur aus `body.print_face`, Warnungen und Vorgaben (Magnet 6 × 2) offen genannt.
- **Prüfweg:** Unit `blockTool`; Harness `bloecke-findings`, `bloecke-w2`; Vertragstests
- **Risiko:** mittel – strengere Grenzen können gültige Aufrufe des Assistenten ablehnen

### BC-04 Export, Drucklage, versteckte Körper (L8)

- **Kennungen:** `D21+S-23`, `D24+N-normteile-policy-6`, `D20`, `H-13`, `D22`, `D44`, `S-28`, `D31`, `D43`, `N-nach-4`, `D34`
- **Dateien:** M/solidcraft/supervisor.ts, M/solidcraft/mirror.ts, M/solidcraft/partReference.ts, M/index.ts, M/projects/{assembly,importFile,versionCompare}.ts, M/share/description.ts, R/shell/DesignActions.tsx, R/i18n/{de,en}.json
- **Worum:** Export und Teilen legen jeden Körper auf seine Druckfläche, die gemerkte Druckfläche überlebt Rückgängig/Umbenennen und gilt auch ohne Projektordner, versteckte Körper fallen nicht still aus Prüfung und Export, Netzimport fragt nach der Einheit.
- **Prüfweg:** Unit; E2E Export/Teilen; Vertragstests (`file.export`); 3MF in Bambu Studio öffnen
- **Risiko:** mittel-hoch – Exportformat und Lage; Normteil-Nachmessung (N-nach-4) berührt den App-Start

### BC-05 Regeltexte: Zahlen gegen Code und Maßstab (L5)

- **Kennungen:** `T25+R9+D15+H-15`, `D18+MG-23+H-16`, `R8+H-20+R34`, `D27+T22+H-14+H-32`, `D29`, `R33`, `H-18`, `H-22`, `H-23`, `N-passung-texte-5`
- **Dateien:** M/print/printProfiles.ts (Regeltext, Startprofile), S/standards.ts (nur Brückenzeilen)
- **Worum:** Jede Zahl im Regeltext stimmt mit dem Code (Brücke, kleine Absätze 1,8 statt 1,5 mm, ein Passungsname je Wert, Startprofil aus dem Materialkatalog) und trägt eine Quelle oder heißt „eigene Wahl“; unter dem Druckbaren wird gefragt statt gebaut.
- **Prüfweg:** Unit (Text-Snapshots); Harness `passung-texte-standards`
- **Risiko:** niedrig – nur Text und Startwerte; Startprofil-Änderung trifft bestehende Nutzerprofile nicht

### BC-06 Passungsschwelle und Gelenkläufe der Prüfung (L1)

- **Kennungen:** `D9+MG-13+R32+N-passung-texte-1`, `D10`, `D42+H-04`
- **Dateien:** R/print/usePrintCheck.ts, R/print/report.ts, M/print/printCheckNote.ts, für D10 ggf. G/printCheck.ts (`withClearance` je Druckgruppe)
- **Worum:** Die Prüfung misst Spalte gegen dasselbe auf die Düse skalierte Spiel, das der Assistent bekommt, verlangt für zusammen gedruckte bewegliche Teile max(0,3; Düse) und fährt auch Gelenke ohne Grenzen.
- **Prüfweg:** Unit `report`/`usePrintCheck`; E2E Gelenke; Harness `passung-texte-t2`
- **Risiko:** mittel – freie Gelenke über 360° kosten Laufzeit; nach BC-02 (gleiche Spur)

### BC-07 Schraube, Schraubdeckel, Zapfen, Vorlagen-Rest (L2)

- **Kennungen:** `W22+N-mechanik-9`, `W24+N-mechanik-12`, `T7+MV-07+W19+N-bloecke-7`, `T17+MV-08+W20`, `N-mechanik-18+T61`, `W21`, `MV-28`, `T6`, `N-mechanik-20`, `W29+R30+H-31`, `T59`, `W25`, `T29`, `T43`, `T56`
- **Dateien:** S/mechanisms.ts, M/agents/mechanismTool.ts, S/templates.ts
- **Worum:** Schraubdeckel misst den Hals, Zapfen die Dicke, Senkkopftiefe und Meldung stimmen, für jede Dicke gibt es eine Schraube, Gewindeflanken unter 45°, Spaltbeschreibung = Verhalten; Wandhalter liegt, Holzschraube nach Tabelle.
- **Prüfweg:** Unit; Harness `mechanik-*`, `bloecke-findings -t "T7"`; Vertragstests
- **Risiko:** mittel

### BC-08 Auswahlaktionen und Gelenkprobe (L7)

- **Kennungen:** `D25+G6`, `S-15+D16`, `S-16`, `D26`, `D11`, `G4`, `D45`
- **Dateien:** M/solidcraft/actions.ts, M/solidcraft/dimensions.ts, R/viewer/SelectionActions.tsx
- **Worum:** Rundung, Fase, Bohrung und Schale aus der Auswahl laufen über PartBuddys Regeln (Fase statt Rundung am Bett, Lochaufmaß, Wand im Linienraster, `body` wird mitgeschickt); die Schnapperprobe meldet Anstöße vor dem Limit und fährt sauber zurück.
- **Prüfweg:** Unit; E2E Auswahlaktionen; Vertragstests
- **Risiko:** mittel – sichtbares Verhalten der Oberfläche ändert sich

### BC-09 Policy: Form, Schreibweisen, Dateien (L6)

- **Kennungen:** `W42+H-30`, `N-normteile-policy-3+R42`, `N-normteile-policy-4`, `N-normteile-policy-5`, `S-31`, `S-26`, `S-27`, `R17`
- **Dateien:** M/agents/policy.ts, M/agents/toolNotes.ts
- **Worum:** Die Policy ist bei unlesbarer oder verschachtelter Form zu (execute in execute, batch als Schritt, `params` als Text), sperrt `document.*`, Pfade als Liste, `properties`, App- und Material-Befehle, und ein Tippfehler legt keinen Parameter an.
- **Prüfweg:** Unit `policy`; Harness `normteile-policy-decide`
- **Risiko:** niedrig-mittel – zu viel gesperrt nimmt dem Assistenten Wege

### BC-10 Scharnier (L2)

- **Kennungen:** `W8`, `W9+H-08`, `W7+R11`, `N-mechanik-7`, `H-07`, `T12+W4+W6+MV-04+R20+W5+N-mechanik-16+N-passung-texte-2`, `W11+N-passung-texte-3`, `MV-03+W10`, `MV-05`, `N-mechanik-15`, `T40`, `T41`, `W12`
- **Dateien:** S/mechanisms.ts, M/agents/mechanismTool.ts
- **Worum:** Augen mit zu wenig Überdeckung, eine dünne Haut ohne `wall` oder bei gescheiterter Probe und das stehende/geneigte Scharnier werden nicht mehr still gebaut; das Standardscharnier geht bei jeder Düse, Grenzen und Rat rechnen mit Düse und Schicht.
- **Prüfweg:** Unit; Harness H „hinge …“, `mechanik-review`; Vertragstests
- **Risiko:** mittel

### BC-11 Riegel und Schnapphaken der Mechanik (L2)

- **Kennungen:** `N-mechanik-10`, `N-mechanik-11`, `W23`, `MV-11`, `T58`, `R40+H-24`, `R50`
- **Dateien:** S/mechanisms.ts, M/agents/mechanismTool.ts
- **Worum:** Riegel und Schnapphaken messen die nötige ebene Wand und die Wanddicke statt sie nur zu nennen, der Riegel bekommt einen Fußradius, Texte nennen den wirksamen Hinterschnitt und die Zahlen aus `latchReach()`.
- **Prüfweg:** Unit; Harness `mechanik-*`; Vertragstests
- **Risiko:** mittel

### BC-12 Bausteine: Löcher, Gewinde, Normmaße (L3)

- **Kennungen:** `S-09+N-bloecke-9`, `R7+T31`, `S-19+T49+R36`, `S-11`, `S-14`, `MV-13`, `T39+MV-20`, `MV-09`, `MV-25`, `N-bloecke-10`, `MV-15`, `T46`, `MV-26`, `MV-21`, `MV-24`
- **Dateien:** S/blocks.ts, M/agents/blockTool.ts, S/screwSizes.ts, S/magnet.ts, S/wallMount.ts, S/knob.ts
- **Worum:** Gewinde, Durchgangsloch und Senkung bekommen Druckaufmaß aus PartBuddys Tabelle statt SolidCrafts ISO-Wert, Text-Tiefe und Lochfasen folgen den eigenen Detailregeln, Senkungen nutzen `bridge`, Dom bekommt Fußradius, Knopf- und Schlüssellochmaße stimmen.
- **Prüfweg:** Unit; Harness `bloecke-sizes`; Vertragstests
- **Risiko:** mittel – Lochmaße aller Bausteine ändern sich

### BC-13 Rohe SolidCraft-Befehle: FDM-geprüft oder gesperrt (L6)

**Entscheidung Manuel 13.11.2026:** gemischt – was PartBuddy als geprüften Baustein hat (Löcher, Gewinde, Schnapphaken, Einsatz-Sitze), roh sperren mit Hinweis auf den Baustein; übrige volumenbildende Befehle erlaubt, danach automatisch druckgeprüft, Befund an den Assistenten.

- **Kennungen:** `R2`, `S-03`, `S-17`, `S-18`, `S-12`, `S-08`, `S-21`, `S-22`, `S-20+R23`, `S-04`, `S-05`, `W28`
- **Dateien:** M/agents/policy.ts, M/agents/toolNotes.ts, M/agents/gateProxy.ts, M/agents/assemblyTool.ts
- **Worum:** Statt einer Negativliste: Löcher, Gewinde, Schnapphaken, Dome, Skalieren und Einheiten nur über PartBuddys geprüfte Wege, übrige volumenbildende Befehle mit Nachprüfung; Werkzeugliste ohne abgelehnte Werkzeuge, Eingaben gegen das Schema geprüft.
- **Prüfweg:** Unit `policy`, `gateProxy`; Harness `normteile-policy-raw`; Vertragstests; Phase 7
- **Risiko:** hoch – Eingriff in den Werkzeugkasten des Assistenten; Entscheidung „sperren oder nachprüfen“ je Befehlsgruppe vorab mit Manuel

### BC-14 Raster, Spalte, Spiel (designFit) (L4)

- **Kennungen:** `MG-07+T54`, `T21+MG-15`, `MG-17`, `T20+MG-12`, `T19+MG-09+D37`, `MG-06`, `MG-08`, `MG-10`, `MG-11`, `MG-14`, `T32+D28`, `T33`, `T53`, `MG-31`
- **Dateien:** S/designFit.ts, S/tolerances.ts, S/contract.ts (Druckerschema), R/print/PrintProfilesEditor.tsx
- **Worum:** Maße des Assistenten rasten nach einer Regel: Spaltwarnung = eigenes Minimum, Marken behalten ihre Anzahl, eine Rundung wie die Prüfung, Spiel nicht linear unbegrenzt, Linienbreite je Slicer belegt, Schicht ≤ Düse, Toleranzlesung prüft Reihenfolge und meldet Übermaß.
- **Prüfweg:** Unit `designFit`, `tolerances`; E2E Druckprofil-Editor
- **Risiko:** mittel – verschiebt jedes vom Assistenten gerastete Maß

### BC-15 Führung und Antworten des Mechanik-Werkzeugs (L2)

- **Kennungen:** `W26`, `H-09+W27`, `H-26`, `W48+R29+N-mechanik-19`, `W13`, `W14`, `T16`, `N-mechanik-13`, `N-mechanik-17`, `G3`, `R49`, `R51`
- **Dateien:** S/mechanisms.ts, M/agents/mechanismTool.ts
- **Worum:** Geteiltes Volumen nach dem Bau scheitert und wird zurückgenommen, alle SolidCraft-Warnungen kommen an, kein Text verlangt rohes `joint.*`, Drucklage wird gesetzt statt erbeten; Führung prüft Länge, Lage, Schichtspalt und Schienenform.
- **Prüfweg:** Unit; Harness O „T5“; Vertragstests
- **Risiko:** mittel

### BC-16 Druckprofil in die Werkzeuge (L2+L3)

- **Kennungen:** `W16+T10+S-10+MV-17`, `W15`, `T11`, `T28`, `T42+W36`
- **Dateien:** S/mechanisms.ts, M/agents/mechanismTool.ts, S/blocks.ts, M/agents/blockTool.ts, S/magnet.ts, S/knob.ts, S/wallMount.ts, S/templates.ts, M/index.ts (Werkzeugaufruf)
- **Worum:** Bausteine, Mechanik und Vorlagen bekommen Material und Düse: Spiel und Lochaufmaß aus dem Profil, Festmaße „für 0,4 mm“ und 45°-Schrägen nach Düse und Überhanggrenze, eine Lippe für Deckel.
- **Prüfweg:** Unit; Harness `passung-texte`, `bloecke-sizes`, `mechanik-*`; Vertragstests
- **Risiko:** hoch – ändert Maße in allen Werkzeugen; erst wenn BC-15 und BC-12 gemergt sind

### BC-17 Schnapphaken je Material (L2+L3)

- **Kennungen:** `T18+R56+S-13+MV-12+H-17`, `R31+H-21`, `G9`, `MV-10`
- **Dateien:** S/blocks.ts, M/agents/blockTool.ts, S/mechanisms.ts, M/agents/mechanismTool.ts, R/viewer/BlockPanel.tsx
- **Worum:** Eine Haken-Tabelle für Baustein und Mechanik, Dehnung gegen das gewählte Material geprüft (nicht nur im Formular), Fußradius und Verjüngung, Schichtrichtung belegt.
- **Prüfweg:** Unit `snapStrain`; Harness; Vertragstests
- **Risiko:** mittel – nach BC-16

### BC-18 Ablauf erzwingen statt bitten (L5)

- **Kennungen:** `W41+R13+R14`, `R22`, `R57`, `H-11`, `R16`, `R18`, `H-28`, `R53`
- **Dateien:** M/agents/questions.ts, M/agents/workLog.ts, M/agents/loop.ts, M/agents/claudeCode.ts, M/agents/viewContext.ts, M/agents/designTool.ts, M/agents/standardTool.ts, M/agents/sketchNote.ts, M/agents/photoNote.ts, M/chatgpt/chatgptAgent.ts, M/local/localAgent.ts
- **Worum:** Plan/Go, Abbruch und offene Frage sperren wirklich, nach „Not built“ wird nicht selbst modelliert, das Rundenlimit meldet sich, die Profil-Notiz überlebt das Verdichten, fehlende Prüfung heißt „nicht geprüft“.
- **Prüfweg:** Unit `questions`, `loop`; E2E Chat mit Fake-Agent; Phase 7
- **Risiko:** mittel – betrifft jeden Zug des Assistenten

### BC-19 Aussagen der Druckprüfung (L1)

- **Kennungen:** `H-12`, `R55`, `H-29`, `D19+MG-22`, `MG-21`, `D36`
- **Dateien:** G/printCheck.ts, G/overhang.ts, G/analysis.ts, M/print/printCheckNote.ts
- **Worum:** Überlappung und blockiertes Gelenk heißen „beheben“, „ohne Stützen“ macht Überhang zur Sperre, verlorene Druckfläche wird gesagt, Grenzwinkel ohne +1°, ungenutzte Prototyp-Exporte weg.
- **Prüfweg:** Unit; Harness `druckpruefung`
- **Risiko:** niedrig-mittel – nach BC-06 (gleiche Spur)

### BC-20 Material- und Druckerkatalog, Testteile (L4)

- **Kennungen:** `T23+MG-26`, `MG-27`, `MG-28`, `MG-29`, `MG-30`, `T55`, `MG-32`, `T60`, `T27+MV-16`, `T57`, `T48+S-30`, `T47`
- **Dateien:** S/materialCatalog.ts, S/printerCatalog.ts, S/tolerances.ts, S/testPieces.ts, S/contract.ts, M/solidcraft/standardParts.ts
- **Worum:** Lochaufmaß abhängig vom Durchmesser, jede Katalogzahl mit abgerufener Quelle oder als eigene Wahl, Testteile halten die eigenen Regeln (Bettfase, Schrift) und messen sinnvoll, Senkkopfschraube im Normteil-Menü.
- **Prüfweg:** Unit; Recherche (je Zahl zwei Quellen, AUFTRAG Phase 3)
- **Risiko:** niedrig

### BC-21 Rollentexte je Route (L5)

- **Kennungen:** `R21`, `R24+W44`, `R25`, `R26`, `R27`, `R58`, `R41`, `R43`, `R44+W49`
- **Dateien:** M/agents/loop.ts, M/agents/claudeCode.ts, M/agents/questions.ts, M/agents/viewContext.ts, M/agents/research.ts, M/local/localAgent.ts, M/agents/photoNote.ts
- **Worum:** Jede Route bekommt nur, was für sie stimmt (kein „SolidCraft is open“, kein Screenshot-Rat ohne Bild, Recherche nur wenn möglich), ein Satz zu ehrlichen Grenzen, Material aus dem Profil.
- **Prüfweg:** Unit (Prompt-Snapshots je Route)
- **Risiko:** niedrig

### BC-22 Normtexte (standards.ts) (L5)

- **Kennungen:** `T24+R5`, `T50`, `MV-22+R47`, `R46+H-33`, `R45`, `MV-23`, `MV-27`
- **Dateien:** S/standards.ts
- **Worum:** Die Normtexte stimmen mit Bausteinen und Tabellen (Stege 1,35 mm, nutTrap M2–M10, Haken über den Baustein, Bettfase nach Schicht).
- **Prüfweg:** Unit; Harness `passung-texte-standards`
- **Risiko:** niedrig

### BC-23 Logos und Zeichnungen (L7)

- **Kennungen:** `W38`, `W39`, `G8`, `H-27`, `T52`, `T51`, `W40`
- **Dateien:** M/agents/drawingTool.ts, M/solidcraft/logoMove.ts, S/drawingDetail.ts, S/drawingPlacement.ts, S/svgDrawing.ts
- **Worum:** Ein Logo, das nach dem Bau nicht zentriert werden kann, wird zurückgenommen oder als gebaut gemeldet; Tiefe gegen die Wand, Detail gegen zwei Bahnen, Farbkörper sicher erkannt, nicht lesbares SVG gezählt.
- **Prüfweg:** Unit `svgDrawing`, `drawingDetail`; E2E Logo
- **Risiko:** niedrig-mittel

### BC-24 Neue Prüfungen (Erweiterung) (L1)

**Entscheidung Manuel 13.11.2026:** alle sieben Prüfungen, nur als gelber Hinweis (nie Sperre), je mit Fallsammlung, einzeln über das Druckprofil abschaltbar; sperren erst, wenn bewährt.

- **Kennungen:** `MG-25`, `D14`, `R35`
- **Dateien:** G/printCheck.ts, G/overhang.ts, M/print/printCheckNote.ts
- **Worum:** Was der Maßstab verlangt und keine Prüfung kennt: liegende Bohrung/Tropfen, kleinste Bohrung, Bettkanten-Rundung und Elefantenfuß, Mindestdetail, Messerkanten, Schriftstrich, Schichtrichtung unter Last.
- **Prüfweg:** Unit mit neuen Fallsammlungen (wie `overhangCases`); Harness
- **Risiko:** hoch – neue Fehlalarme; je Prüfung eigener Commit, Umfang vorab mit Manuel

### BC-26 Erlaubnisliste je Befehlsnummer (L6) – neu 14.11.2026

- **Kennungen:** `S-03` (Rest aus #390)
- **Worum:** Feste Liste der Befehlsnummern von SolidCraft 0.40.1; unbekannte Nummern in erlaubten Gruppen werden abgelehnt („noch nicht geprüft“); Vertragstest vergleicht `list_commands` mit der Liste.
- **Entscheidung Manuel 14.11.2026:** einplanen.

### BC-27 Rohe Rundung, Fase, Schale in der Druckprüfung (L1) – neu 14.11.2026

- **Kennungen:** BC-08-Rest aus #390 („Open“)
- **Worum:** Kleine Rundung an der Bettkante und Schalenwand außerhalb des Linienrasters meldet die Druckprüfung als Hinweis (gilt für jeden Weg, auch `press_pull`, `timeline.edit`). Nach BC-19, vor oder mit BC-24.
- **Entscheidung Manuel 14.11.2026:** einplanen.

### BC-28 Drucklage bei Zapfen und Schnapphaken (L2) – neu 14.11.2026

- **Kennungen:** `N-mechanik-19`, `W48` (Rest aus #395)
- **Worum:** Das Mechanik-Werkzeug legt die Hälften auf ihre Trennfläche (Entscheidung Manuel 14.11.2026), über `layOn` aus BC-15.

### BC-25 Doku an Code (L9)

- **Kennungen:** `T36+W46`, `T37+W45`, `T38`, `W47`, `S-25`, `S-29`, `D32`, `D33`, `D46`
- **Dateien:** docs/feature-catalog.md, docs/building-blocks.md, docs/engineering-notes.md, docs/ui-inventur.md, docs/adr/0024-*.md
- **Worum:** Katalog, Bausteine, Notizen und ADR nennen die heutigen Werte und Versionen (Riegel ohne Spiel, Dach 1,05 r, SolidCraft 0.40.1, kein occt-import-js, `body.repair` vorhanden, keine Prüfstufen).
- **Prüfweg:** keiner (nur Doku); Links prüfen
- **Risiko:** niedrig

## Vermutlich erledigt – nachmessen, nicht einplanen

Am Code (main `a6e52eb`) gelesen bzw. Dublette eines behobenen Befunds. Status in BEFUNDE.md erst nach Nachmessung setzen.

| Kennungen | Beleg |
|---|---|
| D8, H-05 | #364/#367: gescheiterte Abstands-/Gelenkmessung wird `unmeasured`, Ampel „nicht vollständig geprüft“ (usePrintCheck.ts:82, 88, 94) |
| H-06 | #357/#367: Werkzeugantwort trägt die Prüfung der Revision, Ampel prüft Revision/Dokument |
| D23 | #367: Export/Teilen/Slicer fragen, solange gemessen oder gespiegelt wird (Rest `assistantIdle` mit nachmessen) |
| D35, R19 | #357: Notiz zählt die übrigen Befunde mit (`rest`, `omitted`, printCheckNote.ts:124) |
| D13 | #363: Beginn in der Luft je Zusammenhangsteil, schichtweise |
| MG-24, R52 | #353: Brücken aus den Auflagern, überbrückbare Decken fallen heraus (printCheck.ts Kopf) |
| D47 | #364/#367: Netzkörper als „nicht gemessen“ bzw. neutrale Zeile |
| D38 | #353: Größe mit `SIZE_SLACK` ungerundet gegen den Bauraum, gedreht (printCheck.ts:472-480); 6-mm-Rand der Plattenansicht mit nachmessen |
| N-druckpruefung-6 | #353: `contact` nennt den Körper (Nachmessung D3: „0 mm² an der Kugel“) |
| N-druckpruefung-7 | #353: Boden als eigener Fund mit `floor: true` (Nachmessung D4) |
| N-passung-texte-6 | #352: `[auto 1×nozzle]` ergibt 0,3 mm bei Düse 0,2/0,25 – Marke und Text passen |
| T9 | #355: `sizesOf` gibt boss/insertSeat nur Größen mit Einsatz, `blockOf` lehnt andere ab (blockTool.ts:115-116) |
| R12, W37 | #357: `partbuddy_place_drawing`/`_move_drawing` in `CHANGING_TOOLS` (workLog.ts:29) |
| S-06 | #356: `batch` mit `path` abgelehnt (policy.ts `decideBatch`) |
| S-07 | #356 (P-6): `screenshot {path}`, `compare_picture {reference}` abgelehnt |
| W43 | #356: Foto-Ausnahme vergleicht exakt mit den gemerkten Pfaden (`isKeptPhoto`) |
| N-normteile-policy-8 | #356: Erkennung über SolidCrafts Bibliothek statt `startsWith` |
| S-24, G5 | #346: Mindest- und empfohlene Version 0.40.1 (engineVersion.ts:20-22) |
| W18, H-19, N-mechanik-8 | #357/#364/#365 (R54): Sitz, Ring, Boden und Senkung werden vor dem Bau gemessen, Text je Größe (`seatWall`) |
| W35, T34 | Dublette von R54 (behoben, nachgemessen 13.11.) |
| R37 | Dublette von D3 (behoben, nachgemessen 13.11.) |
| MV-14 | Dublette von T5 (behoben, nachgemessen 13.11.) |
| T26 | Dublette von R4/MV-18 (behoben PR #351) |
| R10, MV-06 | Dublette von T8/S-02 (behoben PR #355) |
| N-druckpruefung-5 | Dublette von N-mechanik-4 (behoben, nachgemessen 13.11.) |

Teilweise erledigt und deshalb mit Rest eingeplant: D12 (offene Körper sperren seit #353; Selbstdurchdringung fehlt) → BC-02;
D42/H-04 (über 40 Läufe jetzt in Blöcken und als „nicht gemessen“; freie Gelenke fehlen) → BC-06; W34 (Warnungen kommen an;
Gelenke auf 0 nicht geprüft) → BC-03; W38 (Mechanik über H-02 behoben; Logo fehlt) → BC-23; W41 (Zeichenwerkzeuge gesperrt;
Abbruch, `partbuddy_assembly`, `partbuddy_design_rules` nicht) → BC-18; N-bloecke-3/N-mechanik-17 (Satz statt JSON; Ursache fehlt).

## Außerhalb von PRs

| Kennung | Warum |
|---|---|
| T35 | Konstanten „not printed yet“: belegbar nur durch Testdrucke (Phase 7 bzw. Manuel); Code-Seite (Kennzeichnung im Antworttext) steht schon |
| G7 | Audit-Dokument: 114 IPC-Kanäle in die Prüfliste (PLAN Phase 1) – Audit-Zweig, kein PR |
| G10 | Audit-Dokument: vier Fehler in den Prüflisten – Audit-Zweig, kein PR |
| H-25 | Audit-Dokument: 13 Textquellen ohne Zeile in 05-ki-regeln – Audit-Zweig, kein PR |
