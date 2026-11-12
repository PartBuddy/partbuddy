# Vollaudit – Plan und Stand

Auftrag und Maßstab: [AUFTRAG.md](AUFTRAG.md). **Diese Datei ist der Stand.** Jede Sitzung liest sie
zuerst, arbeitet am ersten offenen Punkt weiter und hakt ab, sobald ein Punkt belegt fertig ist.

## So geht es in einer frischen Sitzung weiter

1. `AUFTRAG.md` und diese Datei lesen.
2. Ersten offenen Punkt unten nehmen. Befunde stehen in [BEFUNDE.md](BEFUNDE.md) (eine Zeile je
   Befund, fortlaufende Nummer, Status), Prüflisten in den `01-…`-Dateien (Spalte „Status“).
3. Nach jedem abgeschlossenen Punkt: hier abhaken, Befund-/Prüflistenstatus setzen, committen.
4. Dokumente des Audits liegen auf dem Zweig `docs/vollaudit-2026-11` bis zum ersten Merge nach
   `main`; Fixes laufen als eigene PRs von `main`.

## Dateien

| Datei | Inhalt |
|---|---|
| `01-inventur-werkzeuge.md` | Prüfliste Assistenten-Werkzeuge |
| `01-inventur-tabellen.md` | Prüfliste Fachtabellen |
| `01-inventur-druck-export-ui.md` | Prüfliste Druckprüfung, Export, SolidCraft-Anbindung, Oberfläche |
| `02-solidcraft-abgleich.md` | SolidCraft roh / PartBuddy heute / PartBuddy soll |
| `03-massstab-geometrie.md` | Soll-Werte Geometrie mit Quellen |
| `03-massstab-verbindungen.md` | Soll-Werte Verbindungen, Passungen, Mechanik mit Quellen |
| `05-ki-regeln.md` | Regeltexte Satz für Satz |
| `09-gegenpruefung-*.md` | Was die Gegenprüfer zusätzlich fanden |
| `BEFUNDE.md` | Alle Befunde, nummeriert, mit Status |

## Stand

### Phase 1 – Inventur
- [x] Prüfliste Werkzeuge (286 Zeilen)
- [x] Prüfliste Fachtabellen (594 Zeilen)
- [x] Prüfliste Druck/Export/SolidCraft-Anbindung/Oberfläche
- [ ] 62 fehlende Elemente aus `09-gegenpruefung-inventur.md` Tabelle 1 in die Prüflisten nachtragen (22 IPC, 15 SolidCraft-Anbindung, 4 Geometrie, 13 shared, 8 agents); 80 IPC-Kanäle ohne Zeile
- [ ] Gegenprüfung Inventur ohne neue Funde (1. Durchgang 12.11.: 62 fehlende Elemente, 10 neue Befunde → nach dem Nachtragen wiederholen)

### Phase 2 – SolidCraft-Abgleich
- [x] Tabelle roh/heute/soll (22 MCP-Werkzeuge, 633 Engine-Befehle: 549 ungeprüft durchgereicht)
- [ ] Gegenprüfung ohne neue Funde (1. Durchgang 12.11.: 33 neue Befunde H-01…H-30 → nach Phase 6 wiederholen)

### Phase 3 – Maßstab
- [x] Geometrie
- [x] Verbindungen, Passungen, Mechanik
- [ ] Jede Zahl aus den Fachtabellen gegen den Maßstab gehalten – offen: `printProfiles.ts`, Werkzeugtexte, die in den 03-Dateien unter „Nicht geprüft“ genannten Zeilen von `standards.ts`, Material- und Druckerkatalog gegen Herstellerangaben

### Phase 5 (statischer Teil) – KI-Regeln
- [x] Regeltexte Satz für Satz gegen Code
- [ ] Texte ohne Zeile aus `09-gegenpruefung-regeln-solidcraft.md` Abschnitt 1 nachtragen
- [ ] Gegenprüfung ohne neue Funde
- [ ] Regeltexte gegen Maßstab und Befunde aus Phase 2/4

### Befunde zusammenführen
- [x] `BEFUNDE.md` als Index: 349 Befunde (A 30, B 195, C 124), Kennung = Präfix der Quelldatei
- [ ] Dubletten bei B und C abgleichen (bei A erledigt)
- [ ] „Nicht geprüft, weil …“ aller Dateien zu einer Restliste zusammenführen und abarbeiten

### SolidCraft 0.40.1 (stabil, seit 12.11.2026) – Maßstab des Audits ab jetzt
Fest installiert in `C:Program FilesSolidCraft` (MSI, Prüfsumme geprüft, ersetzt 0.30.1; `solidcraft-cli` auf dem PATH ist damit 0.40.1). Die CI-Runner nutzen weiter ihre portable rc.4 (`contract.yml`, `site-sync.yml`). Gegenüber rc.4: 634 statt 633
Befehle, neu `assembly.constraint.edit`, geänderte Parameter bei `solid.hole`, `solid.box`, `solid.sweep`,
`surface.sweep`, `parts.insert`, `parts.fastener`, `body.rename`, `file.export`, `file.export_view_dxf`,
`document.inspect`, `sketch.insert_svg`, `sketch.insert_dxf`, `sketch.drawing_bounds`, `sketch.scale`,
`sketch.move`, `config.*`.
- [ ] Parameteränderungen der 19 Befehle einzeln lesen und gegen jede Stelle halten, an der PartBuddy sie aufruft
- [ ] alle Fälle unter `tools/audit/cases/` gegen 0.40.1 wiederholen; Abweichungen zu rc.4 sind Befunde
- [ ] `02-solidcraft-abgleich.md` auf 0.40.1 nachziehen (neuer Befehl, geänderte Parameter)
- [ ] App auf 0.40.1 umstellen (`RECOMMENDED_VERSION` in `engineVersion.ts`, Vertragstests, Runner-Pfad in `contract.yml`/`site-sync.yml`, `docs/engineering-notes.md` „PATH ist 0.30.1“) – eigener PR
- [ ] `MINIMUM_VERSION` 0.30.1: lokal gibt es dafür kein Programm mehr – entscheiden, ob die Mindestversion auf 0.40.1 steigt (Dateiformat 50 liest 0.30.1 ohnehin nicht)

