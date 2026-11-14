# 09 – Gegenprüfung der Inventur (Präfix G)

Stand 12.11.2026, Zweig `docs/vollaudit-2026-11` (Commit e29171c). Nur gelesen, nichts gebaut, nichts ausgeführt außer
drei Lese-Skripten (Zeilenabgleich, siehe „Vorgehen“). Maßstab: [AUFTRAG.md](AUFTRAG.md), Abschnitt „Arbeitsweise“
(Gegenprüfer-Durchgang). Geprüft werden `01-inventur-werkzeuge.md` (W), `01-inventur-tabellen.md` (T) und
`01-inventur-druck-export-ui.md` (D).

Pfadkürzel: **A** = `apps/desktop/src/main/agents`, **S** = `apps/desktop/src/shared`, **M** = `apps/desktop/src/main`,
**G** = `packages/geometry/src`.

## Ergebnis in Kürze

- Vom Code aus gezählt: **1643 Codezeilen** mit Zahl, Schema-Feld (`z.…`) oder exportierter Konstante in 78 Dateien der
  sechs Ordner, dazu **114 IPC-Aktionen** und **9 Ereigniskanäle** (`S/channels.ts:5-133`).
- **876 dieser Zeilen** sind in einer der drei Prüflisten mit `Datei:Zeile` belegt, **767 nicht**. Von den 767 sind der
  größte Teil Indexrechnung ohne eigenen Wert (`i * 3`, `/ 2`, Vektorlänge 3) oder Zeilen, die eine Liste dem Sinn nach
  führt, ohne die Zeile zu nennen. **Übrig bleiben 62 fehlende Elemente** (Tabelle 1): 22 Zeilen IPC-Aktionen, 15 Zeilen
  SolidCraft-Anbindung, 4 Geometrie, 13 `shared`, 8 `agents`.
- **Kein IPC-Kanal steht mit seinem Namen in einer Prüfliste** (Textsuche nach allen 123 Kanalnamen und -schlüsseln:
  0 Treffer). 34 Kanäle sind der Sache nach erfasst (Export, Teilen, Messen, Blöcke, Profile …), 80 haben keine Zeile.
- Stichprobe: **472 Zeilen** gegen den Code gehalten (293 von Hand, 179 Katalogzeilen per Skript). **4 Abweichungen**,
  alle in der Liste, keine im Wert einer Fachtabelle (Tabelle 2).
- **10 eigene Befunde** (2 A, 5 B, 3 C), die in W, T und D nicht stehen.

## Vorgehen

1. `cover.js` (Scratchpad): liest jede `.ts`-Datei der sechs Ordner (ohne `*.test.ts`), markiert Zeilen mit Zahl,
   `z.…(`, `export const GROSS` oder `min/max…:` und prüft, ob eine der drei Listen die Zeile als `Datei:Zeile` oder
   Bereich nennt (Kürzel mT, bT, dT, mech, blk, con und `G/ M/ S/` aufgelöst).
2. Jede unbelegte Zeile gelesen und entschieden: fehlt (Tabelle 1), sinngemäß vorhanden, oder ohne eigenen Wert.
3. `catalog.js`: jede Katalogzeile T416–T594 gegen die zitierte Codezeile (Name, Zahl).
4. Für die Stichprobe und die eigenen Befunde vollständig gelesen: `S/mechanisms.ts`, `S/screwSizes.ts`,
   `S/channels.ts`, `G/printCheck.ts`, `M/solidcraft/actions.ts`, `engineVersion.ts`, `standardParts.ts`,
   `logoMove.ts`, `headless.ts`, `A/mechanismTool.ts:36-625`, `M/solidcraft/mirror.ts:20-324`,
   `S/contract.ts:1040-1289`. Übrige Dateien in den unten genannten Ausschnitten.

## 1 Fehlende Elemente

Spalten wie in den Prüflisten. „Test: n. g.“ = nicht nachgeschlagen (siehe „Nicht geprüft“).

