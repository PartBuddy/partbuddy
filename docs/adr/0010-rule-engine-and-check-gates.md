---
status: accepted
date: 2026-11-04
---

# Declarative rule engine for hooks and check gates (own implementation)

## Context and Problem Statement

The earlier workflow relied on hooks of one coding agent: a fail-closed mesh check after every
export, a print gate that blocks print packages until every overhang finding has a solution with
proof, and timeline checks. In PartBuddy these guarantees must hold for every provider, including
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

## Amendment 2026-11-05: the ready-to-print check (M7)

The first check that shipped does not run in the Python sidecar, which does not exist yet: it is
pure TypeScript in `packages/geometry` (`checkPrint`), on the render meshes the view already has
with their BVH. It checks the build volume of the printer in use, walls under two extrusion lines
(a ray from each triangle into the material; only walls facing back within 30° count, so sharp
but printable edges are not reported), overhangs beyond the material's limit with the same rule
as the overhang view, the area on the bed, and features SolidCraft reports with errors or
warnings. 12,000 triangles take about 50 ms, so it runs after every revision.

* The result is a light in the status bar: green, yellow (`warn`) or red (`block`), with every
  finding pointing at its faces on the model.
* Red does not stop an export: decided with the product owner, the export asks once and then goes
  ahead. This replaces the fail-closed print gate above for the user's own exports.
* The assistant hears of the result with its next message whenever it changed, worded by the main
  process from the renderer's report. Gates around the assistant's own tool calls are still to
  come with the rule engine.
* A sidecar stays an option for checks that need a mesh kernel (slicing, wall thickness on the
  exact B-rep); the findings keep their shape.
