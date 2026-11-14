# 03 – Maßstab Verbindungen, Passungen, Mechanik

Phase 3 des Vollaudits ([AUFTRAG.md](AUFTRAG.md)), Teil Verbindungen/Passungen/Mechanik. Stand 12.11.2026, alle
Quellen abgerufen am 12.11.2026. Nur gelesen und recherchiert; nichts gebaut, nichts gemessen.

Vollständig gelesen: `apps/desktop/src/shared/screwSizes.ts` (57 Z.), `magnet.ts` (62), `knob.ts` (137),
`wallMount.ts` (112), `mechanisms.ts` (840), `blocks.ts` (345), `standards.ts` (106), `tolerances.ts` (61),
`testPieces.ts` (87). Nur per Suche angesehen (nicht vollständig gelesen): `materialCatalog.ts:27-43`,
`main/agents/mechanismTool.ts`, `main/agents/blockTool.ts`.

## Quellen (Kürzel)

| Kürzel | Quelle |
|---|---|
| F-4762 | fasteners.eu, Tabelle ISO 4762 – https://www.fasteners.eu/standards/ISO/4762/ |
| W-4762 | Westfield Fasteners, DIN 912 / ISO 4762 – https://www.westfieldfasteners.co.uk/Standards/ScrewBolt-SHCap-M.html |
| W-10642 | Westfield Fasteners, ISO 10642 – https://westfieldfasteners.co.uk/Standards/ScrewBolt-SHCsk-M.html |
| F-7991 | fasteners.eu, Seite „ISO 10642“ (zeigt die Tabelle DIN 7991) – https://www.fasteners.eu/standards/ISO/10642/ |
| F-4032 | fasteners.eu, EN ISO 4032 – https://www.fasteners.eu/standards/ISO/4032/ |
| F-562 | fasteners.eu, DIN 562 – https://www.fasteners.eu/standards/DIN/562/ |
| F-7380 | fasteners.eu, ISO 7380-1 – https://www.fasteners.eu/standards/ISO/7380/ |
| F-7045 | fasteners.eu, Seite „ISO 7045“ (zeigt die Tabelle DIN 7985) – https://www.fasteners.eu/standards/ISO/7045/ |
| F-7996 / F-7997 | fasteners.eu, DIN 7996 / DIN 7997 – https://www.fasteners.eu/standards/DIN/7996/ , …/DIN/7997/ |
| F-4017 | fasteners.eu, DIN 933 / ISO 4017 – https://www.fasteners.eu/standards/ISO/4017/ |
| WP-273 | Wikipedia (de) „Durchgangsbohrung“, Tabelle fein/mittel/grob, Stand 26.07.2024 – https://de.wikipedia.org/wiki/Durchgangsbohrung |
| IF | Ifanger, Normtabelle Schraubenkopfsenkungen (DIN 974-1, DIN 74:2003-04, Durchgangslöcher) – https://www.defruytier.be/uploads/product/files/ifanger-VFL.pdf |
| LE | Leicht GmbH, Dimensions counterbores (28.11.2009) – https://www.leicht-gmbh.de/en/technics/dimensions-counterbores/ |
| D74 | DIN 74-1:2000-11, Tabelle 1 Form A (Abdruck) – https://krepcom.ru/upload/dimensions_pdf/pdf-din-74.pdf |
| RX | ruthex, Produktdatenblatt RX-Reihe, Stand 15.08.2022 – https://www.igo3d.com/mediafiles/Sonstiges/Ruthex/ruthex_Datenblatt_RX-Serie.pdf |
| HH | Helsinki Hacklab Wiki „3D-thread-inserts“ (ruthex- und CNC-Kitchen-Tabellen) – https://wiki.helsinki.hacklab.fi/3D-thread-inserts |
| CK | CNC Kitchen, Vergleichstabelle der Einsätze (bei 3DJake) – https://www.3djake.com/cnc-kitchen/thread-insert-set-xxl |
| RXV | ruthex M3 Voron (bei 3DJake) – https://www.3djake.com/ruthex/threaded-insert-m3-voron-100-pieces |
| HU-S | Hubs/Protolabs Network, Snap-fit joints – https://www.hubs.com/knowledge-base/how-design-snap-fit-joints-3d-printing/ |
| HU-F | Hubs, How to design parts for FDM – https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/ |
| HU-E | Hubs, Enclosure design – https://www.hubs.com/knowledge-base/enclosure-design-3d-printing-step-step-guide/ |
| PR | Prusa, Modeling with 3D printing in mind – https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135 |
| QI | QIDI, How to 3D print interlocking parts (Tabelle Spiel je Fuge, 0,4-Düse/0,2-Schicht, PLA/PETG) – https://qidi3d.com/blogs/news/how-to-3d-print-interlocking-parts-and-assemblies |
| SM | Snapmaker, 3D printed hinges – https://www.snapmaker.com/blog/3d-printed-hinges/ |
| SO-P | Sovol, Print-in-place (08.08.2026) – https://www.sovol3d.com/blogs/news/print-in-place-3d-printing-how-to-design-hinges-joints-and-moving-parts-that-actually-work |
| SO-T | Sovol, Threads and screws – https://www.sovol3d.com/blogs/news/3d-printing-threads-and-screws-how-to-design-reliable-fdm-fasteners |
| SO-G | Sovol, Gears (05.08.2026) – https://www.sovol3d.com/blogs/news/3d-printing-gears-that-actually-work-backlash-orientation-and-material-tips |
| SO-S | Sovol, Snap-fit joints – https://www.sovol3d.com/blogs/news/3d-printed-snap-fit-joints-how-to-design-clips-that-work |
| JLC | JLC3DP, 3D Printing Design Guideline – https://jlc3dp.com/help/article/3d-printing-design-guideline |
| SC | SelfCAD, 3D printing threads and screws – https://www.selfcad.com/blog/3d-printing-threads-and-screws-key-settings-and-tips |
| MD | Machine Design, Screw techniques for vinyl components – https://www.machinedesign.com/archive/article/21818564/screw-techniques-for-vinyl-components |
| TR | TR Fastenings, Plas-Fix 45 installation – https://www.trfastenings.com/Knowledge-Base/Fasteners-for-Plastic/Plas-Fix-45-installation |
| BAY | Bayer MaterialScience, Snap-Fit Joints for Plastics – A Design Guide, S. 8–12 (Spiegel MIT) – https://fab.cba.mit.edu/classes/S62.12/people/vernelle.noel/Plastic_Snap_fit_design.pdf |
| GF | gridfinity-rebuilt-openscad, `src/core/standard.scad` – https://raw.githubusercontent.com/kennetek/gridfinity-rebuilt-openscad/main/src/core/standard.scad |
| KJ | K&J Magnetics, Specifications & Tolerances – https://www.kjmagnetics.com/neodymium-magnet-specifications.asp |
| BO | Bourns PEC11R Datenblatt, Rev. 04/26, „Shaft Dimensions“ – https://www.bourns.com/docs/Product-Datasheets/PEC11R.pdf |
| AL | Alps Alpine RK09K/RK09D, „Shaft Variety“ – https://www.mouser.com/datasheet/2/15/rk09k_varietyother-2307124.pdf |
| GA | Ganter, DIN 6336 Sterngriffe Kunststoff (Katalogseite 494) – https://live-katalog.ganternorm.com/pdf/ganter/de/6336k.pdf |
| LS | Leschhorn, Datenblatt DIN 6336 Kunststoff – https://www.leschhorn.de/media/e7/9a/1a/1758490641/Datenblatt-12717.pdf |
| RP4 / RP5 | Raspberry Pi Ltd, Mechanical Drawing Pi 4 (20.05.2019) / Pi 5 – https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-mechanical-drawing.pdf , https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf |
| OP | Optimas, Tapping drill and clearance hole sizes – https://optimas.com/technical-resources/tapping-sizes/ |