### 1.1 IPC-Aktionen ohne Zeile (`S/channels.ts`, Schemata in `S/contract.ts`)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| F1 | `design:undo`, `design:redo` | S/channels.ts:67-68; S/contract.ts:1228-1229 | keine Parameter | nimmt einen SolidCraft-Schritt zurück / stellt ihn wieder her | Handler in M/index.ts (nicht gelesen) | n. g. | |
| F2 | `design:save-video` | S/channels.ts:70; S/contract.ts:666-668, 1231 | > 0 bis 64 MiB; `mp4`, `webm` | keine (Aufnahme der Gelenkbewegung) | zod | n. g. | |
| F3 | `design:open-in-solidcraft` | S/channels.ts:72; S/contract.ts:1233 | keine Parameter | öffnet den Entwurf im SolidCraft-Fenster; dort ist jede rohe Funktion frei | – | n. g. | |
| F4 | `design:visibility` | S/channels.ts:92; S/contract.ts:942-945, 1264 | ≤ 500 Körper, ≤ 2000 Skizzen, mindestens eines | ausgeblendete Körper werden weder geprüft noch exportiert (Folge in D120, D180; die Aktion selbst fehlt) | zod | n. g. | |
| F5 | `design:rename-body` | S/channels.ts:93; S/contract.ts:400, 1265 | Name 1–200 Zeichen | Körpername ist Schlüssel für Druckfläche (`printFacesSchema`, S/contract.ts:801), Normteil-Merkliste und Teileliste | zod; Folgen nicht gelesen | n. g. | |
| F6 | `design:slicers` | S/channels.ts:87; S/contract.ts:795; M/solidcraft/supervisor.ts:442-450 | ≤ 20 Slicer; Id ≤ 80, Name ≤ 120 Zeichen; 30 s | keine | zod + `slice` | n. g. | |
| F7 | `design:send-to-slicer`: Zeitlimit | M/solidcraft/supervisor.ts:465 | 2 min | – (D137 nennt die Aktion ohne Limit) | – | n. g. | |
| F8 | `design:print-faces` | S/channels.ts:104; S/contract.ts:801, 1251 | Körper → Flächenname ≤ 300 Zeichen | gemerkte Druckflächen für Prüfung und Plattenansicht | zod | n. g. | |
| F9 | `project:new`, `project:open`, `project:open-folder`, `project:info`, `project:list` | S/channels.ts:13-15, 20-21; S/contract.ts:232-286, 1174-1182 | Name 1–120; Ordner ≤ 1000 Zeichen; ≤ 500 Projekte; Vorschau ≤ 1 500 000 Zeichen PNG-Data-URL | ersetzt den offenen Entwurf | zod | n. g. | |
| F10 | `project:rename`, `project:duplicate`, `project:reveal`, `project:trash`, `project:set-meta` | S/channels.ts:16-19, 34; S/contract.ts:237-243, 1177-1180, 1195 | Gründe `empty`, `exists`, `noProject`, `busy`; Tags ≤ 100 × 200 (Anfrage) bzw. ≤ 20 × 40 (Liste, S/contract.ts:279) | keine | zod; zwei verschiedene Grenzen für Tags | n. g. | |
| F11 | `project:versions`, `project:save-version`, `project:restore-version`, `project:name-version`, `project:version-as-project` | S/channels.ts:25-27, 29-30; S/contract.ts:303-314, 1186-1191 | Id `v-[a-z0-9]{1,20}`; Label 1–200; ≤ 300 Versionen; Grund manual, export, assistant, restore | `restore-version` ersetzt den Entwurf durch einen älteren Stand | zod | n. g. | |
| F12 | `project:compare-version`: Antwort | S/contract.ts:417-427 | Status same, changed, moved, added, removed; ≤ 20 Bereiche; ≤ 500 Körper | Aussage „verschoben/geändert“ (D144–D146 führen nur die Schwellen) | zod | n. g. | |
| F13 | `project:trash-list`, `project:trash-restore`, `project:trash-empty` | S/channels.ts:31, 36-37; S/contract.ts:332-341 | Id `t-[a-z0-9]{1,20}`; ≤ 200 Einträge | keine; `trash-empty` löscht endgültig | zod | n. g. | |
| F14 | `project:parts`, `project:set-part` | S/channels.ts:32-33; S/contract.ts:317-327 | Stückzahl 1–999; gedruckt 0–999; Filament ≤ 80; Notiz ≤ 500 Zeichen | keine (Teileliste) | zod; „gedruckt ≤ Stückzahl“ wird nicht geprüft | n. g. | |
| F15 | `project:save-preview` | S/channels.ts:24; S/contract.ts:293-295 | Dokument-Id 1–200; PNG Base64 ≤ 1 400 000 Zeichen | keine | zod | n. g. | |
| F16 | `agent:send` | S/channels.ts:41; S/contract.ts:948-972 | Text 1–20 000; Auswahl 1–20; Skizze/Foto PNG ≤ 4 MiB mit Signatur; `MAX_PHOTOS` 4; Skizzenliste ≤ 8000; SVG ≤ 512 KiB, Breite > 0 bis 1000 mm, Name 1–200 | Eingang jedes Auftrags an den Assistenten | zod | n. g. | |
| F17 | `agent:status`, `agent:refresh`, `agent:stop`, `agent:sign-in`, `agent:sign-out`, `agent:select`, `agent:allow-api-billing`, `agent:choose-model`, `agent:research`, `agent:set-research` | S/channels.ts:39-40, 42-49; S/contract.ts:394, 492-537, 612 | Agent claude-code, chatgpt, local; Stufe 1–20 Zeichen; ≤ 12 Stufen; ≤ 30 Modelle | keine; `agent:stop` bricht einen laufenden Bau ab (Zwischenstand bleibt) | zod | n. g. | |
| F18 | `viewer:state` | S/channels.ts:50; S/contract.ts:438-483 | ≤ 20 Auswahlen; ≤ 500 Körper; ≤ 500 Skizzen; Fläche plane, cylinder, other | was `partbuddy_view` dem Assistenten sagt | zod | n. g. | |
| F19 | `notes:current`, `notes:add`, `notes:edit`, `notes:delete`, `notes:accept`, `notes:reattach`, `notes:restore`, `notes:dismiss` | S/channels.ts:106-113; S/contract.ts:984-1014 | Id `[a-z0-9]{6,16}`; Text 1–1000; ≤ 500 Notizen; ≤ 50 wiederherstellbar; Ziel ≤ 4010 Zeichen; Status attached, moved, ambiguous, orphaned | keine; Notizen gehen an den Assistenten | zod | n. g. | |
| F20 | `chat:load`, `chat:save`, `sketch:list`, `sketch:load`, `assembly:get` | S/channels.ts:100-103, 105; S/contract.ts:1024-1035, 1258-1263 | ≤ 400 Einträge; Nutzertext ≤ 20 000, Assistent ≤ 50 000, Fehler ≤ 2000 Zeichen; ≤ 50 Skizzen | keine | zod | n. g. | |
| F21 | `print:part`, `print:set-material`; `settings:*` (9 Kanäle), `updates:*` (4), `window:*` (3), `solidcraft:*` (5), `app:info`, `app:relaunch`, `mirror:current` | S/channels.ts:6-12, 38, 51-66, 116-117; S/contract.ts:40-67, 190-227, 344-390, 1119-1131 | Titelleiste 24–64 px; Reset-Bereiche general, solidcraft, assistant, print, all (S/contract.ts:376); Engine-Unterstützung recommended, supported, tooOld, unknown | `print:set-material` wechselt Überhanggrenze und Passungen des Teils; `solidcraft:choose-engine` wechselt die SolidCraft-Version (siehe G5) | zod | n. g. | |
| F22 | 9 Ereigniskanäle | S/channels.ts:123-133; S/contract.ts:1285 ff. | updates, solidcraft-status, mirror:revision, agent-status, agent:event, notes, print, assembly, print-faces | keine | zod | n. g. | |

