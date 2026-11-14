# Vollaudit 10 – Designqualität: Recherche und Regelvorschlag

Stand 14.11.2026. Nur gelesen und recherchiert, kein Code geändert. Ziel: Regeln, mit denen der Assistent ungefragt
Teile baut, die (in dieser Reihenfolge) **funktionieren, halten, gut aussehen und schnell/sparsam drucken**.

Gelesen auf `origin/main` (ffc860ed, 14.11.2026): `apps/desktop/src/main/print/printProfiles.ts` (`withoutSupportLines`,
`designLines`, `printNote`), `apps/desktop/src/shared/standards.ts`, `apps/desktop/src/main/agents/questions.ts`
(`questionGuidance`), `toolNotes.ts`, `designTool.ts`, dazu `shared/blocks.ts` (Konstanten `ENTRY_CHAMFER`, `STURDY`,
`textDepth`), `shared/contract.ts` (`PRINT_HINTS`), `packages/geometry/src/printCheck.ts` (Befundarten) und
`loop.ts` (`FLEX_GUIDANCE`). Maßstab Geometrie: `03-massstab-geometrie.md` (Zweig `docs/vollaudit-2026-11`); dessen
Kennungen S1–S35 und MG-xx werden hier nur zitiert, nicht wiederholt.

## Quellen

Alle abgerufen am 14.11.2026, Volltext gelesen, wo nicht anders vermerkt.

| Nr | Herausgeber, Titel | URL |
|---|---|---|
| D1 | Prusa Research, Seam position | https://help.prusa3d.com/article/seam-position_151069 |
| D2 | Prusa Research, Ironing | https://help.prusa3d.com/article/ironing_177488 |
| D3 | Prusa Research, Infill | https://help.prusa3d.com/article/infill_42 |
| D4 | Prusa Research, Layers and perimeters | https://help.prusa3d.com/article/layers-and-perimeters_1748 |
| D5 | Prusa Research, Variable layer height function | https://help.prusa3d.com/article/variable-layer-height-function_1750 |
| D6 | Prusa Research, Modeling with 3D printing in mind | https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135 |
| D7 | Protolabs Network (Hubs), How to design parts for FDM 3D printing | https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/ |
| D8 | Protolabs Network (Hubs), How does part orientation affect a 3D print? | https://www.hubs.com/knowledge-base/how-does-part-orientation-affect-3d-print/ |
| D9 | Protolabs Network (Hubs), How to design snap-fit joints for 3D printing | https://www.hubs.com/knowledge-base/how-design-snap-fit-joints-3d-printing/ |
| D10 | Xometry Pro (N. Mroncz), FDM 3D Printing Design Tips | https://xometry.pro/en/articles/fdm-design-tips/ |
| D11 | UltiMaker, Design for FDM 3D printing: Maximize your success | https://ultimaker.com/learn/design-for-fff-3d-printing-maximize-your-success/ |
| D12 | Stratasys Direct, FDM Design Guide (dg_sdm_fdm_0725a), Abschnitte 3.7–3.9, 4 „Mating assemblies“ | https://www.stratasys.com/siteassets/sdm/content---website-storage/design-guides/dg_sdm_fdm_0725a.pdf |
| D13 | Stratasys Direct, Strategies to reduce 3D printing costs | https://www.stratasys.com/en/stratasysdirect/resources/articles/strategies-to-reduce-3d-printing-costs/ |
| D14 | CNC Kitchen (S. Hermann), The effect of Extrusion Width on Strength and Quality | https://cnckitchen.com/blog/the-effect-of-extrusion-width-on-strength-and-quality-of-3d-prints |
| D15 | CNC Kitchen, The influence of layer height on the strength of FDM 3D prints | https://www.cnckitchen.com/blog/the-influence-of-layer-height-on-the-strength-of-fdm-3d-prints |
| D16 | Fictiv bei Core77, Best Practices for Adding Ribs and Gussets to 3D Printed Parts (FEA in ABS) | https://www.core77.com/posts/66446/Best-Practices-for-Adding-Ribs-and-Gussets-to-3D-Printed-Parts-for-Structural-Integrity |
| D17 | Fictiv, How to Design Snap-Fit Components | https://www.fictiv.com/articles/how-to-design-snap-fit-components |
| D18 | Protolabs, How to Design Corners on Injection-Molded Parts (Spritzguss) | https://www.protolabs.com/resources/design-tips/cutting-corners-on-injection-molded-parts/ |
| D19 | Envalior (vormals DSM), Radii and chamfers (Kunststoff-Konstruktion) | https://prd.envalior.com/en-us/radii-and-chamfers |
| D20 | HLH Rapid, How to 3D Print Text, Lettering and Symbols | https://hlhrapid.com/knowledge/3d-printing-design-guide-adding-text-lettering-and-symbols/ |
| D21 | 3DPrinting.com, How to get stronger FDM prints (Sekundärquelle zu CNC Kitchens Wand-gegen-Füllung-Haken) | https://3dprinting.com/how-to/how-to-get-stronger-fdm-3d-prints/ |

