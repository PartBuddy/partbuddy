# Vollaudit Phase 3 – Maßstab Geometrie (MG)

Stand 12.11.2026. Nur gelesen und recherchiert; kein Code geändert, nichts gebaut, kein Test gelaufen.
Alle Aussagen über das Verhalten des Codes sind **aus dem Quelltext hergeleitet**, nicht gemessen –
die Nachstellschritte gehören in Phase 4.

Gelesen (vollständig): `apps/desktop/src/shared/tolerances.ts` (61 Z.), `designFit.ts` (116 Z.),
`materialCatalog.ts` (44 Z.), `printerCatalog.ts` (96 Z.), `packages/geometry/src/printCheck.ts`
(479 Z.), `overhang.ts` (218 Z.). Zusätzlich in Ausschnitten: `printCheck.test.ts` Z. 1–135,
`usePrintCheck.ts` Z. 54–62, Aufrufstellen per Suche.

## Quellen

Abruf aller Seiten: 12.11.2026. „Volltext“ = Artikeltext vollständig gelesen.

| Nr | Herausgeber, Titel, Datum | URL | Gelesen |
|---|---|---|---|
| Q1 | Protolabs Network (Hubs), How to design parts for FDM 3D printing, © 2026 | https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/ | Volltext |
| Q2 | Prusa Research, Modeling with 3D printing in mind | https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135 | Volltext |
| Q3 | Protolabs Network (Hubs), What are the key design elements for 3D printing? | https://www.hubs.com/knowledge-base/key-design-considerations-3d-printing/ | Volltext |
| Q4 | UltiMaker, Design for FDM 3D printing: Maximize your success, 30.07.2020 | https://ultimaker.com/learn/design-for-fff-3d-printing-maximize-your-success/ | Volltext |
| Q5 | Xometry Pro, FDM 3D Printing Design Tips (N. Mroncz) | https://xometry.pro/en/articles/fdm-design-tips/ | Volltext |
| Q6 | MakerVerse, FDM Design Guide, 03.04.2024 | https://www.makerverse.com/resources/the-fused-deposition-modeling-fdm-design-guide/ | Volltext |
| Q7 | Prusa Research, Elephant foot compensation | https://help.prusa3d.com/article/elephant-foot-compensation_114487 | Volltext |
| Q8 | Bambu Lab Wiki, Elephant foot compensation, 14.08.2026 | https://wiki.bambulab.com/en/software/bambu-studio/parameter/elephant-foot | Volltext |
| Q9 | OrcaSlicer Wiki, Precision (X-Y compensation, Elephant foot, Polyholes, Flow) | https://www.orcaslicer.com/wiki/print_settings/quality/quality_settings_precision | Abschnitte X-Y, EFC, Polyholes, Wandüberlappung |
| Q10 | Bambu Lab Wiki, 3D Prints Shrinkage, 22.06.2026 | https://wiki.bambulab.com/en/knowledge-sharing/3d-prints-shrinkage | Volltext |
| Q11 | Bambu Lab Wiki, XY Hole and Contour Compensation | https://wiki.bambulab.com/en/software/bambu-studio/xy-hole-contour-compensation | Volltext |
| Q12 | Bambu Lab Wiki, Auto Circle Contour-Hole Compensation | https://wiki.bambulab.com/en/software/bambu-studio/manual/auto-circle-contour-compensation | Volltext |
| Q13 | Protolabs Network (Hubs), Dimensional accuracy of 3D printed parts | https://www.hubs.com/knowledge-base/dimensional-accuracy-3d-printed-parts/ | FDM-Abschnitt und Tabelle |
| Q14 | Protolabs Network (Hubs), How does part orientation affect a 3D print? | https://www.hubs.com/knowledge-base/how-does-part-orientation-affect-3d-print/ | Abschnitte Festigkeit/Anisotropie |
| Q15 | Stratasys Direct, FDM Design Guide (dg_sdm_fdm_0725a) | https://www.stratasys.com/siteassets/sdm/content---website-storage/design-guides/dg_sdm_fdm_0725a.pdf | bis Abschnitt 4.1; 4.2–4.5 nicht gelesen |
| Q16 | Universität Zürich, AMF, Design Guideline FDM (L. Lüchinger) | https://www.amf.uzh.ch/dam/jcr:fd1ee024-1a98-488b-89ec-ffd85befa786/Design-Guideline-FDM.pdf | Volltext (Textauszug) |
| Q17 | HLH Rapid, Design Guide: FDM 3D Printing, 26.10.2022 | https://hlhrapid.com/knowledge/design-guide-fdm-3d-printing/ | Volltext |
| Q18 | Materialise, Design Guidelines PC-ISO (FDM, industriell) | https://www.materialise.com/en/academy/industrial/design-am/pc-iso | Volltext |
| Q19 | Filament2Print, Schrumpf und Warping im 3D-Druck, 26.04.2023 (Tabelle nach SpecialChem) | https://filament2print.com/en/blog/contrazioni-warping-stampa-3d | Tabelle und Abschnitt Schrumpf |
| Q20 | Prusa Research, Materialartikel PLA, PETG, ABS, ASA, PC, PA, Flexible | https://help.prusa3d.com/article/abs_2058 (analog `petg_2059`, `pla_2062`, `asa_1809`, `polycarbonate-pc_165812`, `polyamide-nylon_167188`, `flexible-materials_2057`) | Fundstellen zu Schrumpf, Verzug, Überhang, Detail |
| Q21 | Prusa Polymers, Technical datasheet Prusament PLA v1.1, 27.07.2022 (Spiegel bei MatterHackers) | https://www.matterhackers.com/r/xFvGl8 | Volltext |
| Q22 | University of Cambridge, DoITPoMS, Fused Deposition Modelling | https://www.doitpoms.ac.uk/tlplib/add_manuf/fdm.php | Abschnitte Anisotropie |
| Q23 | nophead (HydraRaptor), Polyholes, 02/2011 | https://hydraraptor.blogspot.com/2011/02/polyholes.html | Artikeltext |
| Q24 | OrcaSlicer Wiki, Line Width | https://www.orcaslicer.com/wiki/print_settings/quality/quality_settings_line_width | Z. 1–90 |
| Q25 | Bambu Studio, mitgelieferte Prozessprofile (GitHub `master`): `fdm_process_common.json`, `fdm_process_single_0.20.json`, `fdm_process_single_0.30_nozzle_0.6.json` | https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/process/fdm_process_common.json | Schlüssel Linienbreite, EFC, Stützwinkel |
| Q26 | OrcaSlicer Wiki, Support | https://www.orcaslicer.com/wiki/print_settings/support/support_settings_support | Threshold angle, Ignore small overhangs |
| Q27 | Snapmaker, The 45-Degree Rule in 3D Printing | https://www.snapmaker.com/blog/45-degree-rule-3d-printing/ | Fundstellen Tropfenloch, Schichthöhe |
| Q28 | Core Electronics, Designing FDM 3D Printed Parts for Manufacture, 16.04.2026 | https://core-electronics.com.au/guides/designing-fdm-printed-parts-for-manufacture/ | Volltext |
| Q29 | Bambu Lab Wiki, Brim (Auto) | https://wiki.bambulab.com/en/software/bambu-studio/auto-brim | Volltext |
| Q30 | 3DSourced, 3D Print Shrinkage PLA/ABS/PETG | https://www.3dsourced.com/guides/3d-print-shrinkage-pla-abs-petg/ | Fundstellen; Ausreißerwerte, nur als Widerspruch geführt |
| Q31 | Prusa Research, PrusaSlicer-Profilbündel `PrusaResearch/2.3.2.ini` (GitHub `main`) | https://raw.githubusercontent.com/prusa3d/PrusaSlicer-settings-prusa-fff/main/PrusaResearch/2.3.2.ini | nur Häufigkeit der Schlüssel `nozzle_diameter`, `*extrusion_width` |