### 1.2 SolidCraft-Anbindung (`M/solidcraft`), in D ausdrücklich „nicht gelesen“

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| F23 | `MINIMUM_VERSION` | M/solidcraft/engineVersion.ts:19 | 0.30.1 | älteste zugelassene SolidCraft-Version | `supportOf` Zeile 60-65; Ablehnung nur unter dem Minimum (M/solidcraft/engineChoice.ts:85) | n. g. | |
| F24 | `RECOMMENDED_VERSION` | M/solidcraft/engineVersion.ts:21 | 0.40.0-rc.4 | Version, gegen die entwickelt wird | nur Anzeige (`support`) | n. g. | |
| F25 | `readVersion` | M/solidcraft/engineVersion.ts:68-74 | 10 s, sonst „unbekannt“ | – | – | n. g. | |
| F26 | Headless-Start | M/solidcraft/headless.ts:70-82 | `mcp --headless --allow-path … [--in Datei]`; stderr verworfen | Schreibrechte von SolidCraft (Ordnerliste) | Argumente | n. g. | |
| F27 | Zeitlimits Headless | M/solidcraft/headless.ts:18-20 | 10 min je Aufruf, 30 s für `document.revision`, 3 s beim Schließen | ein Bau über 10 min bricht ab | – | n. g. | |
| F28 | Fehlertext der Engine | M/solidcraft/headless.ts:55, 165; M/solidcraft/actions.ts:79; A/mechanismTool.ts:80, 462; A/blockTool.ts:207, 236; A/drawingTool.ts:141 | gekürzt auf 500 / 300 / 200 Zeichen | was Nutzer und Assistent von SolidCrafts Ablehnung sehen | – | n. g. | |
| F29 | Steuerkanal | M/solidcraft/controlClient.ts:10, 68 | Zeile ≤ 16 MiB; 127.0.0.1; Verbindungsaufbau 3 s | – | – | n. g. | |
| F30 | Zustandsmaschine | M/solidcraft/machine.ts:76-77 | Abfrage alle 3 s; Wiederverbinden nach 2 s | – | – | n. g. | |
| F31 | Endpunkt-Suche | M/solidcraft/discovery.ts:56, 84 | Token ≥ 32 Hex-Zeichen; Port ≤ 65535 | – | – | n. g. | |
| F32 | Start und Sichern | M/solidcraft/supervisor.ts:355, 478, 986, 1121, 1261-1269 | CLI 10 min, Puffer 4 MiB; Autosave 1,5 s nach Änderung; Start 90 s; Beenden 5 s | Stand der gesicherten Datei hinkt bis 1,5 s nach | – | n. g. | |
| F33 | Spiegel: Textgrenzen | M/solidcraft/mirror.ts:27-57, 69, 93, 144 | Feature-Name 200, Art 80, Fehler/Warnung 500; Körpername 200; ≤ 500 Komponenten; ≤ 500 Normteile; Folgeindex 0–5 | Feature-Warnung wird nach 500 Zeichen abgeschnitten, bevor `printCheckNote` sie liest | `slice` | n. g. | |
| F34 | Spiegel: Zeitlimits | M/solidcraft/mirror.ts:89, 202, 262 | 60 s (Kopf, Metadaten), 10 min (Export-Stapel) | – | – | n. g. | |
| F35 | Normteil-Bibliothek | M/solidcraft/standardParts.ts:26-35, 73-79 | ≤ 100 Größen je Familie, Größe ≤ 40 Zeichen, ≤ 100 Längen; freier Name bis „(999)“, Basis ≤ 180 Zeichen | – | `slice` | n. g. | |
| F36 | Logo treffen und ändern | M/solidcraft/logoMove.ts:19, 41, 166, 188, 259, 265, 310 | `REACH_MM` 20 mm; Kasten ± 0,5 mm; Körperbox ± 1e-3; Faktor auf 1e-6; Tiefe auf 0,001 mm; Texthöhe-Rückfall 5 mm | welches Logo ein Klick meint; neue Tiefe ohne Blick auf die Wand | – (G8) | n. g. | |
| F37 | Maßmarken: Lage | M/solidcraft/dimensionMarks.ts:163-167, 271, 303; M/solidcraft/supervisor.ts:815 | Abstand max(2; 8 % der Größe), Größe ≥ 10; Loch 2 mm; max(2; 15 %); ≤ 60 Features | nur Anzeige | – | n. g. | |

### 1.3 Geometrie-Bibliothek (`G`)

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| F38 | `signatureScore`: Gewichte | G/noteAnchors.ts:161-171 | Flächenart 0,3; Radius 0,2; Flächeninhalt 0,3; Abstand 0,4; Reichweite max(10 mm; √Fläche) | welche Fläche eine Notiz nach einem Umbau wiederfindet (D65–D66 führen nur die Schwellen) | – | n. g. | |
| F39 | `Overhang` (Klassen) | G/overhang.ts:9 | Fine 0, Bed 1, Borderline 2, Support 3 | Kodierung je Eckpunkt | – | n. g. | |
| F40 | `SKETCH_STYLE`; Kreisschritt | G/sketch.ts:49, 222 | free 0, constrained 1, construction 2; Schritt 2·acos(1 − Toleranz/r), bei Toleranz ≥ r Viertelkreis | Anzeige der Skizzen | – | n. g. | |
| F41 | `testShapes.ts` (135 Zeilen) | G/testShapes.ts | Prüfkörper der Tests | Grundlage der Tests von `checkPrint` | – | – | |

