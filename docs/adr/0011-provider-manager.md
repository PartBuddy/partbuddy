---
status: proposed
date: 2026-11-04
---

# Provider manager with local-server detection and capability checks (own implementation)

## Context and Problem Statement

Users choose freely between cloud providers and local servers. All providers must be configured
the same way, tested before use and shown with their capabilities. Local servers differ in ports,
health endpoints, context limits, reasoning field names and tool-calling support, and some change
these between releases. Which component owns this?

Evidence: [research § Local models](../research.md#33-requirements-for-local-models).

## Considered Options

* Own provider manager on top of the AI SDK provider packages
* Rely on the AI SDK alone
* A router service (OpenRouter or LiteLLM) in front of all providers

## Decision Outcome

Chosen option: "Own provider manager", because detection, capability checks and normalisation of
local servers are not covered by the provider packages, and a router would send local traffic
through another service.

* **Profiles:** provider type, endpoint, model, key reference (the key itself stays in the Windows
  credential store via `@napi-rs/keyring`), data-policy flags (training default, data location).
* **Detection:** parallel probes with short timeouts on the documented defaults: Strata
  `127.0.0.1:8080` (`/health`, `/props`, `/status`), llama.cpp `:9931` and `:8080` (`/health`
  returns 503 while loading), Ollama `:11434` (`/api/tags`, `/api/ps`), LM Studio `:1234`
  (`/v1/models`), vLLM `:8000` (`/health`, `/v1/models`).
* **Capability check before a session:** context limit (refuse agent sessions below a configured
  minimum; Ollama defaults to 4K context on smaller GPUs), tool support (`chat_template_caps`,
  model metadata), image input, reasoning control.
* **Status model shown in the UI:** reachable, loading, warming up, model loaded, busy, context
  limit, tool calling yes/no, unreachable.
* **Connection test:** one short non-tool request and one tool-call round trip against a dummy tool.
* **Timeouts:** cloud requests use a first-token timeout; local requests use a long budget with
  prompt progress (`return_progress` on llama.cpp and Strata, `/slots` polling) and a visible stop
  button.

### Consequences

* Good, because users see why a local run is slow or impossible before it fails.
* Bad, because server behaviour changes between releases (llama.cpp moved its default port to
  9931, vLLM renamed `reasoning_content` to `reasoning`); the probes are covered by recorded
  fixture responses per server version.

## Pros and Cons of the Options

### AI SDK alone

* Bad, because it connects to a configured endpoint but does not detect servers, read context
  limits or report loading states.

### Router service

* Bad, because it adds a network hop and a third party for local traffic, against the privacy goal
  of local models.