## Maßstab

Winkel sind **von der Senkrechten** gemessen (0° = senkrechte Wand, 90° = Decke), wie im Code.
Wo eine Quelle die Düse nicht nennt, gilt 0,4 mm (Q2: Standard).

| Nr | Thema | Soll-Wert, Einheit, Gültigkeit | Quelle 1 | Quelle 2 (+ weitere) | Widerspruch / konservativer Wert |
|---|---|---|---|---|---|
| S1 | Linienbreite | 0,4-mm-Düse: 0,45 mm (PrusaSlicer) bzw. 0,42 mm außen / 0,45 mm innen (Bambu Studio); 0,6-mm-Düse: 0,62 mm (Bambu Studio). Kein einheitlicher Faktor. | Q2: „extrusion width of 0.45 mm“ | Q25: `line_width 0.42`, `outer_wall_line_width 0.42`, `inner_wall_line_width 0.45`; 0,6er-Profil `0.62`. Q24: außen 105–120 %, Start 100 % | Faktor liegt je Slicer bei 103–112,5 %. 112,5 % ist die **Obergrenze** der Standardprofile, nicht „der Standard der Slicer“. |
| S2 | Wandstärke als Linienvielfaches | n Linien ergeben **nicht** n × Breite: Slic3r-Familie (Prusa, Bambu, Orca) überlappt, zwei 0,4-mm-Linien bei 0,2 mm Schicht = 0,714 mm; Cura rechnet 0,8 mm. Tabellenwerte 0,45/0,9/1,35/1,8 mm sind laut Prusa „approximations“. Arachne passt die Breite an. | Q9 (Flow-Abschnitt) | Q2 (Tabelle mit Fußnote) | Vielfache sind Näherung; die n-fache Breite ist die obere Schranke (konservativ, da ≥ Bedarf). |
| S3 | Mindestwand, druckbar | ≥ 1 Linienbreite (0,45 mm bei 0,4-mm-Düse); darunter nicht druckbar. 1–2 Linien: druckbar mit „Detect thin walls“. | Q2 | Q4: ≥ 0,5 mm bei 0,25-mm-Düse (= 2 × Düse), steigt mit der Düse | Grenze ist die **Linienbreite**, nicht der Düsendurchmesser. |
| S4 | Mindestwand, empfohlen nicht tragend / gestützt | 0,8–1,0 mm | Q3: > 0,8 mm | Q5: 0,75 mm (gestützt); Q16: 1,0 mm; Q17: 1,0 mm; Q18: 1 mm; Q15: 4 × Schichthöhe (0,8 mm bei 0,2 mm; 1,0 mm bei 0,25 mm) | 0,75 … 1,0 mm; konservativ **1,0 mm** |
| S5 | Mindestwand, frei stehend / tragend | 1,0–1,2 mm bzw. 3 × Düse | Q5: 1,00 mm (ungestützt), „three times the nozzle diameter“ | Q17: 1,2 mm (ungestützt, Verzug); Q16: 1,0 mm | konservativ **1,2 mm** (= 3 × 0,4 mm) |
| S6 | Überhang ohne Stütze | 45° allgemein; 45–60° je nach Düse und Einstellung; mit 0,25-mm-Düse unter 45°; bis 75° nur mit Nextruder + 360°-Kühlung | Q1: 45°, „supported by 50 % of the previous layer“ | Q2: 45–60°, < 45° bei 0,25 mm, 75° MK4S/CORE One; Q4, Q5, Q16, Q17, Q18: 45° | konservativ **45°**, bei kleiner Düse bzw. großer Schichthöhe weniger (Q2, Q27). Slicer-Vorgabe ist großzügiger: `support_threshold_angle 30` = Stütze erst ab 60° (Q25, Q26). |
| S7 | Überhang je Material | PETG: „poor bridging and overhangs“; TPU: „very bad bridging and overhangs“; PC/ASA/ABS: keine Winkelangabe | Q20 (PETG, Flexible) | – | **Keine Quelle mit Gradzahl je Material gefunden.** |
| S8 | Kleiner Überhang (Nase, Lippe) | bis 1,2 mm Auskragung ohne Stütze | Q17: „up to 1.2 mm in length and up to 45°“ | Q26: Slicer ignoriert „small overhangs that possibly don't need support“ (ohne Maß) | Nur eine Quelle mit Maß: **1,2 mm**. Q6 nennt „45 degrees and 5 mm“ (unklar formuliert). |
| S9 | Brückenlänge | ≤ 5 mm ohne sichtbares Durchhängen; ≤ 10 mm ohne Stütze für Standardmaterial; 25 mm nur als Bestwert (Tough PLA, optimiert) | Q1: „unless the bridge is less than 5 mm“ | Q5: > 5 mm ggf. Stütze; Q4: 10 mm, bis 25 mm gedruckt | 5 mm vs. 10 mm; konservativ **5 mm** sauber, **10 mm** Obergrenze |
| S10 | Bohrung stehend (Achse = Z) | druckt untermaßig; Betrag hängt von Drucker, Slicer, Durchmesser und Material ab, bei kleinen Durchmessern stärker; kritische Maße untermaßig drucken und aufbohren | Q1 | Q15: „fractionally undersized“, bei Toleranz aufreiben; Q23: Ursachen Facettierung cos(π/n), Bogenschrumpf, Eckenabkürzung | **Kein allgemeingültiger Betrag.** Einziger Messwert: M6-Loch (6,0 mm) misst 5,9 mm bei Kompensation 0 (Q11, ein Drucker, ein Filament). |
| S11 | Polygoneffekt | Ecken eines n-Ecks liegen auf dem Kreis: Innenmaß × cos(π/n). Polyhole: Eckenzahl ≈ 2 × Durchmesser in mm (0,4-mm-Düse), Radius ÷ cos(π/n) | Q23 | Q9 (Polyholes, „about twice the hole diameter in mm with a 0.4 mm nozzle“); Q2: Facettenzahl prüfen | – |
| S12 | Kleinste Bohrung | Ø 2 mm | Q4: „should not be smaller than 2 mm“ | Q16: 2,0 mm; Q11: unter 1 mm kaum einstellbar | **2 mm** |
| S13 | Bohrung liegend (Achse waagrecht) | rund bis Ø 8 mm ohne Stütze, leicht elliptisch; darüber Tropfen- oder Rautenform, Spitze ≥ 45°; Ellipse Höhe = 2 × Breite bis ca. 25 mm | Q6 | Q27: Tropfenloch statt flacher Scheitel; Q1: Bauteil drehen, sonst Stütze | Nur Q6 nennt die 8 mm; Schwelle ist maschinen- und materialabhängig (Q6). |
| S14 | Kante an der Bettseite | 45°-Fase (Radius zulässig laut Q1; Fase bevorzugt laut Q2, weil ein Radius zum Bett hin steil überhängt) | Q1: „45° chamfer or radius on all edges touching the build plate“ | Q4: kleine 45°-Fase gegen Elefantenfuß; Q2: „use chamfer instead“ | Fase vs. Radius; konservativ **45°-Fase** |
| S15 | Elefantenfuß | Ausgleich im Slicer 0,1–0,25 mm je Seite, erste Schicht; hängt von Druckplatte ab | Q7: „around 0.2 mm“ bei 0,4-mm-Düse | Q8: Rechenbeispiel 0,10 mm, Bild 0,2 mm; Q25: Profil 0,20 mm → 0,15 mm; Q9: Beispiel 0,25 mm | 0,10 … 0,25 mm; ohne Slicer-Ausgleich konstruktiv Fase ≥ 0,25 mm (obere Angabe) |
| S16 | Anisotropie | Zug quer zu den Schichten deutlich schwächer: XY typ. 4–5 × Z (Q14); Prusament PLA: Schichthaftung 17 ± 3 MPa gegen 51 ± 3 MPa liegend (= 33 %) | Q14 | Q21; Q22: Z „significantly weaker“; Q1, Q2, Q4, Q5, Q6 qualitativ | 20–25 % (Q14) vs. 33 % (Q21); konservativ **Z-Zug ≤ 25 % von XY**; Zug und Biegung nie quer zu den Schichten |
| S17 | Schrumpf PLA | 0,3–0,5 % | Q19 | Q13: FDM allgemein 0,2–1 % | Q30 nennt 0,2–3 % (Ausreißer, ohne Beleg) |
| S18 | Schrumpf PETG | 0,2–1,0 % | Q19 | Q20 PETG: „does not shrink or warp“; Q30: 0,6 % | „keiner“ vs. bis 1 %; konservativ **1,0 %** |
| S19 | Schrumpf ABS | 1–2 % | Q20 ABS: „around 1-2 %“ | Q19: 0,7–1,6 % | konservativ **2 %**. Q30 „up to 11 %“ ohne Beleg, nicht übernommen. |
| S20 | Schrumpf ASA | 0,4–0,7 %; Verzug „significant“ | Q19 | Q20 ASA: „significant warping“ (ohne Prozentwert) | Nur eine Quelle mit Zahl. |
| S21 | Schrumpf TPU | gering | Q20 Flexible: „low shrinkage“ | – | **Keine Quelle mit Zahl gelesen.** |
| S22 | Schrumpf PA | PA12 0,7–2,0 %; PA66 0,7–3,0 %; faserverstärkt 0,5–1,0 % | Q19 | Q20 PA: „main disadvantage … warping“, CF-Typen deutlich weniger | konservativ **2 %** (PA12), **1 %** (faserverstärkt) |
| S23 | Schrumpf PC | keine Zahl gelesen; „High warping“ | Q20 PC | Q19: PC/ABS 0,5–0,7 % | **Keine zweite Quelle für reines PC.** |
| S24 | Schrumpf, Wirkung | Prozent der Bauteilgröße, vor allem in X/Y; Skalierung im Slicer wirkt auf Außenmaße, nicht auf Löcher; Fasern senken den Schrumpf | Q10 | Q19: „percentage of the part size“; Q13 | – |
| S25 | Verzug, Konstruktion | große ebene Flächen meiden, Rippen, Ecken runden; gleichmäßige Wandstärke | Q3 | Q13: Radius an Bettkante oder Brim; Q6: Wandstärke konstant; Q5 | – |
| S26 | Kerbwirkung, Innenradien | Innenecken runden; Radius = ¼ Wandstärke (Rippen, Zapfen) bis = Wandstärke; Zapfen < 5 mm mit Fußradius | Q6: ¼ Wandstärke | Q5: Radius = Wandstärke; Q1: Fußradius an Zapfen < 5 mm; Q15: Radien senken Spannungsspitzen | ¼ t … 1 t; konservativ **Radius ≥ ¼ Wandstärke, nie scharf** |
| S27 | Mindestdetail in X/Y | 0,5 mm kleinstes druckbares Merkmal (≈ Linienbreite); sicher 1,0–2,0 mm | Q28: 0,5 mm | Q5: 1,00 mm; Q16: 2,0 mm; Q18: 0,3 mm (industriell) | konservativ **1,0 mm** für Merkmale, die halten sollen |
| S28 | Zapfen / Säulen | Zapfen ≥ 1 mm (zuverlässig), Säulen 2–3 mm; unter 5 mm ohne Füllung und schwach | Q5 | Q17: 0,8 mm möglich, 1 mm zuverlässig; Q16: 3,0 mm; Q1: < 5 mm schwach | 1 … 3 mm; konservativ **3 mm**, darunter Normstift einsetzen (Q1) |
| S29 | Schrift erhaben | Strich ≥ 0,8 mm, Höhe ≥ 0,5 mm | Q5 | Q16: ≥ 1,0 mm, Schrift ≥ 14 pt; Q17: Höhe ≥ 0,3 mm; Q18: Strich 2,5 mm, Höhe 0,5 mm (industriell); Q15: fett, ≥ 24 pt | konservativ **Strich 1,0 mm, Höhe 0,5 mm**, fette serifenlose Schrift |
| S30 | Schrift vertieft | Strich ≥ 1,0 mm, Tiefe ≥ 0,5 mm; vertieft ist erhaben vorzuziehen | Q5 | Q17: 0,5 mm breit, 0,5 mm tief; Q18: Strich 1 mm, Tiefe 0,3 mm, „engraved … preferable“ | konservativ **Strich 1,0 mm, Tiefe 0,5 mm** |
| S31 | Auflagefläche / Haftung | Haftbedarf steigt mit Bauteilhöhe bei kleiner Standfläche, mit Material (PC, ABS, PA-CF, PET-CF, PLA-CF mehr; TPU weniger) und Geschwindigkeit; Abhilfe Brim | Q29 | Q19: Haftung muss die Schrumpfspannung tragen, wächst mit Bauteilgröße; Q4: größere Auflage senkt Verzug | **Keine Quelle mit Mindestfläche in mm² gefunden.** |
| S32 | Stützfreiheit | Bauteil teilen, Löcher senkrecht stellen, Fase statt Stufe; Tropfen-/Rautenloch | Q1 | Q2, Q5, Q6 | – |
| S33 | Maßhaltigkeit Tischdrucker | ± 0,5 %, mindestens ± 0,5 mm | Q13 | Q5: ± 0,5 % (± 0,5 mm); Q17: ± 0,3 % (± 0,3 mm); Q2: Original Prusa „accurate to at least 0.2 mm“ | 0,2 … 0,5 mm; konservativ **± 0,5 mm**. Industriell ± 0,15 %, mind. ± 0,2 mm (Q13, Q18). |
| S34 | Spalt bewegliche / gemeinsam gedruckte Teile | ≥ 0,5 mm | Q16: 0,5 mm | Q17: 0,5 mm; Q4: 0,6 mm („printed together“); Q2: bewegliche Teile ≥ 0,3 mm | 0,3 … 0,6 mm; konservativ **0,5 mm** (0,6 mm nach Q4) |
| S35 | Spiel gesteckter Teile | Gleitsitz 0,2–0,3 mm; beweglich ≥ 0,3 mm; kein Universalwert, hängt von Größe, Lage, Kalibrierung, Material ab | Q5 | Q2 | Quellen sagen nicht, ob je Seite oder gesamt. |