## Maßstab

„per Seite“ = radial bzw. je Fuge; „Ø“ = auf den Durchmesser. Wo nur eine Originalquelle geholt werden konnte, steht
„(1 Quelle)“ – das ist dann kein belegter Soll-Wert im Sinn des Auftrags, sondern ein Kandidat.

### Passungen und Spiel

| Thema | Soll-Wert, Einheit, Gültigkeit | Quelle 1 | Quelle 2 | Widerspruch / konservativer Wert |
|---|---|---|---|---|
| Bewegliche Teile allgemein | ≥ 0,3 mm | PR („movable parts … at least 0.3 mm“) | JLC (FDM bewegliche Teile min. 0,5 mm) | 0,3 vs 0,5; konservativ 0,5, Untergrenze 0,3 |
| Print-in-place-Scharnier (Stift im Rohr) | 0,30–0,40 mm per Seite; Spalt > 1 Schichthöhe in Z und ≈ 1 Bahnbreite in XY; 0,4-Düse, 0,2-Schicht, PLA/PETG | QI | PR (≥ 0,3) | SM und SO-P nennen 0,2–0,3 mm (radial, „gut kalibriert“); konservativ ≥ 0,3 per Seite |
| Print-in-place-Kugelgelenk | 0,35–0,50 mm per Seite | QI | – (1 Quelle) | – |
| Laufpassung, Stift nach dem Druck gesteckt, frei drehend | 0,15–0,25 mm radial (0,30–0,50 Ø) | QI | PR (≥ 0,3 für Bewegliches) | konservativ 0,25–0,3 per Seite |
| Gleitpassung / Führung / Schwalbenschwanz | 0,20–0,30 mm per Seite; unter 0,20 steigt die Reibung stark | QI | PR (≥ 0,3) | konservativ 0,3 |
| Übergangs-/Schiebesitz von Hand | 0,1–0,2 mm per Seite | QI (Rastfläche 0,10–0,20) | HU-E (Bohrung ± 0,25 Ø) | keine zweite direkte Quelle für „von Hand“ |
| Presssitz ohne Kleber | Übermaß 0,05–0,15 mm; ab ≈ 0,20 mm reißt der Dom entlang der Schicht | QI | GF (6-mm-Magnet: Quetschrippen-Innen-Ø 5,9; „refined“ 5,86 → Übermaß 0,10–0,14 Ø) | Einheit bei QI nicht eindeutig (per Seite); konservativ 0,05–0,1 Ø mit Quetschrippen |
| Bauteil in Gehäuse | 0,5 mm umlaufend | HU-E | JLC (FDM min. 0,5) | – |
| Stecker-/Portöffnung | 1 mm je Seite (2 mm gesamt) | HU-E | – (1 Quelle) | – |
| Deckel mit Schnapprand | 0,20–0,25 mm per Seite | QI | SO-S (0,20–0,40 per Seite zwischen nicht rastenden Flächen) | konservativ 0,25 |
| Je Material und Düse | keine Quelle nennt Werte je Material × Düse; alle Werte gelten für 0,4-Düse und PLA/PETG und „am eigenen Drucker prüfen“ | QI | PR | – deshalb ist der Passungskamm (`testPieces.ts`) der eigentliche Maßstab |

### Schrauben, Muttern, Löcher

| Thema | Soll-Wert | Quelle 1 | Quelle 2 | Widerspruch / konservativ |
|---|---|---|---|---|
| Durchgangsloch ISO 273 / DIN EN 20273, mittel | M2 2,4 · M2,5 2,9 · M3 3,4 · M4 4,5 · M5 5,5 · M6 6,6 · M8 9 · M10 11 mm | WP-273 | IF (Zeile „mittel“); LE (d1) | keiner |
| Durchgangsloch fein / grob | fein 2,2 · 2,7 · 3,2 · 4,3 · 5,3 · 6,4 · 8,4 · 10,5; grob 2,6 · 3,1 · 3,6 · 4,8 · 5,8 · 7 · 10 · 12 | WP-273 | IF (fein); OP (M2: 2,2/2,4/2,6) | keiner |
| Aufmaß gedrucktes Durchgangsloch | + 0,25 mm Ø; bei Bedarf aufbohren | HU-E | HU-F (stehende Löcher fallen kleiner aus, Betrag drucker­abhängig) | – |
| Zylinderkopf ISO 4762, dk max (glatt) × k max | M2 3,8×2 · M2,5 4,5×2,5 · M3 5,5×3 · M4 7×4 · M5 8,5×5 · M6 10×6 · M8 13×8 · M10 16×10 | F-4762 | W-4762 (dk) | gerändelter Kopf dk max 3,98 · 4,68 · 5,68 · 7,22 · 8,72 · 10,22 · 13,27 · 16,27 (beide) – für die Tasche maßgebend |
| Flachsenkung für ISO 4762, DIN 974-1 Reihe 1 | M2 4,4 · M2,5 5,5 · M3 6,5 · M4 8 · M5 10 · M6 11 · M8 15 · M10 18 mm | IF | LE (M3–M10) | – |
| Senkkopf ISO 10642, dk theoretisch max | M3 6,72 · M4 8,96 · M5 11,2 · M6 13,44 · M8 17,92 · M10 22,4; ferner M2 4,70 · M2,5 5,88 | W-10642 | F-7991 zeigt nur DIN 7991 (dk 6 · 8 · 10 · 12 · 16 · 20) | DIN 7991 hat kleinere Köpfe; ISO-Wert ist der größere = konservativ. M2/M2,5 nur bei W-10642 (1 Quelle) |
| Senkkopf Kopfhöhe k max | ISO 10642: 0,62·d (M3 1,86, M5 3,10, M10 6,20 – Suchtreffer fasten.it/Westfield, Originaltabelle nicht geholt); DIN 7991: 1,7 · 2,3 · 2,8 · 3,3 · 4,4 · 5,5 | F-7991 | – | ISO-Werte nur aus Suchauszug |
| Senkung für ISO 10642 (DIN 74:2003 Form F), d2 | M3 6,94 · M4 9,18 · M5 11,47 · M6 13,71 · M8 18,25 · M10 22,73 | IF | – (1 Quelle; D74 von 2000 nennt 7,5 · 10 · 12,5 · 14,5 · 19 · 23,5) | Ausgaben weichen ab |
| Linsenkopf ISO 7380-1, dk max × k max | M3 5,7×1,65 · M4 7,6×2,2 · M5 9,5×2,75 · M6 10,5×3,3 · M8 14×4,4 · M10 17,5×5,5 | F-7380 | – (1 Quelle) | – |
| Flachkopf ISO 7045 / DIN 7985, dk max × k max | M2 4×1,72 · M2,5 5×2,12 · M3 6×2,52 · M4 8×3,25 · M5 10×3,95 · M6 12×4,75 | F-7045 | – (1 Quelle) | – |
| Sechskantmutter ISO 4032, s × m max | M2 4×1,6 · M2,5 5×2 · M3 5,5×2,4 · M4 7×3,2 · M5 8×4,7 · M6 10×5,2 · M8 13×6,8 · M10 16×8,4; Eckmaß e min 4,32 · 5,45 · 6,01 · 7,66 · 8,79 · 11,05 · 14,38 · 17,77 | F-4032 | F-4017 (gleiche Schlüsselweiten am Sechskantkopf) | gleiche Website, keine unabhängige zweite Quelle geholt |
| Schlüsselweite M10 nach alter DIN-Reihe | 17 mm (DIN 562 belegt; für DIN 934 aus dem Gedächtnis, nicht online belegt) | F-562 | – | ISO 16 vs DIN 17: beide sind im Handel |
| Mutterntasche | + 0,20–0,30 mm über Schlüsselweite, + 0,10 mm Tiefe | QI | – (1 Quelle) | – |
| Vierkantmutter DIN 562, s × m min | M2 4×1,2 · M2,5 5×1,4 · M3 5,5×1,6 · M4 7×1,8 · M5 8×2,3 · M6 10×2,72 · M8 13×3,52 · M10 17×4,52 | F-562 | – (1 Quelle) | – |
| Sechskantkopf ISO 4017, s × k nominal | M5 8×3,5 · M6 10×4 · M8 13×5,3 | F-4017 | – (1 Quelle) | – |
| Holzschraube Halbrundkopf DIN 7996, d1 × k | 3,5: 7×2,35 · 4: 8×2,8 · 4,5: 9×3,1 · 5: 10×3,5 | F-7996 | – (1 Quelle) | – |
| Holzschraube Senkkopf DIN 7997, d1 × k | 3,5: 6,5×1,93 · 4: 7,5×2,2 · 4,5: 8,3×2,35 · 5: 9,2×2,5 | F-7997 | – (1 Quelle) | – |
| Senkung DIN 74 Form A (Holzschrauben), d1 / d2 / t1 | 3,5: 3,9 / 7,6 / 1,9 · 4: 4,5 / 8,6 / 2,1 · 4,5: 5 / 9,5 / 2,3 · 5: 5,5 / 10,4 / 2,5 | D74 | LE (90°-Senkung d2 8,6 und 10,4 für 4 und 5) | – |
| Schraubenlängen ISO 4762 | 2,5 · 3 · 4 · 5 · 6 · 8 · 10 · 12 · 16 · 20 · 25 · 30 · 35 · 40 · 45 · 50 · 55 · 60 · 65 · 70 · 80 · 90 … | F-4762 | – (1 Quelle) | Zuordnung je Größe aus der Tabelle nicht sicher lesbar |
| Schraubenlängen Senkkopf (DIN 7991) | ab 8 mm (M3–M6), ab 10 (M8), ab 12 (M10); M3 bis 30, M4 bis 40 | F-7991 | – (1 Quelle) | – |

