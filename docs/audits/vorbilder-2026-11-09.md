# Profi-Vorbilder je UI-Element (Stand 09.11.2026)

Nur belegte Angaben, gelesen am 09.11.2026. Wo kein Wert öffentlich ist: „nicht öffentlich beziffert“. Wo nichts Belastbares zu finden war: „kein Beleg gefunden“.

## 1. Motion-Tokens
- **Fluent 2 (Microsoft)**: Dauer-Tokens 50 / 100 / 150 / 200 / 250 / 300 / 400 / 500 ms (`durationUltraFast` bis `durationUltraSlow`). Kurven: `curveDecelerateMid` = cubic-bezier(0,0,0,1) fürs Hereinkommen, `curveAccelerateMid` = (1,0,1,1) fürs Hinausgehen, `curveEasyEase` = (0.33,0,0.67,1). Seitenwechsel („Top level“) laut Leitfaden als schnelles Überblenden statt Gleiten. – https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/durations.ts · …/curves.ts · https://fluent2.microsoft.design/motion
- **Material 3**: short1–4 = 50–200 ms, medium1–4 = 250–400 ms, long1–4 = 450–600 ms, extra-long 700–1000 ms. Kurven: standard (0.2,0,0,1), emphasized decelerate (0.05,0.7,0.1,1), emphasized accelerate (0.3,0,0.8,0.15). Fade-Übergang: 150 ms hinein, 75 ms hinaus. – https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md
- **IBM Carbon**: unterscheidet *productive* (Arbeitsfluss) und *expressive* (seltene, wichtige Momente). Standardkurve productive (0.2,0,0.38,0.9), expressive (0.4,0.14,0.3,1); Eintritt (0,0,0.38,0.9), Austritt (0.2,0,1,0.9). Dauern: fast-01 70 ms (Button), fast-02 110 ms (Fade), moderate-01 150 ms, moderate-02 240 ms (Toast/Ausklappen), slow-01 400 ms, slow-02 700 ms (Abdunkeln des Hintergrunds). Mikro-Interaktionen 90–120 ms mit ease-out. Seitenpanel, das in der Nähe bleibt, schließt mit Standard- statt Austrittskurve. – https://carbondesignsystem.com/elements/motion/overview/
- **Apple**: HIG verlangt knappe, präzise Rückmeldungs-Animation und keine Bewegung als einzigen Informationsträger. Zahlen gibt die HIG nicht an. SwiftUI-Standard seit iOS 17/macOS 14 ist eine Feder mit response 0.55 und dampingFraction 1.0 (kein Überschwingen). – https://developer.apple.com/design/human-interface-guidelines/motion · https://developer.apple.com/documentation/swiftui/animation/default
- **Federn für Panels, Motion (früher Framer Motion)**: Tween-Standard 0,3 s, Feder-Standard bounce 0.25. Mit `visualDuration` lässt sich eine Feder auf feste Zeiten abstimmen. – https://motion.dev/docs/react-transitions
- **Radix/Linear**: Radix liefert keine Motion-Tokens, sondern stellt nur Origin-CSS-Variablen und `data-side` bereit. Für Linear kein Beleg gefunden. – https://www.radix-ui.com/primitives/docs/components/tooltip

## 2. Tooltips
- **Radix Tooltip**: `delayDuration` 700 ms. Nach dem ersten Tooltip öffnen weitere sofort, solange zwischen zwei Tooltips weniger als `skipDelayDuration` 300 ms liegt. Öffnet bei Hover und Fokus, schließt bei Klick oder Esc. – https://www.radix-ui.com/primitives/docs/components/tooltip
- **Fluent UI v9**: `showDelay` 250 ms, `hideDelay` 250 ms. – https://cdn.jsdelivr.net/npm/@fluentui/react-tooltip/dist/index.d.ts
- **VS Code**: `workbench.hover.delay` = 500 ms unter Windows/Linux, 1500 ms unter macOS (laut Code-Kommentar entspricht das den nativen Hovers). Der Befehlsname samt Tastenkürzel steht direkt im Tooltip, etwa „Ctrl+,“. – https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/workbench.contribution.ts
- **Carbon**: kennt Icon-Tooltip, Definition-Tooltip und Toggletip (Klick statt Hover für interaktiven Inhalt). Verzögerung auf der Seite nicht beziffert. Figma und Linear: nicht öffentlich beziffert. – https://carbondesignsystem.com/components/tooltip/usage/