## Abgleich: jede Zahl der sechs Dateien

„ok“ = stimmt mit dem Maßstab oder ist ein interner Rechen-/Rauschwert ohne äußeren Maßstab.

| Nr | Datei:Zeile | Zahl / Regel | Maßstab | Ergebnis |
|---|---|---|---|---|
| P1 | tolerances.ts:8 | Passkamm −0,1 … 0,5 mm in 0,05-Schritten je Seite | S35 (0,2–0,3 Gleit, ≥ 0,3 beweglich) liegt im Bereich | ok |
| P2 | tolerances.ts:9 | Lochplatte 3, 5, 8, 10 mm | S10, S12 (ab 2 mm) | ok; Messbereich endet bei 10 mm, siehe MG-26 |
| P3 | tolerances.ts:10, 57 | Überhangstufen 20 … 70°, Grenze 20–70 | S6 (45–60°, Nextruder 75°) | ok |
| P4 | tolerances.ts:24 | Rundung auf 0,05 mm | – | ok |
| P5 | tolerances.ts:40 | Passung begrenzt auf −0,5 … 2 mm | – | ok (weiter als die Stufen in Z. 8) |
| P6 | tolerances.ts:50 | Lochmessung gilt bis 1 mm Abweichung | S10 | ok |
| P7 | tolerances.ts:53 | Lochzugabe = Mittel(Nenn − Ist), begrenzt 0 … 1 mm | S10 (durchmesserabhängig) | MG-31 |
| P8 | tolerances.ts:44 | Reihenfolge clamp ≤ push ≤ slide ≤ turn | – | ok |
| P9 | designFit.ts:19–22 | Linienbreite = 1,125 × Düse, „the slicers' default“ | S1 | MG-09 |
| P10 | designFit.ts:16 | Rundung 0,001 mm | – | ok; weicht von printCheck.ts:94 ab, MG-17 |
| P11 | designFit.ts:28–31 | Print-in-place-Spalt = max(0,3 mm, Düse) | S34 | MG-06 |
| P12 | designFit.ts:33–36 | Spiel × Düse / 0,4 | S33, S35 | MG-12 |
| P13 | designFit.ts:40 | Einheiten: Wand = Linie, Höhe = Schicht, Spalt/Detail = Düse | S2, S34 | MG-10, MG-14 |
| P14 | designFit.ts:43 | Mindestwand 2 Linien (0,9 mm bei 0,4) | S3, S4, S5 | MG-08 |
| P15 | designFit.ts:44 | Mindesthöhe 1 Schicht | Q4: Höhe > 0,06 mm; S29/S30 für Schrift 0,5 mm | ok als Druckgrenze; für Schrift siehe MG-25 |
| P16 | designFit.ts:45 | Mindestspalt 0,2 mm | S34 | MG-07 |
| P17 | designFit.ts:46 | Mindestdetail 1 Düse | S3, S27 | MG-11 |
| P18 | designFit.ts:50–55 | Aufrunden auf ganzes Vielfaches | S2 | MG-10 |
| P19 | designFit.ts:67–75 | Warnungen für Maße des Nutzers | S1, S34 | MG-07, MG-09 |
| P20 | designFit.ts:102–106 | Neuberechnung bei Druckerwechsel | S34 | MG-05, MG-15 |
| P21 | materialCatalog.ts:20–24 | Lochzugabe = 0,10 mm + Schrumpf auf 10 mm | S10, S24 | MG-26, MG-27 |
| P22 | materialCatalog.ts:27–29 | PLA, Matte, Silk: 45°, 0,15 mm, Spiel 0,05/0,15/0,25/0,3 | S6, S17 (0,3–0,5 % → 0,14), S35 | ok (0,15 = 0,10 + 0,04 gerundet) |
| P23 | materialCatalog.ts:30 | PLA-CF: 0,1 mm | S24 (Fasern senken Schrumpf, Q10) | ok |
| P24 | materialCatalog.ts:31 | PETG: 40°, 0,15 mm, Spiel 0,1/0,2/0,3/0,35 | S7, S18 | Winkel ohne Quelle, MG-30; 0,15 passt zu 0,5 %, konservativ wären 1,0 % → 0,20 |
| P25 | materialCatalog.ts:32–33 | PETG-CF, PET-CF: 40°, 0,1 mm | Raise3D-Datenblatt | nicht geprüft (PDF nicht gelesen) |
| P26 | materialCatalog.ts:34 | ABS: 45°, 0,25 mm | S19 (1–2 % → 0,25) | ok |
| P27 | materialCatalog.ts:35 | ABS-GF: 0,15 mm | – | nicht geprüft (keine Quelle mit Zahl gelesen) |
| P28 | materialCatalog.ts:36 | ASA: 0,15 mm, „less warping than ABS“ | S20 | Zahl ok; Notiz MG-29 |
| P29 | materialCatalog.ts:37 | TPU 95A: 35°, 0,1 mm, Spiel 0/0,1/0,3/0,4 | S7, S21 | Zahlen ohne Quelle, MG-30 |
| P30 | materialCatalog.ts:38 | PA: 0,2 mm (aus 0,5–1,5 %) | S22 | MG-28 |
| P31 | materialCatalog.ts:39–40 | PA-CF 0,15 mm, PA12-CF 0,1 mm | S22 (0,5–1,0 %) | MG-28 |
| P32 | materialCatalog.ts:41 | PC: 0,2 mm (aus 0,7–1,0 %) | S23 | nicht belegbar, keine zweite Quelle |
| P33 | materialCatalog.ts:42 | HIPS: 0,15 mm (0,2–0,8 %) | Q19: 0,2–0,8 % | ok |
| P34 | materialCatalog.ts:43 | PP: 0,3 mm (1,0–3,0 %) | Q19: 1,0–3,0 % | ok nach eigener Formel |
| P35 | materialCatalog.ts:23, 31–43 | „warping types 0.05 mm wider“ | – | ohne Quelle, MG-30 |
| P36 | printerCatalog.ts:19–95 | 77 Bauräume | – | nicht geprüft, siehe unten |
| P37 | printerCatalog.ts:19–95 | Düse 0,4 (Giga 0,6), Schicht 0,2 durchgehend | – | nicht geprüft; kein Toleranzwert im Katalog, MG-32 |
| P38 | printCheck.ts:93–95 | Mindestwand = 2 × 1,125 × Düse, auf 0,01 gerundet | S3–S5 | MG-08, MG-17 |
| P39 | printCheck.ts:98 | Rauschgrenze 1 mm² | – | ok (intern) |
| P40 | printCheck.ts:100, 346–349 | Sperre: Wand < Düse über ≥ 5 mm² | S3 | MG-16 |
| P41 | printCheck.ts:102, 410 | Auflage < 25 mm² warnt | S31 | MG-20 |
| P42 | printCheck.ts:109 | Gegenwand innerhalb 10° | – | ok (intern) |
| P43 | printCheck.ts:111, 177 | höchstens 40 000 Strahlen, sonst jede n-te Fläche | – | MG-18 |
| P44 | printCheck.ts:184–188, 347 | Strahl bis `minimum`, jeder Treffer zählt | S3 | MG-04 |
| P45 | printCheck.ts:223–258 | Berührung ≤ 0,05 mm, höchstens 4000 Eckpunkte | – | MG-19 |
| P46 | printCheck.ts:261–280 | gemeinsame X/Y-Ausdehnung aller Körper | – | MG-03 |
| P47 | printCheck.ts:310–320 | Passt-Prüfung, auf 0,1 mm gerundet, nur 90°-Drehungen | – | MG-02 |
| P48 | printCheck.ts:368, 406–409 | Überhang ab Materialwinkel, nur Warnung | S6 | MG-21, MG-24 |
| P49 | printCheck.ts:427–431 | Überlappung ab 0,01 mm³, Kontakt < 0,001 mm, Rand 2 mm | – | ok (intern); Kontaktlücke MG-19 |
| P50 | printCheck.ts:438–450 | Spalt < Schiebesitz (push) warnt | S34, S35 | MG-13 |
| P51 | printCheck.ts:456 | Gelenk am Anschlag: 0,5° / 0,1 mm | – | ok (intern) |
| P52 | overhang.ts:19 | ohne Profil 35° grenzwertig, 45° Stütze | S6 | ok (35° ohne Quelle, nur Anzeige) |
| P53 | overhang.ts:22–24 | grenzwertig 10° vor dem Materialwinkel | – | ok (ohne Quelle, nur Anzeige) |
| P54 | overhang.ts:31, 39 | 1° Toleranz über der Grenze | S6 | MG-22 |
| P55 | overhang.ts:34 | Bett: 0,05 mm | – | ok (intern) |
| P56 | overhang.ts:71–73 | kleiner Überhang: 4 Linien = 1,8 mm | S8 | MG-23 |
| P57 | overhang.ts:76 | Verschweißen 0,0001 mm | – | ok (intern) |
| P58 | overhang.ts:86–167 | „klein“, wenn jede **Ecke** in Reichweite einer Ankerkante liegt | S9 | MG-01 |

