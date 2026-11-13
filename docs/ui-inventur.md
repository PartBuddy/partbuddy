# UI-Inventur der Bedienelemente (Stand 07.11.2026)

Grundlage für das UI-Upgrade „jedes Bedienelement auf dem Niveau der besten Desktop-Apps Ende 2026“.
Erfasst sind alle Steuerelemente in `apps/desktop/src/renderer/src`; Dateien unter `viewer/` sind
Overlay-Bedienelemente der 3D-Ansicht (das Rendering selbst bleibt unberührt). Zeilennummern
beziehen sich auf `main` bei `d782dcf`.

**Grenzen (Audit D46, 13.11.2026):** Die Inventur ordnet Bedienelement-**Familien** fürs Styling, sie
ist kein Verzeichnis der Aktionen. Später Gebautes fehlt hier, u. a. Gelenk-Regler, Plattenansicht
und Zusammenbau, Toleranzassistent und Materialkatalog. Eine vollständige
Liste dessen, was die Oberfläche auslösen kann, gibt es in der Doku nicht; die nächste Annäherung
sind die IPC-Kanäle in `apps/desktop/src/shared/channels.ts` (`invokeChannels`: 115 Anfragen an den
Hauptprozess, `eventChannels`: 9 Meldungen zurück; Stand `61db080`). Aktionen, die nur im Renderer
wirken (Ansicht, Auswahl, Regler), stehen dort nicht.

Checkliste (Spalte „Mängel“): **1** Zustände · **2** Hell/Dunkel nur über Tokens · **3** Tastatur
und Fokusring · **4** WCAG 2.2 AA (Kontrast, Zielgröße ≥ 24 px, ARIA, reduzierte Bewegung) ·
**5** einheitliche Dichte, Radien, Bewegung · **6** DE/EN ohne Abschneiden.

## Übergreifend

* Gemeinsame Bausteine gab es nur für `Button` (primary/secondary) und `Feedback` (EmptyState,
  Busy, StatusDot). Alles andere sind Klassenketten je Datei; geteilt werden nur `radioClass`,
  `card` und `tip`.
* Kein gedrückter Zustand (`pressed`) bei den meisten Elementen; Fokus in Menüs und Listen über
  `focus:` statt `data-focus-visible`; 9 von 10 Tooltips ohne Rand, ohne Bewegung, Verzögerung
  300/400/500 ms gemischt; Popover und Dialoge ohne Ein-/Ausblendung.
* Tokens fehlten für: gedrückte Flächen, Akzent gedrückt, gefüllte Gefahr-Schaltfläche,
  Bewegung beim Ein-/Ausblenden (Easing, Versatz), Deckkraft „deaktiviert“, einheitlicher
  Fokusring als Utility. `border-strong` erreichte auf `canvas` nur 2,97:1 (gefordert 3:1).
* Fünf Abstandsklassen außerhalb der Token-Skala erzeugen gar kein CSS: `max-h-40`, `px-1.5`
  (AssemblyPlayer, motion.tsx), `min-w-28`, `gap-1.5` (PlateBar).
* Keine Hex-Farben im Komponentencode (ESLint verhindert sie); reduzierte Bewegung global
  über `styles.css`.

## Element-Familien

