# Usability-Offensive November 2026

Ziel: Eine Makerin oder ein Maker mit 3D-Drucker, aber ohne CAD-Erfahrung, kommt ohne Anleitung vom ersten Start bis
zum ersten druckbaren Teil. Stand `main` bei `facb15f` (0.3.4), 16.11.2026.

## Grundlage

- **Durchläufe:** `apps/desktop/e2e/usability.spec.ts` spielt die Aufgaben 1–7 in der echten App durch (headless
  SolidCraft 0.42.0, Test-Claude, eigenes Profil, Fenster außerhalb des Bildschirms). Je Schritt Bild, Dauer, axe
  (WCAG 2.2 AA), abgeschnittene Texte und alle sichtbaren Hinweise. Läufe: DE und EN 1440×900, DE 960×600,
  nur Tastatur, ohne SolidCraft und abgemeldet, dazu Nachläufe für Absturz/Esc und Projektwechsel/Import/Export.
  Start: `PARTBUDDY_USABILITY=<ordner> PARTBUDDY_E2E_SOLIDCRAFT=1 npx playwright test e2e/usability.spec.ts`.
- **Belege:** Bilder unter `%USERPROFILE%\.partbuddy\usability-2026-11\<lauf>\<nr>-<schritt>.png`, je Lauf
  `steps.json`. Zitiert als `lauf/nr`, z. B. `de-narrow/63`.
- **Test-Claude** ergänzt um „Hit my limit“ und „Go offline“ (Wortlaut von Claude Code 2.1). Antworten des
  Test-Claude sind englisch und nicht bewertet.
- **Nicht abgedeckt:** echte Claude-/ChatGPT-Anmeldung im Browser (bewusst, nur Fake), echtes Offline-Netz, Mac.
  Der SolidCraft-Absturz ließ sich im Test nicht sichtbar auslösen (U-24).

## Was gut läuft

Vorlage öffnen 8–13 s mit Fortschritt in der Kachel, Projektwechsel 0,2 s, Papierkorb mit Wiederherstellen,
Startseite ohne SolidCraft mit klarer Leiste und Knöpfen (A-07 behoben), abgelaufene Anmeldung mit Knopf
„Mit Claude anmelden“, Gelenk-Panel mit verständlichem Text, Druckprüfung nach jeder Änderung, ungültiger Name und
negativer Wert mit klarer Meldung am Feld. Fokusring überall außer am ViewCube.

## Befunde

Schwere: **blockiert** (ein Neuling kommt nicht weiter) · **bremst** (kommt weiter, aber rät oder sucht) ·
**Feinschliff**. Aufwand S/M/L. Sortiert nach Schwere, dann Aufwand. „Alt“ = aus früherem Audit übernommen.