## 3. Kontextmenü im Baum, Umbenennen
- **Fusion (Timeline/Browser)**: Rechtsklick bietet Edit Feature, Rename, Suppress/Unsuppress, Create Group, Find in Browser und Create Selection Set. Doppelklick bearbeitet das Feature. Umbenennen: Rename → Name eingeben → Enter. – https://help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/ASM-USE-TIMELINE.htm
- **Fusion-Browser, F2**: F2 benennt ein Element im Browser um, langsamer Doppelklick ebenfalls. Belegt nur durch Tutorial und Forum, nicht durch die offizielle Hilfe. – https://forums.autodesk.com/t5/fusion-support-forum/unable-to-slow-double-click/m-p/8937513
- **Onshape Feature list**: Rechtsklick → Rename bearbeitet den Namen direkt in der Liste, ohne Dialog. Das Werkzeug-Icon bleibt neben dem Namen, damit der Feature-Typ erkennbar bleibt. F2 ist nicht dokumentiert. – https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm
- **Plasticity Outliner**: Umbenennen per Doppelklick oder F2, mehrere Objekte mit Shift. Rechtsklick auf Abschnitte und Gruppen öffnet Befehle wie Mark as Asset und Add to Isolation. – https://plasticity-document-revisions.vercel.app/plasticity-essentials/plasticity-interface/outliner

## 4. 3D-Viewport
- **Autodesk ViewCube**: 26 klickbare Bereiche. 6 Flächen führen in Normalansichten, Kanten in Halbansichten, Ecken in Dreiviertelansichten; zusätzlich lässt sich der Würfel ziehen. Der Würfel ist ohne Mauskontakt halbtransparent (Deckkraft einstellbar). Animierte Übergänge sind eine Option, etwa in Inventor und Navisworks. – https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-A90F5F1C-B338-4BDE-9D05-F26BFFE3B3A5.htm · https://help.autodesk.com/cloudhelp/2023/ENU/Navisworks/files/GUID-38D9A57C-87CC-4646-98A2-9565610C7B20.htm
- **Onshape View cube**: Würfel oben rechts. Seite → Normalansicht, Ecke → trimetrische Ansicht. Die Pfeile drehen um 15°, mit Shift um 90°, mit Ctrl um 5°; die Pfeiltasten auf der Tastatur genauso. Mit Alt gleitet die Kamera animiert zur nächsten Ansicht ohne Rollwinkel. – https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm
- **Kamera-Gleitdauer** bei Fusion, Onshape und Shapr3D: nicht öffentlich beziffert.
- **Vorauswahl beim Hover** (Preselection): kein offizieller Wert gefunden.
- **Schnittansicht, Fusion Section Analysis**: Schnittebene wählen, Ebene über die Griffe für Abstand und Winkel ausrichten oder Werte eintippen. Flip wechselt die Seite. Schnittfarbe „From Component“ oder frei wählbar, Schraffur abschaltbar. Das Ergebnis landet im Browser-Ordner „Analysis“. – https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-SECTION-ANALYSIS.htm
- **Messen, Onshape**: Ergebnis-Anzeige unten rechts, aufklappbar. Sie misst die aktuelle Auswahl laufend mit; zwischen zwei Elementen zeigt sie Mitte–Mitte, Minimum und Maximum. Die Einheiten richten sich nach dem Dokument. – https://cad.onshape.com/help/Content/View/measure_tool.htm
- **Explosionsansicht**: kein belastbarer Beleg mit Werten gefunden.