## Befunde

| Kennung | Schwere | Datei:Zeile | Ist | Soll (Quelle / Begründung) | Nachstellen |
|---|---|---|---|---|---|
| MG-01 | A | packages/geometry/src/overhang.ts:149–164 | `smallPatches` prüft nur die **Eckpunkte** der Überhang-Dreiecke gegen die Ankerkanten. Eine Decke oder Brücke, deren Ecken alle auf Wänden liegen, ist damit „klein“ und wird als grenzwertig statt als Überhang gezählt – unabhängig von der Spannweite. Der Kommentar Z. 81–82 verspricht das Gegenteil („a ceiling … needs support; both stay“). Der vorhandene Test (printCheck.test.ts:76–84) deckt nur die Tischplatte auf einem Mittelbein ab. | Brücken über 5 mm (Q1, Q5) bzw. 10 mm (Q4) müssen gemeldet werden. Prüfung braucht den größten Abstand eines **Flächenpunkts** zur nächsten Ankerkante, nicht nur der Ecken. | Hohlkasten 100 × 100 × 30 mm, unten offen, Decke 2 mm, bzw. Platte auf zwei Wänden mit 100 mm Abstand; `checkPrint` mit PLA. Erwartet: Überhang-Befund über die Decke. Nach Code: keiner, sofern die Deckenfläche ohne Innenpunkte trianguliert ist. |
| MG-02 | A | packages/geometry/src/printCheck.ts:314–319 | Prüft nur achsparallel und um 90° gedreht. Ein Stab 300 × 20 × 10 mm wird auf einem 256 × 256-Bett gesperrt („size“, block), obwohl er diagonal passt (Bedarf (300 + 20)/√2 = 226 mm je Seite). | Keine Sperre, wenn das Teil in irgendeiner Drehung um Z auf das Bett passt (Geometrie; die Slicer drehen frei). | `checkPrint([box('Stab',[0,0,0],[300,20,10])], {bed:[256,256,256],…})` → erwartet kein Block. |
| MG-03 | A | packages/geometry/src/printCheck.ts:261–280, 339–341 | `printedSize` nimmt die X/Y-Ausdehnung **aller Körper zusammen** in ihrer Konstruktionslage, nachdem jeder Körper einzeln auf seine Druckfläche gedreht wurde (`laid`, Z. 283–301). Laut Kopfkommentar Z. 15–17 legt der Slicer jeden Körper für sich aufs Bett. Zwei Körper, die je passen, aber weit auseinander konstruiert sind, werden gesperrt; nach dem Drehen einzelner Körper ist die gemeinsame Ausdehnung ohne Bedeutung. | Größe je Körper prüfen; die gemeinsame Belegung höchstens als Hinweis (Flächensumme). | Zwei Platten 200 × 200 × 3 mm mit 100 mm Abstand in X, Bett 256³ → erwartet kein Block; nach Code Block mit 500 × 200. |
| MG-04 | A | packages/geometry/src/printCheck.ts:184–188, 346–351 | Der Strahl sucht bis `minimum` einschließlich; jede getroffene Fläche wird gezählt, ohne `Dicke < minimum` zu prüfen. Eine Wand von genau 0,9 mm (das, was `snapSize('wall')` als kleinsten Wert liefert, designFit.ts:43) trifft bei 0,899 mm und erzeugt die Warnung „thinWall“ mit Dicke 0,9 und Minimum 0,9. | Zwei volle Linien drucken sauber (Q2: „More than two perimeters“ = druckbar); gemeldet wird nur, was **unter** dem Minimum liegt. | `checkPrint([box('Platte',[0,0,0],[20,20,0.9])], PLA)` → erwartet `ready`. |
| MG-05 | A | apps/desktop/src/shared/designFit.ts:105 | Für Maße mit Marke `×nozzle` gilt `count × Düse` ohne Untergrenze. Ein Spalt „[auto 1×nozzle]“ wird beim Wechsel auf eine 0,2-mm-Düse zu 0,2 mm – unter der eigenen Untergrenze 0,3 mm (Z. 29–31) und unter allen Quellen. | ≥ 0,3 mm (Q2), konservativ 0,5 mm (Q16, Q17) bzw. 0,6 mm (Q4). `fittedValue` muss für Spalte über `snapSize('gap')` laufen. | `fittedValue({count:1,unit:'nozzle'}, 0.4, {nozzle:0.2, layer:0.1})` → liefert 0,2. Offen: welche Marke der Assistent für Spalte schreibt (Phase 5). |
| MG-06 | B | apps/desktop/src/shared/designFit.ts:28–31 | Print-in-place-Spalt 0,4 mm bei 0,4-mm-Düse, 0,3 mm bei 0,2/0,25 mm. | 0,5 mm (Q16, Q17), 0,6 mm für gemeinsam gedruckte Teile (Q4); 0,3 mm ist bei Prusa die Untergrenze für bewegliche Teile (Q2). Konservativ 0,5 mm. | `printInPlaceGap({nozzle:0.4,layer:0.2})` → 0,4. |
| MG-07 | B | apps/desktop/src/shared/designFit.ts:45, 67–75 | `MINIMUM.gap` ist fest 0,2 mm, `snapSize('gap')` hebt aber auf `printInPlaceGap` (≥ 0,3 mm). Ein Nutzermaß von 0,25 mm bei 0,4-mm-Düse bekommt **keine** Warnung (0,25 ≥ 0,2, und der Vielfachen-Hinweis gilt nur für Wände). Unter 0,2 mm lautet die Meldung „under the printable 0.2 mm; 0.4 mm prints reliably“ – zwei verschiedene Grenzen in einem Satz. | Eine Grenze: der Print-in-place-Spalt (siehe MG-06); darunter warnen. | `fitSize('gap', 0.25, 'user', {nozzle:0.4,layer:0.2})` → `warning: null`. |
| MG-08 | B | apps/desktop/src/shared/designFit.ts:43; packages/geometry/src/printCheck.ts:93–95 | Mindestwand überall 2 Linien = 0,9 mm (0,4-mm-Düse). Keine Unterscheidung gestützt / frei stehend / tragend. | Gestützt ≥ 1,0 mm (Q16, Q17, Q18; Q15 bei 0,25 mm Schicht), frei stehend oder tragend ≥ 1,2 mm bzw. 3 × Düse (Q5, Q17). 0,9 mm ist nur die Druckbarkeitsgrenze (Q2). | `snapSize('wall', 0.5, {nozzle:0.4,layer:0.2})` → 0,9. |
| MG-09 | B | apps/desktop/src/shared/designFit.ts:19–22, 73 | Kommentar: „the slicers' default of 112.5 %“. Trifft nur für PrusaSlicer bei 0,4 mm zu (Q2). Bambu Studio: 0,42 mm außen, 0,45 mm innen, 0,62 mm bei 0,6-mm-Düse (Q25); Orca empfiehlt außen 105–120 % (Q24). Die Nutzermeldung Z. 73 („not a whole number of 0.45 mm lines; … prints cleaner“) behauptet damit für die meisten Katalogdrucker eine Linienbreite, die ihr Slicer nicht verwendet. | Linienbreite als Wert des Druckerprofils führen oder die Aussage auf „Richtwert“ abschwächen (S1). | `fitSize('wall', 1.2, 'user', {nozzle:0.4,layer:0.2})` → Meldung mit 0,45 mm und 1,35 mm. |
| MG-10 | C | apps/desktop/src/shared/designFit.ts:50–55 | Wand = n × Linienbreite. | n Linien belegen Breite + (n − 1) × (Breite − Schichthöhe × (1 − π/4)); zwei 0,4-mm-Linien bei 0,2 mm = 0,714 mm (Q9). Die Tabelle 0,9/1,35/1,8 ist Näherung (Q2). Das Vielfache ist die obere Schranke, also druckbar, aber nicht „genau n Linien“. | Rechnung: 2 × 0,45 = 0,9 gegen 0,45 + (0,45 − 0,043) = 0,857. |
| MG-11 | B | apps/desktop/src/shared/designFit.ts:46 | Mindestdetail = 1 Düsendurchmesser (0,4 mm) – kleiner als die eigene Linienbreite 0,45 mm (Z. 21). | Unter einer Linienbreite nicht druckbar (Q2); kleinstes X/Y-Merkmal 0,5 mm (Q28); haltbar 1,0 mm (Q5), 2,0 mm (Q16). | `snapSize('detail', 0.1, {nozzle:0.4,layer:0.2})` → 0,4. |
| MG-12 | B | apps/desktop/src/shared/designFit.ts:33–36 | Spiel linear mit der Düse: bei 0,2 mm halbiert (PLA turn 0,15 mm, slide 0,125 mm, push 0,075 mm), bei 0,8 mm verdoppelt. Keine Quelle im Code genannt. | Keine gelesene Quelle skaliert Spiel mit der Düse. Beweglich ≥ 0,3 mm unabhängig von der Düse (Q2); Maßhaltigkeit des Druckers ± 0,2 … 0,5 mm (Q2, Q13) wird durch eine kleinere Düse nicht halbiert. Mindestens nicht unter den 0,4-mm-Wert senken. | `scaleClearance(0.3, {nozzle:0.2,layer:0.1})` → 0,15. |
| MG-13 | B | apps/desktop/src/renderer/src/print/usePrintCheck.ts:54, 62; packages/geometry/src/printCheck.ts:438–450 | Die Engstellen-Prüfung nimmt den **unskalierten** Schiebesitz des Materials, während der Assistent skalierte Werte genannt bekommt (printProfiles.ts:303). Bei 0,8-mm-Düse baut er mit 0,3 mm, die Prüfung warnt erst unter 0,15 mm. Außerdem kennt sie keinen Print-in-place-Spalt: 0,2 mm zwischen gemeinsam gedruckten Körpern bleibt ohne Meldung. | Eine Quelle für die Grenze (dieselbe Skalierung wie im Regeltext); gemeinsam gedruckte Körper gegen S34 prüfen. | Zwei Körper mit 0,2 mm Abstand, PLA, 0,8-mm-Düse → keine „tight“-Warnung. |
| MG-14 | C | apps/desktop/src/shared/designFit.ts:40, 50–51 | Spalte hängen nur an der Düse; die Schichthöhe geht nicht ein, ein Spalt in Z wird nicht auf ganze Schichten gelegt. | Stratasys Direct nennt laut Suchauszug X/Y-Spiel 0,015″ und Z-Spiel = Schichtdicke (Q15, Abschnitt 4.2 **nicht im Volltext gelesen**). Vor einer Änderung Quelle vollständig lesen. | `snapSize('gap', 0.3, {nozzle:0.4, layer:0.28})` → 0,4 (kein Vielfaches von 0,28). |
| MG-15 | C | apps/desktop/src/shared/designFit.ts:102–106 | Wände und Höhen werden nur aufgerundet, `mark.count` wird nicht benutzt: 0,9 mm („2×line“) wird auf 0,6-mm-Düse 1,35 mm und bleibt nach der Rückkehr zur 0,4-mm-Düse 1,35 mm; die Marke nennt weiter 2 Linien. | Nach Hin- und Rückwechsel derselbe Wert, Marke und Wert stimmig. | `fittedValue({count:2,unit:'line'}, 0.9, {nozzle:0.6,…})` → 1,35; danach mit 0,4 → 1,35. |
| MG-16 | B | packages/geometry/src/printCheck.ts:343, 346 | Gesperrt wird erst unter dem Düsendurchmesser (0,4 mm). | „Walls thinner than one nozzle perimeter are not printable“, 1 Perimeter = 0,45 mm (Q2). Grenze = Linienbreite. | Platte 20 × 20 × 0,42 mm → nach Code nur Warnung. |
| MG-17 | B | packages/geometry/src/printCheck.ts:94; apps/desktop/src/shared/designFit.ts:16, 21, 43 | Dieselbe Formel zweimal mit verschiedener Rundung (0,01 gegen 0,001 mm). Bei 0,5-mm-Düse: `minimumWall` = 1,13 mm, `MINIMUM.wall` = 2 × 0,563 = 1,126 mm. Die vom Assistenten gerastete Mindestwand liegt unter der Prüfgrenze. (PrusaSlicer-Profile führen 0,5-mm-Düsen, Q31.) | Eine Funktion, eine Rundung. | `minimumWall(0.5)` gegen `snapSize('wall', 0.1, {nozzle:0.5, layer:0.2})`. |
| MG-18 | B | packages/geometry/src/printCheck.ts:111, 176–179 | Über 40 000 Dreiecken wird nur jedes n-te geprüft und dessen Fläche mit n multipliziert. Eine dünne Stelle aus wenigen Dreiecken kann ganz ausfallen oder mit falscher Fläche gezählt werden (Sperre hängt an ≥ 5 mm², Z. 100). | Jede dünne Wand wird gefunden (AUFTRAG.md Phase 4 Nr. 5). | Körper mit > 80 000 Dreiecken (feines Gewinde) und einer 0,3-mm-Rippe aus 12 Dreiecken. |
| MG-19 | B | packages/geometry/src/printCheck.ts:233–258, 428–429, 446 | Berührung wird nur an höchstens 4000 **Eckpunkten** geprüft. Zwei gekreuzt aufeinander liegende Stäbe haben keine Ecke in der Nähe des anderen → keine „separate“-Warnung. `withClearance` überspringt Abstände < 0,001 mm mit der Begründung, die Netzprüfung melde Berührung bereits. Flächige Berührung ohne nahe Ecke meldet damit niemand. | Jede Berührung zweier Körper wird gemeldet (Kopfkommentar Z. 15–17). | Stab 100 × 10 × 5 längs X bei z 0–5, Stab 10 × 100 × 5 längs Y bei z 5–10, mittig gekreuzt. |
| MG-20 | B | packages/geometry/src/printCheck.ts:102, 410 | Feste Grenze 25 mm² Auflage, unabhängig von Höhe, Material und Schwerpunkt. Ein 200 mm hoher Stab mit 6 × 6 mm Fuß (36 mm²) gilt als unauffällig. | Haftbedarf wächst mit Höhe bei kleiner Standfläche und mit dem Material (Q29), und mit der Bauteilgröße (Q19). Keine Quelle nennt eine feste Fläche; die 25 mm² sind unbelegt. Mindestens Verhältnis Höhe zu Standbreite einbeziehen. | `box('Stab',[0,0,0],[6,6,200])` → kein „contact“-Befund. |
| MG-21 | B | packages/geometry/src/overhang.ts:21–24; apps/desktop/src/shared/materialCatalog.ts:27–43 | Die Überhanggrenze hängt nur am Material. | Sie hängt an Düse und Einstellungen: mit 0,25-mm-Düse unter 45° (Q2); bei 45° trägt die untere Schicht 50 % nur bei passendem Verhältnis Schichthöhe zu Linienbreite (Q1), kleinere Schichthöhe verbessert (Q27). | Profil PLA, Düse 0,25 mm, Fläche 45° → nach Code grenzwertig, kein Befund. |
| MG-22 | C | packages/geometry/src/overhang.ts:31, 39; packages/geometry/src/printCheck.ts:408 | Stütze erst über Grenze + 1° (45,9° gilt bei Grenze 45° als grenzwertig); der Befund nennt als `limit` 45. | 45° (S6). Toleranz gegen Rundung der Normalen: Zehntelgrad genügen; oder die wirksame Grenze ausweisen. | Prisma mit 45,8°-Schräge → kein Befund. |
| MG-23 | B | packages/geometry/src/overhang.ts:64–73 | Kleine Überhänge bis 4 Linien = 1,8 mm (0,4-mm-Düse) gelten als unbedenklich; Beleg laut Kommentar `TreeSupport.cpp` (Orca/Bambu). | Einzige gelesene Quelle mit Maß: 1,2 mm (Q17). Das Orca-Wiki bestätigt nur, dass es die Option gibt (Q26), kein Maß. Der Quelltextbeleg wurde hier **nicht** nachgeprüft. Konservativ 1,2 mm oder Beleg nachreichen. | `smallOverhangReach(0.4)` → 1,8. |
| MG-24 | B | packages/geometry/src/printCheck.ts:367–409 | Es gibt keine Brückenprüfung: weder Spannweite noch Unterscheidung Brücke / freier Überhang. | Spannweite ≤ 5 mm sauber, ≤ 10 mm ohne Stütze (S9). Die Spannweite legt die Konstruktion fest, nicht der Slicer. | Platte auf zwei Wänden mit 8, 12 und 40 mm Abstand → drei verschiedene Aussagen erwartet. |
| MG-25 | B | packages/geometry/src/printCheck.ts (ganze Datei) | Zu folgenden Maßstabsthemen gibt es in den sechs Dateien weder Zahl noch Prüfung: liegende Bohrung / Tropfenform (S13), kleinste Bohrung 2 mm (S12), Polygoneffekt (S11), Fase an der Bettseite und Elefantenfuß (S14, S15; ein Radius an der Bettkante bis 1,8 mm fällt zudem unter „kleiner Überhang“, overhang.ts:140), Schichtrichtung und Belastung (S16), Verzug bei großen ebenen Flächen und scharfen Ecken (S25), Innenradien (S26), Zapfendurchmesser (S28), Schrift (S29, S30). | Je Thema ein Soll-Wert an einer Stelle im gemeinsamen Code, den Werkzeuge und Regeltexte nutzen (AUFTRAG.md Phase 5: harte Prüfung vor Prompt-Zeile). Ob die Werte anderswo stehen (`main/agents/`), prüft Phase 5. | Suche nach den Themen in `apps/desktop/src/shared/` und `packages/geometry/src/`. |
| MG-26 | B | apps/desktop/src/shared/materialCatalog.ts:19–24; apps/desktop/src/shared/tolerances.ts:9, 53 | Die Lochzugabe ist eine Konstante je Material, gerechnet für 10 mm. Der Schrumpfanteil ist aber ein Prozentsatz der Größe (Q10, Q19): ABS 1,5 % sind bei 50 mm 0,75 mm, die Zugabe bleibt 0,25 mm; bei 3 mm sind es 0,045 mm. Die Messplatte reicht nur bis 10 mm. | Zugabe = fester Druckanteil + Schrumpf × Durchmesser, oder Gültigkeit auf etwa 3–15 mm begrenzen und darüber warnen. Bambu gleicht Kreise nur bis 50 mm aus (Q12). | Bohrung 50 mm in ABS: Zugabe nach Katalog 0,25 mm gegen 0,10 + 0,75 mm nach eigener Formel. |
| MG-27 | C | apps/desktop/src/shared/materialCatalog.ts:20 | „0.10 mm from printing (an M6 hole prints 5.9 mm, Bambu Lab wiki)“: ein Messwert, ein Drucker, ein Filament (Q11); die Seite steht bei keinem Eintrag unter `source`. Der Messwert enthält den Schrumpf des gedruckten Filaments bereits; der Katalog addiert den Schrumpf noch einmal. | Zwei unabhängige Quellen (AUFTRAG.md Phase 3) – eine zweite mit Zahl wurde nicht gefunden (S10); Quelle angeben; Doppelzählung benennen. | Q11, Abschnitt „Step 1“. |
| MG-28 | B | apps/desktop/src/shared/materialCatalog.ts:38–40 | PA 0,2 mm (aus 0,5–1,5 %), PA-CF 0,15 mm, PA12-CF 0,1 mm. | PA12 0,7–2,0 %, PA66 0,7–3,0 %, faserverstärkt 0,5–1,0 % (Q19): Mitte 1,35 % → 0,10 + 0,135 = 0,25 mm; faserverstärkt 0,75 % → 0,175 ≈ 0,2 mm. Konservativer Wert zählt. Für PA12-CF nennt der Katalog ein Datenblatt, das hier nicht gelesen wurde. | Rechnung nach materialCatalog.ts:20–22 mit Q19. |
| MG-29 | C | apps/desktop/src/shared/materialCatalog.ts:36 | Notiz: ASA „less warping than ABS“. | Prusa: „The main disadvantage of ASA is significant warping“ (Q20 ASA). Die angegebene Quelle (SpecialChem) war nicht abrufbar (HTTP 403). Notiz belegen oder streichen. | Q20, ASA-Artikel. |
| MG-30 | C | apps/desktop/src/shared/materialCatalog.ts:23, 31–33, 37 | Zahlen ohne Quelle: Überhang 40° (PETG, PETG-CF, PET-CF) und 35° (TPU); TPU-Passungen 0/0,1/0,3/0,4; Zuschlag 0,05 mm für verzugsfreudige Typen. Die Notizen sagen „derived“. | Quellen nennen für PETG und TPU nur „poor“ / „very bad“ (S7). Als eigene Festlegung kennzeichnen und in Phase 4 mit dem Überhang-Prüfkörper belegen. | – |
| MG-31 | C | apps/desktop/src/shared/tolerances.ts:53 | Misst der Nutzer Löcher **über** Nennmaß, wird das negative Mittel still auf 0 gesetzt, ohne Hinweis. Über 3–10 mm wird gemittelt, obwohl der Fehler vom Durchmesser abhängt (Q1). | Hinweis an den Nutzer (Messfehler oder Überextrusion); Abhängigkeit vom Durchmesser siehe MG-26. | `applyReadings(material, {fits:{}, holes:[3.1,5.1,8.1,10.1], overhang:null})` → `holeShrink` 0, `problems` leer. |
| MG-32 | C | apps/desktop/src/shared/printerCatalog.ts:6–16 | Der Katalog führt Bauraum, Düse, Schichthöhe – keine Maßhaltigkeit. In den sechs Dateien gibt es keinen Toleranzwert des Druckers; Passungen kommen nur aus dem Material. | Tischdrucker ± 0,5 %, mindestens ± 0,5 mm (Q13, Q5); ± 0,3 mm (Q17); Prusa ≥ 0,2 mm (Q2). Mindestens als Hinweis bei engen Passungen und großen Maßen. | – |