### 1.4 `shared`

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| F42 | `faceTableSchema.units` | S/contract.ts:35 | Literal `mm` | einzige Stelle, an der eine Einheit geprüft wird (zu D58, D122) | zod | n. g. | |
| F43 | `faceInfoSchema` | S/contract.ts:18-29 | Index ≥ 0; Name ≥ 1 Zeichen; Fläche beliebig (auch negativ); Zylinder mit Radius beliebig | Flächentabelle des Spiegels | zod; keine Grenze für Fläche und Radius | n. g. | |
| F44 | Strukturgrenzen | S/contract.ts:106-168 | ≤ 5000 Features; ≤ 500 Körper; ≤ 2000 Skizzen; ≤ 200 Gelenke; ≤ 6 Werte; Farbe `#rrggbb` | ein Entwurf mit mehr Körpern scheitert an der Prüfung des Schemas | zod | n. g. | |
| F45 | Namen | S/contract.ts:397-404 | Körper 1–200; Fläche 1–2000; Kante 1–4010 Zeichen; `finite = z.number()` | Auswahl und Befundorte | zod | n. g. | |
| F46 | Maßmarke | S/contract.ts:717-738 | Label ≤ 80; Ausdruck ≤ 500; linear, radius, diameter, angle; mm, deg; Anfrage ≤ 50 Features oder `all` | Anzeige | zod (zu D167, siehe Tabelle 2) | n. g. | |
| F47 | Parametername | S/contract.ts:700, 714; M/solidcraft/dimensions.ts:58 | Buchstabe oder `_`, dann bis 99 Buchstaben/Ziffern/`_` | Parameter mit anderem Namen erscheinen nicht in der Liste (dimensions.ts:195) | Regex, doppelt geführt | n. g. | |
| F48 | Normteil-Bibliothek (Antwort) | S/contract.ts:782-788 | ≤ 20 Familien; ≤ 100 Größen; ≤ 100 Längen | – | zod | n. g. | |
| F49 | Prüfkörper-Bild | S/contract.ts:1281 | PNG-Data-URL ≤ 8 000 000 Zeichen | – | zod | n. g. | |
| F50 | `STEP_PHRASE_KEYS`, `MAX_STEP_PHRASES`, `MAX_PHRASES_PER_STEP` | S/stepPhrases.ts:11 ff., 100, 102; S/contract.ts:542-555 | Schlüsselliste; 6 Zeilen je Karte; 50 je Schritt; Werte ≤ 80 Zeichen | Arbeitsprotokoll: was dem Nutzer als „getan“ gezeigt wird | zod | n. g. | |
| F51 | Skizzenblätter | S/sketch.ts:31-33, 44-45 | vier Blätter free, front, top, side | Eingang für den Assistenten | zod | n. g. | |
| F52 | `uniqueLogoName`, `isLogoColourBody`, `planeAngle` | S/drawingPlacement.ts:37-48, 102-104 | „… 2“, „… 3“; Muster `<Name> <rrggbb> <n>[ (m)]`; Winkel auf 0,001° | ein Körper mit so gebautem Namen gilt als Farbteil und fällt aus der Abstandsmessung (D113) | Regex | n. g. | |
| F53 | Prüfkörper: Lage der Beschriftung | S/testPieces.ts:33, 43, 46, 51, 56, 61 | Loch 7 mm über der Schrift; Grundlinie 1,5 mm; Stift 12 mm neben dem Kamm; Platte 8 mm dahinter; Loch 8,5 mm über der Schrift | Abstand Gravur ↔ Loch am Prüfkörper | fest | n. g. | |
| F54 | Vorlagen: Hilfsmaße | S/templates.ts:57, 61, 116-117, 134, 136 | Gelenkachse 0,3 mm vor dem Ende des ersten Deckelauges; Wand 2,4; Schrauben bei 0,15 und 0,85 der Länge, 7 mm vom Rand; Senkung 4 mm hoch ab z = 3; Anschlag bei y = −12 | Lage von Gelenk und Löchern der Vorlagen | fest | n. g. | |

### 1.5 `agents`

| Nr | Funktion/Option/Parameter/Grenzwert | Datei:Zeile | Wert bzw. Bereich | Geometrische Wirkung | Durchsetzung im Code | Test | Status |
|---|---|---|---|---|---|---|---|
| F55 | Vektor-Schema | A/mechanismTool.ts:15; A/blockTool.ts:26; A/drawingTool.ts:10; A/assemblyTool.ts:13 | genau 3 Zahlen | jede Punkt- und Richtungsangabe | Schema; im Code `vec3` (endlich) | n. g. | |
| F56 | `LOOP_NOTICE` | A/loop.ts:44 | Text an den Nutzer | – | – | n. g. | |
| F57 | Eigene Schleife: Anzeige | A/loop.ts:109, 112 | Zusammenfassung 2000, Grund 500 Zeichen | – (W254 führt nur den Gate-Proxy) | – | n. g. | |
| F58 | `CLAUDE_RESEARCH_TOOLS`, `KEY_TITLE` | A/research.ts:16, 35 | WebSearch, WebFetch; Muster für unübersetzte Seitentitel | – | – | n. g. | |
| F59 | AgentService: Textgrenzen | A/agentService.ts:100, 192 | 500 Zeichen | – | – | n. g. | |
| F60 | Rundung der Antworten | A/mechanismTool.ts:282; A/drawingTool.ts:165 | 0,01 mm | Zahlen, die der Assistent liest | – | n. g. | |
| F61 | Standardnamen der Mechanismen | A/mechanismTool.ts:117, 131, 141, 177, 187, 197, 222, 229, 587 | Hinge, Guide, Closure, Peg, Latch, Snap hook, Thread, Screw, Dovetail | Name von Features, Skizzen und Gelenk; dient als Verweis (G3) | keine Eindeutigkeit | n. g. | |
| F62 | Schlüssellochantwort: Brücke und Überstand | A/blockTool.ts:134 | „roof is a bridge of <entry> mm“ (8–11 mm) | Aussage an den Assistenten | Text (T25 nennt die Zahl, W182 die Zeile 133) | n. g. | |

