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

## Amendment 2026-11-05 (M7f step 3): counterbores facing the bed

* A counterbore that opens towards the bed (a wide bore from below, a narrower hole above, the
  flat step between them facing down) is its own cause. The rays see a bridge over the step, but
  the hole cuts every strand that crosses it; Bambu Studio supports an 8/4.5 mm counterbore in both
  support modes. Steps of at most 1.5 mm (a short overhang) are left alone. Found from the face
  table: coaxial upright hole cylinders and the planar step between them, around their own axis.
* The fix is a stepped bridge cut into the layers above the step: a slot as wide as the hole across
  the bore, one layer deep, its ends 0.05 mm off the bore's wall, and a square as wide as the hole,
  two layers deep. Both cuts start 0.01 mm below the step: a cut that starts in the step's plane
  makes SolidCraft retry its boolean and warn, and slot corners on the bore's wall leave faces
  without area. After it, Bambu's tree supports drop from 14 layers to none; its normal supports
  still fill the bore (as without the fix), so the practice reading "support only where both modes
  put some" calls it free of support.
* `model.faces` reports such a face without area with `point: null`; the face table takes its
  centroid then instead of failing the whole mirror.

## Amendment 2026-11-05 (M7f step 4): support printed into the model

* An overhang without a shape to change ("other") gets support walls printed into the model on
  request: walls 1 mm thick, 4 mm apart, along the longer side of the spots, one layer of air under
  the part and 0.5 mm beside it, each a body of its own named `Print support <n>`. Only walls that
  stand on the bed are made: the slicer lays every object onto the bed by itself.
* The check leaves support bodies out of everything but the build volume, and reads spots with a
  wall right under them (within 2.6 mm sideways, its top one layer below) as carried: an info
  finding that says to turn the slicer's supports off. The orientation proposal ignores them.
* Bambu Studio arranges the objects of a 3MF on its own and turned the walls away from the part.
  The 3MF export therefore moves each support body's mesh into the object of the part it stands
  under (most overlap from above); in the design they stay bodies of their own. An export that is
  no readable package goes out unchanged. After the export the notice says to turn the slicer's
  supports off.
* For the ghost, which shows one body, the walls are joined into one on trial; SolidCraft warns that
  a join of walls apart from each other leaves a body in pieces, which is why applying makes them
  separate bodies.

## Amendment 2026-11-05 (plan step R1): back to what only the design decides

The product owner reset the plan on 2026-11-05: supports, bridges and the orientation in detail are
the slicer's job, and the slicer does them better. The amendments "the check follows what the slicer
prints", "fixes at the light", "counterbores facing the bed" and "support printed into the model"
are withdrawn, and with them the print orientation of the first amendment (proposal, marked loads,
"print on this face", the turned 3MF and STL export).

* The check looks at the part **as designed**, standing on its lowest point; each body on its own
  bed as before. It reports the build volume, walls under two lines or the nozzle, bodies that touch,
  too little on the bed and features SolidCraft could not build.
* **Overhangs are a hint by angle only:** faces leaning past the material's angle form one yellow
  finding that points at its faces and says that the slicer decides about support. It never makes
  the light red. The slicer-style reach (short overhangs, bridges up to 10 mm), the causes and the
  fix buttons are gone (`supportReach`, `printFixes`, `supportRibs`, `supportExport`,
  `orientation` and `orientFile` in the geometry package).
* The rules for designing without support stay in the assistant's note, without the stepped bridge
  over counterbores: Bambu Studio and OrcaSlicer build that themselves (`counterbore_hole_bridging`).
* Print files of parts written before keep their material; an orientation or loads in them are
  ignored. Work-log phrases of the removed fixes stay readable.
* Where SolidCraft itself marks the face a part prints on (`body.print_face`), PartBuddy offers it
  in plan step B8 as a plain action, without orientation logic of its own.

## Amendment 2026-11-08: threads and snap fits are not findings

Showcase parts for the launch, built on 2026-11-08 and checked in the app, made the light red on a
modelled M20 thread ("walls only 0.01 mm") and yellow on every thread flank and on the nose of a
`plastic.snap_fit`, though all of them print without support.

* **Wedges are not walls.** A thread cut off by the end of the bolt leaves a 30° knife edge; the
  thin-wall rays counted opposite faces facing back within 30°, so the tip read as a wall of
  0.01 mm. Only faces facing back within 10° count now: walls, with draft or without. A wedge is
  thin at its tip alone, and the slicer just leaves the tip out.
* **Small overhangs are left out, as the slicers do by default.** An overhang patch counts as small
  when every point of it lies within four extrusion lines (1.8 mm at a 0.4 mm nozzle) of an edge
  where the material goes on below, or of the bed: OrcaSlicer and Bambu Studio leave such
  overhangs without support ("Ignore small overhangs", on by default; `TreeSupport.cpp` drops a
  cluster that is no wider than two lines once one line is eroded from each side). Thread flanks
  up to about M20 and the nose of a snap fit are small. A ceiling, a ledge reaching further, a
  narrow arm that reaches out from its end and a patch that starts in the air stay findings.
* This is the slicers' own default rule, not the slicer-style reach R1 removed: no bridges, no
  causes, no fix buttons.

## Amendment 2026-11-12: the check follows SolidCraft's print face

Practice runs on 2026-11-11 showed the check warning about 4599 mm² of overhang on a lid that the
assistant had laid on its top with `body.print_face`: the check looked at the body as designed,
while the slicer export lays it on that face.

* A body with a print face is checked **lying on that face**: size, overhang and the area on the
  bed. A body without one is checked as designed, as before. This is SolidCraft's own face, not an
  orientation PartBuddy works out; nothing of the withdrawn orientation logic comes back.
* Findings still name faces and bounds where they are in the design.
* A print face the assistant sets or clears itself is read from SolidCraft's answer and kept in
  `print-faces.json`, like those of blocks, mechanisms and templates, so the plate view and the
  check agree. An undo of `body.print_face` is not seen (SolidCraft does not list print faces).