### Phase 4 – Bauen und Messen
- [x] Mess-Harness `tools/audit/` (README dort; Aufruf aus `apps/desktop`: `pnpm exec vitest run --config ../../tools/audit/vitest.config.mts <fall>`)
- [x] A-Befunde und ausgewählte B-Befunde gemessen (rc.4): 52 gemessen, 49 bestätigt, 2 teilweise (H-02, T12), 1 widerlegt (G2); 52 neue Befunde, davon 12 A (`04-messung-*.md`, Status in `BEFUNDE.md`)
- [ ] Harness-Lücken schließen: STL/STEP wieder einlesen, Gelenk über den Weg fahren, dünnste Wand suchen, `withPrintFaces`/`partbuddy_standard`/Baugruppe einhängen, `knob`/`magnet`/`wallMount`/`templates` bauen
- [ ] Harness auf das installierte SolidCraft 0.40.1 umstellen (statt Pfad der portablen rc.4)
- [ ] je Prüflisten-Datei: alle Zeilen gebaut und gemessen (Status in der Prüfliste)
- [ ] Kombinationen
- [ ] Export wieder eingelesen
- [ ] Druckprüfung mit absichtlich fehlerhaften Körpern

### Phase 6 – Beheben und Ausbauen
- [ ] alle A behoben und nachgemessen
- [ ] alle B behoben und nachgemessen
- [ ] alle C behoben und nachgemessen