### Einschmelz-Einsätze

| Thema | Soll-Wert | Quelle 1 | Quelle 2 | Widerspruch / konservativ |
|---|---|---|---|---|
| ruthex RX: Loch d3 / Länge L / Wand W min | M2 3,2 / 4,0 / 1,3 · M2,5 4,0 / 5,7 / 1,6 · M3 4,0 / 5,7 / 1,6 · M4 5,6 / 8,1 / 2,1 · M5 6,4 / 9,5 / 2,6 · M6 8,0 / 12,7 / 3,3 · M8 9,6 / 12,7 / 4,5 | RX | HH | keiner |
| ruthex: Außen-Ø d1 / Spitze d2 | M2 3,6 / 3,1 · M2,5 4,6 / 3,9 · M3 4,6 / 3,9 · M4 6,3 / 5,5 · M5 7,1 / 6,3 · M6 8,7 / 7,9 | RX | HH | – |
| CNC Kitchen: Loch / Länge / Wand | M2 3,2 / 3,0 / 1,3 · M2,5 4,0 / 4,0 / 1,6 · M3 4,0 / 5,7 / 1,6 · M4 5,7 / 8,1 / 2,1 · M5 6,5 / 9,5 / 2,6 · M6 8,1 / 12,7 / 3,3 · M8 9,7 / 12,7 / 4,5 | CK | HH (M2 × 3, M2,5 × 4, M3 × 5,7) | Loch 0,1 größer als ruthex bei M4–M8; Längen M2 und M2,5 kürzer |
| Voron-Standard M3×5×4 | Außen-Ø 5,0, Länge 4,0, Loch 4,4, Wand ≥ 1,3 | RXV | CK („M3 Voron 4,0 / 5,0 / 4,25 / 4,4 / 1,3“); RX | – (Lochmaß aus der Voron-Dokumentation selbst nicht gefunden) |
| Lochtiefe | Einsatzlänge + 1 mm bei Sackloch | HH („hole needs to be L+1mm deep“) | – (1 Quelle) | – |

### Schrauben direkt in Kunststoff, gedruckte Gewinde

| Thema | Soll-Wert | Quelle 1 | Quelle 2 | Widerspruch / konservativ |
|---|---|---|---|---|
| Kernloch selbstschneidende Schraube | 0,8 × Nenn-Ø | MD | HU-E: Nenn-Ø − 0,25 mm | M3: 2,4 vs 2,75. Zu klein sprengt den Dom, zu groß reißt aus; kein eindeutig „konservativer“ Wert – am Teil erproben (TR) |
| Dom-Außen-Ø | 2 × Nenn-Ø | MD | TR: 2,5–3 × Kernloch; HU-E: Wand ≥ 1 Loch-Ø (= 3 × Loch) | konservativ 3 × Loch |
| Einschraubtiefe | ≥ 2 × Schrauben-Ø | TR | MD (Dom mindestens 2 × Dom-Ø hoch, Loch etwas tiefer als die Schraube) | – |
| Kernloch anfasen | auf Schrauben-Außen-Ø | TR | – (1 Quelle) | – |
| Gedruckte Gewinde, kleinste Größe | M6 | JLC („minimum recommended thread for printing is M6“) | SO-T (M6 konservativ; unter M5 nähert sich das Profil der Bahnbreite) | SC: „nicht kleiner als M5“; konservativ M6 |
| Gedruckte Gewinde, Spiel | 0,10–0,20 mm radial per Seite (0,20–0,40 Ø) | SO-T | SC | QI: 0,25–0,40 auf den Außen-Ø ab M10 – deckungsgleich |
| Gedruckte Gewinde, Schichthöhe | ≤ 1/6–1/8 der Steigung; 0,12–0,16 mm | SO-T | SC (≈ 0,1–0,12 mm) | – |
| Kernloch M3 zum Gewindeschneiden | 2,5 mm (M2,5: 2,05) | OP | – (1 Quelle) | – |

### Schnapphaken, Rastnasen, Filmscharnier

| Thema | Soll-Wert | Quelle 1 | Quelle 2 | Widerspruch / konservativ |
|---|---|---|---|---|
| Balkenformel, Rechteck, konstanter Querschnitt | y = 0,67 · ε · l² / h (also ε = 1,5 · h · y / l²) | BAY S. 9, Tab. 1 | – (BASF-Leitfaden nicht abrufbar, siehe unten) | – |
| Verjüngter Balken (h auf h/2) | y = 1,09 · ε · l² / h, über 60 % mehr Auslenkung | BAY S. 9, 12 | HU-S, SO-S („taper … 100 % → 50 %“) | – |
| Zulässige Dehnung, einmaliges Fügen | amorph ≈ 70 % der Streckdehnung, teilkristallin bis nahe Streckdehnung, glasfaserverstärkt ≈ 50 % der Bruchdehnung; PC 4 %, PC/ABS 2,5 % | BAY S. 11–12 | – | für PLA, PETG, ABS, PA als Druckwerkstoff nennt keine geholte Quelle Zahlen |
| Zulässige Dehnung, häufiges Fügen | ≈ 60 % des Einmalwerts | BAY S. 12, Tab. 2 | – (1 Quelle) | – |
| Werkstoffwahl | ABS, PETG, PA, TPU geeignet; PLA „less suitable“ (spröde, kriecht) | HU-S | SO-S | – |
| Fußradius | R ≥ 0,5 × Fußdicke | HU-S | BAY S. 8 (Optimum R/h = 0,6, nie unter 0,38 mm); SO-S (0,5–1,0 t, mind. 0,8–1,0 mm) | konservativ R = 0,6 h |
| Mindestbreite | 5 mm | HU-S | HU-E (Laschen ≥ 5 mm) | – |
| Spiel am Schnapphaken | 0,5 mm (FDM) | HU-S | SO-S 0,20–0,40 per Seite; QI 0,10–0,20 an der Rastfläche | konservativ 0,5 an nicht tragenden Flächen, an der Rastfläche klein |
| Hinterschnitt | 0,5–1,2 mm | SO-S | – (1 Quelle) | – |
| Druckrichtung | Arm liegend, Biegung in der Schichtebene | SO-S | HU-S („favorable build direction“) | – |
| Filmscharnier | 0,4–0,8 mm dick (QI); 0,4–0,6 mm, mind. 2 Schichten (nur Suchauszug) | QI | – | 2. Quelle nur als Suchauszug, nicht als Originalseite |

