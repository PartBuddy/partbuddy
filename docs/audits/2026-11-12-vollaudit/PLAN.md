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
- [ ] Prüfliste Werkzeuge
- [ ] Prüfliste Fachtabellen
- [ ] Prüfliste Druck/Export/SolidCraft-Anbindung/Oberfläche
- [ ] Gegenprüfung Inventur ohne neue Funde

### Phase 2 – SolidCraft-Abgleich
- [ ] Tabelle roh/heute/soll
- [ ] Gegenprüfung ohne neue Funde

### Phase 3 – Maßstab
- [ ] Geometrie
- [ ] Verbindungen, Passungen, Mechanik
- [ ] Jede Zahl aus den Fachtabellen gegen den Maßstab gehalten

### Phase 5 (statischer Teil) – KI-Regeln
- [ ] Regeltexte Satz für Satz gegen Code
- [ ] Gegenprüfung ohne neue Funde
- [ ] Regeltexte gegen Maßstab und Befunde aus Phase 2/4

### Befunde zusammenführen
- [ ] `BEFUNDE.md` aus allen Dateien, dedupliziert, nummeriert

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
| 12.11.2026 | Workflow Lesephase (7 Prüfer + 2 Gegenprüfer) für Phase 1, 2, 3, 5 statisch | gestartet; Ergebnisdateien prüfen, dann oben abhaken. Fehlt eine Datei, den betreffenden Prüfer einzeln nachholen. |
