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

## Amendment 2026-11-05 (later): the check follows what the slicer prints

The practice run before the first prints sliced every export with Bambu Studio (no window,
H2S 0.4 · 0.20 mm Standard · PLA, once with tree supports on). The slicer printed the tops of
horizontal Ø4.5 holes, their countersinks and a 1 mm groove ceiling without a single support,
where the light was yellow; and it laid every body of the 3MF onto the bed by itself. The check
now does the same:

* A face steeper than the material's limit needs support only where nothing carries it
  (`supportNeed` in `packages/geometry/src/supportReach.ts`): just under each spot, eight
  horizontal rays look for walls of the layer below. A wall of another face within 1.5 mm makes it
  a short overhang, walls on two opposite sides within 10 mm a bridge, and a spot over material
  rests on it. The orientation proposal uses the same rule; the overhang view still shades by
  angle alone.
* Every body stands on its own lowest point; the printed height is the tallest body. Bodies that
  touch or run into each other get a `separate` warning, because the slicer pulls them apart.
* The cable clip still checks in about 40 ms; the orientation proposal takes about 350 ms.

## Amendment 2026-11-05 (M7f): designing without support, and how the slicer is asked

* With the print profile the assistant gets rules for designing without support in the print
  orientation (chamfer edges facing the bed, teardrop or flat roofs on lying holes too wide to
  bridge, stepped bridges over counterbores and countersinks facing the bed, slopes under wide
  ceilings). A setting "Design without support" turns them off; it is on from the start.
* A face exactly at the material's limit is printable: the check and the overhang view allow 1°
  past it, so a 45° chamfer is no longer read as needing support.
* Bambu Studio's two support modes disagree with each other: tree supports prop up every flat
  bridge (a 4.5 mm slot too), normal supports that leave bridges alone prop up the tops of small
  round holes and a 1 mm groove ceiling. All of these print without support. The practice runs
  therefore count the slicer as needing support only where both modes put some; on the six parts
  sliced so far this agrees with the light, and a hook laid on its side gets support in both.

## Amendment 2026-11-05 (M7f step 2): fixes at the light

* A support finding names its cause: fillets facing the bed (faces named `F<n>:blend:…`), lying
  holes too wide to bridge (a cylinder with the material outside, its axis level in the print), or
  anything else. One finding per cause.
* Fillets and holes have a fix, built by PartBuddy from SolidCraft commands and shown as a ghost
  first (decided with the product owner): the fillet keeps the edges that do not face the bed and
  the others get a chamfer of its size (`timeline.edit`/`timeline.delete`, `solid.chamfer`; the
  edges are matched by the distance of each definition edge point to the faces' triangles); a hole
  gets a roof cut along it from a sketch at its start, 45° flanks, flat on top up to a 10 mm bridge
  and pointed beyond. Each fix is one step of the work log; what SolidCraft refuses goes to the
  assistant on request, with the faces named.