### Scharnier, Führung, Magnet, Zahnrad, Wellen, Platinen

| Thema | Soll-Wert | Quelle 1 | Quelle 2 | Widerspruch / konservativ |
|---|---|---|---|---|
| Scharnierbohrung liegend | 45°-Tropfenprofil statt Kreis | SO-P | – (1 Quelle) | – |
| Stift stehend/klein | < 5 mm Ø nur Außenbahnen, schwache Anbindung; Radius am Fuß | HU-F | SO-P (kleine liegende Stifte sacken, Ø erhöhen) | – |
| Brücke | über 5 mm sichtbarer Durchhang | HU-F | – (1 Quelle in diesem Teil) | siehe `03-massstab-geometrie.md` |
| Kante an der Bettseite | 45°-Fase an allen Kanten auf dem Bett (Elefantenfuß) | HU-F | SO-P (Fasen an der Unterkante), SM (Elefantenfuß füllt den 0,2-mm-Spalt) | – |
| Magnet, Maßtoleranz | ± 0,1 mm | KJ | – (supermagnete-Seite 404) | – |
| Magnettasche Klebesitz, 6×2-Magnet | Ø 6,5, Tiefe 2,4 (Magnet + 2 Schichten à 0,2) | GF | Suchauszug MakerWorld: + 0,2 bis + 0,3 Ø (Originalseite nicht geholt) | 0,2–0,5 Ø |
| Magnettasche Presssitz | Quetschrippen, Innen-Ø 5,9 bei 6 mm; „experimentally chosen“ | GF | QI (Übermaß 0,05–0,15) | – |
| Fase am Taschenmund | + 0,8 mm Radius, 45° | GF | – (1 Quelle) | – |
| Zahnrad Mindestmodul, 0,4-Düse | 1,0 als Untergrenze, 1,5–2,0 Regelfall | SO-G | – (Unionfab nennt nur „Zahn nicht feiner als die Düse“) | 2. Quelle fehlt |
| Zahnrad Flankenspiel | 0,1–0,2 mm je Flanke und Rad (0,2–0,4 gesamt); ≥ 12–14 Zähne bei 20° | SO-G | – (1 Quelle) | – |
| D-Welle 6 mm | Ø 6,0 ± 0,1; über die Abflachung 4,5 +0/−0,05; Länge der Abflachung F = 7 / 10 / 12 / 12 mm bei L = 15 / 20 / 25 / 30 | BO | AL: Ø 6, 4,5; Abflachung ℓ1 = 6 mm bei LM1 15, 7 mm bei LM1 20, 7–12 bei 25/30 | kürzeste Abflachung 6 mm (AL), nicht 7 |
| Rändelwelle 6 mm | 18 Zähne, Ø 6,0 ± 0,1, Schlitz 1 mm (BO); Alps RK09: 40 Zähne | BO | AL | Zähnezahl herstellerabhängig |
| Sterngriff DIN 6336 Kunststoff, d1 / Nabe d3 / Höhe h1 | 25 / 12 / 16 (M5) · 32 / 14 / 20 (M6) · 40 / 18 / 25 (M8) · 50 / 22 / 32 (M10) · 63 / 26 / 40 (M12) | GA | LS | keiner |
| Raspberry Pi 4 | 85 × 56 mm; Löcher Ø 2,7 im Rechteck 58 × 49, 3,5 mm vom Rand; lange Kante: USB-C 11,2, micro-HDMI 26,0 und 39,5, Klinke 54,0; kurze Kante: USB 9 und 27, Ethernet 45,75; Bauhöhen Z: USB 16,0, Ethernet 13,5, USB-C 3,2, HDMI 3,0, Klinke 6,0 | RP4 | – (Herstellerzeichnung) | – |
| Raspberry Pi 5 | 85 × 56; Löcher Ø 2,7, 58 × 49, 3,5; USB-C 11,2, micro-HDMI 25,8 und 39,2; Ethernet 10,2, USB 29,1 und 47; Überstand 3 mm; „approximate … for reference only“ | RP5 | – (Herstellerzeichnung) | – |

## Abgleich: jede Zahl der neun Dateien

✓ = stimmt mit dem Maßstab; „eigene Wahl“ = im Code als eigene Festlegung ausgewiesen und ohne Gegenquelle.

### `screwSizes.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| 11-20 | `CAP_HEAD` M2–M10 | ✓ dk max und k max nach F-4762 / W-4762 (glatter Kopf; gerändelt bis 0,27 mm größer, vom Aufmaß gedeckt) |
| 23 | `COUNTERSUNK_HEAD` M3–M10 | ✓ W-10642 (theoretisch max). „from M3“ → MV-25 |
| 30 | `INSERT` M2 3,2 / 4 | ✓ RX, HH |
| 31 | `INSERT` M2.5 **3,6** / 5,7 | **falsch**, Soll 4,0 → MV-01 |
| 32-35 | `INSERT` M3 4 / 5,7 · M4 5,6 / 8,1 · M5 6,4 / 9,5 · M6 8 / 12,7 | ✓ RX, HH; CNC Kitchen 0,1 größer und teils kürzer → MV-24 |
| 39-48 | `NUT` M2–M10 | ✓ F-4032 (s und m max); M10 → MV-09 |
| 51 | `NUT_ALLOWANCE` 0,3 / 0,4 | ✓ Schlüsselweite innerhalb QI (0,20–0,30); Tiefe 0,4 statt 0,10 – großzügiger, unkritisch |
| 54 | `HEAD_ALLOWANCE` 0,6 / 0,4 | eigene Wahl; Anwendung uneinheitlich → MV-20 |
| 57 | `CLEARANCE_NORMAL` | ✓ WP-273, IF |

### `blocks.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| 68, 234 | Rückfall 4 / 5,7 | ✓ (= M3) |
| 71 | `tappedHole` `modeled: true` für jede Größe | → MV-06 |
| 75, 237 | Sitz-/Lochtiefe = Länge + 1 | ✓ HH |
| 78 | Dom-Ø = Loch + 4 (Wand 2), Höhe = Länge + 3 | Wand unter Hersteller-W bei M4–M6 → MV-02 |
| 80, 93 | Text/Logo Höhe 5, Tiefe 0,6, Breite 20 | nicht Teil dieses Maßstabs (Schrift: `03-massstab-geometrie.md`) |
| 83 | Mutterntasche = s + 0,3, m + 0,4 | ✓ siehe oben |
| 87 | Langloch Breite = ISO 273 mittel, Länge 10 | ✓ / eigene Wahl |
| 90 | `lip` 1,2 / 2 / 0,2 | 0,2 liegt an der Untergrenze von QI (0,20–0,25); eigene Wahl |
| 96 | `snapFit` 12 / 1,5 / 5 / 0,8 / 1,5 | Breite ✓ HU-S; Hinterschnitt ✓ SO-S; Dehnungsaussage → MV-12; Fußradius → MV-10 |
| 105-108 | `snapStrain` = 150·t·y/Hebel² | ✓ BAY (1,5·h·y/l²); mit den Standardwerten 1,42 % nachgerechnet |
| 223 | Flachsenkung = dk + 2·0,6, Tiefe k + 0,4 | → MV-20 |
| 227 | Kegelsenkung = dk + 0,6, 90° | ✓ 90° (F-7991, W-10642); Ø 0,27–0,38 über DIN 74 F (IF), als Druckaufmaß vertretbar |