## Nicht geprüft, weil …

- **Bauräume in `printerCatalog.ts` (77 Einträge, Z. 19–95):** nicht gegen die Herstellerseiten gehalten;
  der Auftrag dieses Teils sind Konstruktionsregeln. Braucht einen eigenen Durchgang (je Eintrag die
  `source`-Seite holen). Ebenso ungeprüft: ob 0,2 mm für jeden Eintrag die Herstellervorgabe ist und
  ob der nutzbare Bereich kleiner ist als der Nennbauraum (Sperrzonen, Brim).
- **Datenblätter Raise3D (PET-CF, PA12-CF) und SpecialChem:** PDF nicht gelesen bzw. HTTP 403. Die
  SpecialChem-Zahlen sind nur über die Tabelle in Q19 belegt.
- **Stratasys Direct, Abschnitte 4.2–4.5 (Assemblies, Spiel):** der Abruf endete bei 9000 Zeichen.
- **`TreeSupport.cpp` (Beleg für `smallOverhangReach`):** Quelltext nicht geholt.
- **PrusaSlicer-Profilbündel:** nur Häufigkeiten der Schlüssel ausgewertet (u. a. Extrusionsbreiten
  0,27 / 0,5 / 0,6 / 0,65 / 0,68 mm, Düsen 0,25 / 0,3 / 0,5 / 0,6 / 0,8 mm), nicht je Profil zugeordnet.