### Phase 7 – Abnahme im echten Chat und Modelltest
Entscheidung Manuel 12.11.2026: Der Modelltest läuft mit Phase 7, erst nach den A-Fixes. Dieselbe feste
Auftragsreihe je Modell einmal, streng nacheinander, jedes Ergebnis mit dem Harness nachgemessen. Modelle:
Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.2 (Claude-Code-Route) und die Modelle des ChatGPT-Abos (ChatGPT-Route).
Ergebnis: eine belegte Empfehlung für den Standard je Route (Modell und Aufwand). Bis dahin gilt vorläufig
Opus 5.5 · Mittel (PR #354); Claude Codes Eintrag „Default (recommended)“ ist ausgeblendet.
- [ ] Auftragsreihe festgelegt (je Funktionsbereich ein typischer, ein schwieriger, ein unklarer Auftrag)
- [ ] Bewertung festgelegt: Messwerte je Lauf (Maße, Druckprüfung, Regelverstöße), Zahl der Werkzeugaufrufe, Dauer, Kontingent
- [ ] alle Läufe je Modell gemessen
- [ ] Standard je Route aus den Messwerten festgelegt und in der App gesetzt (`CLAUDE_STANDARD` in `modelChoice.ts`, ChatGPT-Route entsprechend)
- [ ] Abnahme: Läufe mit dem gewählten Standard ohne neuen Befund

### Abschluss
- [ ] Bericht `BERICHT.md`, Audit-Dokumente nach `main`

## Verlauf der Läufe

| Datum | Was | Ergebnis |
|---|---|---|
| 12.11.2026 | Workflow Lesephase (7 Prüfer + 2 Gegenprüfer) für Phase 1, 2, 3, 5 statisch | fertig, 9/9 Dateien, 349 Befunde. Alles statisch aus dem Code – nichts gebaut oder gemessen. |
| 12.11.2026 | Workflow Messung A (Harness unter `tools/audit/`, dann 5 Messgruppen → `04-messung-*.md`) | gestartet. Nach Ende: Urteile in `BEFUNDE.md` als Status eintragen, neue Befunde aufnehmen, Harness-Punkt abhaken. |
| 12.11.2026 | PR PartBuddy/partbuddy#346: Mindest- und empfohlene Version 0.40.1, Runner auf installiertes SolidCraft | offen. Erst mergen, wenn PR-CI grün UND `contract.yml` auf dem Zweig `feat/solidcraft-0.40.1` grün (von Hand starten, sobald der Messlauf fertig ist: `gh workflow run contract.yml --ref feat/solidcraft-0.40.1`). Worktree: `../partbuddy-wt-sc0401` neben dem Repo. |
| 12.11.2026 | PR #346 gemergt: Mindest- und empfohlene Version SolidCraft 0.40.1, Vertragstests grün | erledigt |
| 12.11.2026 | PR #347 gemergt: Einschmelz-Einsatz M2.5 4,0 mm, Dom-Wand nach Hersteller (T1, MV-01, MV-02) | erledigt; Nachmessung mit Harness auf 0.40.1 offen |
| 12.11.2026 | PR #348: Baustein nur auf dem genannten Körper, sonst zurückgenommen (W1, N-bloecke-2, Teil von W2/N-bloecke-1) | offen, bei Grün mergen. Arbeits-Worktree für Fixes: `../partbuddy-wt-fix` (Harness dorthin kopieren, nicht committen). |
| 12.11.2026 | SolidCraft 0.40.1: `rollback`-Stapel und `edit.restore_checkpoint` taugen nicht als Rückweg (steht in `docs/engineering-notes.md`, PR #348) | betrifft auch `mechanismTool` (H-02) – dort denselben Undo-Weg nehmen |
| 12.11.2026 | PR #348 PR-CI grün; Vertragstests auf dem Zweig laufen (Run 43215281329) | bei Grün mergen, dann `fix/block-limits` (lokal im Worktree, 1 Commit: W3, S-02, N-bloecke-4) auf main umsetzen, pushen, PR |
| 12.11.2026 | PR #349 (T2 Messdüse), #350 (D5 Stützen-Aussage, Vertragstest-Erwartung angepasst → vor Merge `contract.yml` auf dem Zweig laufen lassen), #351 (R4 Kernloch) | offen, bei Grün mergen |
| 12.11.2026 | Subagent behebt die A-Befunde der Druckprüfung auf `fix/print-check-audit` (eigener Worktree, eigener PR) | Ergebnis prüfen (Diff lesen, Harness-Fälle `druckpruefung`), dann mergen |

## Noch offene A-Befunde ohne Fix (Stand 12.11.2026)

- Bausteine: W2/T4/N-bloecke-1 Rest (Durchgangsloch/Langloch geht durch beide Wände des eigenen Hohlkörpers)
- Mechanik: T3 (Vorlage hingedBox ohne Stege), T5 (Nutdecke der Führung), H-02 (Fehler nach dem Bau lässt Geometrie stehen → Undo-Weg wie in #348), N-mechanik-2 (Wulst ohne Überdeckung), N-mechanik-3 (zweites Scharnier ohne Grenzen), N-mechanik-4/-5 (Stege: „without support“ stimmt nicht)
- Normteile: S-01/G2/H-01, N-normteile-policy-1 (Senkkopfschrauben landen im Export)
- Regeln: R1 (Druckprüfung vor „fertig“ nur Bitte), R3 („ready to print, nothing found“), R54 (Bedingungen nur im Erfolgstext), MG-05 (Marke 1×nozzle ohne Untergrenze)
| 12.11.2026 | #349, #351, #352 gemergt | erledigt |
| 12.11.2026 | #348: 1. Vertragstest-Lauf rot (2 von 52, beide 30-s-Zeitüberschreitung unter Last; Schlitz auf Klappe mit Harness nachgestellt: baut). Versuch 2 läuft | grün → mergen; rot → Formular-Weg (`ActionService.applyBlock`) untersuchen |
| 12.11.2026 | #353 Druckprüfung (Subagent): 12 Kennungen behoben, G1 und N-normteile-policy-2 offen. Unabhängiges Review läuft | Review-Funde einarbeiten, `contract.yml` auf dem Zweig, dann mergen. Danach im Audit-Zweig `tools/audit`: `layer` in die Profile (`harness.ts`, `mechanik-helpers.ts`), `body` im `size`-Fund von `passung-texte-d5-stuetzen.case.ts`. Folge: die Standardführung warnt jetzt (Nutdecke 13,9 mm > Brücke 10 mm) → mit T5 beheben |
| 12.11.2026 | Testversion 0.1.0-test.20261112.132 (main bis #352) an Server und Gaming-PC geliefert; gebaut im Worktree `../partbuddy-wt-main` (für weitere Lieferungen: dort `git checkout --detach origin/main`, dann das Lieferskript aus PowerShell) | erledigt. Gaming-PC hat SolidCraft 0.40.1 installiert |
| 12.11.2026 | #353 Druckprüfung: 8 Review-Funde eingearbeitet (Kragarm als Brücke, hängender Anker, entartetes Dreieck …) | PR-CI abwarten, dann `contract.yml` auf dem Zweig, dann mergen |
| 12.11.2026 | Vertragstest „a slot built into a hinged flap“ rot auf #348 UND #350 (dort ohne Baustein-Änderung): App meldet „built the function block slot“, Ansicht bleibt 30 s bei „2 bodies · 35 faces“. Mit Harness auf main-Code: Schlitz schneidet richtig. | bei ruhigem Server `contract.yml` für #350 und #348 wiederholen; wieder rot → eigener Befund „Ansicht aktualisiert nach applyBlock auf Scharnierklappe nicht“ (Spiegelung), vor dem Merge beheben |
| 12.11.2026 | Subagent Mechanik (T3, T5, H-02, N-mechanik-2 bis -5) auf `fix/mechanism-audit`, aufgesetzt auf `fix/print-check-audit`, PR gegen diesen Zweig | Ergebnis unabhängig prüfen lassen (wie bei #353), nach Merge von #353 auf main umhängen |
| 12.11.2026 | #348 gemergt (Wiederholung der Vertragstests grün – der rote Lauf war Serverlast). `fix/block-limits` (lokal) jetzt auf main umsetzen und als PR öffnen | offen |
| 12.11.2026 | PR #354: neuer Chat startet mit Opus · Mittel statt mit Claude Codes Vorgabe (Fable); Eintrag „Default (recommended)“ ausgeblendet | bei Grün mergen |
| 12.11.2026 | Drei Subagenten parallel: Mechanik (`fix/mechanism-audit`), Normteile (`fix/standard-parts-audit`, von main), Regeln R1/R3/R54 (`fix/assistant-check-rules`, auf `fix/print-check-audit`) | je Ergebnis: Diff unabhängig prüfen lassen (wie #353), `contract.yml` auf dem Zweig, dann mergen. Reihenfolge: #353 zuerst, dann die beiden darauf aufgesetzten PRs auf main umhängen |
| 12.11.2026 | Danach noch offen bei A: W2/T4/N-bloecke-1 Rest (Durchgangsloch durch beide Wände des eigenen Hohlkörpers) und N-normteile-policy-2 (Loch schneidet die Außenwand auf) – beides im Baustein-Werkzeug, erst nach #355 und dem Regel-PR (gleiche Dateien). G1 (zusammen gedruckte Teile): Vorschlag – die Mechanik-Werkzeuge kennen ihre Print-in-place-Arten (Scharnier, Führung); diese Körperpaare als Gruppe merken und in der Druckprüfung auf ein gemeinsames Bett stellen; erst nach dem Mechanik-PR | offen |
| 12.11.2026 | Nutzer-Befund U-1 (A): Assistent optimiert Druckzeit und Material nicht von allein – keine Regel, kein Messwert. An den Regel-Subagenten als Zusatzpunkt gegeben (Maßstab mit Quellen, schaltbare Regelgruppe, Messwerte je Körper in der Prüfnotiz) | mit dem Regel-PR prüfen; die Maßstab-Tabelle aus dem PR-Text nach `03-massstab-druckzeit-material.md` übernehmen; in Phase 7 eigene Aufträge dazu (Auftrag ohne das Wort „optimieren“ → Volumen/Höhe gegen eine Referenzlösung messen) |
| 12.11.2026 | #354 Oberflächen-Tests rot: 1 Test (`app.spec.ts:718`, Gelenke abspielen, „Expected < -5, Received 0“) – berührt die Modellwahl nicht, Server unter Last (drei Subagenten) | Lauf wiederholt; wieder rot → ansehen |
| 12.11.2026 | #355 gemergt. Vertragstest „a slot built into a hinged flap“ zum dritten Mal rot (#350, zweimal; #348 einmal rot, einmal grün; #346 grün). Auffällig: grün nur auf Ständen MIT dem Körper-Fix (#348, `targets`) bzw. vor #347; #350 basierte auf main ohne #348 | #350 auf aktuelles main umgesetzt, Vertragstests neu (Run 43229167123). Grün → der Schnitt ohne `targets` in einer Komponente war auf 0.40.1 unzuverlässig und ist mit #348 behoben (als Befund nachtragen). Rot → Spiegelung nach `applyBlock` untersuchen |
| 12.11.2026 | #354 gemergt (Opus · Mittel als Standard). #356 Normteile: Review fand 5 neue Befunde (P-1 bis P-5), darunter P-1: jede Policy-Regel ist per Großschreibung des Befehlsnamens umgehbar. An den Subagenten zurückgegeben | Nachtrag prüfen, `contract.yml` auf dem Zweig, mergen. Danach `tools/audit` nachziehen (`normteile-policy-families` an `isLibraryPart(description, library)`) |
| 12.11.2026 | #353: Vertragstests grün, aber das 2. Review (nur die drei Nachtrags-Commits) hält ihn für nicht merge-reif: Brückenlogik hängt an 12 festen Richtungen (schräge Brücke/Loch fälschlich gemeldet), Loch in der Brücke meldet die ganze Decke, Ankerprüfung quadratisch (bis 56 s im UI-Thread), spitz endende hängende Lippe bleibt „ready“. An den Subagenten zurückgegeben | nach dem Nachtrag: 3. Review nur dieser Commits, `contract.yml`, dann mergen |
| 12.11.2026 | #357 (R1, R3, R54, U-1): Review fand 11 Punkte (u. a. Rippenregel 50–75 % führt unter die Mindestwand, Vollvolumen täuscht Ersparnis vor, Logo-Werkzeuge fehlen in `CHANGING_TOOLS`, 5-s-Wartezeit bei Mehrkörper-Entwürfen). Zurückgegeben | nach dem Nachtrag: Review der neuen Commits, `contract.yml`, mergen (nach #353) |
| 12.11.2026 | Beobachtung: Jeder Subagenten-PR brauchte bisher mindestens eine Review-Runde mit echten Fehlern. Regel für den Rest des Audits: kein Subagenten-PR ohne unabhängiges Review des Diffs; Review der Nachträge wiederholen, bis nichts Ernstes mehr kommt | gilt |
| 12.11.2026 | Ursache des wiederholt roten Vertragstests gefunden: Befund V-1 (A), Wettlauf zwischen stillen Checks der Probeläufe und echten Änderungen (`headless.ts`/`supervisor.ts`) – kein Lastproblem und nicht durch #348 behoben (meine frühere Vermutung war falsch). #350 gemergt (sein Diff berührt den Wettlauf nicht). Subagent behebt V-1 auf `fix/quiet-check-race` und lässt die Vertragstests dreimal laufen | Ergebnis unabhängig prüfen lassen, mergen. Bis dahin kann JEDER Vertragstest-Lauf an diesem einen Test scheitern – dann nicht als Fehler des jeweiligen PRs werten |
| 12.11.2026 | #356 Normteile: 2. Review „merge-reif“, aber die Referenz blockiert die Modellanzeige (30 Teile 4,2 s je App-Start, Fehlschläge nie gemerkt). Zurückgegeben: nicht blockierend, Fehlschläge merken, Cache über Neustart, zusätzlicher Formvergleich | nach dem Nachtrag kurzes Review, `contract.yml`, mergen |
| 12.11.2026 | #358 Mechanik: Review „nicht merge-reif“ – Dach der Führung zerschneidet Schieber mit Knopf (M-2), Rücknahme scheitert ab Undo-Tiefe 200 (M-1, betrifft auch das gemergte `blockTool.ts` aus #348!), koaxiales zweites Scharnier fälschlich abgelehnt, „without support“ stimmt für 40°-Material nicht. Zurückgegeben | nach dem Nachtrag Review, Vertragstests, mergen. **Danach `blockTool.ts` auf die gemeinsame Rücknahme `takeBack.ts` umstellen (M-1) – eigener kleiner PR, nach #357** |
| 12.11.2026 | Merke für Squash-Merges: PR-Titel höchstens 93 Zeichen, sonst sprengt „ (#nnn)“ die 100-Zeichen-Grenze von commitlint in PRs, die main hineinmergen (#354 hat 101; deshalb ist „Conventional Commits“ in #357 rot, bis #357 auf main umgehängt ist) | gilt |
| 12.11.2026 | #357: 2. Review „nicht merge-reif“ – Prüfnotiz entfällt ab Undo-Tiefe 200 (Regression), Rücknahme scheitert am Deckel, Messrichtung bei mehreren Löchern bis 68° daneben, Sonde ab halber Tiefe übersieht Sitz an Fase. Zurückgegeben. Neuer Befund X-1 (Ampel/Export während laufender Abstandsmessung) | nach dem Nachtrag 3. Review nur der neuen Commits |
| 12.11.2026 | Offene Nacharbeit nach den Merges: Rücknahme in `blockTool.ts` (lokal, #357) und `takeBack.ts` (#358) zu EINER Funktion zusammenführen | offen |
| 12.11.2026 | #353: 3. Runde gepusht (Brückenrichtung aus den Auflagern, Flutung vom Bett, Laufzeit 56 s → 0,4 s); 3. Review läuft, Vertragstests in der Schlange. #356: 3. Review „merge-reif“, letzte kleine Runde (Absturz nicht dauerhaft merken, Cache validieren, Zeitfenster der Druckprüfung) plus neuer Befund P-6 (`screenshot {path}` überschreibt Nutzerdateien) | je nach Push: Vertragstests, mergen |
| 12.11.2026 | Merke: `contract.yml` hat nur EINEN wartenden Platz – ein neu angestoßener Lauf bricht den wartenden ab. Vertragstests immer einzeln anstoßen, erst wenn kein Lauf mehr läuft oder wartet; `cancelled` zählt nicht. Der Test „starts SolidCraft without a window“ zählt `solidcraft-cli`-Prozesse auf dem Rechner und kippt, wenn nebenher ein Harness-Lauf endet | gilt |

## Übergabe an die nächste Sitzung (12.11.2026 spät, Kontext der Sitzung voll)

**Zuerst lesen:** Dieser Abschnitt ersetzt alle älteren Zeilen im Verlauf oben, wo sie sich widersprechen.

### Stand 12.11.2026 abends (Folgesitzung) – ersetzt die Tabelle und den Nachtrag unten

- **Gemergt (alle fünf):** #359 (Wettlauf V-1), #353 (Druckprüfung), #356 (Normteile), #357 (Regeln), #358 (Mechanik), dazu #360 (Testkorrekturen). Vertragstests von #357 und #358 zuletzt komplett grün (#358 auf dem mit #357 zusammengeführten Stand). **Testversion 0.1.0-test.20261112.133 aus main an Server und Gaming-PC geliefert.** Die Worktrees unter `.claude/worktrees` sind damit entbehrlich (nicht aufgeräumt; `tools/audit/cases` darin vorher sichten, Schritt 5 unten).
- **Als Nächstes:** (1) schichtweise Druckprüfung als eigener PR; (2) Schritte 1–5 und 7–9 unter „Danach“ (Schritt 6 ist erledigt); (3) Mac-Build: PR #361 einer eigenen Sitzung, wartet auf das dmg; danach Release 0.3.1 zur Freigabe vorlegen.
- **#353 – Entscheidung Manuel 12.11.2026:** mit 27 bekannten Fehlfällen von 178 gemergt (Liste `OPEN` in `packages/geometry/src/overhangCases.test.ts`, als erwartete Fehlschläge). Falsches „ready“: Treppen aus niedrigen Stufen, Tropfkante/Schürze mit Wange. Falsches „warn“: L-/T-/Kreuz-/Ringkanäle, Tunnel mit Rundung oder Schnitt, Mutterntaschen M4–M6. **Nächster eigener PR: Prüfung schichtweise neu bauen** (Teil in Schichten schneiden, je Schicht Auflage und Spannweite, `clipper2-ts`), gemessen an den 178 Fällen. Zwei verworfene Umbauten des Flächenansatzes liegen in `wip-353/` (rekursiv: läuft endlos; feste Tiefe: 44 druckbare Formen falsch gemeldet).
- **#358 Mechanik:** drei Review-Runden eingearbeitet (Dachprobe mit Flankenstäben an der richtigen Stelle, Überlappung zweier Scharniere über die Stifte, ehrliche Texte). In CLI gemessen: SolidCraft 0.40.1 rechnet die Stab-Überlappung exakt (4e-10 bei 300 mm). Bekannte Grenzen als `shortcut:` im Code: schräge Schiene und runde/gefaste Schlitten bekommen kein Dach; umbenannter oder verschobener Stift wird nicht erkannt.
- **#357 Regeln:** Werkzeugantwort wartet auf die Druckprüfung (bis 3 s je änderndem Aufruf, lokal 150–350 ms). Die Vertragstests warten deshalb jetzt auf das Zugende (`turnEnded`). Punkte 1–7 des 3. Reviews weiter offen (Folge-PR mit der Vereinheitlichung der Rücknahme).
- **#360:** nur Tests – Text-Test setzt die Draufsicht vor jedem Klick neu (Taste 7 ging verloren, Ursache unbewiesen), Gelenk-Tests lesen die Revision erst, wenn nicht mehr „rebuilding“ steht. Beide Wackler traten erst am 12.11. nachmittags auf; ungeklärt, ob #359 „rebuilding“-Momente häufiger macht.
- **Mac-Build (Manuel 12.11.2026):** Der erste Mac-Build (unsigniertes dmg) soll mit dem nächsten Update 0.3.1 erscheinen. Einordnung: nach Schritt 6 „Testversion“ unten, vor der Freigabe von Release-PR #310; eigener PR, Schritte im Gedächtnis (`vorhaben\partbuddy\mac-version.md`). Release 0.3.1 erst freigeben, wenn das dmg gebaut ist.
- **Merke:** Nach einem Squash-Merge der Basis einen abhängigen Zweig so nachziehen: erst den echten Endstand des Basiszweigs hineinholen, dann main; Konfliktdateien, die auf main dem Basis-Endstand gleichen, mit dem Zweigstand auflösen. Konfliktliste vollständig lesen (nicht mit `tail` kürzen) – ein pauschales `checkout --theirs` hat am 12.11. Änderungen von #357 verworfen.

Auf main gemergt am 12.11.2026: #346 (SolidCraft 0.40.1 Mindestversion), #347 (Einschmelz-Einsätze), #348 (Baustein auf dem genannten Körper), #349 (Messdüse), #350 (Stützen-Aussage), #351 (Kernloch-Regel), #352 (Spalt-Marke), #354 (Opus · Mittel als Standard), #355 (Baustein-Grenzen).

### Fünf offene PRs – Arbeitsverzeichnisse unter `.claude/worktrees/` NICHT aufräumen

In der vorigen Sitzung liefen dazu Subagenten. Ob sie noch laufen, weiß die neue Sitzung nicht: **vor jeder Arbeit an einem Zweig `git fetch` und den Kopf des Zweigs mit dem hier genannten vergleichen**, im Worktree `git status` ansehen (uncommittete Arbeit übernehmen, nicht überschreiben) und den PR-Text lesen (die Subagenten haben ihre Berichte dort eingetragen).

| PR / Zweig | Worktree | Kopf bei Übergabe | Stand | Nächster Schritt |
|---|---|---|---|---|
| #359 `fix/quiet-check-race` – Wettlauf V-1 | `agent-a92980055acef80e8` | `0e1ba80` | PR-CI grün. Vertragstests: Lauf 1 (43238880716) 51/52, Schlitz-Test grün, rot „a built text is picked … under a click“ (3-s-Wartezeit); Lauf 2 (43245381541) wartete. Noch KEIN unabhängiges Review | Läufe auswerten (bis drei saubere; tritt der Text-Test wieder auf, prüfen, ob die neue Serialisierung Klick-Treffer verzögert). Unabhängiges Review des Diffs. Mergen. **Vorrang:** ohne diesen Fix kippt in jedem Vertragstest-Lauf zufällig „a slot built into a hinged flap“ |
| #356 `fix/standard-parts-audit` – Normteile, Policy | `agent-a4b14993fe6a97320` | `155e2c3` | 3. Review: merge-reif. Letzte kleine Runde war in Arbeit (a–g, darunter P-6: `screenshot {path}` und alle Pfad-Argumente der direkt erlaubten Werkzeuge sperren) | Kopf/Worktree prüfen; ist die Runde gepusht: kurzes Review nur des Policy-Commits, `contract.yml`, mergen. Sonst die Runde fertigstellen (Punkte stehen im Verlauf, Zeile „#356: 3. Review“) |
| #353 `fix/print-check-audit` – Druckprüfung | `agent-ad58394fa92920f35` | `89274a3` | 3. Review: NICHT merge-reif (Treppe aus niedrigen Stufen und Tropfkante mit Wange sind „ready“; falsches „warn“ bei L-/T-/Kreuz-/Ringkanälen, Tunneln mit Rundung, Mutterntaschen ab M4). 4. Runde war in Arbeit, Vorgabe: zuerst alle Fälle der drei Reviews als Tests (neun Drehungen, gespiegelt), dann ändern. Fälle des Reviewers: Scratchpad der alten Sitzung, Ordner `r3` (kann weg sein – dann aus dem PR-Text und dem Verlauf oben nehmen). Vertragstest-Lauf 43243307606 lief auf `89274a3` | Kopf/Worktree prüfen; 4. Review nur der neuen Commits. Zeigt es wieder falsches „ready“: Manuel den Wechsel auf eine schichtweise Prüfung vorschlagen (Teil in Schichten schneiden, je Schicht Auflage und Spannweite messen; `clipper2-ts` ist vorhanden) – nicht allein entscheiden |
| #357 `fix/assistant-check-rules` – R1, R3, R54, U-1 (Material/Druckzeit) | `agent-afbe1a91e3152bf83` | `0a3f08c` | Zwei Review-Runden eingearbeitet, PR-CI lief. 3. Review (nur `d19ec0a`, `0a3f08c`) war gestartet: prüft `takeBack` (nimmt es zu viel zurück?), Einzelschnitt bei mehreren Löchern, Undo-Deckel, Volumenprobe, Holzschrauben-Lesart. Basis ist `fix/print-check-audit`; „Conventional Commits“ dort rot wegen des main-Commits von #354 (101 Zeichen) – wird grün nach dem Umhängen | Ergebnis des 3. Reviews fehlt der neuen Sitzung → Review neu starten. Dann nach #353 auf main umhängen (`gh pr edit 357 --base main`), `contract.yml`, mergen |
| #358 `fix/mechanism-audit` – Mechanik | `agent-a7796255c86d74bc4` | `f37a9c7` (im Worktree lagen 5 ungepushte Commits) | 1. Review: nicht merge-reif (M-2 Dach der Führung zerschneidet Schieber; M-1 Rücknahme am Undo-Deckel, neue `takeBack.ts`; koaxiales zweites Scharnier fälschlich abgelehnt; „without support“ bei 40°-Material; kleine Schiene; Vorlagen-Mindesthöhe). Nachbesserung war in Arbeit | Kopf/Worktree prüfen, ggf. fertigstellen und pushen; 2. Review; nach #353 auf main umhängen, `contract.yml`, mergen |

### Regeln, die sich in dieser Sitzung bewährt haben
- Kein Subagenten-PR ohne unabhängiges Review des Diffs; Nachträge erneut prüfen, bis nichts Ernstes mehr kommt (jeder PR brauchte 2–3 Runden).
- `contract.yml` einzeln anstoßen, erst wenn kein Lauf mehr läuft oder wartet (nur EIN wartender Platz; `cancelled` zählt nicht). Währenddessen möglichst keine Harness-Läufe (der Test „starts SolidCraft without a window“ zählt `solidcraft-cli`-Prozesse).
- PR-Titel höchstens 93 Zeichen (Squash hängt „ (#nnn)“ an; commitlint-Grenze 100).
- Fixes in eigenen Worktrees neben dem Repo bzw. unter `.claude/worktrees`; der Haupt-Checkout bleibt auf `docs/vollaudit-2026-11` (nur Audit-Dokumente und `tools/audit`, nicht gepusht).
- Ersetzungen mit Backslashes nie über Heredoc/sed, sondern mit dem Edit-Werkzeug oder einer mit Write angelegten Skriptdatei.

### Danach, in dieser Reihenfolge
1. Rücknahme vereinheitlichen: `takeBack` in `blockTool.ts` (#357) und `takeBack.ts` (#358) zu einer Funktion (Befund M-1).
2. Rest-A-Befunde im Baustein-Werkzeug: Durchgangsloch/Langloch geht durch beide Wände des eigenen Hohlkörpers (W2/T4/N-bloecke-1 Rest); Loch schneidet die Außenwand auf (N-normteile-policy-2); Mechanik-Fall `r54-screw-insert-edge`.
3. Zusammen gedruckte Teile (G1): Print-in-place-Paare der Mechanik-Werkzeuge als Gruppe merken, Druckprüfung stellt sie auf ein gemeinsames Bett.
4. X-1: Ampel und Export während laufender Abstandsmessung.
5. Harness auf dem Audit-Zweig nachziehen: neue Fälle der Subagenten liegen uncommittet in ihren Worktrees unter `tools/audit/cases/`; `normteile-policy-*` an die neue Erkennung anpassen; `passung-texte-r1-r3-pruefnotiz` an das Schema von #353.
6. Testversion aus main bauen und liefern (Worktree `../partbuddy-wt-main`: `git checkout --detach origin/main`, dann `tools/test-app/deliver-test-app.ps1` aus PowerShell). Manuel wartet darauf: auf dem Gaming-PC liegt noch …132 ohne Opus-Standard, Druckprüfung, Normteile.
7. B- und C-Befunde (BEFUNDE.md, Status „offen“), Dubletten bei B/C abgleichen, „Nicht geprüft“-Restliste.
8. Phase 4 für die ganze Prüfliste, alle Messfälle gegen 0.40.1 wiederholen, `02-solidcraft-abgleich.md` auf 0.40.1 nachziehen.
9. Phase 7: Abnahme im echten Chat mit Modelltest (Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.2, ChatGPT-Modelle; streng nacheinander), eigene Aufträge zu Material/Druckzeit ohne das Wort „optimieren“.

### Nachtrag nach der Übergabe (Berichte, die noch in der alten Sitzung ankamen)
- **#358 Mechanik**: Nachbesserung gepusht, Kopf jetzt `864e273` (enthält `origin/fix/print-check-audit` bis `89274a3`). Laut Bericht behoben: Dach nur noch, wo fünf Probestäbe entlang der Nut im Körper liegen; jeder Schritt, der einen Körper teilt, lässt den Aufruf scheitern und nimmt ihn zurück; Rücknahme über neue `apps/desktop/src/main/agents/takeBack.ts` (`markOf(run)` vor dem ersten Bauschritt, `takeBack(run, mark)` im Fehlerzweig, hängt `component.activate {component: 0}` selbst an) – so auch in `blockTool.ts` einzusetzen; koaxiales zweites Scharnier wird gebaut und teilt das Gelenk; „without support“ nur ab 45° Materialgrenze; kleine Schiene als Brücke benannt; Vorlage bei `height = 5` ohne Steg unter dem Boden. Offen: Einsatz-Sitz der Schraubverbindung am Rand (N-mechanik-8), zweite Führung wird weiter abgelehnt, Vorlage `hingedBox` bei `height = 5` blockt an der Fase des Verschlusses (ungeklärt, ob schon vorher). **Nächster Schritt: 2. unabhängiges Review nur der Commits `29786b8` und `6623081`, dann nach #353 auf main umhängen, `contract.yml`, mergen.**
- **#357 Regeln**: 3. Review (nur `d19ec0a`, `0a3f08c`) liegt vor: **merge-reif, kein Fund blockiert** – das Review muss NICHT neu gestartet werden. Kleine Punkte, vor oder direkt nach dem Merge: (1) `takeBack` in `blockTool.ts` nimmt bis „gesendet + 4“ Schritte zurück, der letzte Undo wird nicht mehr geprüft, und `sent` zählt die zwei `component.activate` mit (belegen keinen Undo-Schritt) → bis zu 6 fremde Schritte; (2) nach gescheiterter Rücknahme stimmt die Meldung nicht mit dem Zustand überein (Undos zählen und bei Misserfolg `edit.redo`). Beides erledigt sich, wenn `blockTool.ts` auf `takeBack.ts` aus #358 umgestellt wird (Schritt 1 unter „Danach“) – dort gleich mit prüfen. (3) Erfolgstext „needs 2 mm … it is there“ behauptet mehr, als die Schwelle misst: `slack` für gekrümmte Flächen gilt auch auf ebenen (M3-Sitz geht ab ~5,0 mm von einer Kante mit 3-mm-Fase durch, Wand oben unter 1,6 mm; Holzschraube bis ~5,7 statt 6,35 mm an die Kante) → `slack` nur bei wirklich abfallender Fläche oder Text ehrlich machen; (4) `UNDO_CAP = 200` hart kodiert → Vertragstest „205 Schritte lesen `undo` 200“, `marker` aus `document.inspect` als Zusatzkriterium (zählt über 200 weiter, bewegt sich aber nicht bei reinen Skizzenänderungen); (5) Gelenkläufe über 40 und ungeprüfte Netzkörper ebenfalls als `unmeasured` melden; (6) Sitz auf vorhandenem Vorloch wird jetzt immer abgelehnt – Text ergänzen; (7) Tests: Undo wirkt, Vorher-Stand nie erreicht; `edit.undo` wirft; ein schlechtes Loch unter mehreren. An SolidCraft 0.40.1 gemessen: ein Befehl = ein Undo-Schritt; `component.activate` belegt keinen, bewegt aber die Revision; Undo stellt das Volumen bitgenau wieder her; `edit.undo` am Anfang scheitert mit „nothing to undo“. **Nächster Schritt: nach #353 auf main umhängen, `contract.yml`, mergen; Punkte 1–7 als Folge-PR zusammen mit der Vereinheitlichung der Rücknahme.**
- **CI von #357 rot in „Lint, typecheck, test, build“** (Kopf `0a3f08c`): nicht wegen #357, sondern wegen des Laufzeittests aus #353 (`packages/geometry/src/overhangSpeed.test.ts`, „finds the flanks of a long thread small“: 3890 ms gegen die Grenze 3000 ms auf dem belasteten Linux-Runner). An den Subagenten von #353 gegeben: Laufzeit über das Wachstum (n gegen 4n) statt über eine feste Zeit prüfen. Bis das in `fix/print-check-audit` ist und #357/#358 es hineingeholt haben, kann dieser Check dort zufällig rot sein.
- **#356 Normteile**: letzte Runde gepusht, Kopf jetzt `c38f5b6` (davor `46e330a` = Sperre der Datei-Argumente `path`/`file`/`reference`/`output` für alle direkt erlaubten Werkzeuge, Befund P-6; Ausnahmen: `compare_picture` mit PartBuddys eigenem Foto, `skill_reference` mit bloßem Namen). Laut Bericht: nur echte Ablehnungen dauerhaft gemerkt; Timer nach der Sperre; Export scheitert mit Meldung statt einen ungeprüften Körper hinauszugeben; `structure.pendingParts` aus der Druckprüfung genommen (Markierung „vorläufig“ fehlt bis zur Zusammenführung mit #357); Cache validiert. Ein letztes kurzes Review der zwei Commits war gestartet (prüft v. a.: Umgehung der Foto-Ausnahme über Pfadschreibweisen; kann ein Körper dauerhaft in `pendingParts` hängen und so ungeprüft bleiben; sperrt der scheiternde Export Nutzer aus). **Nächster Schritt: liegt das Review-Ergebnis der neuen Sitzung nicht vor, dieses kurze Review wiederholen; dann `contract.yml` auf dem Zweig (einzeln!), mergen.**
- **#356 Normteile, letztes Review** (nur `46e330a`, `c38f5b6`): merge-reif mit einem Vorbehalt. An den Subagenten zurückgegeben (in Arbeit, Kopf bei Übergabe `c38f5b6`): (1) BLOCKER `pendingParts` bleibt hängen, wenn der Nachhol-Spiegel scheitert → Körper dauerhaft ungeprüft; (2) Export/Slicer/Stückliste dauerhaft gesperrt, wenn `solidcraft-cli` fehlt – stattdessen Kandidaten als gedruckt behandeln und es sagen; (3) scheiterndes `parts.library` sperrt den Export auch ohne Normteil; (4) Foto-Ausnahme der Policy ist ein Formmuster (fremdes Projekt, UNC, 8.3 gehen durch) → exakter Vergleich mit den gespeicherten Fotopfaden; (5) Datei-Sperre hängt an vier Argumentnamen → Erlaubnisliste je Werkzeug, auch in `decideCommand`; (6) Timer-Ketten ohne Obergrenze. **Nächster Schritt: Kopf des Zweigs prüfen; ist die Runde gepusht, nur noch nachsehen, dass Punkt 1 mit Test behoben ist (kein volles Review mehr nötig), `contract.yml`, mergen.**