## 2 Stichprobe vorhandener Zeilen gegen den Code

Geprüft je Zeile: Wert bzw. Bereich an der zuerst zitierten Fundstelle und die Spalte „Durchsetzung“; weitere
Fundstellen derselben Zeile nicht in jedem Fall. 472 Zeilen, davon 4 mit Abweichung.

| Liste | Zeilen (Nr) | Gegen | Ergebnis |
|---|---|---|---|
| W | 1, 4, 7, 9, 10, 11, 15, 19, 22, 23, 24, 25, 27 | A/mechanismTool.ts:41-68; S/mechanisms.ts:59, 201, 308, 447, 550, 629, 712, 776 | stimmt (Enum 8 Arten; alle acht Fundstellen „zwei Körper“; `more` 40 / 20 / 20) |
| W | 28, 29, 31, 32, 34 | A/mechanismTool.ts:109, 122, 124, 141, 177, 187, 197, 221, 229 | stimmt |
| W | 35, 36, 37, 38, 41 | S/mechanisms.ts:44, 46, 63-70, 112, 121-143, 150, 157-173 | stimmt |
| W | 42, 43, 44, 46, 48 | A/mechanismTool.ts:378-433, 441-451, 488, 492 | stimmt (Stab Ø 0,1; −0,05; 0,2 mm; Düse·2·1,125) |
| W | 49, 50, 56, 57, 62, 64, 65 | S/mechanisms.ts:202, 204, 309, 310, 365-398 | stimmt (Rille 0,45 mm tief nachgerechnet: Radius 0,7 − 0,25) |
| W | 68, 74, 75, 77, 78, 83 | S/mechanisms.ts:424-443, 452-453, 482, 533, 535, 590-591 | stimmt |
| W | 92, 106, 110 | S/mechanisms.ts:652-660, 766, 769-772 | stimmt (Unterkante 12 − 1,5 − 0,2 = 10,3; 8,1 / 14,1 nachgerechnet) |
| W | 113, 115, 128, 129, 130, 132, 133, 135 | A/mechanismTool.ts:100-102, 326-348, 462; S/mechanisms.ts | stimmt (7 / 7 / 11 / 6 Meldungen nachgezählt) |
| W | **131** | A/mechanismTool.ts:144, 146, 148, 152, 155; S/mechanisms.ts:308-312 | **Abweichung:** in den zitierten Bereichen stehen 10 Meldungen (5 + 5), die Zeile nennt 9 |
| W | 137, 142, 144, 163, 176, 198, 200, 201 | A/blockTool.ts:19-24, 81-96, 108-109, 242-255; S/knob.ts:76-78 | stimmt (13 Bausteine; 5 Meldungen) |
| W | **242** | A/policy.ts:13-49 | **Abweichung:** 16 SolidCraft-Werkzeuge stimmt, `partbuddy_*` sind **10** (view, ask, plan, assembly, design_rules, move_drawing, place_drawing, mechanism, block, standard), die Zeile nennt 9 |
| W | 244, 255, 256, 279 | A/policy.ts:67-82; A/loop.ts:38, 41; A/research.ts:18, 21, 39, 49 | stimmt (14 Namen; 25; 3; 8 / 2000 / 300) |
| T | 1–44 | S/screwSizes.ts:7-57 | stimmt, jede Zahl einzeln; abgeleitete Senkmaße nachgerechnet |
| T | 48, 49, 50, 60, 63–66, 69–75, 95, 96 | S/blocks.ts:57-98, 155-173; S/contract.ts:804 | stimmt |
| T | 102, 107, 110, 127, 129, 143 | S/mechanisms.ts:66-68, 126, 159-166, 352, 363, 438-443 | stimmt (Flachstück 2·(√2 − 1,05)·r = 0,73 r; Fußfase 1,4) |
| T | 151–155, 160, 162, 170–172, 196 | S/mechanisms.ts:533-546, 574, 595, 625, 652-658, 769-772 | stimmt (Kopf/Fuß 0,4/2,6 · 0,8/3,2 · 1,0/4,0) |
| T | 199–211, 213–217, 222–229, 231–240 | S/knob.ts:21, 24, 73-78; S/magnet.ts:17, 42-45; S/wallMount.ts:20-30, 54-63 | stimmt (Mindestdicken 6,2 / 6,7 / 7,0 / 7,4 nachgerechnet) |
| T | 285–292, 294, 296–300 | S/tolerances.ts:8-10, 38-59; S/testPieces.ts:14-56 | stimmt |
| T | 304–312, 317 | S/designFit.ts:16-55 | stimmt |
| T | 318–324, 329, 330, 333–337 | S/contract.ts:364-365, 662, 679, 767-776, 791, 890-917, 1055-1074 | stimmt |
| T | 383–387 | S/sketch.ts:9-43 | stimmt |
| T | 416–594 (179 Zeilen) | S/materialCatalog.ts:27-43; S/printerCatalog.ts:19-95 | per Skript: 179 von 179 stimmen (Name, Zeile, Zahl); 17 Materialien und 77 Drucker im Code, jede Zeile zitiert |
| D | 5, 7–12, 15–19 | G/printCheck.ts:93-112, 179-188, 223-253, 346-350 | stimmt |
| D | 21–28, 30, 31, 33–35, 38, 40, 41 | G/printCheck.ts:261-337, 406-476 | stimmt |
| D | **29** | G/printCheck.ts:337 | Wert stimmt; **Abweichung:** die Zeile verweist auf „D51“, den es nicht gibt (letzter Befund ist D47; gemeint ist D47) |
| D | 42–45, 47, 48, 65, 66 | G/overhang.ts:19-76; G/noteAnchors.ts:48-51 | stimmt |
| D | 73, 81–86 | M/print/printProfiles.ts:50-60 | stimmt |
| D | 119, 120, 121, 125, 127, 131, 137, 138 | S/contract.ts:662; M/solidcraft/supervisor.ts:222-233, 302, 456-469, 486-488; M/solidcraft/headless.ts:199-206 | stimmt |
| D | 158–162, 166 | M/solidcraft/actions.ts:18-19; M/solidcraft/dimensions.ts:50-58, 188-209 | stimmt |
| D | **167** | S/contract.ts:735-738; M/solidcraft/supervisor.ts:815, 885 | **Abweichung:** die Zeile nennt „≤ 60 Features“ (supervisor.ts:815); das zitierte Schema lässt in der Anfrage nur 50 zu (contract.ts:736). 60 greift nur bei `all` |
| D | 170–175, 177–182 | S/contract.ts:776, 917-927; M/solidcraft/actions.ts:195-196, 221; M/solidcraft/standardParts.ts:8-65; M/solidcraft/mirror.ts:155-189, 205, 268-278 | stimmt (12 Familiennamen, 8 Familien; 200 Gelenke, 6 Werte) |

