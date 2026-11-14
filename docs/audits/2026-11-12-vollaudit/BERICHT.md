# Vollaudit November 2026 – Bericht

Zeitraum 12.–14.11.2026, Stand `main` bis #415. Auftrag in [AUFTRAG.md](AUFTRAG.md), Verlauf in [PLAN.md](PLAN.md),
jeder Befund mit Status in [BEFUNDE.md](BEFUNDE.md).

## Ergebnis

| Schwere | fertig | teilweise | offen | entfallen |
|---|---|---|---|---|
| A (30) | 30 | – | – | – |
| B (195) | 134 | 30 | 31 | – |
| C (124) | 94 | 19 | 10 | 1 |
| neu aus Messung, Reviews, Nutzer (69) | 55 | 3 | 9 | 2 |

„Fertig“ heißt behoben und – wo die Harness es kann – auf SolidCraft 0.40.1/0.41.0 nachgemessen. Alle A-Befunde sind
behoben, darunter der Wettlauf V-1 (Ansicht blieb nach einer Änderung auf altem Stand, #359).

Rund 57 PRs auf `main`, in Paketen BC-01 … BC-28 ([BC-PAKETE.md](BC-PAKETE.md)), jedes mit unabhängigem Review und
Vertragstests gegen echtes SolidCraft. Die wichtigsten Wirkungen:

- **Druckprüfung** je Körper statt über alle, diagonale Lage, Schichthöhe und Richtung bei Wänden, Brücken und Anker,
  Design-Hinweise nach jedem Bau (#353, #413, BC-24 #405).
- **Maße** als Maß nach dem Druck mit Lochaufmaß je Material (BC-16), Einsätze nach Herstellerangabe (#347).
- **Mechanik und Bausteine** mit Rücknahme bei Fehlern, Drucklage gesetzt, Grenzen geprüft (#348, #358, BC-11, BC-15, BC-28).
- **Rohbefehle** über eine Erlaubnisliste je Befehl; ungeprüftes Durchreichen ist zu (BC-13, BC-26).
- **Assistent:** Regeln gekürzt und nach Vorrang geordnet, Abschlussprüfung mit drei Ansichten im Chat, Parameter
  gruppiert und hart geprüft (#410, #412, #414, #415). Vorher/Nachher an sechs echten Läufen: [10-vorher-nachher.png](10-vorher-nachher.png).
- **CI:** PR-CI ~5 statt ~15 min, Vertragstests stabil (#376, #384, #393).

## Offen

- **MV-10** Fußrundung am Schnapphaken – braucht Anschläge und einen Testdruck.
- **Synonym-Lücke** bei der Parameterprüfung (`spalt`, `offset`, `lidgap` werden nicht als Spiel erkannt).
- **Phase 7** (Abnahme im echten Chat, Modellvergleich) ausgesetzt; Standard bleibt vorläufig Opus 5.5 · Mittel (#354).
- **Phase 4 Rest:** Harness kann STL/STEP nicht wieder einlesen und Gelenke nicht über den Weg fahren.
- Die 61 offenen bzw. teilweisen B- und 29 C-Befunde stehen in `BEFUNDE.md` (Spalte Status).
- Ungeprüft im Druck: das neue Lochaufmaß; Manuel entschied 14.11., vor 0.3.1 keinen Testdruck zu machen.