### `mechanisms.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| 44 | `MIN_BARREL_WALL` 0,8 | → MV-04 |
| 46 | `MIN_KNUCKLE` 2,5 | eigene Wahl, keine Quelle gefunden |
| 52-53 | Stift = d/2, mind. 2 | → MV-05 |
| 60 | Rohr 4–40 | eigene Wahl |
| 61 | Spalt 0,2–1 | Untergrenze → MV-03 |
| 62 | 3/5/7/9 Knöchel | eigene Wahl |
| 68 | Dach ≥ 0,9 | ✓ = 2 Bahnen à 0,45 (PR), aber nur für 0,4-Düse → MV-04 |
| 112 | `WEB` 0,5 / 0,3 | eigene Wahl |
| 150 | `ROOF_TOP` 1,05; „0,73 des Radius“, „0,72 mm bei 1,2“ | ✓ nachgerechnet (2·(√2−1,05) = 0,728; 3 − 1,9·1,2 = 0,72); Tropfenform ✓ SO-P |
| 202, 205-207 | Führung ≥ 5 lang, Breite 2–60, Höhe 1,5–20, Spalt 0,2–1 | Spalt ✓ QI (0,20–0,30); Schlankheit ungeprüft, Decke → MV-14 |
| 227 | Flankenversatz = Spalt·√2 | ✓ (Spalt senkrecht zur 45°-Flanke) |
| 303 | `LIP` 1,2 / 4 / 0,25 / 3 / 0,5 / 14 / 16 | Spiel ✓ QI; düsenfest → MV-19 |
| 309-311 | 12 mm, Wand 1,6–10 | eigene Wahl |
| 361-392 | −0,2, −0,05, Rille Ø 1,4, 0,25, 2,5 | Rille reicht 0,45 in die Wand = Wulst 0,25 + 0,2 ✓ (Kommentar Z. 301) |
| 424 | `SCREW_LENGTHS` | → MV-08 |
| 426 | `TAPPED_FROM` 5 | → MV-06 |
| 428 | `UNDER_HEAD` 1,2 | eigene Wahl; wird beim Senkkopf unterschritten → MV-07 |
| 433 | Senkkopftiefe 0,6·d | → MV-07 |
| 435, 441 | Halt 2,5·d, mind. 2/3 davon | → MV-28 |
| 481-482 | Sitz Länge + 1, Gewinde Halt + 1 | ✓ HH |
| 533 | Gewinde 3 / 1,1 · 4 / 1,2 · 5 / 1,5 bis Ø 24 / 77 / darüber | nicht geprüft (Flaschenhals-Normen) |
| 535-536 | 1,75 Umdrehungen, mind. 0,75; Kamm = P/2 − Tiefe, Fuß = P/2 + Tiefe | ✓ rechnerisch für 45°-Flanken (0,4 / 0,8 / 1,0 und 2,6 / 3,2 / 4,0) |
| 540 | `LID` 1 / 2,4 / 2,4 / 1 / 3 | eigene Wahl |
| 551-553 | Ø 16–200, 1–3 Gänge, Spalt 0,2–0,6 | Spalt ✓ SO-T, SC (0,10–0,20 radial); Flankenspiel senkrecht = Spalt/√2 (0,14 mm bei 0,2) |
| 574, 587-596 | 0,2, 0,05, 0,6, 1,2, Rillen alle 7 mm, mind. 8 | eigene Wahl |
| 625 | `SNAP` 12 / 1,5 / 5 / 0,8 / 1,5 / 0,2 / 0,3 / 0,2 / 0,5 | Breite ✓ HU-S; Spiel 0,2–0,3 unter HU-S (0,5), innerhalb SO-S; 1,4 % ✓ gerechnet; → MV-10, MV-12 |
| 633 | Wand 1,6–10 | eigene Wahl |
| 703 | `PEG` 1,5 / 1 / 0,5 / 0,5 / 5 | „unter 5 mm schwach“ ✓ HU-F; Verhältnis 1,5 nicht geprüft |
| 713-714 | Ø 3–20, Spalt 0,05–0,5 | Spalt ✓ innerhalb QI |
| 766 | `LATCH` 1,6 / 1,5 / 1 / 5 / 12 / 1,2 / 0,4 / 0 / 2 / 0,5 / 1 | 1,5·1,6·0,8/144 = 1,33 % ✓ gerechnet; scharfer Fuß → MV-11; → MV-12 |
| 780 | Breite 5–40 | ✓ Untergrenze HU-S |

### `magnet.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| 2 | „± 0,1 mm (K&J, supermagnete)“ | ✓ KJ; supermagnete nicht abrufbar |
| 3-4 | „none to 0,5 mm … Gridfinity“ | ✓ GF (6,5 für 6) |
| 17 | Klebesitz + 0,3 Ø | ✓ innerhalb 0,2–0,5 |
| 17 | Presssitz + 0,1 Ø | → MV-17 |
| 17 | 0,2 versenkt | GF: 0,4 (2 Schichten); 0,2 ist bei 0,2-Schicht eine Schicht – eigene Wahl |
| 17 | Fase 0,4 | GF 0,8; eigene Wahl |
| 43-45 | Ø 2–40, Höhe 1–20, 40 weitere | eigene Wahl; keine Prüfung der Restwand hinter der Tasche in dieser Datei |

### `knob.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| 4 | „6 mm, flat at 4,5“ | ✓ BO, AL |
| 4, 21 | „7 mm of flat at the least“, `flat: 7` | **falsch** für Alps RK09 mit 15-mm-Welle (6 mm) → MV-15 |
| 21 | Dach 3, Wand 2,4, Einstecktiefe 11, Rille 3, Band 2, Fasen 0,6 / 0,5, Zeiger 1,2 × 0,6 | eigene Wahl |
| 21 | `setScrew` 2,6 | → MV-26 |
| 24 | Spiel D / rund 0,2, Rändel 0 | 0,2 Ø = 0,1 per Seite ✓ innerhalb QI (0,1–0,2 Schiebesitz); Rändel → MV-26 |
| 55 | Abflachung 4,5 nur bei Ø 6 | ✓ |
| 65 | Rille alle 7 mm, mind. 8 | eigene Wahl |
| 73-78 | Welle 3–10, Spiel 0–0,6, Ø bis 80, Höhe 9–60 | eigene Wahl |
| 116-117 | Abflachung bei flat − d/2 + Spiel/2 | ✓ nachgerechnet: 4,7 über die Abflachung bei 6,2-Bohrung |

### `wallMount.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| 11 | Schrauben 3,5 / 4 / 4,5 / 5 | ✓ F-7996, F-7997 |
| 20-23 | `entry` 8 / 9 / 10 / 11 | ✓ Kopf 7 / 8 / 9 / 10 (F-7996) + 1; SPAX-Köpfe nicht geprüft |
| 20-23 | `slot` 4 / 4,5 / 5 / 5,5 | ✓ Gewinde + 0,5 |
| 20-23 | `pocket` 3 / 3,5 / 3,8 / 4,2 | k + 0,65–0,7 statt + 0,6 → MV-21 |
| 20-23 | `clearance` 4,1 / 4,7 / 5,2 / 5,7 | ✓ D74 d1 3,9 / 4,5 / 5 / 5,5 + 0,2 |
| 20-23 | `countersink` 7,8 / 8,8 / 9,7 / 10,6 | ✓ D74 d2 7,6 / 8,6 / 9,5 / 10,4 + 0,2 |
| 30 | `KEYHOLE` 8 / 2 / 1,2 | eigene Wahl (im Code so benannt); Brücke → MV-13 |
| 110 | 90° | ✓ D74 |

### `standards.ts` (nur Verbindungen/Mechanik/Platinen; übrige Zeilen siehe „Nicht geprüft“)

