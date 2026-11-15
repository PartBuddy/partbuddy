# Token-Verbrauch senken (#446)

Stand 15.11.2026. Anlass: Ein Tester hat das 5-Stunden-Fenster von ChatGPT Plus in etwa 6 Minuten verbraucht.

## Ist-Stand (gemessen)

Modellfrei gemessen mit `e2e/token-probe.spec.ts` (Probe-Test, `test/probeClaude.mjs`) und echtem SolidCraft, o200k-Token:

| Teil | Token | geht mit |
|---|---|---|
| Werkzeugdefinitionen (27) | 14.613 | jeder Anfrage |
| davon `partbuddy_mechanism` | 3.351 | |
| davon `partbuddy_block` | 2.144 | |
| davon `batch` | 1.124 | |
| Rolle (`rolePrompt`) | 2.192 | jeder Anfrage |
| SolidCraft-Anweisungen mit Werkzeug-Notizen | 2.166 | jeder Anfrage |
| Druckprofil und Regeln (erste Nachricht) | 2.392 | einmal je Gespräch |

Der Fixanteil liegt also bei **rund 19 k Token je Anfrage**. Ein Zug hat bis zu 25 Werkzeugrunden (`MAX_STEPS`). Jede Runde ist eine Anfrage und schickt den ganzen bisherigen Verlauf mit, alle Werkzeugantworten eingeschlossen. Nach jedem ändernden Zug folgt zusätzlich eine Rücksendung zur Prüfung (`review.ts`).

Bis zum Commit f72b8c18 hatte die ChatGPT-Route keinen `prompt_cache_key`. Ob dort Cache-Treffer zustande kommen, zeigt erst das neue Log (`turn tokens … cached`).

Verbrauch je Zug in echten Läufen: *folgt* (Lauf mit `PROBE_REAL=1`; Log-Zeilen `turn tokens`).

## Was andere Tools tun (Recherche 15.11.2026)

- **Alte Werkzeugergebnisse aus dem Verlauf nehmen:** Anthropic misst −84 % Token über 100 Runden ([context-management](https://claude.com/resources/articles/context-management)). Empfohlen wird, gebündelt zu kürzen und die letzten 3 Ergebnisse stehen zu lassen, weil jede Kürzung den Cache bricht ([context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)).
- **Tool Search bzw. verzögerte Werkzeugdefinitionen:** −85 % an Definitions-Token bei sogar höherer Trefferquote ([advanced-tool-use](https://www.anthropic.com/engineering/advanced-tool-use)). Claude Code macht das bei MCP-Werkzeugen von sich aus. Ausnahmen lassen sich mit `_meta["anthropic/alwaysLoad"]` festlegen ([code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)).
- **Mehrere Aufrufe in einer Runde (Programmatic Tool Calling):** −37 % ([advanced-tool-use](https://www.anthropic.com/engineering/advanced-tool-use)). PartBuddy hat dafür schon `batch`.
- **Verdichten:**
  - Codex verdichtet ab 90 % des Kontextfensters.
  - OpenAI bietet serverseitig `context_management.compact_threshold` an, auch mit `store=false` ([compaction](https://developers.openai.com/api/docs/guides/compaction)).
  - OpenHands misst bis zu 2× günstigere Runden ([Blog](https://openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents)).
- **Werkzeugausgaben deckeln:** Codex kürzt auf 10.000 Byte, Claude Code warnt ab 10 k Token.
- **Codex-Cache:**
  - `prompt_cache_key` = Session-ID.
  - Gleichbleibende Anweisungen, Werkzeugliste und Reasoning-Einstellung, sonst bricht der Cache.
  - Header `session-id`/`thread-id` sowie `x-codex-turn-state` für Sticky Routing innerhalb eines Zugs ([client.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/client.rs)).
  - Gecachte Eingabe kostet ein Zehntel ([Codex-Preise](https://developers.openai.com/codex/pricing)).
- **Modell je Schritt:**
  - Cline: Plan und Act mit getrennten Modellen.
  - Aider: Architect/Editor sowie ein „weak model“ für Zusammenfassungen.
  - Claude Code: `opusplan` sowie eigene Modelle für Subagenten.
- **Verbrauch anzeigen:**
  - Codex liest `x-codex-primary-used-percent` aus den Antwort-Headern und warnt bei 50/75/90/95 %. Ab 90 % bietet es ein günstigeres Modell an ([rate_limits.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/rate_limits.rs)).
  - Eine Kostenschätzung *vor* einer Aufgabe bietet keines der Tools.

## Plan (größter Hebel zuerst)

*Entwurf, wird nach der Messung und der Fragerunde festgezogen.*