Offene Punkte der Listen, die sich beim Lesen klären ließen:

- T59 („ob mechanismTool `from` = `to` vorher abfängt, ist nicht geprüft“): es fängt ab. `pegOf` ruft `common`
  (A/mechanismTool.ts:177), das unter 1e-6 mm Abstand ablehnt (Zeile 101-102). Der Fehler in `pegSteps` bleibt nur für
  Aufrufer außerhalb des Werkzeugs.
- T6 (Gewindeflanke 46,1°) nachgerechnet: `into` = min(2,6/2 + 0,2; 1,5 − 0,05) = 1,45; radial 1,3, axial 1,25. Stimmt.
- Kopfzeile T („61 Befunde, 5 A, 30 B, 26 C“) nachgezählt: stimmt.

## Befunde

Alle statisch (gelesen, nicht gebaut). „Verdacht“ heißt: hängt an einem Verhalten von SolidCraft oder des Slicers, das
in diesem Lauf nicht nachgeprüft wurde.

| Kennung | Schwere | Datei:Zeile | Ist | Soll (mit Quelle/Begründung) | Nachstellen |
|---|---|---|---|---|---|
| G1 | A | G/printCheck.ts:14-17, 283-308, 372-389; A/mechanismTool.ts:431-433; S/mechanisms.ts:129-131 | Die Druckprüfung stellt **jeden Körper auf seinen eigenen tiefsten Punkt** (`bedOf` je Körper) und dreht jeden für sich auf seine Druckfläche. Für Teile, die zusammen gedruckt werden (Scharnier, Führung aus `partbuddy_mechanism`), gilt das nicht: sie behalten ihre Lage zueinander. Das Scharnierwerkzeug selbst rechnet mit **einem** Bett für beide Körper (kleinstes z beider Hüllkörper) und baut Stege für Augen, „die über dem Bett beginnen“. Ein Deckel, der höher liegt als der Boden der Dose, gilt in der Prüfung als aufliegend: seine Unterseite zählt als Bettfläche (`Overhang.Bed`), geht in die Auflage ein und wird nie als Überhang gemeldet. Werkzeug und Prüfung widersprechen sich über dieselben Körper. | Körper, die ein Gelenk verbindet (aus `joint.list` bekannt, `structure.joints`) oder die PartBuddy als Mechanismus gebaut hat, als Gruppe auf ein gemeinsames Bett stellen und gemeinsam drehen; Maßstab AUFTRAG.md Phase 4 Nr. 5 („kein guter fälschlich, jeder fehlerhafte gemeldet“). Schwere A: die Ampel sagt „bereit“ für einen Körper, der in der Luft beginnt. | Dose 30 mm hoch, daneben Deckelplatte 3 mm dick auf z = 27…30, `kind: hinge` an der gemeinsamen Kante. Erwartung nach Code: kein Überhangbefund für die Deckelunterseite, obwohl sie 27 mm über dem Bett liegt. |
| G2 | A (Verdacht) | M/solidcraft/standardParts.ts:11, 52-70; M/solidcraft/mirror.ts:73-76, 91-93; S/mechanisms.ts:470, 494-496; M/solidcraft/supervisor.ts:222-223, 459-460 | `screwSteps` setzt bei `head: countersunk` Normteile der Familie `countersunk_socket_screw` ein (über den `batch` des Assistenten; die Merkliste `STANDARD_PARTS_KEY` schreibt nur `insertPart` der Oberfläche, supervisor.ts:529-530). Als Normteil erkannt wird ein Körper nur, wenn die Beschreibung seiner Komponente mit einem von 12 festen Familiennamen beginnt (`LIBRARY_PARTS`, Stand „0.40.0-rc.2“). Eine Senkkopf-Familie ist nicht darunter; sie kam laut docs/engineering-notes.md:195 erst mit rc.4. Passt keiner der 12 Namen, gilt die Schraube als gedrucktes Teil: sie wird geprüft (Gewinde als dünne Wand), gegen ihr Loch gemessen (Überlappung/enger Spalt) und mit exportiert und an den Slicer gegeben. T48 nennt nur das fehlende Enum, D177 nur die feste Liste. | Familiennamen aus `parts.library` lesen (der „shortcut“-Kommentar Zeile 50 sagt es selbst) oder die vom Werkzeug eingesetzten Körper in `STANDARD_PARTS_KEY` eintragen. Exportdatei mit Stahlschrauben als Druckkörper = falsches Modell. | `partbuddy_mechanism {kind: screw, head: countersunk, size: M4}`; danach `structure.standardParts` lesen und 3MF exportieren: Körperzahl. Vorher klären, wie SolidCraft rc.4 die Familie nennt. |
| G3 | B (Verdacht) | A/mechanismTool.ts:117, 131, 222, 362-363, 373; S/mechanisms.ts:582, 596; S/drawingPlacement.ts:36 | Die Mechanismen verweisen über **Namen**: Gelenk (`joint.sweep`, `joint.limits {joint: spec.name}`), Schnittskizze des Gewindes (`solid.coil {sketch: name}`), Griffrille (`solid.pattern.circular {features: ["<Name> ◆"]}`). Ohne `name` heißen sie „Hinge“, „Guide“, „Thread“. SolidCraft lässt einen Namen zweimal zu (so der Kommentar in drawingPlacement.ts:36, dort gelöst mit `uniqueLogoName`). Beim zweiten Scharnier, der zweiten Führung oder dem zweiten Schraubdeckel im selben Entwurf kann der Verweis das **erste** treffen: Grenzen am falschen Gelenk, Gewinde aus dem Profil des ersten Deckels, Rillen des ersten Deckels vervielfacht. Keine Prüfliste führt die Standardnamen oder ihre Eindeutigkeit (W25: „Name ≤ 60 Zeichen, Test keiner“). | Namen eindeutig machen wie beim Logo, oder mit den Ids aus den Ergebnissen der Schritte arbeiten. Zwei Scharniere an einer Dose sind der Normalfall. | Zweimal `kind: hinge` ohne `name` an zwei Kanten; `joint.list`: Grenzen beider Gelenke. Zweimal `kind: lid` ohne `name`: Gewinde des zweiten Deckels messen. |
| G4 | B | M/solidcraft/actions.ts:151, 158-176 | Die Schnapper-Probe fährt das Gelenk ans Limit, misst die Durchdringung und fährt zurück, in **einem** Stapel mit `rollback: true`. Der Kommentar Zeile 151 hält fest, dass ein zurückgenommener Stapel ein gefahrenes Gelenk dort stehen lässt. Scheitert Schritt 2 oder 3, bleibt das Gelenk am Limit stehen; ausgewertet wird nur `!posed.failed`, kein Zurückfahren, keine Meldung. Die Probe läuft selbsttätig nach jeder Revision (D111, D115). Folge: der Entwurf steht ausgelenkt, wird so exportiert (D124), und `partbuddy_mechanism` lehnt den nächsten Aufruf ab („joints stand away from 0“). | Bei Fehlschlag in einem eigenen Aufruf zurückfahren und, wenn auch das scheitert, als Befund melden. Eine Prüfung darf den Entwurf nicht verändern. | Fake-Engine: `inspect.interference` im Probestapel fehlschlagen lassen; Gelenkwert danach lesen. |
| G5 | B (Verdacht) | M/solidcraft/engineVersion.ts:19-21, 60-65; M/solidcraft/engineChoice.ts:57, 85; A/mechanismTool.ts:353-375, 396; M/solidcraft/actions.ts:21, 155, 185 | SolidCraft 0.30.1 gilt als „supported“ und bleibt wählbar. Die Werkzeuge benutzen Befehle und Verhalten, die im Code nur für 0.40.0-rc.2 bis rc.4 belegt sind: `joint.sweep`, `joint.as_built`, `joint.limits`, `inspect.clearance`, Senkkopfschrauben in `parts.insert` (engineering-notes.md:195), Verhalten aktiver Komponenten (rc.3), Vernetzung planer Flächen (rc.4, darauf ruht D6). `supportOf` wird nur in engineChoice.ts benutzt; kein Werkzeug fragt die Version. In keiner Prüfliste steht die Mindestversion (D: „engineVersion.ts nicht gelesen“). | Eine Version, gegen die jede Zeile der Prüfliste gemessen wird (AUFTRAG.md „Fertig, wenn“: jede genutzte SolidCraft-Funktion abgesichert); ältere ablehnen oder Werkzeuge nach Version sperren. | Engine 0.30.1 wählen, `kind: hinge` aufrufen. Ob 0.30.1 die Befehle kennt: nicht geprüft. |
| G6 | B | M/solidcraft/actions.ts:22-39, 67-69; S/contract.ts:767-773 | Die Aktionen der Auswahl (Rundung, Fase, Ziehen, Bohrung, Schale) prüfen `body` im Schema, schicken ihn aber nicht an SolidCraft: `commandOf` übergibt nur Punkte. Der Körper dient allein dem Export für die Vorschau. Liegt ein Punkt auf einer gemeinsamen Fläche oder Kante zweier Körper, kann der Befehl den anderen Körper treffen; die Vorschau zeigt dann den gewählten Körper unverändert. Gleiche Lücke wie W1, dort für die Blöcke; D25 nennt sie für die Aktionen nicht. | `body` bzw. `targets` mitgeben, wo SolidCraft es annimmt. | Zwei Körper mit gemeinsamer Kante, Kante am ersten wählen › Rundung 1 mm; prüfen, welcher Körper sich ändert. |
| G7 | B | S/channels.ts:5-121; AUFTRAG.md:46 | Phase 1 verlangt eine Zeile für „jede Aktion, die der Nutzer in der Oberfläche auslösen kann“. Keiner der 114 Kanäle steht mit Namen in einer Prüfliste; D46 erklärt `channels.ts` zum Inventar, ohne es auszuschreiben. Ohne Zeile sind auch Aktionen, die die Geometrie oder das Geprüfte ändern: `design:undo`, `design:redo`, `design:visibility`, `design:rename-body`, `project:restore-version` (Tabelle 1.1). Für sie gibt es damit in Phase 4 keinen Prüfschritt. | Tabelle 1.1 in die Prüfliste übernehmen; je Aktion Handler in M/index.ts lesen (Sperre `assistantIdle()`, Folgen für Druckfläche und Merklisten). | – |
| G8 | C | M/solidcraft/logoMove.ts:18-19, 311; S/contract.ts:896; A/drawingTool.ts:183 | `REACH_MM` = 20 mm, Kommentar „deeper than any logo“. Zulässig sind Logos bis 50 mm Tiefe oder Höhe. Ein Klick auf die Oberseite eines 30 mm hohen Logos liegt 30 mm von der Skizzenebene: `logoAt` findet es nicht, die Logo-Bedienung erscheint nicht. | Reichweite = größte zulässige Tiefe, oder die Tiefe des Logos selbst. | Logo `emboss`, `depth: 30`; in der Ansicht auf die Oberseite klicken. |
| G9 | C | S/blocks.ts:96 und S/mechanisms.ts:625; G/printCheck.ts:456 und M/solidcraft/actions.ts:196; M/solidcraft/actions.ts:18, dimensions.ts:54, supervisor.ts:417, 762, A/mechanismTool.ts:398; S/contract.ts:279 gegen :240 | Doppelt geführte Zahlen über die schon gemeldeten hinaus: Schnapphaken 12 / 1,5 / 5 / 0,8 / 1,5 einmal als Standard des Bausteins, einmal als `SNAP`; „Limit erreicht“ 0,5° / 0,1 mm zweimal; der absichtlich scheiternde Schritt `sketch.inspect {sketch: 2147483647}` an fünf Stellen; Tags ≤ 100 × 200 in der Anfrage, ≤ 20 × 40 in der Liste. | Je Zahl eine Quelle (wie D37, T42, T48). | Textvergleich. |
| G10 | C | 01-inventur-werkzeuge.md Zeilen 131, 242; 01-inventur-druck-export-ui.md Zeilen 29, 167 | Vier Fehler in den Prüflisten selbst (Tabelle 2): 9 statt 10 Meldungen; 9 statt 10 `partbuddy_*`-Werkzeuge; Verweis auf nicht vorhandenen Befund D51; Featuregrenze 60 ohne die 50 des Schemas. | Listen berichtigen. | – |