| Zeile | Aussage | Ergebnis |
|---|---|---|
| 16, 69 | Brücke sackt ab 5 mm (Hubs) | ✓ HU-F |
| 18 | 0,3 per Seite; Prusa ≥ 0,3, Hubs 0,5 | ✓ PR, HU-S / HU-E |
| 40 | 0,4-mm-Fase an Bettkanten (Hubs) | ✓ HU-F (Größe ist eigene Wahl) |
| 49 | Fußradius am Haken, „Hubs asks for a fillet without a size“ | Für Schnapphaken nennt Hubs 0,5 × Dicke (HU-S); für Haken/Stifte keine Größe (HU-F) – Aussage vertretbar |
| 80 | Abstandshalter 2–2,5 × Loch, mind. 5 | → MV-27 |
| 81 | Kernloch „0,25 less … 2,0 for M2.5 and 2,5 for M3“, Tiefe ≥ 2 d | Rechnung widersprüchlich → MV-18; Tiefe ✓ TR |
| 82 | Schnapphaken 1 mm am Fuß, 5 mm breit, 0,5 Spiel (Hubs) | ✓ Breite und Spiel HU-S; 1 mm Fußdicke bei Hubs nicht gefunden |
| 84 | 0,5 um die Platine, 1 mm je Seite am Stecker (Hubs) | ✓ HU-E |
| 85 | Pi 4/5: 85 × 56, 4 × Ø 2,7, 58 × 49, 3,5 | ✓ RP4, RP5 |
| 85 | Pi Zero, Arduino Uno | nicht geprüft |
| 86 | Pi 4: 11,2 · 26,0 · 39,5 · 54,0 · 9 · 27 · 45,75; Pi 5: 11,2 · 25,8 · 39,2 · 10,2 · 29,1 · 47; 3 mm Überstand | ✓ RP4, RP5 |
| 86 | „The drawings give no sizes for the openings“ | unscharf → MV-23 |
| 92 | DIN 6336 Maße | ✓ GA, LS |
| 94 | Köpfe ISO 4017 M5 8 / 3,5 · M6 10 / 4 · M8 13 / 5,3; Tasche + 0,3, Loch + 0,4 | ✓ F-4017; ✓ QI |
| 95 | Muttern 4,7 / 5,2 / 6,8; „For M3 to M6 … nutTrap“ | ✓ F-4032; Größenangabe → MV-22 |

### `tolerances.ts`, `testPieces.ts`

| Zeile | Zahl | Ergebnis |
|---|---|---|
| tolerances 8 | Stufen −0,1 … 0,5 per Seite, Schritt 0,05 | ✓ deckt alle Maßstabswerte (Presssitz −0,05 … −0,15 nur bis −0,1) |
| tolerances 9 | Löcher 3 / 5 / 8 / 10 | eigene Wahl; deckt M3–M10-Durchgangslöcher nur ungefähr |
| tolerances 10 | Überhang 20–70° in 5°-Schritten | siehe `03-massstab-geometrie.md` |
| tolerances 40, 53, 57 | Grenzen −0,5…2, 0…1, 20…70, Loch ± 1 mm | ✓ gleich `contract.ts:1070-1074` |
| testPieces 14 | Stift Ø 6, 10 mm hoch, Kamm 4 mm | ein Durchmesser, eine Stecktiefe; eigene Wahl |
| testPieces 21 | Schrift max(3, 7,5 × Düse), 2 Schichten tief | siehe `03-massstab-geometrie.md` |
| testPieces 42, 56 | Löcher ohne Fase auf dem Bett | → MV-16 |
| testPieces 65-69 | Rippe 6 hoch, 6 × Düse tief, 8 × Düse breit | eigene Wahl |

### Querbezug `materialCatalog.ts:27-43` (nicht mein Bereich, nur gegen den Maßstab gehalten)

PLA `clamp 0,05 / push 0,15 / slide 0,25 / turn 0,3`, PETG/ABS je + 0,05, per Seite. `slide` und `turn` liegen im
Maßstab (QI 0,20–0,30; PR ≥ 0,3). `clamp` ist ein **Spiel** von 0,05 per Seite, der Maßstab für Presssitz ist ein
**Übermaß** (QI, GF). Ob `clamp` zusammen mit `holeShrink` wirkt, wurde hier nicht geprüft → an den Prüfer der
Fachtabellen.

## Befunde

