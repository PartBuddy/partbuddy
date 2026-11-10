/**
 * Every surface of the app that opens: menus, popovers, dialogs, tooltips, lists, cards, notices
 * and drop zones (UI audit 2026-11-09). `step` is the picture in `audit.spec.ts`; the unit test
 * `test/surfaces.test.ts` fails when a renderer file opens an overlay that is not listed here.
 */
export interface Surface {
  area: string;
  name: string;
  file: string;
  /** K click, R right click, D double click, T key, H hover, A on its own. */
  open: string;
  states: string;
  /** Picture name(s) in audit.spec.ts. */
  steps: string[];
  gallery?: boolean;
  inventory?: boolean;
}

export const SURFACES: Surface[] = [
  // Startseite und Projektverwaltung
  { area: 'Start', name: 'Startseite (leer, Vorlagen)', file: 'home/HomePage.tsx', open: 'A / K Logo', states: 'leer, Projekte, Suche, kein Treffer', steps: ['home-empty', 'home-projects', 'home-search', 'home-no-match', 'home-scrolled'] },
  { area: 'Start', name: 'Sortierung (Select)', file: 'home/HomePage.tsx', open: 'K', states: 'offen, gewählt', steps: ['home-sort'], gallery: true },
  { area: 'Start', name: 'Kachel-Menü', file: 'home/HomePage.tsx', open: 'K ⋯ (Hover)', states: 'offen, deaktiviert (offenes Projekt)', steps: ['home-tile-hover', 'home-tile-menu'] },
  { area: 'Start', name: 'Schlagwörter-Dialog', file: 'home/TagsDialog.tsx', open: 'K Menü', states: 'leer, gefüllt', steps: ['home-tags-dialog'] },
  { area: 'Start', name: 'Papierkorb', file: 'home/TrashSection.tsx', open: 'K', states: 'leer, Einträge, Leeren-Bestätigung', steps: ['home-trash'] },
  { area: 'Start', name: 'Erststart (4 Schritte)', file: 'shell/FirstStart.tsx', open: 'A', states: 'Schritt 1–4, SolidCraft fehlt', steps: ['first-start-1', 'first-start-2', 'first-start-3', 'first-start-4'] },
  // Titelleiste und Menüs
  { area: 'Titelleiste', name: 'Projektmenü', file: 'shell/ProjectMenu.tsx', open: 'K / Strg+…', states: 'offen, deaktiviert', steps: ['project-menu'] },
  { area: 'Titelleiste', name: 'Umbenennen-Dialog', file: 'shell/ProjectMenu.tsx', open: 'K Menü / F2', states: 'leer, ungültig', steps: ['project-rename-invalid'] },
  { area: 'Titelleiste', name: 'Papierkorb-Bestätigung', file: 'shell/ProjectMenu.tsx', open: 'K Menü', states: 'alertdialog', steps: ['project-trash-dialog'] },
  { area: 'Titelleiste', name: 'Export-Menü', file: 'shell/DesignActions.tsx', open: 'K', states: 'Formate, Slicer, Teilen', steps: ['export-menu'], inventory: true },
  { area: 'Titelleiste', name: 'Export-Bestätigung', file: 'print/ExportConfirm.tsx', open: 'K Export bei Befunden', states: 'alertdialog', steps: [] },
  { area: 'Titelleiste', name: 'Versionen-Dialog', file: 'shell/VersionsDialog.tsx', open: 'K', states: 'leer, Einträge, Umbenennen, Wiederherstellen', steps: ['versions-empty', 'versions-one', 'versions-restore-confirm'] },
  { area: 'Titelleiste', name: 'Verbindungsstatus/Speicherstand', file: 'shell/TitleBar.tsx', open: 'A / H', states: 'verbunden, fehlt, getrennt', steps: ['save-state', 'connection-tooltip', 'home-no-solidcraft'] },
  { area: 'Titelleiste', name: 'Tooltips der Titelleiste', file: 'ui/Tooltip.tsx', open: 'H / Fokus', states: 'mit Kürzel', steps: ['tooltip-home-button', 'tooltip-home-new'], gallery: true },
  // Einstellungen
  { area: 'Einstellungen', name: 'Einstellungen (6 Bereiche)', file: 'shell/SettingsDialog.tsx', open: 'K / Strg+,', states: 'je Bereich', steps: ['settings-general', 'settings-solidcraft', 'settings-assistant', 'settings-print', 'settings-shortcuts', 'settings-about'] },
  { area: 'Einstellungen', name: 'Suche in Einstellungen', file: 'shell/SettingsDialog.tsx', open: 'Tippen', states: 'Treffer, leer', steps: ['settings-search', 'settings-search-empty'] },
  { area: 'Einstellungen', name: 'Zurücksetzen-Bestätigung (Popover)', file: 'shell/SettingsDialog.tsx', open: 'K', states: 'offen', steps: ['settings-reset-confirm'] },
  { area: 'Einstellungen', name: 'Auswahllisten (Choice/Select)', file: 'ui/Choice.tsx', open: 'K', states: 'offen', steps: ['home-sort'], gallery: true },
  { area: 'Einstellungen', name: 'SolidCraft-Programm', file: 'shell/EnginePanel.tsx', open: 'A', states: 'gefunden, fehlt, Neustart nötig', steps: ['settings-solidcraft', 'settings-solidcraft-missing'] },
  // Druck
  { area: 'Druck', name: 'Material-Menü', file: 'print/MaterialMenu.tsx', open: 'K Statusleiste', states: 'offen', steps: ['material-menu'] },
  { area: 'Druck', name: 'Druckprofile (Tabs)', file: 'print/PrintProfilesEditor.tsx', open: 'K Menü', states: 'Drucker, Material, Fehler', steps: ['print-profiles-printer', 'print-profiles-material'] },
  { area: 'Druck', name: 'Katalog-Auswahl', file: 'print/CatalogPicker.tsx', open: 'K', states: 'Liste, Suche', steps: ['print-catalog'] },
  { area: 'Druck', name: 'Toleranz-Assistent', file: 'print/ToleranceAssistant.tsx', open: 'K', states: 'Schritte, Fehler', steps: ['tolerance-assistant'] },
  { area: 'Druck', name: 'Druckprüfung', file: 'print/PrintCheckChip.tsx', open: 'K Statusleiste', states: 'ok, Befunde', steps: ['print-check'] },
  // 3D-Ansicht
  { area: '3D-Ansicht', name: 'Ansicht leer / Arbeitsbereich', file: 'viewer/Viewer.tsx', open: 'A', states: 'leer, Teil', steps: ['work'] },
  { area: '3D-Ansicht', name: 'Darstellungs-Menü', file: 'viewer/ViewTools.tsx', open: 'K', states: 'offen', steps: ['display-menu'] },
  { area: '3D-Ansicht', name: 'Werkzeug-Tooltips', file: 'viewer/ViewTools.tsx', open: 'H / Fokus', states: 'mit Kürzel', steps: ['view-tools-tooltip'] },
  { area: '3D-Ansicht', name: 'Ortho/Perspektive', file: 'viewer/ViewTools.tsx', open: 'K / T 5', states: 'an/aus', steps: ['view-ortho'], inventory: true },
  { area: '3D-Ansicht', name: 'Schnitt-Panel', file: 'viewer/ViewTools.tsx', open: 'K', states: 'offen', steps: ['section-panel'] },
  { area: '3D-Ansicht', name: 'Explosions-Panel', file: 'viewer/ViewTools.tsx', open: 'K', states: 'offen, gezogen', steps: ['explode-panel'] },
  // No picture in audit.spec.ts yet: its fixtures have no joint. The flows in app.spec.ts take the pictures (joint-playing, joint-paused, joint-stopped).
  { area: '3D-Ansicht', name: 'Bewegliche Teile (Panel, Tooltips)', file: 'viewer/JointPanel.tsx', open: 'K', states: 'Regler, spielt, angehalten, Anschlag, Aufnahme', steps: [] },
  { area: '3D-Ansicht', name: 'Montage-Spieler', file: 'viewer/AssemblyPlayer.tsx', open: 'K', states: 'Schritte', steps: ['assembly-panel'] },
  { area: '3D-Ansicht', name: 'Druckplatte', file: 'viewer/PlateBar.tsx', open: 'K', states: 'eine/mehrere Platten, passt nicht', steps: ['plate'] },
  { area: '3D-Ansicht', name: 'Maße', file: 'viewer/Dimensions.tsx', open: 'K / T M', states: 'Auswahl, alle, bearbeiten', steps: ['dimensions', 'dimensions-all', 'dimension-edit'], inventory: true },
  { area: '3D-Ansicht', name: 'Auswahl-HUD (Dock)', file: 'viewer/DimensionHud.tsx', open: 'K Fläche/Kante', states: 'Fläche, Kante, Hinweis, eingeklappt', steps: ['dock-hint', 'face-selected', 'edge-selected', 'dimension-preview'], inventory: true },
  { area: '3D-Ansicht', name: 'Aktionen der Auswahl', file: 'viewer/SelectionActions.tsx', open: 'K', states: 'Liste, Feld, Fehler', steps: ['hud-actions', 'action-extrude'], inventory: true },
  { area: '3D-Ansicht', name: 'Funktionsbausteine', file: 'viewer/BlockPanel.tsx', open: 'K Aktion', states: 'Kacheln, Formular, Fehler', steps: ['block-panel', 'block-screw-hole'] },
  { area: '3D-Ansicht', name: 'Schrift-Auswahl (ComboBox)', file: 'viewer/FontChoice.tsx', open: 'K / Tippen', states: 'offen, gefiltert', steps: ['block-text-font'] },
  { area: '3D-Ansicht', name: 'Logo/Text-Panel', file: 'viewer/LogoPanel.tsx', open: 'K Logo', states: 'Formular', steps: [] },
  { area: '3D-Ansicht', name: 'Normteil-Panel', file: 'viewer/PartPanel.tsx', open: 'K Aktion', states: 'Formular', steps: ['part-panel'] },
  { area: '3D-Ansicht', name: 'Druckfläche-Knopf', file: 'viewer/PrintFaceButton.tsx', open: 'K Fläche', states: 'Tooltip', steps: [] },
  { area: '3D-Ansicht', name: 'ViewCube', file: 'viewer/ViewCube.tsx', open: 'H / K', states: 'Hover, Fokus', steps: ['viewcube-hover'] },
  { area: '3D-Ansicht', name: 'Bau-Status / Live-Leiste', file: 'viewer/BuildStatus.tsx', open: 'A', states: 'arbeitet, Schritt', steps: ['chat-streaming'] },
  { area: '3D-Ansicht', name: 'Verbindungshinweis', file: 'viewer/ConnectionNotice.tsx', open: 'A', states: 'fehlt, verloren', steps: ['home-no-solidcraft'], inventory: true },
  // Notizen
  { area: 'Notizen', name: 'Notiz anlegen (HUD)', file: 'viewer/DimensionHud.tsx', open: 'Tippen', states: 'Text', steps: ['note-composer'], inventory: true },
  { area: 'Notizen', name: 'Notiz-Pin und Karte', file: 'notes/NotePins.tsx', open: 'K Pin', states: 'offen, bearbeiten', steps: ['note-pin', 'note-card'], inventory: true },
  { area: 'Notizen', name: 'Notizen im Baum', file: 'notes/NotesSection.tsx', open: 'K', states: 'leer, Einträge, wiederherstellbar', steps: ['notes-section'] },
  // Struktur, Parameter, Zeitleiste
  { area: 'Struktur', name: 'Baum-Kontextmenü', file: 'shell/Tree.tsx', open: 'R / Shift+F10', states: 'offen', steps: ['tree-context-menu'] },
  { area: 'Struktur', name: 'Umbenennen im Baum', file: 'shell/Tree.tsx', open: 'D / F2', states: 'Feld', steps: ['tree-rename'] },
  { area: 'Struktur', name: 'Teil-Details', file: 'shell/PartDetails.tsx', open: 'K', states: 'eingeklappt, offen', steps: ['part-details'] },
  { area: 'Parameter', name: 'Parameter bearbeiten', file: 'shell/ParametersSection.tsx', open: 'D', states: 'Feld, Schieber, ungültig', steps: ['parameter-edit', 'parameter-invalid'] },
  { area: 'Zeitleiste', name: 'Schritt-Tooltip', file: 'shell/Timeline.tsx', open: 'H', states: 'ok, Warnung, Fehler', steps: ['timeline-tooltip'] },
  { area: 'Zeitleiste', name: 'Schritt-Menü', file: 'shell/Timeline.tsx', open: 'K', states: 'offen', steps: ['timeline-menu', 'timeline-rolled-back'], inventory: true },
  // Assistent
  { area: 'Assistent', name: 'Modell-Chip (Popover)', file: 'assistant/AgentChip.tsx', open: 'K', states: 'Claude, ChatGPT, lokal, abgemeldet', steps: ['agent-menu', 'agent-menu-chatgpt'], inventory: true },
  { area: 'Assistent', name: 'Chat leer, Beispiele', file: 'assistant/AssistantPanel.tsx', open: 'A', states: 'leer', steps: ['chat-empty'] },
  { area: 'Assistent', name: 'Antwort streamt / arbeitet', file: 'assistant/AssistantPanel.tsx', open: 'A', states: 'streamt, fertig, lang', steps: ['chat-streaming', 'chat-answer', 'chat-long-answer'], inventory: true },
  { area: 'Assistent', name: 'Rückfragen-Karte', file: 'assistant/QuestionCard.tsx', open: 'A', states: 'offen, beantwortet', steps: ['question-card', 'question-answered'], inventory: true },
  { area: 'Assistent', name: 'Plankarte', file: 'assistant/QuestionCard.tsx', open: 'A', states: 'offen, gebaut', steps: ['plan-card', 'plan-built'], inventory: true },
  { area: 'Assistent', name: 'Fehlgeschlagene Antwort', file: 'assistant/AssistantPanel.tsx', open: 'A', states: 'Fehler, abgemeldet', steps: ['chat-failed'] },
  { area: 'Assistent', name: 'Arbeitsprotokoll (Fold)', file: 'assistant/WorkGroup.tsx', open: 'K', states: 'zu, offen', steps: ['chat-work-log'] },
  { area: 'Assistent', name: 'Nachrichten-Aktionen', file: 'assistant/MessageActions.tsx', open: 'H', states: 'Kopieren', steps: ['chat-message-actions'] },
  { area: 'Assistent', name: 'Zum Ende springen', file: 'assistant/AssistantPanel.tsx', open: 'A Scrollen', states: 'sichtbar', steps: ['chat-scrolled-up'] },
  { area: 'Assistent', name: 'Skizze (Modal)', file: 'assistant/SketchPad.tsx', open: 'K', states: 'leer, gezeichnet, Bemaßung, Foto', steps: ['sketch-pad', 'sketch-drawn', 'sketch-photo'] },
  { area: 'Assistent', name: 'Skizzen-Ablage-Menü', file: 'assistant/SketchPad.tsx', open: 'K', states: 'offen', steps: ['sketch-kept-menu'] },
  { area: 'Assistent', name: 'Foto anhängen / groß', file: 'assistant/AssistantPanel.tsx', open: 'K', states: 'Vorschau, groß', steps: ['composer-photo', 'photo-large'] },
  { area: 'Assistent', name: 'SVG-Zeichnung im Composer', file: 'assistant/AssistantPanel.tsx', open: 'Ablegen', states: 'Maße, Fehler', steps: [] },
  { area: 'Assistent', name: 'Composer-Tooltips', file: 'assistant/AssistantPanel.tsx', open: 'H', states: '', steps: ['tooltip-composer-sketch'] },
  { area: 'Assistent', name: 'Offline/abgemeldet', file: 'assistant/AssistantPanel.tsx', open: 'A', states: 'offline, Hinweis', steps: ['composer-offline'], inventory: true },
  // Übergreifend
  { area: 'Übergreifend', name: 'Datei ablegen', file: 'shell/FileDrop.tsx', open: 'Ziehen', states: 'aktiv', steps: ['file-drop'] },
  { area: 'Übergreifend', name: 'Hinweis in der Statusleiste', file: 'shell/StatusBar.tsx', open: 'A', states: 'Erfolg, Fehler', steps: [] },
  { area: 'Übergreifend', name: 'Chat-Breite ziehen', file: 'shell/ChatResizer.tsx', open: 'Ziehen / Pfeile', states: 'aktiv', steps: [] },
  { area: 'Übergreifend', name: 'Kontrastdesign', file: '—', open: '—', states: 'forced-colors', steps: ['forced-colors-work'] },
  { area: 'Übergreifend', name: 'Interface-Größe', file: '—', open: '—', states: '90 %, 125 %', steps: ['zoom-0.9', 'zoom-1.25'] },
];
