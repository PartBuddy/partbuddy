---
status: accepted
date: 2026-11-04
---

# Record architecture decisions as MADR files

## Context and Problem Statement

PartBuddy combines a CAD kernel, an AI agent runtime, a 3D viewer and a desktop shell. Many
choices (stack, pipelines, own implementations versus ready-made components, licences) must stay
traceable for later contributors and for reviews of the build-versus-buy policy. Where and in which
form are these decisions recorded?

## Considered Options

* Markdown Architectural Decision Records (MADR 4.0.0) in `docs/adr/`
* Free-form design documents in a wiki
* Decisions only in pull request descriptions

## Decision Outcome

Chosen option: "MADR 4.0.0 in `docs/adr/`", because the records are versioned with the code,
reviewed in pull requests and follow a widely used template
([adr/madr 4.0.0](https://github.com/adr/madr/releases/tag/4.0.0), released 2024-09-17).

Rules:

* One file per decision: `NNNN-short-title.md`, numbered in order, never renumbered.
* Front matter `status`: `proposed`, `accepted`, `rejected`, `deprecated` or `superseded by NNNN`.
  Decisions that need the product owner's approval stay `proposed` until approved.
* Every own implementation of a component that has ready-made alternatives gets its own ADR with
  the alternatives checked (see [building blocks](../building-blocks.md)).
* Evidence lives in [research](../research.md); ADRs link to it instead of repeating it.

### Consequences

* Good, because decisions are reviewable and searchable next to the code.
* Bad, because records must be maintained; superseded records stay in place with a pointer.
