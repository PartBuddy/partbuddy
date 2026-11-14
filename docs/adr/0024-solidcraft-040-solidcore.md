---
status: accepted
date: 2026-11-05
---

# SolidCraft 0.40 with the solidcore kernel as the development base

## Context and Problem Statement

SolidCraft 0.40.0-rc.1 and rc.2 (released 2026-11-03 as pre-releases) replace SolidCraft's geometry
kernel with solidcore, a pure-Rust kernel. The stable release is still 0.30.1. The product owner
expects 0.40 to be SolidCraft's future and asked whether PartBuddy should be built on it from now
on, before the basics (projects, import, versions) are written. Which SolidCraft does PartBuddy
develop and test against, and how does a user run PartBuddy on a version other than the installed
one?

## Considered Options

* Develop against 0.40.0-rc.2 now; 0.30.1 stays selectable until 0.40.0 is released
* Stay on 0.30.1 and move when 0.40.0 is released

## Decision Outcome

Chosen option: **develop against 0.40.0-rc.2 now** (product owner, 2026-11-05, on the evidence
below). The basics are mostly about files and projects; building them on 0.30.1 and moving later
would mean testing them twice. Designs that PartBuddy creates are built and named by solidcore
itself, so the naming change below affects mostly older files.

* **Which program.** The SolidCraft program is a setting (gear menu → "SolidCraft …", kept in
  `solidcraft-settings.json` in the user data folder). The automatic search (Program Files, local
  programs, `PATH`) stays the default; a chosen program wins over it, and a test override
  (`PARTBUDDY_SOLIDCRAFT_EXE`) wins over both. A chosen program that is gone counts as missing:
  PartBuddy never falls back silently to a different kernel.
* **Version check.** PartBuddy asks `solidcraft-cli --version` and rates it: from 0.40.0-rc.2
  *recommended*, from 0.30.1 *supported*, older *too old* (refused when chosen). These ratings held until
  2026-11-12, see the update below. A chosen file must
  be `solidcraft.exe` with `solidcraft-cli.exe` beside it.
* **Restart.** A new choice takes effect after PartBuddy restarts (the dialog offers it; the design
  is saved first), so an open design never moves between kernels.
* **CI.** The CI runs the flows against PartBuddy's fake SolidCraft; it never ran a real SolidCraft
  and does not now. The contract tests against the real engine run locally
  (`PARTBUDDY_E2E_SOLIDCRAFT=1`, with `PARTBUDDY_SOLIDCRAFT_EXE` pointing at 0.40) before every pull
  request that touches SolidCraft.

### Update 2026-11-12: SolidCraft 0.40.1 is the minimum

0.40.1 is the first stable release of 0.40. Since #346 it is both the minimum and the recommended
version (`MINIMUM_VERSION` and `RECOMMENDED_VERSION` in `apps/desktop/src/main/solidcraft/engineVersion.ts`):
every rule and measure of the app is checked on solidcore only. The version check now rates 0.40.1
and newer *recommended* and everything older *too old*, 0.30.1 and the 0.40 release candidates
included; *supported* stays in the code for a later minimum below the recommended version. The
recommended version had moved with the release candidates before (rc.3 on 2026-11-08, rc.4 on
2026-11-11, [engineering notes](../engineering-notes.md#solidcraft-0400-rc4-checked-2026-11-11)).

The contract tests against the real engine no longer run only locally: `contract.yml` runs them on
demand on the self-hosted Windows runner of the website screenshots with the SolidCraft installed
there ([ADR 0022](0022-self-hosted-ci-runner.md), [website](../website.md)). The pull request CI
still runs the fake SolidCraft only.

### Evidence (measured 2026-11-05)

* **Contract tests:** 13 of 13 pass on 0.40.0-rc.2 as on 0.30.1 (4 need a SolidCraft window and are
  skipped in both). The command set grew from 570 to 595 commands; none was removed, and changed
  parameters are additions with backward-compatible defaults.
* **29 existing designs** (the product owner's holder project, a fidget wheel, PartBuddy's last
  design) rebuilt with `solidcraft-cli eval` on both versions, nothing saved: all 29 build cleanly on
  0.30.1; on 0.40 10 build unchanged and 19 lose 41 features with "the reference … no longer exists
  as it was picked; reselect it": chamfers, fillets and every modelled thread on cylinder faces,
  because solidcore splits and names cylinder sides differently (`F1:side#2`). Volumes match where
  nothing fails.
* **Speed** varies: a 232 s boolean of a threaded nut takes 24 s, but extrusions and booleans on
  knurled or threaded geometry with thousands of faces take four to fourteen times longer (an
  extrusion 6 s → 85 s, a whole design 37 s → 249 s).
* **Release notes of rc.2:** no claim about speed or quality yet; variable-radius fillets and some
  shells of fully rounded parts fail; meshes have more triangles (a box exports as 124 instead of
  12); file format 50 cannot be opened by 0.30.1 or 0.40.0-rc.1.

### Consequences

* Good, because the basics are built and tested once, on the kernel SolidCraft is moving to, and the
  user can still run 0.30.1 by choosing it.
* Bad, because 0.40 is a pre-release: fillets and shells can fail where 0.30.1 succeeded, knurled
  and threaded parts rebuild slowly in the live view, and naming may change again before 0.40.0.
* Bad, because a design saved by 0.40 cannot go back to 0.30.1; designs made elsewhere with 0.30.1
  are not opened with 0.40 without a copy.

## More Information

Findings in detail: [engineering notes, kernel change](../engineering-notes.md#kernel-change-to-solidcore-040-checked-2026-11-05).
Plan step R0 in the [feature catalogue](../feature-catalog.md#direction-and-roadmap).

### Update 2026-11-14: SolidCraft 0.41.0 is recommended

0.41.0 (stable, 2026-11-13) is the recommended version and the first start links it; 0.40.1 stays the
minimum and now reads *supported*. Checked on 0.41.0: the full contract suite (runs for BC-19, BC-24,
BC-27) and the audit harness of phase 4 (109 cases). 0.41.0 adds three commands in allowed groups
(`model.mesh`, `sketch.spline.handles`, `sketch.spline.reset_handles`) and the `plugin` group, which
the policy refuses (#401).
