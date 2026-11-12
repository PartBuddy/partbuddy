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
Liegt portabel unter `%USERPROFILE%.partbuddysolidcraft-0.40.1` (Prüfsumme geprüft). Gegenüber rc.4: 634 statt 633
Befehle, neu `assembly.constraint.edit`, geänderte Parameter bei `solid.hole`, `solid.box`, `solid.sweep`,
`surface.sweep`, `parts.insert`, `parts.fastener`, `body.rename`, `file.export`, `file.export_view_dxf`,
`document.inspect`, `sketch.insert_svg`, `sketch.insert_dxf`, `sketch.drawing_bounds`, `sketch.scale`,
`sketch.move`, `config.*`.
- [ ] Parameteränderungen der 19 Befehle einzeln lesen und gegen jede Stelle halten, an der PartBuddy sie aufruft
- [ ] alle Fälle unter `tools/audit/cases/` gegen 0.40.1 wiederholen; Abweichungen zu rc.4 sind Befunde
- [ ] `02-solidcraft-abgleich.md` auf 0.40.1 nachziehen (neuer Befehl, geänderte Parameter)
- [ ] App auf 0.40.1 umstellen (`RECOMMENDED_VERSION` in `engineVersion.ts`, Vertragstests, Doku) – eigener PR

### Phase 4 – Bauen und Messen
- [ ] Mess-Harness (Werkzeuge direkt gegen echtes SolidCraft, Messung über `packages/geometry`)
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
