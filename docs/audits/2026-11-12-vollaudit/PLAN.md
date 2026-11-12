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

### Phase 7 – Abnahme im echten Chat
- [ ] Auftragsreihe festgelegt
- [ ] alle Läufe gemessen, ohne neuen Befund

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