| ID | Bereich | Problem aus Anwendersicht | Beleg | Schwere | Aufwand | Lösungsvorschlag | Stand |
|---|---|---|---|---|---|---|---|
| U-01 | Ersteinrichtung › Assistent | Abgemeldet steht nur „Nicht bei Claude Code angemeldet · Erneut prüfen“, ohne Knopf zum Anmelden. Angemeldet steht gar kein Status, stattdessen drei Modell-Auswahlen („Opus 9 · Mittel“, „Automatisch je Schritt“, „Fragen und Plan / Bauen / Prüfen“). Man verlässt die Einrichtung nicht angemeldet oder ohne zu wissen, ob es klappt. | missing/02, de-wide/02 | blockiert | M | Status „Angemeldet als … ✓“ bzw. Knopf „Mit Claude anmelden“ / „Mit ChatGPT anmelden“ (wie in der Fehlerkarte). Modellwahl unter „Erweitert“ einklappen, Standard behalten. | behoben [#474](https://github.com/PartBuddy/partbuddy/pull/474) |
| U-02 | Hinweise | Rohe Platzhalter: „„{{value}}“ verworfen, {{kept}} bleibt“ nach einem ungültigen Parameter (bleibt rot oben stehen), ebenso „Höchstens {{count}} Fotos …“. ICU braucht `{value}`. | de-narrow/62–69 | bremst | S | Schlüssel `parameters.discarded` und das Foto-Limit auf `{value}`/`{count}` umstellen; Unit-Test, der `{{` in de/en.json verbietet. | behoben [#470](https://github.com/PartBuddy/partbuddy/pull/470) |
| U-03 | Dialoge | Esc schließt die Einstellungen nicht, wenn der Fokus auf dem Schließen-X liegt. Tastaturnutzer bleiben im Dialog. | keyboard/08, recheck/02 | bremst | S | Esc am Dialog behandeln, nicht nur im Inhalt; E2E-Prüfung. | behoben [#472](https://github.com/PartBuddy/partbuddy/pull/472) |
| U-04 | Chat › Fehler | Verbrauchsgrenze: Karte „Der Assistent hat mit einem Fehler aufgehört“ mit „Erneut senden“, das wieder scheitert. Wann es weitergeht und was man tun kann, steht nirgends. | de-narrow/63 | bremst | S | Grenze erkennen (`rate_limit`, `rejected`): „Dein Claude-Kontingent ist bis 15:00 aufgebraucht“ mit Uhrzeit, Knopf „ChatGPT verwenden“ falls angemeldet, kein „Erneut senden“ vor der Uhrzeit. | behoben [#473](https://github.com/PartBuddy/partbuddy/pull/473) |
| U-05 | Chat › Fehler | Ohne Internet dieselbe allgemeine Karte statt „Keine Verbindung zu Claude – prüfe das Internet“. | de-narrow/64 | bremst | S | Verbindungsfehler erkennen und benennen; „Erneut senden“ bleibt. | behoben [#473](https://github.com/PartBuddy/partbuddy/pull/473) |
| U-06 | Startseite | Nach „Fertig“ der Einrichtung steht eine leere Startseite. Dass man ein Teil im Chat beschreibt, steht nirgends; der Leertext zählt Dateiformate und einen Einstellungspfad auf. | de-wide/09 | bremst | S | Leertext: „Beschreib dein erstes Teil – der Assistent baut es.“ mit Hauptknopf „Neues Teil beschreiben“ (= Neues Projekt, Fokus im Chat); Formate in den Import-Tooltip. | behoben [#474](https://github.com/PartBuddy/partbuddy/pull/474) |
| U-07 | Export | Das Menü erklärt in Fachsprache („off by 0.005 mm per 100 mm“, „finely meshed; laid on its print face only a single part“). Welches Format für den eigenen Slicer, sagt es nicht. Nach dem Export erscheint keine Bestätigung mit Ort. | projects/03, projects/04 | bremst | S | Je Format ein Satz („3MF – für Bambu Studio, PrusaSlicer, Orca (empfohlen)“), Feinheiten in den Tooltip. Nach dem Export Hinweis „Gespeichert unter …“ mit „Ordner öffnen“. | behoben [#475](https://github.com/PartBuddy/partbuddy/pull/475) |
| U-08 | Chat | Der Chat zeigt rohe Bezeichner: „Maß plate_height auf 120 mm gesetzt“, obwohl der Parameter „Höhe“ heißt. | de-narrow/20 | bremst | S | Anzeigenamen aus dem Parameterkommentar verwenden. | behoben [#470](https://github.com/PartBuddy/partbuddy/pull/470) |
| U-09 | Chat › Vorlage | Nach dem Öffnen einer Vorlage zeigt der leere Chat allgemeine Beispiele („Wandhalter für Akkuschrauber“) und „Beschreibe, was SolidCraft bauen soll“. Wie man die Vorlage anpasst (Wert links ändern oder „mach sie 80 mm lang“), steht nicht da. | de-narrow/24 | bremst | S | Bei offenem Design: „Ändere einen Wert links oder sag, was anders sein soll“ mit Beispielen aus den Parametern. „SolidCraft“ durch „der Assistent“ ersetzen. | behoben [#470](https://github.com/PartBuddy/partbuddy/pull/470) |
| U-10 | Ersteinrichtung › Drucker | Vorgegeben ist „Mein Drucker 256 × 256 × 256“; ein Neuling kennt Bauraum und Düse nicht. Der Katalog liegt hinter „Drucker hinzufügen“. | de-wide/03 | bremst | S | Als erste Aktion „Drucker aus der Liste wählen“ (Katalog) anbieten, Felder erst danach. | behoben [#474](https://github.com/PartBuddy/partbuddy/pull/474) |
| U-11 | Titelleiste, Statusleiste | Auf der Startseite steht ein Projekt („Neues Teil ▾“, „No design ▾“) und unten „Druckbereit“, obwohl nichts offen ist. | de-wide/09, missing/05 | bremst | S | Alt A-14: auf der Startseite nur „PartBuddy“ und Einstellungen; Druckstatus erst mit Projekt. | behoben [#474](https://github.com/PartBuddy/partbuddy/pull/474) |
| U-12 | 3D-Ansicht | ViewCube-Flächen haben keinen sichtbaren Fokus (WCAG 2.4.7) und sind kleiner als 24 px (2.5.8); Zeitleisten-Symbole ebenfalls unter 24 px. | keyboard/05, axe target-size | bremst | S | Fokusring am Würfel, Trefferfläche ≥ 24 px. | behoben [#472](https://github.com/PartBuddy/partbuddy/pull/472) (Würfel-Fokus; Zeitleiste: axe-Treffer am Scrollrand, kein Fehler) |
| U-13 | Chat › Fehler | Jede andere Fehlerkarte bietet nur „Logdatei zeigen“ ohne Grund (alt C-04). | de-narrow/66 | bremst | M | Grund in einem Satz aus dem Fehler, „Details kopieren“; Log bleibt. | behoben [#473](https://github.com/PartBuddy/partbuddy/pull/473) |
| U-14 | Import | Ein importiertes STL heißt „Ca… mesh“ mit „1 Fläche“ und „2 Warnungen“; dass ein Netz nicht über Maße änderbar ist und was „In Flächen umwandeln“ bewirkt, erfährt man nicht. Einheit wird nicht erfragt (alt D44). | projects/06 | bremst | M | Nach Import Hinweis „Netz importiert – Maße änderst du über den Assistenten oder nach ‚Umwandeln‘“; bei unplausibler Größe (< 1 mm oder > Bauraum × 10) fragen „In Zoll/Meter?“. | behoben [#475](https://github.com/PartBuddy/partbuddy/pull/475) (Einheiten-Frage gab es schon, D44) |
| U-15 | Druckprüfung | „Druckbereit?“ sagt „Keine Probleme gefunden“, aber nicht, was als Nächstes kommt. | de-narrow/20 | Feinschliff | S | Knopf „Für den Slicer exportieren“ im Popover, wenn grün. | behoben [#475](https://github.com/PartBuddy/partbuddy/pull/475) |
| U-16 | Update-Hinweis | „PartBuddy 0.4.0 ist verfügbar. Herunterladen unter Einstellungen → Über.“ – kein Knopf. | de-wide/60 | Feinschliff | S | Knopf „Herunterladen“ im Hinweis. | behoben [#475](https://github.com/PartBuddy/partbuddy/pull/475) |
| U-17 | Chat | Modell-Chip im schmalen Fenster abgeschnitten: „Clau… · Opus 9 · Mit…“. | de-narrow/14 | Feinschliff | S | Unter 1100 px nur Modellname, Rest im Tooltip. | behoben [#476](https://github.com/PartBuddy/partbuddy/pull/476) |
| U-18 | 3D-Ansicht | Nach einer Maßänderung wächst das Teil aus dem Bild; „Kamera folgt Änderungen“ ist aus. | de-narrow/20 | Feinschliff | S | Bei eigener Maßänderung einpassen, wenn das Teil das Bild verlässt (ohne den Schalter zu ändern). | widerlegt: die Ansicht passt sich schon an, im Bild verdeckte das Prüffenster das Teil ([#476](https://github.com/PartBuddy/partbuddy/pull/476)) |
| U-19 | Struktur | „0/1 gedruckt“ und ein Kreis je Körper bleiben unerklärt. | de-narrow/14 | Feinschliff | S | Tooltip „Als gedruckt abhaken“ am Kreis, Kopf „0 von 1 gedruckt“. | behoben [#476](https://github.com/PartBuddy/partbuddy/pull/476) |
| U-20 | Tastatur | Keine Kürzel-Hilfe aus der Arbeitsfläche (`?`/F1 tun nichts); die Liste liegt nur in Einstellungen › Tastenkürzel. | keyboard/09 | Feinschliff | S | `?` öffnet Einstellungen › Tastenkürzel. | behoben [#472](https://github.com/PartBuddy/partbuddy/pull/472) |
| U-21 | Ansicht ViewCube | Beschriftung ~8 px, „Oben“ kopfüber (alt B-21). | de-narrow/14 | Feinschliff | M | Größere, aufrechte Beschriftung. | behoben [#476](https://github.com/PartBuddy/partbuddy/pull/476) (größer; Ausrichtung war richtig) |
| U-22 | Struktur, Zeitleiste | Interne Namen sichtbar: „Body1“, „Hole1“, „BodyTransfer1“; die Vorlage „Dose mit Scharnier“ zeigt 16 Skizzen „Scharnier 1 ◤“ usw. | keyboard/04, de-narrow/24 | Feinschliff | M | Vorlagen-Hilfsskizzen ausblenden bzw. gruppieren; Bausteine und Vorlagen vergeben deutsche/englische Anzeigenamen. | behoben [#476](https://github.com/PartBuddy/partbuddy/pull/476) |
| U-23 | Texte | 29 deutsche Texte über 220 Zeichen (bis 451, `blocks.hint.screwHole`); Fachwörter ohne Erklärung („Überhangwinkel“, „Brim“, „Kontext … Token“); „Mesh“ und „Netz“, „Design“ und „Projekt“ gemischt. | i18n/de.json | Feinschliff | M | Hinweise auf einen Satz kürzen, Rest in „Mehr“; ein Glossar (Projekt, Teil, Körper, Netz) festlegen und durchziehen. | behoben [#478](https://github.com/PartBuddy/partbuddy/pull/478) (Glossar docs/glossar.md; kein „Mehr“-Ausklapper) |
| U-24 | SolidCraft-Absturz | Nach hartem Beenden zeigt PartBuddy „SolidCraft läuft nicht“ mit „SolidCraft starten“, startet das selbst gestartete SolidCraft aber nicht neu. Der Chat ist gesperrt, die Parameter bleiben bedienbar und melden roh „Error invoking remote method 'design:apply-dimension': Error: SolidCraft is not connected“; unten steht weiter „Druckbereit“. (Der erste Lauf traf den Prozess nicht – Testfehler, behoben.) | crash/recheck/04–08 | bremst | M | Siehe Rückfrage zu U-24. | behoben [#477](https://github.com/PartBuddy/partbuddy/pull/477) |
| U-25 | Skizze | Zeichenfläche bleibt im Dunkelmodus reinweiß (alt C-19). | – | Feinschliff | S | Papier im Dunkelmodus abdunkeln. | behoben [#476](https://github.com/PartBuddy/partbuddy/pull/476) |

### Aus früheren Audits weiter offen, hier nicht neu bewertet

B-05 (HUD verdeckt bei 960 px die Ansicht), A-20 (Kachel-Platzhalter), D8 (Druckprüfung schweigt bei Messfehler),
D24 (ausgeblendete Körper fehlen im Export ohne Hinweis), N-nach-5 (Baustein-Vorschau bis 30 s). Sie gehören zu
Geometrie bzw. Prüfung und laufen im Vorhaben „Assistent-Qualität“ weiter.

## Vorschlag für die Umsetzung (PR-Gruppen)

1. **Texte und Platzhalter:** U-02, U-08, U-09, U-23 (Glossar zuerst)
2. **Ersteinrichtung und Start:** U-01, U-06, U-10, U-11
3. **Fehlerkarten:** U-04, U-05, U-13
4. **Tastatur und Barrierefreiheit:** U-03, U-12, U-20
5. **Export, Import, Prüfung:** U-07, U-14, U-15, U-16
6. **Feinschliff Ansicht/Struktur:** U-17, U-18, U-19, U-21, U-22, U-25
7. **U-24** prüfen, dann ggf. Hinweis.

## Abschlussdurchlauf (16.11.2026, main nach #478)

Alle sieben Läufe (DE/EN 1440×900, DE 960×600, Tastatur, ohne SolidCraft/abgemeldet, Absturz/Esc, Projekte) liefen
durch, **ohne „blockiert“- oder „bremst“-Befund**. Bilder und App-Log unter
`%USERPROFILE%\.partbuddy\usability-2026-11-final\`.

Der erste Abschlusslauf fand noch zwei Fehler, behoben im Abschluss-PR:

- Nach „Version speichern“ fiel der Fokus auf die Seite, solange gespeichert wurde, und Esc schloss den Dialog nicht.
- Ein Projektwechsel setzte die Startzeit der Engine neu; ein Absturz bis eine Minute nach dem Wechsel startete
  SolidCraft deshalb nicht neu (U-24).

Fehlschritte, die keine Befunde sind: Modell-Chip auf der Startseite (gibt es nur mit offenem Projekt), Parameter im
importierten Netz-Projekt (hat keine), Vorlagen und Chat ohne SolidCraft (absichtlich gesperrt, die Leiste sagt warum),
ChatGPT-Auswahl in der Einrichtung (der Test trifft das versteckte Eingabefeld; im Bild wählbar).

Neu als **Feinschliff** (am 16.11. freigegeben):

| ID | Bereich | Problem | Beleg | Aufwand | Stand |
|---|---|---|---|---|---|
| U-26 | Chat | axe color-contrast: „1 Abfrage an SolidCraft · läuft“ und ältere, abgeblendete Antworten unter 4,5:1 | en-wide/28, recheck/07 | S | widerlegt: Messung mitten im Einblenden; die Farben haben 6:1, der Durchlauf misst jetzt in Ruhe (reduzierte Bewegung) |
| U-27 | Struktur | axe label-content-name-mismatch: Netz-Körper „Ca… Netz“ trägt einen anderen Namen als sein sichtbarer Text | projects/05 | S | teilweise: der Name enthält jetzt die Art („CableClip Netz“); axe meldet weiter, weil die Zeile Knöpfe enthält (deren Namen zählt es als Text) – dafür müssten die Knöpfe aus der Baumzeile, eigener Umbau |
| U-28 | Einrichtung › Assistent | „Erneut prüfen“ steht zweimal (Link und Knopf in der Anmeldekarte) | missing/03 | S | behoben |
