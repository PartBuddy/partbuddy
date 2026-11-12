# Audit measuring harness

Phase 4 of the full audit (`docs/audits/2026-11-12-vollaudit/`): PartBuddy's real assistant tools
against a real SolidCraft without a window, measured with `packages/geometry`. No app, no window, no
new dependency. Nothing of the product is rebuilt: `harness.ts` imports `withBlockTool`,
`withMechanismTool`, `HeadlessEngine` and `mirrorActiveDesign` from `apps/desktop/src`, so a case
calls `partbuddy_block` / `partbuddy_mechanism` exactly as the model does.

## Run

From `apps/desktop` (its vitest is used; `tools/audit` is no workspace package):

```
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts              # all cases
pnpm exec vitest run --config ../../tools/audit/vitest.config.mts hinge        # one case, by file name
```

Each case writes to `tools/audit/out/<case>/` (ignored by git): `result.json` (what it measured),
`sent.json` (every batch the PartBuddy tools sent to SolidCraft), `<case>.stl`, `<case>.sc`.

## A case

A file `cases/<name>.case.ts` with one vitest `test` (globals are on, import nothing from vitest):

```ts
const audit = await openAudit('<name>');          // new design, nozzle 0.4 unless given
await audit.batch([{ command: 'solid.box', … }]);  // raw SolidCraft, for carrier bodies and inspect.*
const built = await audit.tool('partbuddy_block', { … });   // { text, isError }: the tool's own words
const { bodies, check } = await audit.measure();   // per body: solidcraft (inspect.measure), faces, mesh, metrics, model
ray(bodies, origin, direction);                    // crossings in order: wall = entering → leaving, gap = leaving → entering
overhang(body, profile, reach);                    // mm² per class, by overhang.ts
cylinders(body);                                   // exact diameters from model.faces
check(PLA_04);                                     // checkPrint with any PrintCheckProfile
await audit.finish(result); await audit.close();
```

## Pitfalls found

- **Version.** The harness uses the installed SolidCraft (`%ProgramFiles%\SolidCraft\solidcraft-cli.exe`,
  0.40.1 since 2026-11-12); `AUDIT_SOLIDCRAFT_CLI` names another one. The first run of 2026-11-12 was
  measured on the portable 0.40.0-rc.4.
- **TEMP.** The Claude app hands out TEMP as an 8.3 path (`ADMINI~1`); the harness passes the long
  path to SolidCraft. Set TEMP and TMP yourself when calling `solidcraft-cli` by hand.
- **Paths.** `mcp --headless` writes only below `--allow-path`; the harness allows `out/<case>` only.
- **Units.** A bare number is millimetres; `"20 mm"`, `20` and `"2 cm"` gave the same 8000 mm³ box.
  Points (`corner`, `position`) are numbers in mm. Angles as `"90 deg"`.
- **Script format.** `solidcraft-cli run file.json` takes a bare array `[{command, params}]` or
  `{ "commands": [...] }`. `solidcraft-cli script design.sc` writes the second form, but as
  `timeline.add` steps, not the commands that were sent. `sent.json` here is a list of batches
  (`[{rollback, commands}]`), not a script: flatten the batches with `rollback: false` to replay.
- **Mesh against exact.** The mesh lies inside curved faces by the chord tolerance (quality
  standard, 2e-4 of the body's size): a 3.4 mm hole reads 3.396 mm by ray. Take diameters from
  `cylinders()` (exact) and use `ray()` for walls and gaps between flat faces, or allow 0.01 mm.
- **Bounding boxes.** SolidCraft's exact bbox carries noise in the last digits (`20.000000000000014`);
  compare with a tolerance.
- **Mirror files.** `mirrorActiveDesign` deletes its 3MF files after reading; the STL and `.sc` in
  `out/` come from `finish()`.
- **Mechanisms change the design's structure.** After a hinge both bodies are components; body names
  stay, `inspect.*` and the mirror still take them.
- **Console.** vitest hides `console.log` of passing tests in this setup; read `result.json`.

## What it does not do

- No STL/3MF/STEP re-import (phase 4, step 4): `packages/geometry` parses only SolidCraft's
  face-tagged 3MF.
- The print check runs as `checkPrint` on the bodies as designed, with the timeline's features; the
  app's additions `withClearance` and `withMotion` and SolidCraft's print faces are not fed in.
- Only `partbuddy_block` and `partbuddy_mechanism` are stacked on SolidCraft's tools; the other
  PartBuddy tools (standard, assembly, design, drawing, view) and the note guard are not.
- `ray()` measures along one line the case gives; it does not search the thinnest wall or the
  smallest gap. For the smallest gap between two bodies use `inspect.clearance` (exact).
- No joint is driven: collision over the range is SolidCraft's `joint.sweep`, as the tool calls it.