| Familie | Fundstellen | Mängel | Ziel |
|---|---|---|---|
| Button (Text) | `ui/Button` 74×; dazu ~25 eigene Ketten (NotesSection `small`, Timeline „Zum Ende“, Statusleiste, Kacheln, Karten, Bild-Buttons) | 1 kein pressed, keine Varianten quiet/danger, kein loading · 4 Link-Buttons < 24 px · 5 Höhen/Radien gemischt | `Button` mit primary/secondary/quiet/danger, sm/md, `isPending`; `pressable`, `linkClass` |
| IconButton | ~45 Stellen, 6 lokale `tool`-Ketten | 1 meist kein pressed · 4 23 ohne Tooltip, LiveBar ~14 px · 5 Größen 20–28 px gemischt | `IconButton` (Name = Tooltip, Kurzbefehl daneben) |
| ToggleButton / Segment | Chip-Toggles 4×, ViewTools, SketchPad, VersionsDialog, Tag-Filter | 1 nur ViewTools mit pressed, z. T. ohne disabled · 5 drei Selected-Looks | `ToggleButton`, `IconToggle`, `SegmentedControl` |
| Checkbox | SettingsDialog, PrintProfilesEditor 2×, BlockPanel, QuestionCard | 1 kein hover/disabled/invalid, „Haken“ ist ein weißes Quadrat statt eines Hakens · 4 Zeile ~20 px | `Checkbox` |
| Radio | `radioClass` 4×, Aufwand-Pillen (AgentChip) | 1 kein pressed/disabled · 4 Pillen ~16–18 px | `RadioGroup`/`Radio`, Karten-Radio |
| Switch | LiveBar (einziger) | 1 kein hover/disabled · Daumen endet 4 px vor dem Rand | `Switch` |
| TextField / TextArea | ~20 Felder, `fieldClass`, `inputClass`, rohe `<input>` (Tree, SketchPad) | 1 meist kein disabled/invalid · 3 drei Felder ohne Fokusring, Composer nur Randfarbe · 4 Fehlertexte nicht mit dem Feld verbunden (Tags, Versionen, Projekt) · 5 Höhen sm/md und Labelfarben muted/subtle gemischt | `TextField`, `TextArea`, `FieldError` |
| NumberField (Einheit) | PartDetails 2×, Druckprofile ~11× | 1 kein invalid · Einheit als lose `w-5`-Spanne | `NumberField` mit Einheit |
| SearchField | Startseite | Abbrechen-Knopf ohne Tooltip, Browser-Knopf per Arbiträrklasse versteckt | `SearchField` |
| Select / ListBox | BlockPanel, PartPanel (gleiches `Choice` doppelt), Startseite-Sortierung, Druckprofil-Liste | 1 kein pressed/disabled, Auswahl nur fett (kein Haken) · 3 `focus:` · 6 drei Selects im 420-px-Dock schneiden DE-Namen ab | `Select`, `ListBox` |
| Menu | 8 Menüs, `itemClass` 3×, Zweizeiler 4× | 1 disabled uneinheitlich · 3 `focus:` überall · 5 Header-Stile 3 Varianten, nur 2 Menüs mit Höhenbegrenzung | `Menu`, `MenuItem`, `MenuSection`, `MenuSeparator` |
| Popover | 11× gleiche Kette, 4 Handbau-Panels (rounded-lg) | 1 keine Ein-/Ausblendung · 5 Versatz 2/4/6/8 gemischt | `Popover` |
| Tooltip | 10× | Rand fehlt (weiß auf weiß), keine Bewegung, Verzögerung gemischt, 8 ohne Maximalbreite | `Tip` |
| Dialog / Modal | 9 Dialoge | 1 keine Ein-/Ausblendung · nur Versionen mit Schließen-X · `max-h-[76vh]` 3× | `Dialog` (Overlay, Kopf, Fuß) |
| Feedback / Progress | `Busy` 7×, Spinner 3× | 4 Busy-Balken unter reduzierter Bewegung ungeprüft · 5 Status-Punkt-Tabellen 4× dupliziert | `Busy`, `Spinner`, `StatusDot`, `Badge` |
| Badge / Chip | ~10 Badge-Ketten, Composer-Chips | 2 DimensionHud nutzt `text-accent` statt `text-accent-text` (Kontrast) · 5 Ketten weichen ab | `Badge` |
| Slider | Parameter, Montage, ViewTools 2× | 4 Daumen 12 px, kein disabled · 5 Spurhöhe über zwei Tokens | `Slider` |
| Tabs | Einstellungen (vertikal), Druckprofile (Unterstrich) | 5 zwei Stile · 6 feste 180 px Navigation | `Tabs` |
| Baum / Listenzeilen | `Tree.tsx` (eigener ARIA-Baum), Montage-Schritte, Prüfbefunde, Maße | 1 Abschnittszeile ohne pressed · Umbenennen-Feld ohne Fokusring | Zeilen-Klassen in `ui/` |
| Links | Erststart, Einstellungen 3×, Quellenkarte, AgentChip | 3 AgentChip-Link ohne Fokusring · 5 fast gleiche Ketten | `linkClass` |
| ViewCube | `viewer/ViewCube.tsx` | 3 Fokus nur als Hintergrund, Zellen ~21 px | bleibt (Fremdbaustein, eigenes Thema) |

## Reihenfolge

1. **Fundament** – diese Inventur, fehlende Tokens, Fokus-Utility, Bewegungs-Keyframes.
2. **Aktionen** – Button, IconButton, ToggleButton, IconToggle, Tooltip, Links.
3. **Eingaben** – TextField, TextArea, NumberField mit Einheit, SearchField, FieldError.
4. **Auswahl** – Checkbox, Radio, Switch, SegmentedControl, Select, ListBox, Slider.
5. **Menüs und Popover** – Menu, MenuItem, MenuSection, Separator, Popover.
6. **Dialoge und Feedback** – Dialog, Busy/Spinner, StatusDot, Badge.
7. **Navigation** – Tabs, Baum- und Listenzeilen.

Aktionen kommen vor den Eingaben, weil Tooltip und `pressable` von allen späteren Familien
gebraucht werden.
