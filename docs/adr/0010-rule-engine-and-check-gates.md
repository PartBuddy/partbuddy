---
status: proposed
date: 2026-11-04
---

# Declarative rule engine for hooks and check gates (own implementation)

## Context and Problem Statement

The earlier workflow relied on hooks of one coding agent: a fail-closed mesh check after every
export, a print gate that blocks print packages until every overhang finding has a solution with
proof, and timeline checks. In CAD-Studio these guarantees must hold for every provider, including
local models with weaker tool calling. Who enforces them, and how are they configured?

## Considered Options

* Declarative rules evaluated by the agent runtime around tool calls
* Checks offered to the model as optional tools
* A general policy engine (for example Open Policy Agent)

## Decision Outcome

Chosen option: "Declarative rules evaluated by the runtime", because gates must run outside the
model's control, and the rules are CAD domain logic.

* Rules are JSON documents validated with Zod. Events: `beforeTool(name, args)`,
  `afterTool(name, result)`, `beforeStep`, `onExport(file)`, `beforePrintJob`, `sessionEnd`.
* Actions: `allow | ask | deny` (last match wins, the same semantics as OpenCode permissions),
  `runCheck(checkId, mode: failClosed | warn)`, `injectMessage(text)` (appended, cache-safe),
  `requireSkill(name)`.
* Checks run in the Python sidecar ([ADR 0012](0012-python-sidecar.md)) and return JSON with the
  status `passed | finding | not_checked`, validated by schema.
* A failed fail-closed check returns a tool error to the model and blocks export and print tools
  until a passing run on the same file state.
* Shipped rules reproduce the earlier guarantees: mesh check after export, print gate before a print
  package, parameter range check before applying a value, timeline check after each step (hints
  only).

### Consequences

* Good, because the same gates apply to manual actions, cloud models and local models.
* Good, because a check result is tied to a file hash; the UI shows the verification level only when
  the proof exists.
* Bad, because the rule schema and evaluator are own code; they stay small (no expression language,
  only event matchers and fixed actions).

## Pros and Cons of the Options

### Checks as optional model tools

* Bad, because a model can skip them; this is exactly the failure mode of weak tool calling.

### Open Policy Agent

* Bad, because it adds a policy language and a separate runtime for a dozen fixed rules.
