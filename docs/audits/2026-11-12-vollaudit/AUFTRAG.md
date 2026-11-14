# Vollaudit PartBuddy – Auftrag

Auftrag von Manuel, 12.11.2026. Diese Datei ist der Maßstab für jede Sitzung und jeden Subagenten,
der am Audit arbeitet. Der Stand steht in [PLAN.md](PLAN.md).

## Anspruch

Niemand darf PartBuddy nachweisen können, dass es ein falsches, ungenaues oder schlecht druckbares
Modell erzeugt. Maßstab ist nicht „funktioniert“, sondern „hält der Prüfung eines erfahrenen
Konstrukteurs und eines kritischen Reviewers stand“. PartBuddy soll die eingebauten Funktionen von
SolidCraft deutlich übertreffen: Wo SolidCraft allgemeines CAD liefert, liefert PartBuddy die auf FDM
abgestimmte, geprüfte Lösung. Keine Kompromisse: kein Befund wird weggelassen, kleingeredet oder mit
„reicht meistens“ abgehakt. Gründlichkeit geht vor Tempo.

## Arbeitsweise (alle Phasen)

- Nichts annehmen. Jede Aussage beruht auf gelesenem Code, einem gebauten Modell oder einer Quelle –
  mit Fundstelle (`Datei:Zeile`) bzw. Messwert. „Sieht richtig aus“ ist kein Prüfergebnis.
- Jede Zahl im Code und in jedem Regeltext einzeln prüfen: Herkunft, Einheit, Gültigkeitsbereich
  (Material, Düse, Schichthöhe, Druckrichtung), Rundung.
- Nach jeder Phase ein Gegenprüfer-Durchgang: ein unabhängiger Subagent bekommt nur Code und
  Prüfliste (nicht die Schlüsse) und sucht, was übersehen wurde. Erst wenn er nichts Neues findet,
  ist die Phase zu.
- Unsicheres wird nachgemessen oder recherchiert, nicht geschätzt. Was sich nicht prüfen lässt, steht
  ausdrücklich als „nicht prüfbar, weil …“ im Bericht.

## Schwere

- **A** – falsche oder nicht druckbare Geometrie, oder falsche Aussage an den Nutzer
- **B** – druckbar, aber unter dem Maßstab; oder nicht besser als SolidCraft roh; oder eine
  SolidCraft-Funktion wird ungeprüft an den Assistenten durchgereicht
- **C** – Unschärfe, Kosmetik, Uneinheitlichkeit

Je Befund: Nummer, Schwere, `Datei:Zeile`, Ist (Messwert oder Zitat), Soll mit Quelle, Nachstellschritt.

## Phase 1 – Inventur

Quellen: `docs/feature-catalog.md`, `docs/building-blocks.md`, `docs/engineering-notes.md`,
`docs/ui-inventur.md`, `docs/audits/`. Frühere Befunde nicht als erledigt übernehmen, sondern
nachprüfen. Prüfliste mit einer Zeile je Funktion, Option, Parameter, Grenzwert und Tabelleneintrag:

- Werkzeuge des Assistenten: `apps/desktop/src/main/agents/` (alle Dateien)
- Fachtabellen: `apps/desktop/src/shared/`
- Druckprüfung, Export, Teilen, SolidCraft-Anbindung: `apps/desktop/src/main/print/`, `…/share/`,
  `…/solidcraft/`, `packages/geometry/`
- Jede Aktion, die der Nutzer in der Oberfläche auslösen kann

Abgleich Katalog ↔ Code ↔ Regeltexte; jede Abweichung ist ein Befund.

## Phase 2 – SolidCraft-Abgleich

Jede Funktion, die SolidCraft selbst anbietet und die PartBuddy nutzt, durchreicht oder ersetzt
(Doku + tatsächliches Verhalten der eingesetzten Version). Je Funktion: Was macht SolidCraft? Was ist
daran für FDM falsch, unvollständig oder ungeprüft? Was fügt PartBuddy heute hinzu? Was fehlt, damit
PartBuddy klar besser ist? Ergebnis: Tabelle „SolidCraft roh / PartBuddy heute / PartBuddy soll“.
Jede Lücke in „soll“ ist ein Befund.

## Phase 3 – Maßstab

Online, je Soll-Wert mindestens zwei unabhängige Quellen mit URL und Datum; bei Widerspruch der
konservativere Wert, Widerspruch notiert. Themen: Wandstärken/Düsenvielfache, Überhang und Brücken,
Bohrungen (liegend/stehend, Tropfen-/Dachform, Aufmaß), Passungen und Spiel je Material × Düse ×
Schichthöhe, Gewinde, Heißeinschmelz-Einsätze, Mutterntaschen, Schraubenköpfe/Senkungen,
Schnapphaken (Dehnung je Material, Hinterschnitt, Fußradius), Rastnasen, Scharniere und
Print-in-place-Gelenke, Führungen, Zahnräder, Fasen statt Radien an der Bettseite, Elefantenfuß,
Schichtrichtung und Belastung, Schrumpf/Verzug, Kerbwirkung und Innenradien, Mindestdetail und
Schrift, Auflagefläche/Haftung, Stützfreiheit, Maßhaltigkeit gängiger Drucker. Quellen:
Hersteller-Leitfäden (Prusa, Bambu Lab, Ultimaker), Normen (ISO/DIN), anerkannte Design-Guides,
Einsatz-Hersteller.

