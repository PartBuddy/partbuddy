---
status: accepted
date: 2026-11-04
---

# Python sidecar for CAD domain checks, run through uv

## Context and Problem Statement

The domain checks of the earlier workflow exist as tested Python tools: mesh check, overhang
analysis, print gate with OrcaSlicer, measurement evaluation, tolerance chains. They use numpy,
scipy, trimesh, pydantic and PyMeshLab. PartBuddy needs these checks without rewriting them in
TypeScript, and must ship them under the product licence (GPL-3.0-or-later, ADR 0007).

## Considered Options

* Python sidecar as a long-running worker, bundled with uv and a standalone Python runtime
* Port all checks to TypeScript
* Call the tools as one-off command-line processes

## Decision Outcome

Chosen option: "Long-running Python worker", because the numerical libraries are proven and
already tested in this domain; porting would replace them with own code.

* The worker speaks JSON-RPC 2.0 over stdio with the Electron main process; every result is
  validated with a schema on both sides (pydantic, Zod).
* Bundled: `uv` (pinned) and a pinned python-build-standalone runtime; the environment is created
  offline from a wheelhouse with `uv sync --frozen --offline`; Python downloads are disabled.
* PyMeshLab (GPL-3.0) is compatible with the product licence and stays where it checks better than
  trimesh (MIT); each replacement is compared against the earlier tool on the same files.
* The sidecar never sees provider API keys.
* The tools are rewritten into the product repository (`apps/cad-tools`), not copied; each rewrite
  is recorded in [provenance](../provenance.md).

### Consequences

* Good, because the checks keep their proven numerics and tests.
* Bad, because Python adds a runtime and its libraries to the installer (size measured with the first sidecar build) and a second language to CI.
* Bad, because bundled `python.exe` and `uv.exe` must be signed to avoid antivirus false positives.

## Pros and Cons of the Options

### Port to TypeScript

* Bad, because mesh repair, overhang classification and statistics (Student t, regression) would
  become own code without equivalent libraries.

### One-off processes

* Bad, because interpreter start and imports cost seconds per call; a worker keeps them loaded.