## 5. Zeitleiste und Feature-Historie
- **Fusion Timeline**: Steuerknöpfe Previous Step, Play, Next Step, Move to Beginning und Move to End bewegen den Timeline Marker. Features lassen sich per Ziehen umsortieren, aber nie vor ein Feature, von dem sie abhängen. Unterdrückte Features erscheinen gedimmt; Gruppen bekommen einen Plus-Knopf. – https://help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/ASM-USE-TIMELINE.htm
- **Onshape Rollback bar**: Die Leiste zieht man, oder man wählt sie aus und bewegt sie mit ↑/↓ um je einen Schritt. Rechtsklick auf ein Feature → „Roll to here“, auf die Leiste → „Roll to end“. Features unterhalb der Leiste gelten als vorübergehend unterdrückt. – https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm

## 6. Parameter
- **Fusion „Change Parameters“**: Tabelle, in der jede Zelle direkt bearbeitbar ist (Name, Expression, Unit, Comment). Favoriten per Stern stehen oben, neue Modellparameter landen automatisch dort. Filter für User- bzw. Favoriten-Parameter, Suchfeld, „Sort in Timeline Order“. Inline-Anlage im Eingabefeld eines Werkzeugs: `Breite=50`. Ein Klick schaltet zwischen Ausdruck und Wert um. Aufruf auch über die Werkzeugsuche (S). – https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-MODIFY-CHANGE-PARAMETERS.htm · https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-MODIFY-PARAMETERS.htm
- **Onshape Variables**: nicht geprüft.

## 7. Startseite und Projektverwaltung
- **Shapr3D**: Das Dashboard ist der Startbildschirm. Projekte lassen sich unter Windows nach Änderungsdatum oder Name sortieren, auf- oder absteigend. Eine Projektsuche fehlt; Nutzer fordern sie im Forum. – https://support.shapr3d.com/hc/en-us/articles/7873939944476 · https://discourse.shapr3d.com/t/lack-of-project-search-bar/28688
- **Onshape Documents**: Die Startseite nach dem Login hat Filter links, Suche, Rasteransicht mit Vorschaubildern als Standard und Listenansicht. Filter und Ansicht bleiben bis zur nächsten Änderung gespeichert. – https://cad.onshape.com/help/Content/Document/documents_page.htm
- **Figma**: Raster und Liste umschaltbar, Sortierung, Suche über Dateien, Projekte und Personen mit Ergebnis-Reitern. Die Listenansicht wurde 2025 nach Protest zurückgeholt. Dass die Sortierung nicht erhalten bleibt, ist eine bekannte Beschwerde. – https://help.figma.com/hc/en-us/articles/14381406380183 · https://forum.figma.com/report-a-problem-6/list-view-missing-from-new-file-browser-update-38952

## 8. Einstellungen
- **VS Code**: Aufruf mit Ctrl+,. Die Suchleiste filtert live, Filter stehen rechts daneben. Tabs für Benutzer und Arbeitsbereich, Inhaltsverzeichnis links, die JSON-Ansicht ist als Ausweg erreichbar. – https://code.visualstudio.com/docs/configure/settings
- **Linear, Raycast, Fluent Settings-Muster**: kein belastbarer Beleg gefunden.

## 9. KI-Assistent
- **Cursor Plan Mode**: Shift+Tab im Eingabefeld wechselt in den Modus; Cursor schlägt ihn bei komplexen Aufgaben auch selbst vor. Ablauf: Rückfragen, Recherche, ein Plan, den man bearbeiten kann, dann der Knopf „Build“. Pläne werden als Markdown gespeichert. – https://cursor.com/docs/agent/plan-mode.md · https://docs.cursor.com/agent/planning
- **Claude**: Der „Thinking“-Abschnitt ist eingeklappt und zeigt beim Aufklappen eine Zusammenfassung. – https://support.claude.com/en/articles/10574485
- **Onshape AI Advisor**: Panel links, Prompt-Feld unten, Antwort oben. Antworten tragen Quellen-Links; mehrere Zitate blättert man durch. Es beantwortet nur Fragen zu Onshape, nicht zum eigenen Modell. – https://cad.onshape.com/help/Content/Home/ai_advisor.htm
- **Modell-Chip, Anhänge, Linear Agent, ChatGPT Desktop, Figma AI**: kein offizieller Beleg geprüft.

## 10. Erststart
- **Shapr3D, Linear, Raycast**: kein offizieller Beleg gefunden.
- **Carbon**: empfiehlt für den Erststart Leerzustände mit Inline-Doku, Onboarding oder Startinhalt. – https://carbondesignsystem.com/patterns/empty-states-pattern/

