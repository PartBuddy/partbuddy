---
status: proposed
date: 2026-11-04
---

# pnpm monorepo with apps, packages, prototypes and tools

## Context and Problem Statement

The product consists of a desktop app, a Python sidecar, several TypeScript libraries (design
tokens, geometry adapter, note anchoring, agent runtime, provider adapters), documentation and
developer tooling. Phase 1 adds a click dummy that must stay apart from product code. Which layout
keeps this clear and matches conventions of maintained desktop projects?

Evidence: [research § Role models and repositories](../research.md#6-role-models-competitors-and-names)
(OpenCode, Zed, FreeCAD, Zoo Design Studio, Spacedrive, Cap, Jan, Bruno, Hoppscotch, Insomnia).

## Considered Options

* pnpm workspace with `apps/`, `packages/`, `prototypes/`, `tools/`, `docs/`
* Single package with `src/` folders
* Separate repositories per component

## Decision Outcome

Chosen option: "pnpm workspace", because the compared Electron and Tauri projects use the same
split (runnable apps, shared packages), pnpm enforces strict dependency boundaries, and one
repository keeps ADRs, code and CI together.

```text
.github/       workflows, issue forms, PR template, CODEOWNERS (Renovate config at the root)
apps/          runnable programs (created with the MVP)
  desktop/     Electron main, preload and renderer entry
  cad-tools/   Python sidecar (uv project): mesh, overhang and print-gate tools
packages/      TypeScript libraries shared by apps and prototypes
  design-tokens/   colours, spacing, typography, radii, elevation (light and dark)
prototypes/    throw-away UI prototypes, never imported by product code
  clickdummy/  Phase 1 main-view prototype with mock data
tools/         developer tooling
  fixtures/    generator for the synthetic sample model
  privacy/     scan helpers for the pre-commit hook
  github/      repository setup script
docs/          research, building blocks, architecture, design system, ADRs, screenshots
```

Rules:

* Folders are created when their first real content arrives; no empty placeholders.
* `prototypes/*` may depend on `packages/*`, never the other way round; product code never
  imports a prototype.
* Each package has its own `package.json` with `lint`, `typecheck`, `test` and `build` scripts; the
  root scripts run them recursively.

### Consequences

* Good, because the click dummy already consumes the real token package, so the design system is
  tested before the MVP.
* Bad, because the Python sidecar lives in a pnpm workspace; it keeps its own `pyproject.toml` and
  `uv.lock` and its own CI job.
