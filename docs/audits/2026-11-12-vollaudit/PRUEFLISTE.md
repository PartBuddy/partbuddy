# Prüfliste für Audit-Pakete (vor dem PR abhaken)

Gezählt: etwa 170 Review-Funde aus #346–#373 sowie PLAN.md und BEFUNDE.md. Je Fund eine Hauptklasse, Zahlen gerundet (±3). Sortiert nach Häufigkeit; die Klasse steht beim ersten Punkt, Folgepunkte derselben Klasse sind eingerückt.

1. **Grenzfall, ca. 35×.** Ist jede Grenze beidseitig getestet (genau darauf, knapp darunter, knapp darüber)? (#353: Brücke 10 mm frei, 10,001 gemeldet; #371: Schilder 100 × 4 × 60/66 beiderseits der 5 mm; #370: Radius 0 < r < 2 lehnte die Fase ab)
   1. Sind fehlende und ungültige Eingaben getestet (`undefined`, `NaN`, 0, leer, Zahl über der Schema-Grenze)? (#353: `layer` oder `openEdges` undefined gab `ready`, `bodies` über 500 sprengte das Schema)
   2. Sind die Deckel der Umgebung überschritten, nicht nur unterschritten (Undo-Tiefe 200, 40 Gelenkläufe, mehr als 200 Beschreibungen, Bericht bei 40 Funden)? (#357 Review 2: Prüfnotiz entfiel ab Undo-Tiefe 200; #356 Review 3 f; #353 Review 1 Punkt 8)
2. **Text ≠ Code, ca. 20×.** Steht jede Zahl in Antwort-, Regel-, Chip- und Parametertext als Konstante aus dem Code, nicht abgetippt? (#353: „(four layers)“ bei 0,12 mm Schicht, Regel „etwa 10 mm“ gegen Prüfung ab Ø 8; #370: Grenzen zuerst nur im Kommentartext)
   1. Behauptet der Erfolgstext nur, was die Schwelle misst, und nennt jeder Fehlertext den wirklichen Grund? (#357: „it is there“ galt auch auf ebenen Flächen mit Toleranz; #358: „without support“ bei 40°-Material, „no limits are set“ nach gescheitertem Lauf)
   2. Sind Doku, Dateikopf, Parameterkommentar und PR-Text mitgezogen (Suche nach dem alten Wert im ganzen Repo)? (#370: `docs/feature-catalog.md` sagt noch 1,2 mm; #358: Textabschnitt „as of the first round“)
3. **Rücknahme und Fehlerweg, ca. 17×.** Ist nach jedem Fehlerpfad (Wurf, Teilerfolg, Deckel) der Entwurf gemessen wieder wie vorher, nicht nur die Meldung „taken back“? (#358 M-1: ab Undo-Tiefe 200 wurde nichts zurückgenommen und trotzdem „Everything was taken back“; #368: `rollback` allein nimmt nichts zurück)
   1. Nimmt der Aufruf nur eigene Schritte zurück, und sagt die Meldung genau, was stehen blieb (back / kept / partly)? (#357 Review 3: bis zu 6 fremde Schritte; #364 Review 4)
   2. Bleibt nach einem Fehlschlag (Programm fehlt, keine Antwort, `parts.library` scheitert) etwas hängen, das nie endet (Wartezustand, Timer-Kette, gesperrter Export), und gibt es eine Obergrenze für Wiederholungen? (#356 letztes Review: `pendingParts`, Export gesperrt, Timer ohne Ende)
4. **Lage, ca. 12×.** Gibt dieselbe Form dieselbe Antwort gedreht (1°, 7,5°, 15°, 30°, 45°, 60°, 75°, 90°), gespiegelt, angehoben und in jeder Höhe gegen das Schichtraster (0,00–0,20 mm in 0,01-Schritten)? (#353 Review 2: schräge Brücke 240 mm² statt 0; #363 Review 3 S1: Kante je nach Höhe übersehen)
5. **Test prüft das Falsche, ca. 12×.** Wird der Test ohne den Fix rot, und läuft er gegen das echte Verhalten statt gegen einen Fake, der anders antwortet als SolidCraft? (#358 Review 2: Probestäbe nur außerhalb des Fakes geprüft; #356 Review 2: `cliReferences` ohne Test; #369: der Fake-Claude gab die neu verlangten Größen nicht mit)
   1. Steckt im Test eine feste Sekundengrenze oder Wartezeit, die unter Last kippt? (#353 4. Runde: Grenze 3000 ms rot auf CI; #373: Beschriftungs-Timer 500 ms kam nach 1,4 s)
6. **Laufzeit, ca. 12×.** Ist die Laufzeit an großen, eckigen und hohen Körpern gemessen (100 000+ Dreiecke, Treppe mit 740 Stufen, 193-MB-3MF), als Tabelle vorher / nachher / main, und läuft nichts Langes im UI-Thread oder hält den Aufrufer auf? (#353 Review 2: 14 s / 56 s; #356 Review 2: 43 s je App-Start; #366: 12–14 s blockiert)
7. **Messung belegt, ca. 9×.** Sind Sollwerte nach jeder Änderung neu gemessen, nicht aus der letzten Runde übernommen? (#353 4. Runde: Sollwerte „as written in the interrupted round“; #363: Kiel 267,3 vom Review nachgerechnet)
   1. Legt die Prüfung die Form fest oder nur Kennzahlen, die ein anderer Körper auch erfüllt? (#356 Review 2: ein Ring hatte Volumen, Fläche und Zahlen der M3-Unterlegscheibe)
8. **Vertragstest- und E2E-Erwartung nicht mitgezogen, ca. 9×.** Ist der alte Wortlaut oder Wert in `e2e/` und `solidcraft.contract.spec.ts` gesucht, angepasst und der Test gelaufen? (#350, #354: „adapted but not run“; #370: Verschluss-Regex 1,4 mm; #357: acht Vertragstests rot, weil die Antwort jetzt auf die Prüfung wartet)
9. **Zweiter Weg nicht mitgezogen, ca. 8×.** Sind alle Aufrufer der geänderten Stelle gesucht: Formular, Assistent (Claude Code, ChatGPT, lokal), Export, Slicer, Teilen, Stückliste, Logo-Werkzeuge? (#355: BlockPanel bietet Gewinde unter M5 weiter an; #357: Logo-Werkzeuge fehlten in `CHANGING_TOOLS`; #369: Formular misst keine Wand)
10. **Sicherheitsregel umgehbar, ca. 7×.** Sind Eingabevarianten durchprobiert (Groß-/Kleinschreibung, Batch-Schritt `id` oder `path`, UNC, `\\.\`, 8.3, `..`), und ist es eine Erlaubnis- statt Sperrliste? (#356 Review 1: jeder Befehl in anderer Schreibweise; letztes Review: Foto-Ausnahme als Pfadmuster, Datei-Sperre an vier Argumentnamen)
11. **Profilwerte fest statt aus dem Profil, ca. 6×.** Sind Düse (0,2 / 0,25 / 0,4 / 0,6 / 0,8) und Schichthöhe (0,12 / 0,2) aus dem Profil genommen und je getestet? (#353: Schichthöhe undefined, „four layers“; #370: Lippe bei Düse 0,6 auf 1,34 mm; #371 S4: Düse + 0,02 statt 1,05 × Düse)
12. **Fremdes berührt, ca. 6×.** Berührt der Diff Dateien einer anderen Spur (BC-PAKETE.md), fremde Körper, Schritte oder Dateien des Nutzers, und steht das im PR-Text? (#371: `contract.ts` aus Spur L4; #370: `templateSteps` aus `main/index.ts` (L8); #356: `screenshot {path}` überschrieb Nutzerdateien)
13. **Stiller Fehlschlag, ca. 5×.** Hat jeder Rückfall und jeder Fehlschlag eine Logzeile mit Körper und Grund und, wo der Nutzer es braucht, einen Hinweis? (#356 Review 1 Punkt 5: `parts.library` scheitert ohne Log; #363 Review 2: ein Netzfehler schaltet die Schichten still ab; #366: Slicer-Startfehler)
14. **Doppelte Wahrheit, ca. 5×.** Gibt es für dieselbe Größe oder Aufgabe eine zweite Konstante oder Routine (Regeltext gegen Prüfung, zwei Rücknahmen, zwei Linienbreiten)? (#364: zwei `takeBack`; #371 K4: zweites `lineWidth`; #353: `LYING_HOLE` und `BRIDGE_SPAN` in Regeltext und Prüfung)
15. **Nur eine Sprache, ca. 4×.** Gibt es jeden neuen Text, Chip und Vorlagenkommentar in de und en, und läuft die deutsche Vorlage (Komponentennamen) durch? (#366: deutsche Klappbox; #371 S2: Chip-Texte)
16. **Rohe SolidCraft-Meldung, ca. 2×.** Zeigt jede Ablehnung, auch im Formular, Ursache und Ausweg in eigenen Worten statt SolidCrafts Satzes? (#370: `ParametersSection.tsx` zeigt „sketch `Closure ▭`: its constraints would conflict …“; #369: Ghost-Körper, Boss Ø 1)

## Pflicht im Bericht

Was Reviewer am häufigsten nachfordern mussten (17 von 28 PRs führen Nicht-Gelaufenes auf, 13 von 28 haben Review-Abschnitte):

1. **Messwerte mit Quelle:** je Fund Eingabe, Vorher, Nachher, SolidCraft-Version (0.40.1), Profil (Werkstoff, Platte, Düse, Schicht), Harness-Fall und Testname (#353 „After the review“-Tabellen).
2. **Liste „Nicht geprüft“:** E2E, Vertragstests, App selbst, Fensterbetrieb, andere SolidCraft-Versionen, jede Plattform (#356, #361, #366 „Not run“, „Not verified“).
3. **Gelaufen:** die Befehle wörtlich mit Trefferzahl, dazu Kopf-Commit und Lauf-Nummer des Vertragstests (#364 „Checked“; #363 Lauf 43371637946).
4. **Geänderte Sollwerte und Erwartungen** einzeln mit Grund (#363 „Expected values changed“; #371 „Changed expectations“). Keine Sollwerte aus einer früheren Runde ungeprüft übernehmen.
5. **Gelesen oder gemessen:** was nur aus der Regel folgt, ausdrücklich so nennen („follows from the rule, not measured“, #353).
6. **Bekannte Grenzen und Offenes** mit Kennung, im PR-Text und als `shortcut:` im Code (#353 „Known limits“; #371 „Open“).
7. **Laufzeittabelle** vorher / nachher / main für jede Änderung an Schleifen oder Netzen (#363).
8. **Neue und geänderte Texte wörtlich**, de und en (#357 „Texts to the assistant“).
9. **Alle Aufrufer und Wege**, die geprüft wurden: Formular, Assistent, Export, Slicer, Teilen (#369 „Form path“).
10. **Fremde Berührungen:** jede Datei außerhalb der Spur des Pakets mit Grund (#371 `contract.ts`).
