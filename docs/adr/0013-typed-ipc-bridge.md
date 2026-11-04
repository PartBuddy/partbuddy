---
status: proposed
date: 2026-11-04
---

# Typed IPC bridge with Zod-validated channels (own implementation)

## Context and Problem Statement

The renderer is sandboxed with context isolation ([ADR 0002](0002-technology-stack.md)). Every call
into the main process (agent runtime, SolidCraft connection, project store, key store) crosses the
preload bridge. The bridge is security-critical: it decides what a compromised renderer could do.
Which component provides typed, validated IPC?

Evidence: [building blocks](../building-blocks.md) (IPC row).

## Considered Options

* Own preload bridge with one shared channel contract validated by Zod
* electron-trpc
* @electron-toolkit/typed-ipc

## Decision Outcome

Chosen option: "Own preload bridge", because the ready-made options are either incompatible with
sandboxed renderers or not maintained, and the bridge is small enough to audit completely.

* One contract module lists every channel with request and response schemas (Zod). The preload
  script exposes only these channels through `contextBridge`; no generic `invoke`.
* The main process validates every request against its schema and checks the sender frame before
  handling it. Responses are validated in development builds.
* Streams (chat tokens, rebuild progress) use dedicated event channels with the same contract.
* API keys and file paths outside the project folder never cross the bridge.

### Consequences

* Good, because the whole attack surface is one reviewed file plus schemas.
* Bad, because it is own code; it stays small (no routing framework) and is covered by contract tests.
* Neutral: `electron-trpc` 1.0.0 (released 2026-10-30) addresses sandbox support and is re-evaluated
  once it passes the seven-day rule and shows maintenance.

## Pros and Cons of the Options

### electron-trpc

* Bad, because 0.7.1 does not work in sandboxed renderers; 1.0.0 was too new to adopt.

### @electron-toolkit/typed-ipc

* Bad, because it had no release in twelve months and provides types without runtime validation.