- **Prusament-PETG-Datenblatt:** nicht abrufbar; Anisotropie-Zahl nur für PLA belegt (Q21).
- **Normen (ISO/ASTM 52902, DIN EN ISO 2768, VDI 3405):** kostenpflichtig, nicht gelesen; kein
  Soll-Wert stützt sich darauf.
- **Hubs-Poster „Design rules for 3D printing“:** nicht abrufbar; ersetzt durch Q16 und Q17.
- **Verhalten des Codes:** kein Befund ist gemessen. MG-01 setzt voraus, dass SolidCraft ebene
  Flächen ohne Innenpunkte trianguliert; MG-04 setzt voraus, dass `raycastFirst` Treffer bis `far`
  liefert. Beides in Phase 4 am echten Körper belegen.
- **Regeltexte und Werkzeuge des Assistenten (`main/agents/`, `printProfiles.ts`):** nur die eine
  Zeile 303 gelesen; ob dort Werte zu den Lücken aus MG-25 stehen, ist offen.
- **Themen ohne zweite Quelle mit Zahl:** Überhang je Material (S7), kleiner Überhang (S8), Betrag
  des Lochuntermaßes (S10), liegende Bohrung ohne Stütze (S13), Schrumpf ASA, TPU, PC (S20, S21,
  S23), Mindestauflage (S31).