Nicht lesbar: Bambu-Lab-Wiki „Seam“ und „Ironing“ (Seite wird per JavaScript gefüllt, Abruf leer). Das Original von
CNC Kitchens Versuch „Wände gegen Füllung“ wurde nicht gefunden, nur D21 und die eigenen Zahlen in D14. Für
Proportion, Ausrichtung und Symmetrie gibt es **keine** Quelle mit Zahl; die Zeilen dazu sind als eigene Festlegung
gekennzeichnet. D16, D18, D19 stammen aus dem Spritzguss bzw. der allgemeinen Kunststoffkonstruktion; ihre Werte für
Rippen und Kerben sind übertragbar, die für Einfallstellen nicht.

## 1. Optik

| Nr | Regel (kurz, mit Zahl) | Quelle | Heute in PartBuddy? | Vorschlag (an den Assistenten) |
|---|---|---|---|---|
| O1 | Eine Radienfamilie; an Schalen sind Außen- und Innenradius konzentrisch: außen = innen + Wand, innen 25–60 % der Wand, sonst wird die Wand in der Ecke dicker oder dünner. | D19 („outside radius … equal to the inner radius plus the wall thickness“), D18 (innen ≥ 0,5 t, außen 1,5 t) | **teilweise**: `designLines` rounding (Größenstaffel 1/2/3 mm, „two or three radii“); kein Innenradius an Schalen, und „never more than the wall they cut into“ verbietet bei 0,9–1,8-mm-Schalen genau die 2-mm-Außenradien der Staffel (siehe W1) | `On a shell, round each rounded outer edge on the inside too, to the outer radius minus the wall (at least half the wall where it carries load), so the wall stays even round the corner. The wall limit applies only to edges of a plate or rib, where both sides are rounded: there each radius is at most half its thickness.` |
| O2 | Nach unten weisende Kanten fasen (45°), nach oben/seitlich runden; eine Rundung zum Bett hin hängt steil über. | D6, D7 | **ja, doppelt**: `withoutSupportLines` erste Zeile und `designLines` rounding | Einmal sagen (W2). |
| O3 | Senkrechte Kanten (parallel zu Z) werden als glatter Bogen gedruckt; waagrechte Rundungen oben werden in Schichtstufen zerlegt, flache Bereiche einer Rundung zeigen die Stufen am stärksten. | D5 (Stufen an flachen Schrägen), D6 (variable Schichthöhe verbessert Rundungen); Ableitung: Stufenbreite = Schicht / tan(Neigung) | **nein** | `Edges that stand upright as printed take any fillet cleanly. On top edges use a fillet of at least 5 layers or a 45° chamfer; a smaller fillet there prints as a few visible steps.` (5 Schichten = eigene Festlegung) |
| O4 | Sichtbare, nach oben weisende Flächen nicht flach geneigt: unter etwa 15° gegen die Waagrechte werden die Stufen bei 0,2 mm Schicht über 0,75 mm breit. | D5, D10 („visible layer lines are more pronounced on curved and angled surfaces“); Zahl abgeleitet | **nein** | `A seen face that faces up is either flat or leans at least 15° from flat; between, the layers show as wide steps.` |
| O5 | Schauseite festlegen: oben (Düse glättet, Bügeln möglich) oder auf dem Bett (glatteste Fläche, nimmt die Textur der Platte); Flächen über Stützen sind rau. | D8 („upward-facing surface is smoothed by the nozzle, the bed-contact surface is typically glossy“), D2 („bottom layer … even smoother than an ironed top layer“), D6 | **nein** (Ausrichtung nur nach Last und Stützen) | `Decide which face is seen most and design for it: on top as one flat level, or on the bed. Never let a seen face rest on support.` |
| O6 | Bügeln wirkt nur auf ebene, bettparallele Oberseiten; „nur oberste Fläche“ bügelt bei erhabener Schrift nur die Buchstabenköpfe. Kostet Zeit. | D2 | **nein** | In O5 enthalten; eine Zeile: `Raised text breaks a top face into islands that cannot be ironed: engrave it on a show face instead.` |
| O7 | Naht: bei FDM nie ganz weg; der Slicer versteckt sie in konkaven bzw. scharfen Ecken; runde Körper ohne Ecke zeigen sie deutlich. | D1 („obvious if the object's shape is cylindrical, without any sharp corners“; „Nearest … concave non-overhang vertex“) | **nein** | `A part round in plan shows a vertical seam. If it is seen from all sides, give it one sharp vertical edge or a small groove at the back for the seam, or tell the user the seam will show.` (Rille = eigene Festlegung) |
| O8 | Schrift: fette, serifenlose Schrift (Stratasys: fett, Monospace, ≥ 24 pt), mindestens 14 pt (HLH); erhaben Strich 0,8 / Höhe 0,5 mm, vertieft Strich 1,0 / Tiefe 0,5 mm; bevorzugt auf Oberseiten. | D10, D12, D20; S29/S30 | **teilweise**: `designLines` details (Tiefe `textDepth`, Strich `textStroke` = 1 mm); Schriftart, Größe und Ort fehlen | `Text and logos: a bold sans-serif font, letters at least 5 mm high (14 pt), strokes and depth as above; engraved on top or bed faces, raised or engraved on upright faces, never on a face that needs support.` |
| O9 | Gleichmäßige Wandstärke; Dickensprünge mit Radius oder Schräge auslaufen lassen; dicke Rippenkreuzungen aushöhlen. | D16, D19; S25 | **ja**: details („one wall parameter“, „blend changes in thickness“) | behalten |
| O10 | Bettkante 45°-Fase gegen Elefantenfuß. | S14/S15 | **ja**: rounding, Standard `feet` | behalten |
| O11 | Kanten in XY haben ohnehin den Düsenradius; kleinere senkrechte Radien sind wirkungslos. | D7 („corners and edges have a radius equal to the nozzle size“) | **ja**: snap („radii at least … nozzle“) | behalten |
| O12 | Formschrägen sind im FDM unnötig; Schräge nur aus Funktion (Einführung, Überhang). | D12 („Draft is unnecessary in FDM parts“) | **nein** (nicht nötig, nur Klarstellung) | weglassen; kein Regelbedarf |
| O13 | Ausrichtung, Symmetrie, Proportion: Bohrungen, Ausschnitte, Schrift auf Achsen oder gemeinsamen Linien; gleiche Abstände wiederholen; Rand um Merkmale gleich. | **keine Quelle mit Zahl** (eigene Festlegung) | **nein**; nur `questionGuidance` Schritt 1 („how proven products … solve this task“) | `Line features up: centre holes, cut-outs and text on the part's axes or on one line, repeat equal spacing, and keep the margin round a feature at least two walls and equal on all sides.` |
| O14 | „Klotz-Look“ vermeiden: Grundkörper nicht als Quader stehen lassen, wenn Rundung, Fase oder eine Teilung der Fläche das Teil lesbar machen. | keine Quelle (eigene Festlegung) | **teilweise** über rounding | In O1/O3 enthalten; keine eigene Zeile. |

## 2. Stabilität

| Nr | Regel (kurz, mit Zahl) | Quelle | Heute in PartBuddy? | Vorschlag (an den Assistenten) |
|---|---|---|---|---|
| F1 | Last längs der Schichten: Zug in XY typisch 4–5 × Z; stehende Haken hielten mindestens 50 % weniger als liegende; ein Kragarm in Z verliert 50 % Bruchdehnung und 20–30 % Festigkeit. | D8, D15, D17; S16 | **ja**: `designLines` („stand the part so loads and snap arms run along the layers“), Standards `hook`, `clamp` | In den Funktionscheck: `Name the main load and its direction in the plan; the layers must not be pulled apart by it.` |
| F2 | Innenecken unter Last runden: r = 0,5 t gibt Kerbfaktor etwa 1,5, r = 0,1 t etwa 3; empfohlen 25–60 % der Wand, obere Grenze bei Last. | D19; D18 (≥ 0,5 t); D10 (r = t); S26 | **ja**: rounding (≥ halbe Wand, ≥ max(1 mm, 2 × Düse)) | behalten; ergänzen: `Inner corners that carry nothing get at least one nozzle, so they print as drawn.` |
| F3 | Festigkeit kommt aus den Wänden, nicht aus der Füllung: Haken mit 2 Wänden 20 kg, 4 Wänden 33 kg, 2 Wänden à 200 % Breite 39 kg. | D3, D4 („mostly defined by the number of perimeters“), D14, D21 | **teilweise**: Standard `hook` (≥ 4 Wandlinien), economy (Rippen statt dicker Wand) | `Where a region carries load, make its walls four lines thick and tell the user to print the part with at least four perimeters; more infill adds little.` |
| F4 | Rippen: so dick wie die Wand (im FDM nicht dünner nötig), höchstens 3 × Wand hoch, lieber mehr niedrige Rippen; in der Biegeebene und an beiden Enden an Wand oder Dom angebunden, sonst ohne Wirkung. | D12 („not necessary to reduce wall thickness of a boss, rib or gusset“), D16 (FEA: 3 Rippen senken die Durchbiegung um fast eine Größenordnung, um 90° gedrehte fast nichts); die 60–80 % aus D16 sind Spritzguss | **teilweise**: economy (Rippen so dick wie die Wand) | `Ribs: as thick as the wall, at most three walls high, in the plane the part bends in, each end tied to a wall or a boss; several low ribs beat one tall one.` |
| F5 | Dome: so dick wie das Teil oder 0,5 mm dünner, immer mit Rippen oder Knotenblechen; ohne Knotenbleche doppelte Spannung, vierfache Durchbiegung. | D10, D12, D16 | **teilweise**: Standard `boardMount` (1-mm-Rundung am Fuß); `partbuddy_block boss` | `A boss taller than twice its diameter is tied to a wall or gets three or four gussets.` (Faktor 2 = eigene Festlegung) |
| F6 | Zapfen und Säulen unter 5 mm sind reine Wandlinien und schwach; Fuß runden, kritische Zapfen als Normstift. Säulen ≥ 2–3 mm, Stifte ≥ 1 mm. | D7, D10; S28 | **teilweise**: Standard `boardMount` | `Pins and posts under 5 mm get a fillet at the foot; where they must hold, use a bought pin in a printed hole.` |
| F7 | Schnapparm: verjüngen, Fußradius ≥ 0,5 × Fußdicke, Breite ≥ 5 mm, nicht in Z bauen; PLA 4–8 % zulässige Dehnung, in Z halbieren. | D9, D17 | **teilweise**: `snapFit` prüft die Dehnung, printInPlace (Armlänge, Einführschräge 30–45°), `FLEX_GUIDANCE`; Verjüngung und Breite fehlen bei selbst modellierten Federn | `A spring or arm you model yourself tapers to half its root thickness at the tip, is at least 5 mm wide, has a root fillet of half its thickness and lies in the layers.` |
| F8 | Schichthöhe über halber Düse kostet Festigkeit (0,3 mm hielt stehend die Hälfte). | D15 | **teilweise**: Standard `hook` (≤ 0,2 mm) | `If the profile's layer is more than half the nozzle and the part carries load, say that thinner layers hold better.` |
| F9 | Kriechen: Dauerlast bei Kunststoff nur ein Bruchteil der Bruchlast (PartBuddy: ein Zehntel). | Standard `hook` (CNC Kitchen zitiert; hier nicht neu gelesen), D17 („susceptible to creep“) | **teilweise**: nur `hook` | `Under a lasting load allow a tenth of a breaking load; say so when the user names a weight.` |
| F10 | Kurze Hebel, keine dünnen freien Kragarme. | – | **ja**: `questionGuidance` Schritt 3 („are levers short“) | behalten |

## 3. Druckzeit und Material

| Nr | Regel (kurz, mit Zahl) | Quelle | Heute in PartBuddy? | Vorschlag (an den Assistenten) |
|---|---|---|---|---|
| Z1 | Zeit wächst mit der Schichtzahl: liegender statt stehender Zylinder 100 statt 300 Schichten; halbe Schicht ≈ doppelte Zeit. | D8, D15, D13 | **ja**: economy („Keep the part low“) | behalten, aber nachrangig zu F1 (W5) |
| Z2 | Füllung 10–15 % reicht meist, über 30 % selten nötig; der Slicer füllt alles dicker als die Wandlinien dünn. | D3 | **ja**: economy (Füllung ist Sache des Slicers) | behalten |
| Z3 | Massiv kann billiger sein als hohl mit Rippen: der Slicer füllt einen Vollkörper ohnehin dünn, eine CAD-Schale druckt innen und außen Wandlinien und eine überbrückte Decke. | D12 („FDM parts can be designed solid rather than … hollowed-out … this can reduce build time“) | **widersprüchlich**: economy „build a shell, not a block“ neben „fill anything thicker with sparse infill“ (W4) | `Leave out volume that does nothing (open the bottom, a frame instead of a plate, a shorter body); do not hollow a closed body: the slicer fills it lightly already, and a cavity adds walls and a bridged ceiling.` |
| Z4 | Stützen kosten zweimal (Druck und Nacharbeit) und hinterlassen Spuren. | D8, D13 | **ja**: `withoutSupportLines`, economy | behalten |
| Z5 | Bügeln kostet viel Zeit und hilft nur auf ebenen Oberseiten. | D2 | **nein** | Nur bei Schauseiten vorschlagen (O5). |
| Z6 | Kleine Taschen in gefüllten Bereichen sparen nichts. | eigene Festlegung (economy) | **ja** | behalten |
| Z7 | Teilen nur, wenn es Stützen oder viel Höhe spart; Teilen verbessert Ausrichtung und Optik. | D6, D7 | **ja**: economy | behalten |
| Z8 | Breitere Linien, kombinierte Füllung, variable Schichthöhe sparen Zeit – Slicer-Einstellungen. | D3, D5, D14 | **ja** (economy: „Infill, speed and layer height are set in the slicer“) | nicht Sache des Assistenten; höchstens als Tipp |

## Widersprüche und Doppelungen heute

- **W1 Radienstaffel gegen Wandgrenze** (`designLines` rounding): Außenradius 2 mm für Teile von 30–100 mm, aber
  „never more than the wall they cut into“; economy und snap schreiben Schalen von 0,9–1,8 mm vor. Bei jeder Schale
  über 30 mm schließen sich die beiden Regeln aus. Auflösung: O1 (Innenradius = Außenradius − Wand).
- **W2 Bettkante zweimal**: `withoutSupportLines` („Edges that face down … chamfer them instead“) und rounding („Edges on
  the bed get a 45° chamfer, not a fillet“), zusätzlich Standard `feet`. Inhalt gleich, Wortlaut verschieden.
- **W3 Fasenhöhen nicht in Schichten**: snap verlangt „steps and chamfer heights to whole layers“, details aber
  „chamfer hole and screw entries 0.5 mm“ (`ENTRY_CHAMFER`) und „0.5 mm lead-in chamfer“ – 2,5 Schichten bei 0,2 mm.
- **W4 Schale gegen Slicer-Füllung** (economy, ein Absatz): „build a shell, not a block“ und „fill anything thicker
  with sparse infill“. Der zweite Satz entkräftet den ersten; D12 sagt, massiv sei oft schneller. Auflösung: Z3.
- **W5 Keine Rangfolge der Ziele**: „stand the part so loads … run along the layers“ (Druck zuerst) und „Keep the part
  low“ (economy) stehen ohne Vorrang nebeneinander; für Optik gibt es keine Regel, also auch keinen Platz in der
  Reihenfolge. „A refinement never makes function or printing worse“ ordnet nur Verfeinerung unter Druckbarkeit ein.
- **W6 Überhang dreimal**: `printNote` (Materialzeile), `withoutSupportLines`, `designLines` („nothing leans more
  than …“). Gleiche Zahl, drei Stellen.
- **W7 Dünne Wände zweimal**: `printNote` Zeile 2 und `designLines` „Sizes the user names“ nennen beide die zwei
  Linien und die dünnste Linie, mit leicht anderem Zweck (Warnen gegen Fragen).
- **W8 Radienuntergrenzen an drei Stellen**: snap „radii at least {nozzle}“, rounding „at least max(1 mm, 2 × nozzle)“
  für Innenecken unter Last, Standard `hook` „at least the hook's thickness“. Kein Widerspruch, aber drei Untergrenzen
  ohne gemeinsamen Satz; dazu Bettfase, Eingangsfase, Einführfase – mit „two or three radii per part“ kaum einzuhalten.
- **W9 Rippen gegen Quellen**: economy „ribs as thick as the wall“ deckt sich mit D12, widerspricht aber den
  60–80 % (D16) bzw. 40–60 % (Protolabs Spritzguss). Kein interner Widerspruch; die Quelle in der Regel nennen (D12),
  damit niemand später nach Spritzgusswerten „korrigiert“.

## Automatisch messbare Prüfungen (für die Design-Hinweise)

Heute misst die Druckprüfung (`printCheck.ts`): `thinWall`, `overhang`, `roundBedEdge`, `smallHole`, `narrowGap`,
`contact`, `tight`, `overlap` u. a.; Schrift und feine Details prüft sie ausdrücklich nicht (`printNote`). Vorschläge,
nach Nutzen geordnet; alle nur gelb, je einzeln abschaltbar wie `PRINT_HINTS`.

| Nr | Hinweis | Messung | Fehlalarm-Risiko | Bezug |
|---|---|---|---|---|
| H1 | Scharfe Innenecke am Fuß einer dünnen Wand, Rippe oder eines Zapfens | Konkave Kanten (Flächenwinkel innen 60–120°) ohne Rundungsfläche, an denen eine Wand ≤ 4 Linien auf eine Fläche trifft; Länge > 3 mm | mittel: Nuten, Taschen, Anschläge sind gewollt scharf; nur am Fuß dünner Körper melden senkt es deutlich | F2, F6 |
| H2 | Kragarm oder Lamelle quer zu den Schichten | Platte ≤ 4 Linien dick, nur unten angebunden (freie Ober- und Seitenkanten), Höhe in Z > 5 × Dicke | mittel: Trennstege und Kastenwände stehen auch so; „nur unten angebunden“ filtert die meisten | F1, F7 |
| H3 | Dünner hoher Zapfen | Querschnitt < 5 mm (größter Inkreis), Höhe > 3 × Durchmesser, stehend | niedrig–mittel: Führungsstifte sind oft gewollt; Text sagt „hält wenig quer“ | F6 |
| H4 | Flache sichtbare Schräge | Nach oben weisende Flächen mit 0° < Neigung < 15° gegen die Waagrechte, Fläche > 50 mm² | niedrig: echte flache Dächer sind selten gewollt; flache Teile der Rundungen ausnehmen (nur ebene Flächen) | O4 |
| H5 | Bessere Lage spart Schichten | Für jede ebene Fläche ≥ 10 % der Hüllfläche als Auflage: Höhe/Schichtzahl und Überhangfläche mit der vorhandenen Überhangrechnung; Hinweis, wenn eine Lage ≥ 30 % weniger Schichten bei nicht mehr Stützfläche hat | mittel: Lastrichtung und Schauseite kennt die Messung nicht; Hinweis muss F1 nennen | Z1, F1 |
| H6 | Radien uneinheitlich | Rundungsflächen (Zylinder/Torus aus den B-rep-Flächen, sonst Krümmung) nach Radius bündeln; > 3 verschiedene Außenradien | niedrig mit Flächentypen, hoch auf reinem Netz; Gewinde und Bohrungen ausnehmen | O1 |
| H7 | Schalenecke ungleich dick | An gerundeten Außenkanten die Wandstärke in der Ecke (Strahl von der Rundung nach innen) gegen die Nennwand; Abweichung > 50 % | niedrig: misst direkt das Ziel von O1 | O1, O9 |
| H8 | Schrift zu fein | Kleine, getrennte Inseln oder Vertiefungen auf einer Fläche (Fläche je Insel < 20 mm², viele davon), Strich < `textStroke` oder Tiefe < `textDepth` | mittel: Lüftungsraster und Rändel sehen gleich aus; Strichbreite trennt Schrift von Raster | O8 |
| H9 | Ungebrochene sichtbare Außenkante | Konvexe Kanten ≤ 100° ohne Fase/Rundung, Länge > 10 mm, nicht auf dem Bett und nicht an einer Passfläche | mittel–hoch: Fügeflächen und bewusst kantige Teile; nur als Sammelhinweis | O1, O14 |
| H10 | Hohe Rippe | Platte ≤ 2 × Wand dick mit freier Kante, Höhe über der Grundfläche > 3 × Dicke | mittel: Wände eines Gehäuses sind keine Rippen; nur Platten, die auf einer Fläche stehen und keine Außenhaut bilden | F4 |
| H11 | Runder Körper ohne Nahtkante | Alle senkrechten Außenflächen gekrümmt, keine senkrechte scharfe Kante, Höhe > 10 mm | niedrig, Nutzen gering: nur Info, abgeschaltet als Standard | O7 |
| H12 | Fast symmetrisch | Bohrungs- und Ausschnittmitten 0,05–1 mm neben der Mittelebene des Körpers oder neben dem Raster der übrigen | mittel: bewusste Versätze (Stecker) gibt es; Text „liegt 0,3 mm neben der Mitte – Absicht?“ | O13 |

Nicht empfohlen: „massiver Bereich“ (Vollkörper dicker X) – der Slicer füllt ihn dünn (D3, D12), der Hinweis würde
zur falschen Schale verleiten (W4). „Ungleiche Wandstärke“ als Histogramm – Böden, Dome und Wände sind zu Recht
verschieden dick; H7 misst die Stelle, auf die es ankommt.

## Vorgeschlagene Regelreihenfolge

Ersatz für `withoutSupportLines` und die Gruppenzeilen von `designLines`, nach Rang. `{…}` sind die Werte, die
`designLines` heute schon einsetzt; die Gruppen (`rounding`, `details`, `economy` …) bleiben abschaltbar und
schalten ihre Zeilen weg. Sizes the user names, Passungen und die Mechanismen-Zeile bleiben wie heute davor bzw. danach.

```text
Design it well without being asked, in this order; a later goal never makes an earlier one worse:
1 FUNCTION
- It does its job in use: held under its loads, fits what it holds (the fits below), goes on and off as often as it must.
- Name the main load and its direction in the plan; stand the part so that load runs along the layers, never pulls them apart.
2 PRINTS WITHOUT SUPPORT
- Nothing leans more than {overhang}° from the vertical. Edges facing the bed: chamfer {lean}, never a fillet.
- Lying holes up to {LYING_HOLE} mm stay round; wider ones get a teardrop or flat roof. Bridges up to {BRIDGE_SPAN} mm, ledges up to {smallLedge}.
- Where support cannot be avoided, say which faces need it and why.
3 STRENGTH
- Loaded walls four lines ({4×line}); tell the user to print at least four perimeters there; infill adds little.
- Inner corners under load: radius at least half the wall and {innerMin}; other inner corners at least one nozzle.
- Ribs as thick as the wall (no thinner, Stratasys), at most three walls high, in the bending plane, both ends tied to a wall or boss.
- Bosses taller than twice their diameter: tied to a wall or three or four gussets. Pins under 5 mm: fillet at the foot.
- Springs and arms you model: taper to half at the tip, at least 5 mm wide, root fillet half the thickness, in the layers.
- Lasting loads: allow a tenth of a breaking load.
4 LOOKS
- One family of radii: outer edges {1/2/3 mm by size}, at most three values in a part; on a shell the inside of a rounded
  corner is the outer radius minus the wall, so the wall stays even. Plate and rib edges: at most half their thickness.
- Edges upright as printed take any fillet; top edges a fillet of at least five layers or a 45° chamfer.
- Seen faces facing up are flat or lean at least 15°; decide the show face and put it on top or on the bed, never on support.
- Line features up: on the part's axes or one line, equal spacing, margins of at least two walls, equal on all sides.
- Even walls; blend changes in thickness with a radius or a 45° slope. Hole entries and lead-ins chamfered {2 layers}.
- Text: bold sans-serif, letters at least 5 mm high, strokes {textStroke}, depth {textDepth}; engraved on top or bed faces.
- A part round in plan shows a vertical seam: if it is seen from all sides, give it one vertical edge at the back for it.
5 PRINT TIME AND MATERIAL
- Low as it prints: every {layer} is one more layer. Never at the cost of 1 to 3.
- Leave out volume that does nothing (open bottom, a frame instead of a plate); never hollow a closed body.
- Infill, speed and layer height are the slicer's: never promise grams or minutes; compare the print check's figures.
- Split a part only when that saves support or much height and a joint is acceptable.
After each step name, in one line, what you added on your own and which goal it serves.
```

30 Zeilen Regeltext. Gegenüber heute fallen weg: die doppelte Bettkante (W2), der dreifache Überhang (W6), „build a
shell“ (W4); neu sind Lastrichtung im Plan, Rippen/Dome/Federn, Schauseite, flache Schrägen, Ausrichtung, Schrift,
Naht. Die Rangfolge löst W5. W3 löst „{2 layers}“ für Eingangs- und Einführfasen (bei 0,2 mm 0,4 mm statt 0,5 mm);
`ENTRY_CHAMFER` in `blocks.ts` müsste dann ebenfalls in Schichten gerechnet werden.
