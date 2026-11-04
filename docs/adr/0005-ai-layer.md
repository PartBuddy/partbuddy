---
status: accepted
date: 2026-11-04
---

# Own thin agent runtime on the Vercel AI SDK and the official MCP SDK

## Context and Problem Statement

The assistant drives SolidCraft over MCP, calls the app's own tools (Python sidecar), streams
answers, asks clarifying questions, shows costs and must work with every configured provider: cloud
models and local servers (Strata, Ollama, LM Studio, llama.cpp, vLLM). Today's workflow relies on
skills, hooks, check gates and file-based memory of one specific coding agent. Should PartBuddy
embed a ready-made agent core or run its own agent loop on top of a provider abstraction?

Evidence: [research § AI layer](../research.md#3-ai-layer).

## Decision Drivers

* All providers equal: one abstraction for cloud and local models
* Licence fit for distribution under GPL-3.0-or-later; no vendor-only SDK as the core
* Control over the loop: gates must run outside the model's control, tool output must be
  truncated early, the prompt prefix must stay byte-stable for local prompt caches
* Release stability of the core

## Considered Options

* Own agent loop on the Vercel AI SDK 7 and the MCP TypeScript SDK
* Embed OpenCode (server or in-process SDK)
* Claude Agent SDK
* OpenAI Agents SDK, Mastra, Goose
* LiteLLM as a provider proxy

## Decision Outcome

Chosen option: "Own agent loop on the Vercel AI SDK 7 and the MCP TypeScript SDK", because the
provider abstraction and the MCP client are ready-made, while the parts that make the product
(gates, skills, CAD tools, local-model guards) are domain logic that a coding-agent core would
neither provide nor let us control.

Building blocks (exact versions in [building blocks](../building-blocks.md)):

* `ai` (Vercel AI SDK 7, Apache-2.0) with the official provider packages for Anthropic, OpenAI,
  Google, DeepSeek and Mistral, `@openrouter/ai-sdk-provider`, and `@ai-sdk/openai-compatible` for
  Z.ai GLM, Strata, llama.cpp, vLLM, LM Studio and Ollama.
* `@modelcontextprotocol/client` (MCP TypeScript SDK v2, stable line) for the stdio connection to
  SolidCraft. The AI SDK's own stdio MCP transport is still experimental and is not used.
* models.dev data (MIT) for the price table; the AI SDK reports token usage but no cost.

Own code (this ADR is its record):

* **Agent loop** in the Electron main process: steps, streaming to the renderer, cancel via
  `AbortSignal`, tool-call validation with Zod, one repair round with the validation error, loop
  guard (same call three times), per-tool permissions (allow, ask, deny).
* **Prompt layout for caches:** fixed system prompt, tool schemas in fixed order and a sorted skill
  index form a byte-stable prefix; dynamic context (notes, selection, project state) is appended as
  later messages. Compaction replaces a middle range of the history and keeps the head.
* **Tool output budget:** large results (topology, screenshots) are stored locally; the model gets
  a summary and a handle. Images from older turns are dropped.
* **Reasoning normalisation:** `reasoning_content`, `reasoning`, `thinking` and `<think>` tags are
  mapped into one reasoning part.
* **Skill loader** for the open Agent Skills format (`SKILL.md` with frontmatter, progressive
  loading through a `load_skill` tool), so the existing skills stay portable.
* **Retrieval glue** (indexing, rank fusion) over the rule base on the ready-made SQLite FTS5 with
  exact ID lookup first and sqlite-vec for
  semantic recall second.
* Gates and the rule engine: [ADR 0010](0010-rule-engine-and-check-gates.md). Provider manager and
  local-server detection: [ADR 0011](0011-provider-manager.md).

### Update 2026-11-04: subscription plans

The product owner requires that PartBuddy works with existing subscription plans, not only API
keys. [ADR 0015](0015-subscription-access.md) adds two routes without replacing this loop:

* ChatGPT Plus/Pro through Sign in with ChatGPT runs **in this loop**, with the user's OAuth access
  token on the Responses API, so all gates and guards apply unchanged.
* Claude Code (Claude subscriptions) and later the Gemini CLI run as **external agents**: the
  user's own program does the reasoning, and PartBuddy's gate proxy is its only way to SolidCraft,
  so tool permissions and gates still hold outside the model's control. Skills and the prompt
  layout of this loop do not apply there; a short role prompt is appended instead.

### Consequences

* Good, because every provider goes through the same loop, so gates and guards apply equally.
* Good, because the core dependencies are Apache-2.0/MIT and the MCP client is the reference SDK.
* Bad, because the loop, compaction and guards are own code to test. An own replayable evaluation
  set of SolidCraft tasks is required, because no current public tool-calling benchmark covers the
  November 2026 models.
* Bad, because the AI SDK releases very often; versions are pinned and updated after a cooldown.

## Pros and Cons of the Options

### OpenCode (MIT)

* Good, because it has a server mode, an SDK, MCP, Agent Skills and allow/ask/deny permissions;
  its formats are a good reference.
* Bad, because it is in a breaking v1 → v2 transition (GitHub "latest" v1.19.5, v2.2 released
  2026-10-27) with several releases a day, and its built-in tools target coding. Kept as plan B.

### Claude Agent SDK

* Bad, because it is governed by Anthropic's commercial terms, works only with Claude models and
  has branding rules; it cannot serve all providers equally.

### OpenAI Agents SDK, Mastra, Goose

* Bad, because the OpenAI SDK is OpenAI-first and 0.x, Mastra has non-open `ee/` parts, and Goose is
  a Rust application (plan B only for a Rust-only stack).

### LiteLLM

* Bad, because it is a Python proxy outside the main process and its package was compromised twice
  in 2026; it would sit on the path that carries API keys.