## Nicht geprüft, weil …

- **Nichts gebaut, nichts ausgeführt** (Vorgabe). G1 bis G6 sind aus dem Code hergeleitet. Für G2, G3 und G5 fehlt das
  Verhalten von SolidCraft: wie rc.4 die Senkkopf-Familie in der Komponentenbeschreibung nennt, was `joint.*` und
  `solid.coil` bei doppeltem Namen tun, welche Befehle 0.30.1 kennt.
- **Verhalten des Slicers bei zusammen gedruckten Körpern** (zu G1): Der Kopf von `printCheck.ts` hält fest, dass
  Bambu Studio jedes Objekt eines 3MF einzeln aufs Bett legt. Ob der Export eines Scharniers aus zwei Körpern die
  Lage zueinander behält (3MF, STL, „An den Slicer“), ist weder in den Prüflisten noch hier geklärt und gehört in
  Phase 4 Nr. 4. Fällt das Scharnier im Slicer auseinander, ist es ein eigener A-Befund.
- **Nicht alle Dateien vollständig gelesen.** Vollständig: siehe „Vorgehen“ Nr. 4. Nur in den unbelegten Zeilen und
  ihrer Umgebung gelesen: `A/blockTool.ts`, `drawingTool.ts`, `policy.ts`, `loop.ts`, `research.ts`, `questions.ts`,
  `workLog.ts`; `S/blocks.ts`, `knob.ts`, `magnet.ts`, `wallMount.ts`, `designFit.ts`, `tolerances.ts`,
  `testPieces.ts`, `templates.ts`, `sketch.ts`, `drawingPlacement.ts`, `stepPhrases.ts`, `contract.ts:1-1040`;
  `M/print/printProfiles.ts`; `M/solidcraft/supervisor.ts`, `dimensions.ts`, `dimensionMarks.ts`, `controlClient.ts`,
  `machine.ts`, `discovery.ts`; `G/overhang.ts`, `noteAnchors.ts`. Gar nicht gelesen: `S/api.ts`, `S/svgDrawing.ts`,
  `S/drawingDetail.ts`, `S/standards.ts`, `S/assembly.ts`, `S/settings.ts`, `M/share/*`, `M/print/printCheckNote.ts`,
  `M/solidcraft/engineChoice.ts` (bis auf zwei Treffer), `G/analysis.ts`, `edges.ts`, `faceTable.ts`, `faceDiff.ts`,
  `renderMesh.ts`, `viewerModel.ts`, `sketch.ts`, `tagged3mf.ts`, die übrigen Dateien unter `A`. Für diese Dateien
  stützt sich „fehlt nicht“ allein auf den Zeilenabgleich.
