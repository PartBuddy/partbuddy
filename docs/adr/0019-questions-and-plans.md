---
status: accepted
date: 2026-11-04
---

# Questions and plans as cards, answered outside the model

## Context and Problem Statement

For larger jobs the assistant should show a plan with Go, Change and Cancel before it builds,
and when a dimension that matters is unclear it should ask with answers to pick from (roadmap
M2a). The approval must come from the user, not from the model, and the model must not build
past an open question. An earlier plan (decision of 2026-11-04) was to hold the tool call in the
gate proxy until the user answered.

## Considered Options

* Hold the tool call open until the user presses a button (blocking)
* Return at once, show the card, and refuse every changing tool until the user's next message

## Decision Outcome

Chosen option: **return at once and refuse changes until the answer** (decided 2026-11-04,
replacing the blocking plan). `partbuddy_ask` and `partbuddy_plan` are answered by PartBuddy
itself (`main/agents/questions.ts`) for both routes. While a question is open, `execute`,
`batch`, `set_parameter`, `undo` and `redo` are refused with the next step for the model ("end
your turn"); reading tools keep working. The user's next message closes the question: a button
press is sent by the renderer as `answer {question, choice}` straight to the main process, so
the note "the user pressed Go" can only come from PartBuddy's interface, never from the model.
Typed text counts as the answer too.

### Consequences

* Good: no MCP time-out to tune, Stop keeps working, Claude Code and ChatGPT behave the same.
* Good: the user may answer in their own words instead of a button.
* Bad: the model has to end its turn; one that keeps going only collects refusals until it does.