## 11. Leer-, Lade-, Fehler- und Offline-Zustände
- **Carbon Empty states**: drei Typen. „No data“ beim ersten Start, „User action“ wie eine leere Suche, „Error management“. Aufbau: optionales Bild, Titel, Text, Hauptaktion oder Hinweis auf das Bedienelement. – https://carbondesignsystem.com/patterns/empty-states-pattern/
- **Carbon Loading**: Skeletons nur für Container- und Datenkomponenten beim ersten Laden, und „nur wenige Sekunden“. Kein Skeleton für Toasts, Menüs, Modals oder Buttons. Inline-Loading für eine einzelne Aktion; Vollbild-Overlay nur, wenn die App blockiert sein muss. – https://carbondesignsystem.com/patterns/loading-pattern/
- **NN/g**: 0,1 s wirkt sofort, bis 1 s bleibt der Gedankenfluss erhalten, ab 10 s verliert man die Aufmerksamkeit. Skeleton Screens laut NN/g nur für Ladevorgänge ganzer Seiten. – https://www.nngroup.com/articles/response-times-3-important-limits/ · https://www.nngroup.com/articles/skeleton-screens/
- **Linear Offline**: Offline-Modus als „Failsafe“; die Form der Anzeige ist nicht dokumentiert. – https://linear.app/docs/offline-mode

## 12. Toasts
- **Sonner**: Position unten rechts, Lebensdauer 4000 ms, maximal 3 sichtbar, Breite 356 px, Abstand 14 px, Randabstand 24 px, Tastenkürzel Alt+T springt in die Toasts. – https://github.com/emilkowalski/sonner/blob/main/src/index.tsx
- **Fluent UI v9 Toast**: `timeout` 3000 ms; `pauseOnHover` und `pauseOnWindowBlur` lassen sich zuschalten (Standard aus). Positionen top/bottom, jeweils -start/-end. Politeness wählbar: assertive oder polite. – https://cdn.jsdelivr.net/npm/@fluentui/react-toast/dist/index.d.ts
- **Carbon**: Toast-Bewegung mit moderate-02 = 240 ms (siehe 1).

## 13. Performance
- **RAIL (web.dev)**: auf Eingaben innerhalb von 100 ms reagieren. 60 fps heißt 16 ms pro Frame, davon rund 10 ms für die App. Ab 1000 ms verlieren Nutzer den Faden. – https://web.dev/articles/rail
- **INP**: gut ≤ 200 ms, verbesserungsbedürftig bis 500 ms, schlecht darüber. – https://web.dev/articles/inp
- **Electron**: Module bewusst laden, Code nicht zu früh ausführen, Haupt- und Renderer-Prozess nie blockieren, bündeln, `Menu.setApplicationMenu(null)` ohne Standardmenü, unnötige Polyfills und Netzwerkzugriffe vermeiden, messen. – https://www.electronjs.org/docs/latest/tutorial/performance
- **Startzeit-Ziel von VS Code**: nicht öffentlich beziffert.

## 14. Barrierefreiheit
- **WCAG 2.2, SC 2.5.8**: Klickziele mindestens 24×24 CSS-px. Ausnahme: kleinere Ziele, wenn ein 24-px-Kreis um jedes Ziel keinen Nachbarn schneidet. Die Stufe AAA (2.5.5) verlangt 44 px. – https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **APG Dialog**: Beim Schließen geht der Fokus an das auslösende Element zurück, außer es existiert nicht mehr. – https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- **APG Menu Button**: Enter und Space öffnen das Menü und setzen den Fokus auf den ersten Eintrag. – https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
- **Forced colors (Windows-Kontrastdesign, Chromium)**: `@media (forced-colors: active)` ersetzt `-ms-high-contrast`. Systemfarben wie `CanvasText`, `Canvas` und `ButtonText` verwenden; `forced-color-adjust: none` nur gezielt einsetzen, etwa für Farbmuster. – https://blogs.windows.com/msedgedev/2020/09/17/styling-for-windows-high-contrast-with-new-standards-for-forced-colors/