| Kennung | Schwere | Datei:Zeile | Ist | Soll (Quelle / Begründung) | Nachstellen |
|---|---|---|---|---|---|
| MV-01 | A | `screwSizes.ts:31` (wirkt in `blocks.ts:75`, `:78`, `:237`, `mechanisms.ts:481`) | Einsatz M2.5: Loch 3,6 mm; Kommentar Z. 26-27 „values of the common ruthex inserts“ | 4,0 mm (RX: RX-M2,5x5,7 d3 = 4,0, d1 4,6, d2 3,9; HH; CK 4,0). 3,6 ist kleiner als die Spitze des Einsatzes (3,9): die Spitze findet nicht ins Loch, und der Einsatz muss 1,0 mm statt 0,6 mm auf den Durchmesser verdrängen | `partbuddy_block insertSeat` bzw. `boss` bzw. `partbuddy_mechanism screw` mit M2.5 bauen, Lochdurchmesser messen |
| MV-02 | B | `blocks.ts:77-78` | Dom um den Einsatz: Ø = Loch + 4, also 2,0 mm Wand für jede Größe; Kommentar „at least 2 mm, as usual for FDM“ | Wand ≥ W min des Herstellers: M4 2,1, M5 2,6, M6 3,3 (RX, HH, CK) → Dom-Ø mind. 9,8 / 11,6 / 14,6 statt 9,6 / 10,4 / 12 | `boss` M5 und M6 mit Standardwerten bauen, Wand um das Loch messen |
| MV-03 | B | `mechanisms.ts:61` | Scharnierspalt ab 0,2 mm zulässig, ohne Bezug zur Schichthöhe | Print-in-place ≥ 0,3 per Seite (PR; QI 0,30–0,40) und größer als eine Schichthöhe (QI). 0,2 nennen nur SM/SO-P für „gut kalibrierte“ Drucker; konservativ 0,3 als Untergrenze, bei Schicht > Spalt ablehnen | Scharnier mit `gap: 0.2` bei 0,28-mm-Schicht bauen: wird angenommen |
| MV-04 | B | `mechanisms.ts:44`, `:63-64`, `:65-68` | Rohrwand ≥ 0,8 mm und Dach ≥ 0,9 mm als feste Zahlen | Zwei Bahnen sind bei 0,4-Düse 0,9 mm (PR), also schon dort mehr als 0,8; bei 0,6-/0,8-Düse ist 0,8 eine Bahn. Soll: beide Grenzen = 2 Bahnbreiten der gewählten Düse | Scharnier Ø 4, Spalt 0,2 (Wand 0,8) bauen und Druckprüfung mit 0,6-Düse laufen lassen |
| MV-05 | B | `mechanisms.ts:52-53`, `:60` | Stift ab 2 mm (Rohr 4 mm), ohne Hinweis | Stifte unter 5 mm sind nur Außenbahnen und schwach (HU-F; SO-P). Dieselbe Datei warnt beim Zapfen unter 5 mm (`mechanisms.ts:700-703`, `mechanismTool.ts:604`), beim Scharnierstift nicht. Soll: gleiche Warnung, Untergrenze begründen | Scharnier Ø 4 bauen, Rückgabetext lesen |
| MV-06 | B | `mechanisms.ts:426`, `:450`; `blocks.ts:71`, `:218` | Modelliertes Gewinde ab M5 (Mechanik); der Funktionsblock `tappedHole` modelliert es für M2–M10 ohne Grenze | Kleinste gedruckte Größe M6 (JLC; SO-T „conservative“); SC nennt M5. Konservativ M6, und beide Wege gleich | `partbuddy_block tappedHole` M3 bauen: wird als Gewinde modelliert; `partbuddy_mechanism screw` M4 `tapped`: abgelehnt |
| MV-07 | B | `mechanisms.ts:433`, `:452-453` | Senkkopftiefe als 0,6 · d angesetzt (M3 1,8; M4 2,4; M5 3,0; M6 3,6) | Die Senkung, die `headRoom` schneidet (`:505`: dk + 0,6 bei ISO-273-Loch), ist (dk + 0,6 − Loch)/2 tief: 1,96 / 2,53 / 3,15 / 3,72. Unter dem Kopf bleibt bis 0,16 mm weniger als die geprüften 1,2 mm (M3 bei 3,0 mm Dicke: 1,04) | `screw` M3 `countersunk` mit `from`–`to` 3,0 mm bauen, Restwand unter dem Kegel messen |
| MV-08 | B | `mechanisms.ts:423-424`, `:438-443` | Eine Längenliste für alle Größen und beide Kopfformen, 4–80 mm, ohne 55 und 65 | ISO 4762 führt 55 und 65 (F-4762); Senkschrauben beginnen bei 8 mm, M8 bei 10, M10 bei 12, M3 endet bei 30, M4 bei 40 (F-7991). `screwLength` kann eine Schraube nennen, die es nicht gibt (z. B. Senkkopf M3 × 5) | `screw` M3 `countersunk` mit 2 mm Dicke und Einsatz: Rückgabe der Schraubenlänge prüfen |
| MV-09 | B | `screwSizes.ts:47`; `blocks.ts:82-83` | Mutter M10: Schlüsselweite 16 (ISO 4032), Tasche 16,3 | Im Handel sind beide Reihen: ISO 16 (F-4032) und die alte DIN-Reihe 17 (F-562 für DIN 562; DIN 934 nicht online belegt). Eine 17er-Mutter passt nicht in 16,3. Soll: Hinweis bzw. Wahl ISO/DIN bei M10 | `nutTrap` M10 bauen, Schlüsselweite messen |
| MV-10 | B | `blocks.ts:184-197`, `mechanisms.ts:663-676` | An `plastic.snap_fit` gehen Länge, Dicke, Breite, Rast – kein Fußradius, keine Verjüngung | Fußradius ≥ 0,5 × Dicke (HU-S), Optimum 0,6 (BAY S. 8); Verjüngung auf die halbe Dicke bringt > 60 % mehr zulässige Auslenkung (BAY S. 12). Ob SolidCraft von sich aus rundet, ist nicht geprüft | Schnapphaken bauen, Kante am Fuß mit `FaceInfo` prüfen |
| MV-11 | B | `mechanisms.ts:822-838` | Profil des Riegels: der Arm setzt mit scharfer Innenecke an der Wand an (`[off, foot]` → `[-into, foot]`) | wie MV-10: Radius ≥ 0,5 × 1,6 = 0,8 mm am Fuß (HU-S, BAY, SO-S) | `latch` bauen, Innenecke am Fuß ansehen |
| MV-12 | B | `blocks.ts:95`; `mechanisms.ts:620-625`, `:764`, `:766` | „About 1,4 % strain … within what printed PLA takes“; ein Haken und ein Riegel (1,3 %) für jedes Material | Zulässig ist ≈ 70 % der Streckdehnung einmalig und davon ≈ 60 % bei häufigem Fügen (BAY S. 11-12). Für PLA nennt keine der Quellen einen Wert; Hubs stuft PLA als wenig geeignet ein (HU-S). Die Aussage ist unbelegt, und ein Riegel wird häufig betätigt. Soll: Grenzdehnung je Material als belegte Tabelle, Prüfung gegen `snapStrain` | – (Recherche: Streckdehnung der Druckwerkstoffe aus Datenblättern) |
| MV-13 | B | `wallMount.ts:68-72`, `:91` | Tasche des Schlüssellochs: Decke ist eine Brücke von 8–11 mm Breite; Kommentar „nothing needs support“ | Brücken über 5 mm sacken sichtbar (HU-F; die App sagt es selbst in `standards.ts:16` und `:69`). Soll: Decke als 45°-Dach oder Zugabe in der Taschentiefe und ehrliche Aussage | `keyhole` für Schraube 5 bauen, Brückenlänge in der Druckprüfung ansehen |
| MV-14 | B | `mechanisms.ts:186`, `:234-247`; `mechanismTool.ts:592` | Nut des Schwalbenschwanzes: oben eine ebene Decke, 2·(Breite/2 + Spalt·√2 + Höhe + Spalt) breit (Standard 6 / 3 / 0,3: 13,4 mm), darüber nur der Spalt; Rückgabe „Print both with the rail's line level or upright, so the flanks need no support“ | Liegt die Linie waagrecht und die Nut nach unten offen, ist die Decke eine Brücke > 5 mm (HU-F), die in den Spalt sackt. Soll: nur „upright“ empfehlen oder oben mehr Luft geben | Führung mit Standardwerten bauen, Druckfläche so setzen, dass die Nut nach unten offen ist, Druckprüfung |
| MV-15 | B | `knob.ts:4`, `:16-21`, `:115` | „Alps RK09: … 7 mm of flat at the least“, `flat: 7` als „the shortest flat sold“ | Alps RK09 mit 15-mm-Welle: Abflachung 6 mm (AL); Bourns PEC11R: 7 mm (BO). Auf der 6-mm-Abflachung sitzt der Knopf 1 mm höher als gebaut, und die Quellenangabe stimmt nicht | `knob` mit `shaft: d`, Höhe 16 bauen; Länge der Abflachung in der Bohrung messen (7) |
| MV-16 | B | `testPieces.ts:42`, `:56` | Löcher von Passungskamm und Lochplatte gehen ohne Fase bis aufs Druckbett | 45°-Fase an allen Bettkanten (HU-F; eigene Regel `standards.ts:40`); der Elefantenfuß verengt genau die Löcher, an denen abgelesen und gemessen wird (SM) – Passungen werden zu weit, `holeShrink` zu groß abgelesen | Teststücke erzeugen, unterste Kante der Löcher ansehen |
| MV-17 | B | `magnet.ts:17`; `blockTool.ts:154` | Presssitz = Magnet-Ø + 0,1, fest, für jedes Material; im Werkzeug kommt `holeShrink` laut Suche nicht vor | Presssitz ist Übermaß (QI 0,05–0,15; GF Quetschrippen 5,9 für 6 mm). Mit `holeShrink` 0,1–0,3 (`materialCatalog.ts`) und Magnettoleranz ± 0,1 (KJ) liegt das Ergebnis zwischen 0,3 mm Übermaß und 0,1 mm Spiel. Soll: an das Materialprofil binden oder Quetschrippen | `magnet` `hold: press` 6 × 2 bauen: Tasche 6,1; mit PP- und PLA-Profil vergleichen |
| MV-18 | B | `standards.ts:81` | „pilot hole 0,25 mm less than the screw for print (Hubs), which is 2,0 mm for M2.5 and 2,5 mm for M3 after print“ | 2,5 − 0,25 = 2,25 und 3 − 0,25 = 2,75 (HU-E). 2,0 / 2,4 wären 0,8 × d (MD). Der Satz mischt zwei Regeln und nennt für eine die Zahlen der anderen; „after print“ ist nicht nachvollziehbar | Thema `boardMount` abrufen und den Satz nachrechnen |
| MV-19 | B | `mechanisms.ts:298-303` | Deckelverschluss „by the usual sizes for a 0,4 mm nozzle“: Lippe 1,2 mm, fest für jede Düse | 1,2 ist kein Vielfaches der Bahnbreite (0,9 / 1,35 bei 0,4; PR) und bei 0,8-Düse 1,5 Bahnen; JLC verlangt für Schnapp- und Befestigungsformen > 1,5 mm. Soll: Dicke aus der Düse | `lip` mit 0,8-Düse bauen, Druckprüfung auf dünne Wand |
| MV-20 | C | `screwSizes.ts:53-54`; `blocks.ts:223`, `:227`; `mechanisms.ts:504-505` | `HEAD_ALLOWANCE.diameter` 0,6 wird bei der Flachsenkung doppelt (dk + 1,2), bei der Kegelsenkung einfach (dk + 0,6) addiert; Einheit im Kommentar offen | Einheitlich benennen. Ergebnis gegen DIN 974-1 (IF, LE): M5 9,7 statt 10, M8 14,2 statt 15, M10 17,2 statt 18; ein Linsenkopf ISO 7380 M5 (9,5; F-7380) passt nach Lochschwund nicht mehr | `screwHole` M5 `cap` bauen, Senk-Ø messen |
| MV-21 | C | `wallMount.ts:15-23` | Kommentar „pan head's height plus 0,6 mm“; Werte 3 / 3,5 / 3,8 / 4,2 | k = 2,35 / 2,8 / 3,1 / 3,5 (F-7996) → + 0,65 / 0,7 / 0,7 / 0,7 | Tabelle nachrechnen |
| MV-22 | C | `standards.ts:95` gegen `screwSizes.ts:7`, `:39-48`, `blocks.ts:63` | „For M3 to M6 partbuddy_block nutTrap makes the pocket“ | Die Tabelle führt M2–M10, `sizesOf('nutTrap')` gibt alle acht Größen | Thema `starKnob` abrufen, `nutTrap` M8 bauen |
| MV-23 | C | `standards.ts:86` | „The drawings give no sizes for the openings“ | Die Pi-4-Zeichnung nennt die Bauhöhen (USB 16,0, Ethernet 13,5, USB-C 3,2, HDMI 3,0, Klinke 6,0; RP4), die Pi-5-Seitenansicht 3,2 / 3,4 / 4,4 / 4,1; Breiten fehlen tatsächlich | Zeichnungen ansehen |
| MV-24 | C | `screwSizes.ts:29-36`, `:38-48` | Nur ruthex-Einsätze M2–M6; keine Vierkantmuttern; nur Zylinder- und Senkkopf | Im Maßstab belegt und nicht geführt: Voron M3×5×4 (Loch 4,4; RXV, CK), ruthex M8 (9,6 / 12,7; RX), CNC-Kitchen-Abweichungen (Loch + 0,1, M2 × 3, M2,5 × 4; CK), DIN 562 (F-562), ISO 7380 / 7045 (F-7380, F-7045). Zahnräder und Filmscharniere führt keine der neun Dateien | – |
| MV-25 | C | `screwSizes.ts:22-23`; `mechanisms.ts:451` | „Countersunk screws, ISO 10642 (from M3)“ / „countersunk screws start at M3“ | W-10642 führt für ISO 10642 auch M2 (dk 4,70) und M2,5 (5,88); DIN 7991 beginnt bei M3 (F-7991). Nur eine Quelle | – |
| MV-26 | C | `knob.ts:21`, `:24`, `:127`; `standards.ts:81` | Kernloch der M3-Madenschraube 2,6; Rändelwelle in glatter Bohrung mit Spiel 0 | Drei Zahlen für dasselbe Kernloch im Projekt (2,6 hier; 2,5 und „0,25 less“ in `standards.ts:81`); OP 2,5. Beim kleinsten Knopf (Ø 13) trägt das Gewinde nur ≈ 3,4 mm < 2 d (TR). Rändel: 18 Zähne (BO) bzw. 40 (AL), die glatte Bohrung hält nur über Klemmung | `knob` `shaft: round`, Ø 13 bauen, Gewindelänge messen |
| MV-27 | C | `standards.ts:80` | Abstandshalter „outer diameter 2 to 2,5 times the hole“ | MD: 2 × Schrauben-Ø; TR: 2,5–3 × Kernloch; HU-E: Wand ≥ 1 Loch-Ø (= 3 × Loch). Konservativ 3 × | – |
| MV-28 | C | `mechanisms.ts:435`, `:441` | Gedrucktes Gewinde: Schraube gilt ab 2/3 von 2,5 d = 1,67 d Eingriff als passend | Eingriff in Kunststoff ≥ 2 d (TR) | `screw` `tapped` M6 mit Dicken durchprobieren, Eingriff aus Länge und Dicke rechnen |

