# UI-Inventar aller Oberflächen (09.11.2026)

Grundlage für den UI/UX-Audit (`ui-ux-audit-2026-11-09.md`). Ermittelt aus `apps/desktop/src/renderer/src`
(Suche nach `MenuTrigger`, `Popover`, `DialogTrigger`, `ModalOverlay`, `TooltipTrigger`/`Tip`, `Select`,
`ComboBox`, `ListBox`, `role="dialog|status|alert"`, `onContextMenu`, eigenen `keydown`-Overlays) auf `main`
bei `89f6fb0`.

**Aufnahme:** `apps/desktop/e2e/audit.spec.ts` öffnet jeden Eintrag in der echten App (headless SolidCraft,
Test-Claude) und nimmt ihn hell und dunkel auf: Deutsch 960×600 (`de-narrow`) und 1440×900 (`de-wide`),
Englisch 960×600 (`en-narrow`), dazu Windows-Skalierung 125/150 %, Kontrastdesign, Interface-Größe 90/125 %
und die Offline-Zustände. Je Zustand laufen axe (WCAG 2.2 AA), Konsolen-Mitschnitt und eine Prüfung auf
abgeschnittene Texte; das App-Log wird je Lauf gesichert. Bilder und Berichte:
`%USERPROFILE%\.partbuddy\audit-2026-11-09\<lauf>\` (nicht im Repo, ~400 Bilder).

```
PARTBUDDY_AUDIT=<ordner> PARTBUDDY_E2E_SOLIDCRAFT=1 pnpm --filter @partbuddy/desktop exec playwright test e2e/audit.spec.ts
```

**Spalten:** *Öffnen* = Klick (K), Rechtsklick (R), Doppelklick (D), Taste (T), Hover (H), automatisch (A).
*Galerie* = Baustein steht in `?gallery`. *Inv.* = in `e2e/inventory.spec.ts` (Echt-Claude-Lauf).
*Audit* = Ergebnis in Runde 2: ✓ = jeder Schritt hell+dunkel in 960×600, 1440×900, 1920×1032 (Deutsch) und 960×600 (Englisch) aufgenommen; ◐ = nur ein Teil der Schritte oder Läufe; ✗ = nicht erreicht bzw. noch kein Schritt.

| Bereich | Oberfläche | Datei | Öffnen | Zustände | Galerie | Inv. | Audit-Schritte | Audit |
|---|---|---|---|---|---|---|---|---|
| Start | Startseite (leer, Vorlagen) | `home/HomePage.tsx` | A / K Logo | leer, Projekte, Suche, kein Treffer | – | – | home-empty, home-projects, home-search, home-no-match, home-scrolled | ✓ |
| Start | Sortierung (Select) | `home/HomePage.tsx` | K | offen, gewählt | ja | – | home-sort | ✓ |
| Start | Kachel-Menü | `home/HomePage.tsx` | K ⋯ (Hover) | offen, deaktiviert (offenes Projekt) | – | – | home-tile-hover, home-tile-menu | ✓ |
| Start | Schlagwörter-Dialog | `home/TagsDialog.tsx` | K Menü | leer, gefüllt | – | – | home-tags-dialog | ✓ |
| Start | Papierkorb | `home/TrashSection.tsx` | K | leer, Einträge, Leeren-Bestätigung | – | – | home-trash | ✓ |
| Start | Erststart (4 Schritte) | `shell/FirstStart.tsx` | A | Schritt 1–4, SolidCraft fehlt | – | – | first-start-1, first-start-2, first-start-3, first-start-4 | ✓ |
| Titelleiste | Projektmenü | `shell/ProjectMenu.tsx` | K / Strg+… | offen, deaktiviert | – | – | project-menu | ✓ |
| Titelleiste | Umbenennen-Dialog | `shell/ProjectMenu.tsx` | K Menü / F2 | leer, ungültig | – | – | project-rename-invalid | ✓ |
| Titelleiste | Papierkorb-Bestätigung | `shell/ProjectMenu.tsx` | K Menü | alertdialog | – | – | project-trash-dialog | ✓ |
| Titelleiste | Export-Menü | `shell/DesignActions.tsx` | K | Formate, Slicer, Teilen | – | ja | export-menu | ✓ |
| Titelleiste | Export-Bestätigung | `print/ExportConfirm.tsx` | K Export bei Befunden | alertdialog | – | – | – | ✗ kein Schritt |
| Titelleiste | Versionen-Dialog | `shell/VersionsDialog.tsx` | K | leer, Einträge, Umbenennen, Wiederherstellen | – | – | versions-empty, versions-one, versions-restore-confirm | ✓ |
| Titelleiste | Verbindungsstatus/Speicherstand | `shell/TitleBar.tsx` | A / H | verbunden, fehlt, getrennt | – | – | save-state, connection-tooltip, home-no-solidcraft | ◐ 3/3 |
| Titelleiste | Tooltips der Titelleiste | `ui/Tooltip.tsx` | H / Fokus | mit Kürzel | ja | – | tooltip-home-button, tooltip-home-new | ✓ |
| Einstellungen | Einstellungen (6 Bereiche) | `shell/SettingsDialog.tsx` | K / Strg+, | je Bereich | – | – | settings-general, settings-solidcraft, settings-assistant, settings-print, settings-shortcuts, settings-about | ✓ |
| Einstellungen | Suche in Einstellungen | `shell/SettingsDialog.tsx` | Tippen | Treffer, leer | – | – | settings-search, settings-search-empty | ✓ |
| Einstellungen | Zurücksetzen-Bestätigung (Popover) | `shell/SettingsDialog.tsx` | K | offen | – | – | settings-reset-confirm | ✓ |
| Einstellungen | Auswahllisten (Choice/Select) | `ui/Choice.tsx` | K | offen | ja | – | home-sort | ✓ |
| Einstellungen | SolidCraft-Programm | `shell/EnginePanel.tsx` | A | gefunden, fehlt, Neustart nötig | – | – | settings-solidcraft, settings-solidcraft-missing | ◐ 2/2 |
| Druck | Material-Menü | `print/MaterialMenu.tsx` | K Statusleiste | offen | – | – | material-menu | ✓ |
| Druck | Druckprofile (Tabs) | `print/PrintProfilesEditor.tsx` | K Menü | Drucker, Material, Fehler | – | – | print-profiles-printer, print-profiles-material | ✓ |
| Druck | Katalog-Auswahl | `print/CatalogPicker.tsx` | K | Liste, Suche | – | – | print-catalog | ✗ |
| Druck | Toleranz-Assistent | `print/ToleranceAssistant.tsx` | K | Schritte, Fehler | – | – | tolerance-assistant | ✓ |
| Druck | Druckprüfung | `print/PrintCheckChip.tsx` | K Statusleiste | ok, Befunde | – | – | print-check | ✓ |
| 3D-Ansicht | Ansicht leer / Arbeitsbereich | `viewer/Viewer.tsx` | A | leer, Teil | – | – | work | ✓ |
| 3D-Ansicht | Darstellungs-Menü | `viewer/ViewTools.tsx` | K | offen | – | – | display-menu | ✓ |
| 3D-Ansicht | Werkzeug-Tooltips | `viewer/ViewTools.tsx` | H / Fokus | mit Kürzel | – | – | view-tools-tooltip | ✓ |
| 3D-Ansicht | Ortho/Perspektive | `viewer/ViewTools.tsx` | K / T 5 | an/aus | – | ja | view-ortho | ✓ |
| 3D-Ansicht | Schnitt-Panel | `viewer/ViewTools.tsx` | K | offen | – | – | section-panel | ✓ |
| 3D-Ansicht | Explosions-Panel | `viewer/ViewTools.tsx` | K | offen, gezogen | – | – | explode-panel | ✓ |
| 3D-Ansicht | Montage-Spieler | `viewer/AssemblyPlayer.tsx` | K | Schritte | – | – | assembly-panel | ✓ |
| 3D-Ansicht | Druckplatte | `viewer/PlateBar.tsx` | K | eine/mehrere Platten, passt nicht | – | – | plate | ✓ |
| 3D-Ansicht | Maße | `viewer/Dimensions.tsx` | K / T M | Auswahl, alle, bearbeiten | – | ja | dimensions, dimensions-all, dimension-edit | ◐ 3/3 |
| 3D-Ansicht | Auswahl-HUD (Dock) | `viewer/DimensionHud.tsx` | K Fläche/Kante | Fläche, Kante, Hinweis, eingeklappt | – | ja | dock-hint, face-selected, edge-selected, dimension-preview | ✓ |
| 3D-Ansicht | Aktionen der Auswahl | `viewer/SelectionActions.tsx` | K | Liste, Feld, Fehler | – | ja | hud-actions, action-extrude | ✓ |
| 3D-Ansicht | Funktionsbausteine | `viewer/BlockPanel.tsx` | K Aktion | Kacheln, Formular, Fehler | – | – | block-panel, block-screw-hole | ✓ |
| 3D-Ansicht | Schrift-Auswahl (ComboBox) | `viewer/FontChoice.tsx` | K / Tippen | offen, gefiltert | – | – | block-text-font | ✓ |
| 3D-Ansicht | Logo/Text-Panel | `viewer/LogoPanel.tsx` | K Logo | Formular | – | – | – | ✗ kein Schritt |
| 3D-Ansicht | Normteil-Panel | `viewer/PartPanel.tsx` | K Aktion | Formular | – | – | part-panel | ✗ |
| 3D-Ansicht | Druckfläche-Knopf | `viewer/PrintFaceButton.tsx` | K Fläche | Tooltip | – | – | – | ✗ kein Schritt |
| 3D-Ansicht | ViewCube | `viewer/ViewCube.tsx` | H / K | Hover, Fokus | – | – | viewcube-hover | ✓ |
| 3D-Ansicht | Bau-Status / Live-Leiste | `viewer/BuildStatus.tsx` | A | arbeitet, Schritt | – | – | chat-streaming | ✓ |
| 3D-Ansicht | Verbindungshinweis | `viewer/ConnectionNotice.tsx` | A | fehlt, verloren | – | ja | home-no-solidcraft | ✓ |
| Notizen | Notiz anlegen (HUD) | `viewer/DimensionHud.tsx` | Tippen | Text | – | ja | note-composer | ✓ |
| Notizen | Notiz-Pin und Karte | `notes/NotePins.tsx` | K Pin | offen, bearbeiten | – | ja | note-pin, note-card | ✓ |
| Notizen | Notizen im Baum | `notes/NotesSection.tsx` | K | leer, Einträge, wiederherstellbar | – | – | notes-section | ✓ |
| Struktur | Baum-Kontextmenü | `shell/Tree.tsx` | R / Shift+F10 | offen | – | – | tree-context-menu | ✓ |
| Struktur | Umbenennen im Baum | `shell/Tree.tsx` | D / F2 | Feld | – | – | tree-rename | ✓ |
| Struktur | Teil-Details | `shell/PartDetails.tsx` | K | eingeklappt, offen | – | – | part-details | ✓ |
| Parameter | Parameter bearbeiten | `shell/ParametersSection.tsx` | D | Feld, Schieber, ungültig | – | – | parameter-edit, parameter-invalid | ✓ |
| Zeitleiste | Schritt-Tooltip | `shell/Timeline.tsx` | H | ok, Warnung, Fehler | – | – | timeline-tooltip | ✓ |
| Zeitleiste | Schritt-Menü | `shell/Timeline.tsx` | K | offen | – | ja | timeline-menu, timeline-rolled-back | ✓ |
| Assistent | Modell-Chip (Popover) | `assistant/AgentChip.tsx` | K | Claude, ChatGPT, lokal, abgemeldet | – | ja | agent-menu, agent-menu-chatgpt | ◐ 1/2 |
| Assistent | Chat leer, Beispiele | `assistant/AssistantPanel.tsx` | A | leer | – | – | chat-empty | ✓ |
| Assistent | Antwort streamt / arbeitet | `assistant/AssistantPanel.tsx` | A | streamt, fertig, lang | – | ja | chat-streaming, chat-answer, chat-long-answer | ✓ |
| Assistent | Rückfragen-Karte | `assistant/QuestionCard.tsx` | A | offen, beantwortet | – | ja | question-card, question-answered | ✓ |
| Assistent | Plankarte | `assistant/QuestionCard.tsx` | A | offen, gebaut | – | ja | plan-card, plan-built | ✓ |
| Assistent | Fehlgeschlagene Antwort | `assistant/AssistantPanel.tsx` | A | Fehler, abgemeldet | – | – | chat-failed | ✓ |
| Assistent | Arbeitsprotokoll (Fold) | `assistant/WorkGroup.tsx` | K | zu, offen | – | – | chat-work-log | ✓ |
| Assistent | Nachrichten-Aktionen | `assistant/MessageActions.tsx` | H | Kopieren | – | – | chat-message-actions | ✓ |
| Assistent | Zum Ende springen | `assistant/AssistantPanel.tsx` | A Scrollen | sichtbar | – | – | chat-scrolled-up | ✓ |
| Assistent | Skizze (Modal) | `assistant/SketchPad.tsx` | K | leer, gezeichnet, Bemaßung, Foto | – | – | sketch-pad, sketch-drawn, sketch-photo | ✓ |
| Assistent | Skizzen-Ablage-Menü | `assistant/SketchPad.tsx` | K | offen | – | – | sketch-kept-menu | ✓ |
| Assistent | Foto anhängen / groß | `assistant/AssistantPanel.tsx` | K | Vorschau, groß | – | – | composer-photo, photo-large | ✓ |
| Assistent | SVG-Zeichnung im Composer | `assistant/AssistantPanel.tsx` | Ablegen | Maße, Fehler | – | – | – | ✗ kein Schritt |
| Assistent | Composer-Tooltips | `assistant/AssistantPanel.tsx` | H |  | – | – | tooltip-composer-sketch | ✓ |
| Assistent | Offline/abgemeldet | `assistant/AssistantPanel.tsx` | A | offline, Hinweis | – | ja | composer-offline | ✗ |
| Übergreifend | Datei ablegen | `shell/FileDrop.tsx` | Ziehen | aktiv | – | – | file-drop | ✓ |
| Übergreifend | Hinweis in der Statusleiste | `shell/StatusBar.tsx` | A | Erfolg, Fehler | – | – | – | ✗ kein Schritt |
| Übergreifend | Chat-Breite ziehen | `shell/ChatResizer.tsx` | Ziehen / Pfeile | aktiv | – | – | – | ✗ kein Schritt |
| Übergreifend | Kontrastdesign | `—` | — | forced-colors | – | – | forced-colors-work | ✓ |
| Übergreifend | Interface-Größe | `—` | — | 90 %, 125 % | – | – | zoom-0.9, zoom-1.25 | ✓ |

## Abdeckung und Lücken

59 von 72 Oberflächen sind vollständig aufgenommen (je Oberfläche 8 Bilder plus axe in Hell und Dunkel). Offen:

- **Ohne Aufnahme-Schritt:** Export-Bestätigung (braucht Druckbefunde), Logo/Text-Panel (braucht eine SVG), Druckfläche-Knopf, SVG-Zeichnung im Composer, Hinweis in der Statusleiste, Chat-Breite ziehen.
- **Schritt erreicht den Zustand nicht:** Katalog-Auswahl (Auslöser `printers-add`, erst nach Runde 2 korrigiert), Normteil-Panel (das Skript trifft keine Bohrung), Maß bearbeiten bei 960 px, Modell-Chip offline (ohne Projekt gibt es kein Assistenten-Panel).
- **Galerie/inventory.spec:** Die Galerie zeigt die Bausteine (Menü, Popover, Dialog, Tooltip, Select), nicht die konkreten Oberflächen. `inventory.spec.ts` deckt 16 Oberflächen mit echtem Claude ab. Neu ist `audit.spec.ts` (alle Oberflächen, Test-Claude) mit `e2e/surfaces.ts` als Liste.
- **Schutz für neue Overlays:** `test/surfaces.test.ts` schlägt fehl, sobald eine Renderer-Datei ein Menü, Popover, einen Dialog, Tooltip, Select, eine ComboBox oder ein Kontextmenü öffnet und nicht in `e2e/surfaces.ts` steht.

Diese Lücken schließt in Phase 2 jeweils der PR des Bereichs mit einem eigenen Aufnahme-Schritt.