## Phase 4 – Bauen und Messen

Für jede Zeile der Prüfliste, mit echtem SolidCraft:

1. Normalfall, kleinster und größter zulässiger Wert, jeder Grenzwert ±1 Schritt, Wert knapp
   außerhalb (muss mit zutreffender, verständlicher Meldung abgelehnt werden), unsinnige und
   widersprüchliche Eingaben.
2. Nachmessen (`meshMetrics`, `Overhang`, `FaceInfo`, Druckprüfung): jedes Maß gegen die Eingabe,
   Wandstärken, Spiel an jeder Fuge, Überhangwinkel, Brückenlängen, Auflagefläche,
   geschlossener/mannigfaltiger Körper, keine Selbstdurchdringung, keine Splitterflächen,
   Radien/Fasen, Lage im Koordinatensystem, Druckfläche.
3. Kombinationen: Baustein an jedem sinnvollen Trägerkörper, Baustein an Baustein, Mechanik +
   Passung, gedrehte Druckfläche, jedes Material × jede Düse, kleinster und größter Drucker,
   Baugruppen mit Bewegung (Kollision über den ganzen Weg).
4. Export (STL/3MF/STEP): wieder einlesen, Maße und Körperzahl gegen das Original.
5. Die Druckprüfung selbst: gezielt fehlerhafte Körper bauen – jeder muss gemeldet werden, kein
   guter fälschlich.

## Phase 5 – Regeln für die KI im Chat

Jeden Text, den der Assistent zu sehen bekommt, Satz für Satz: Systemprompt, Werkzeugbeschreibungen,
Parameter-Schemata, `toolNotes`, Standard-Themen, Recherche-Anleitung, Rückfrage-Regeln,
Fehlermeldungen und Rückgaben der Werkzeuge.

- Jede Aussage gegen Code und Maßstab; jede Zahl gegen die Tabelle, aus der sie stammt.
- Widersprüche, Doppelungen, Veraltetes, Mehrdeutiges, Regeln ohne Durchsetzung im Code.
- Für jeden Befund aus Phase 2 und 4: Welche Regel oder Werkzeugprüfung hätte ihn verhindert? Harte
  Prüfung im Werkzeug hat Vorrang vor einer Prompt-Zeile.
- Vollständigkeit: Druckorientierung, Stützfreiheit, Toleranzwahl, Schichtrichtung bei Belastung,
  Rückfrage bei fehlenden/unplausiblen Maßen, Nachmessen und Druckprüfung vor „fertig“, ehrliche
  Aussage über Grenzen, kein Ausweichen auf rohe SolidCraft-Funktionen, wenn es einen geprüften
  PartBuddy-Weg gibt.
- Kann der Assistent ein schlechtes Modell bauen, ohne dass ihn etwas aufhält? Jeden solchen Weg
  suchen und schließen.

## Phase 6 – Beheben und Ausbauen

Alles beheben, A → B → C, ohne Rückfrage: ein Thema je PR, Ursache einmal im gemeinsamen Code, je Fix
ein Test, der den gemessenen Fehler festhält. Lücken aus Phase 2 schließen – Erweiterungen, die
PartBuddy über SolidCraft heben, sind gewollt. Nach jedem Fix die betroffene Zeile neu bauen und
messen. Je Schritt eslint, Typen, Unit, betroffene E2E; SolidCraft-Vertragstests bei
SolidCraft-Bezug. Während CI läuft nichts Schweres lokal. PR bei Grün selbst mergen.

## Phase 7 – Abnahme im echten Chat

Feste Auftragsreihe mit dem echten Assistenten (streng nacheinander, eigenes Profil): je
Funktionsbereich ein typischer, ein schwieriger und ein bewusst unklarer Auftrag. Jedes Ergebnis
messen wie in Phase 4. Mangelhaftes Modell oder falsche Aussage → neuer Befund → Phase 6.

## Grenzen

- Keine Slicer-Aufgaben nachbauen, kein Umbau von UI/Design, keine selbst gezeichneten Grafiken.
- Kein Release, keine Homepage-/`site:shots`-Änderung, Release-PR nicht mergen.
- App nur über den Test-Starter mit eigenem Profil, Fenster im Hintergrund.

## Fertig, wenn

- jede Zeile der Prüfliste „geprüft – in Ordnung“ (mit Messbeleg) oder „Befund Nr. x – behoben in
  PR y, nachgemessen“ trägt,
- kein Befund offen ist; was nicht behebbar ist, steht mit Grund und Vorschlag im Bericht,
- jede von PartBuddy genutzte SolidCraft-Funktion FDM-geprüft abgesichert ist,
- kein Regeltext Code, Tabellen oder Maßstab widerspricht,
- der letzte Gegenprüfer-Durchgang und Phase 7 nichts Neues fanden,
- `main` grün ist.