Zählung: A 1 · B 18 · C 9.

## Nicht geprüft, weil …

- **BASF Snap-Fit Design Manual**: der bekannte Spiegel (`web.mit.edu/2.75/…/Snap-Fit Design Manual.pdf`) leitet auf
  `meddevdesign.mit.edu` um; kein Dokument. Der Fußradius ist deshalb mit Bayer, Hubs und Sovol belegt, nicht mit BASF.
- **Zulässige Dehnung je Druckwerkstoff** (PLA, PETG, ABS, PA, TPU): keine geholte Quelle nennt Zahlen; Bayer nur für
  PC und PC/ABS. Datenblätter (Streckdehnung liegend/stehend) wurden nicht geholt. MV-12 bleibt deshalb ohne Soll-Zahl.
- **Spiel je Material × Düse × Schichthöhe**: keine Quelle staffelt so; alle Werte gelten für 0,4-Düse, 0,2-Schicht,
  PLA/PETG. Das ist nur mit dem Passungskamm zu messen (Phase 4).
- **Zweite unabhängige Quelle** fehlt für: ISO 4032 (zweite Fundstelle ist dieselbe Website), ISO 7380, ISO 7045,
  DIN 562, DIN 7996, DIN 7997, ISO 4017, k max ISO 10642, DIN 74 Form F, Zahnrad-Werte, Filmscharnier, Hinterschnitt.
  Die Zeilen sind im Maßstab mit „(1 Quelle)“ markiert.
- **DIN 934 M10 = 17 mm** und **Hubs „Stift mind. 3 mm“**: aus dem Gedächtnis, nicht online belegt; deshalb nicht als
  Soll verwendet.
- **Längenbereich je Schraubengröße nach ISO 4762**: Tabelle geholt, die Spaltenzuordnung war im Textauszug nicht
  sicher lesbar.
- **SPAX-Kopfmaße** (`wallMount.ts:4`): nicht geholt.
- **Schraubdeckel** (`mechanisms.ts:526-537`): Steigung/Tiefe „after the neck finishes of bottles“ – keine Norm
  (SPI/GPI, DIN 168) geholt.
- **Zapfen 1,5–2 × Ø** (`mechanisms.ts:699`): Quelle „makers of split prints“ nicht nachgeprüft.
- **`standards.ts` außerhalb Verbindungen**: 3M-Bumpon-Maße (Z. 37), CNC-Kitchen-Hakenlasten (47-48), Ösen und
  Kabelbinder (51-52), Kabel- und Verschraubungsmaße (58-62), IP2X/IP4X (71), Lüfter-Lochabstände (72), Rohrschellen
  (27-29), Pi Zero und Arduino Uno (85) – nicht gegen Quellen gehalten.
- **Verhalten von SolidCraft**: ob `plastic.snap_fit` einen Fußradius setzt, ob `sketch.polygon.circumscribed` die
  Schlüsselweite als Innenkreis nimmt (`blocks.ts:160`), welche Tabelle `solid.hole` mit `clearance`/`thread` nutzt –
  nicht geprüft (kein Lauf erlaubt); gehört in Phase 2/4.
- **Werkzeuge** `blockTool.ts`, `mechanismTool.ts`: nur durchsucht. Die Suche nach `holeShrink` und nach den
  Passungswerten des Materialprofils ergab in beiden keinen Treffer; ob Magnet-, Knopf-, Einsatz- und Mechanikmaße
  damit vom Material unabhängig sind, muss der Prüfer der Werkzeuge bestätigen.
- **Nichts gedruckt, nichts gebaut**: alle „✓ gerechnet“ sind Nachrechnungen der Formeln im Code, keine Messungen.