- **Grenzen des Zeilenabgleichs:** Er findet Zeilen mit Zahl, Schema oder Konstante. Eine Regel ohne Zahl (eine
  Bedingung, eine Reihenfolge, ein Text) findet er nicht; eine zitierte Zeile gilt als erfasst, auch wenn die Liste
  dort etwas anderes beschreibt. Die 33 unbelegten Zeilen in `S/svgDrawing.ts` und 23 in `G/sketch.ts` wurden als
  Rechenschritte eingestuft, ohne die Dateien zu lesen.
- **Regeltexte** (`*_GUIDANCE`, Werkzeugbeschreibungen, `standards.ts`) nicht Satz für Satz gegen die Listen gehalten;
  das ist Phase 5.
- **Handler der IPC-Aktionen** in `M/index.ts` (außerhalb der sechs Ordner) nicht gelesen. Welche Aktion
  `assistantIdle()` verlangt und was `design:rename-body` mit `print-faces.json` und der Normteil-Merkliste macht,
  ist offen (G7).
- **Tests:** Spalte „Test“ in Tabelle 1 nicht gefüllt; kein Test gelesen oder ausgeführt.
- **Exportierte Typen und Funktionen ohne Zahl** (`export interface …`, `export function …`): nicht einzeln gegen die
  Listen gehalten. Ein Namensabgleich aller Exporte lief, ist aber nicht aussagekräftig, weil die Listen nach
  Fundstelle und nicht nach Bezeichner zitieren.
