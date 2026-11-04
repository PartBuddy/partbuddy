---
status: accepted
date: 2026-11-04
---

# Subscription plans through the official agent programs and Sign in with ChatGPT

## Context and Problem Statement

PartBuddy must work with the plans people already pay for (Claude Pro/Max, ChatGPT Plus/Pro,
Google AI plans), not only with API keys (requirement of the product owner, 2026-11-04, issue
#13). Each provider sets its own rules for third-party apps. PartBuddy may not handle a credential
the provider reserves for its own apps, and its gates ([ADR 0010](0010-rule-engine-and-check-gates.md))
must keep working whichever route a request takes. Which route fits each provider?

Evidence: [research § 3.6](../research.md#36-subscription-plans-in-third-party-apps), checked
against the providers' own pages on 2026-11-04.

## Decision Drivers

* Comply with each provider's published terms; never collect, store or forward credentials a
  provider reserves for its own sign-in flow
* Gates and tool permissions stay outside the model's control on every route
* The user sees which account type and plan is used, but PartBuddy keeps no account data
* As little own code as possible on the credential path

## Considered Options

Claude (Anthropic):

* Run the user's unmodified Claude Code in headless mode (`claude -p`, stream-json)
* ACP adapter `@agentclientprotocol/claude-agent-acp` 0.100.0 (Claude Agent SDK underneath)
* Claude.ai OAuth in PartBuddy itself

ChatGPT (OpenAI):

* Sign in with ChatGPT for open-source apps, used by PartBuddy's own agent loop
* Drive the user's Codex CLI (`codex app-server`) signed in with ChatGPT

Gemini (Google):

* Drive the user's Gemini CLI through the Agent Client Protocol (ACP)
* Use the Gemini CLI's Google sign-in tokens directly

## Decision Outcome

**Claude: unmodified Claude Code in headless mode.** Anthropic's Claude Code terms allow running
Claude Code in a product under the Commercial Terms, as long as the binary is unmodified, no
built-in sign-in method is removed and each end user authenticates with their own subscription or
key; they state explicitly that this does not prevent an end user from signing in to the
unmodified Claude Code binary with their own subscription. Third-party apps may not offer
Claude.ai login themselves, and agents built on the Claude Agent SDK need Anthropic's prior
approval for it [research 206, 207]. Therefore:

* PartBuddy starts the installed `claude` program with an argument array: `-p`, stream-json in
  and out, `--tools ""` (no built-in tools), `--strict-mcp-config` with only the gate proxy,
  `--allowedTools mcp__partbuddy`, `--setting-sources ""` (no user hooks, plugins or settings),
  `--no-session-persistence` and an appended role prompt. `--bare` is not used, because it reads
  only API keys.
* Sign-in happens in Claude Code (`claude auth login`), which opens Anthropic's page in the
  browser. PartBuddy reads `claude auth status --json` and keeps only `loggedIn`, `authMethod`
  and `subscriptionType`; it never reads, logs or stores the e-mail address or tokens.
* **Subscription by default** (decided 2026-11-04): PartBuddy uses Claude Code while it is signed in
  with a Claude subscription (`authMethod: claude.ai`). Signed in any other way, for example with an
  API key that Anthropic bills separately, PartBuddy shows a notice and starts no session, unless the
  user allows API billing on purpose ("Use the API key anyway"; stored per installation, off by
  default, revocable). The check runs again before every new session. Claude Code itself is not
  changed and keeps all its sign-in methods: Anthropic's terms forbid products to remove or restrict
  them, so the API route stays open for users who want it.
* The publisher of PartBuddy accepts Anthropic's Commercial Terms once, through the existing
  Claude Console account (decided 2026-11-04). No separate written confirmation is requested
  (decided 2026-11-04): the published terms cover this route; the remaining risk of a different
  reading by Anthropic is accepted knowingly. End users only install Claude Code and sign in with
  their own subscription; they need no Console account and accept nothing beyond their own plan.
* Product texts may say that PartBuddy "runs Claude Code"; Anthropic's names and logos are not
  used as part of PartBuddy's own names or logos.

**ChatGPT: Sign in with ChatGPT in PartBuddy's own agent loop.** OpenAI offers ChatGPT plan usage
to all open-source apps: dynamic client registration (`client_id=dynamic_agent_client`), PKCE on a
`127.0.0.1` loopback callback, no client secret, scopes for Responses API access, a stable
`ext_agent_host_id` per installation, Plus and Pro plans [research 208]. Built in issue #16:

* The "Continue with ChatGPT" button opens OpenAI's page in the system browser (only
  `https://auth.openai.com/` is allowed). The ID token is verified with `jose` against OpenAI's
  JWKS (issuer, audience = issued client ID, nonce) before anything is stored; without the
  `chatgpt.tokens.use.direct` scope the account is kept but plan usage stays off.
* Tokens live only in the Windows credential store. One credential holds at most 2560 bytes, less
  than a token set, so the set is split into chunks under `PartBuddy/chatgpt/tokens#n`; the issued
  client ID is kept after sign-out for the next sign-in. The host ID is an opaque `urn:uuid` in
  `%APPDATA%\PartBuddy\chatgpt-host-id`. Access tokens are renewed two minutes before expiry,
  one renewal at a time; sign-out revokes the refresh token at OpenAI.
* Requests run through the Vercel AI SDK loop of [ADR 0005](0005-ai-layer.md) with
  `@ai-sdk/openai`'s Responses model, the access token set per request by a custom `fetch`, all
  SolidCraft tools in one namespace `solidcraft` (required by the preview), `store: false`,
  `instructions` instead of system messages, the whole history in every request and no
  temperature or output-token limit. Tool calls go through the same policy as the gate proxy.
  OpenAI's plan errors (usage limit, not eligible, unsupported capability) are shown as such;
  PartBuddy never switches to another billing.

**Gemini: the user's Gemini CLI over ACP.** Google states that accessing the services behind
Gemini CLI with third-party software using Gemini CLI's OAuth violates its terms [research 209];
driving the unmodified Gemini CLI through its own ACP mode is the documented integration path.
Built in a later change with `@agentclientprotocol/sdk`.

**Gate proxy (own code).** External agents never get SolidCraft's MCP server directly. PartBuddy
runs an MCP server on `127.0.0.1` with a random per-session bearer token and a host check, lists
SolidCraft's tools unchanged and passes every call through the tool policy before forwarding it to
SolidCraft (`solidcraft-cli mcp --connect`). The token lives in an MCP configuration file only the
user can read, never on a command line. Tools that discard the design or touch files (`new_design`,
`open`, `save`, `export`, and `file.*`/`doc.*` commands inside `execute` and `batch`) are refused
until the confirmation and export gates of ADR 0010 exist. Since 2026-11-04 the policy also
decides the tools SolidCraft runs as `batch` steps (`save`, `export`, `open`, `new_design`, a
nested `execute`) like the tools themselves, and refuses `settings.*` and `diagnostics.*`
commands, `edit.checkpoint`/`edit.restore_checkpoint` (they would drop the work log's later
steps, ADR 0018) and any command whose `path` is text other than a sketch curve id (SolidCraft
uses `path` for files and for geometry alike). Every refusal names what to do instead.

**Tool notes.** Both routes add PartBuddy's notes after SolidCraft's server instructions
(`apps/desktop/src/main/agents/toolNotes.ts`): the proxy as its MCP `instructions`, the ChatGPT
loop in its `instructions` field, which before carried only PartBuddy's role. The notes name the
policy's rules and the traps of SolidCraft 0.30.1 checked headless: a misspelt name in
`set_parameter`/`parameters.change` silently creates a new parameter, arcs drawn clockwise are
stored counter-clockwise with start and end (and their point ids) swapped.

### Consequences

* Good, because each route follows the provider's published terms and PartBuddy holds no Claude or
  Google credentials at all.
* Good, because the gate proxy applies the same policy to every external agent, and the user sees
  every tool decision in the assistant panel.
* Bad, because two agent paths exist (own loop and external agents); prompts, skills and cost
  display differ between them. External agents report no per-request cost on subscriptions.
* Bad, because Claude Code's flags and stream-json format may change between releases; a contract
  test (opt-in, it spends subscription usage) runs the real program against SolidCraft.
* Bad, because ChatGPT plan usage through Sign in with ChatGPT is a preview with documented
  limitations (no `max_output_tokens`, no `temperature`, no hosted tools).

### Confirmation

* Unit tests cover the tool policy, the gate proxy over real MCP HTTP (token, host check,
  refused tools never reach SolidCraft) and a full turn with a test double of Claude Code.
* `apps/desktop/e2e/solidcraft.contract.spec.ts` lets the installed Claude Code build a box in an
  own SolidCraft instance through the gate proxy (`PARTBUDDY_E2E_CLAUDE=1`); first passed on
  2026-11-04 with Claude Code 2.1.302 (Max plan) and SolidCraft 0.30.1.
* Unit tests cover the sign-in (PKCE, dynamic registration, declined consent, foreign keys),
  chunked credential storage, token renewal and revocation, and the ChatGPT loop against a
  recorded-format Responses stream (preview rules, namespaced tools, history, refused tools).
* With `PARTBUDDY_E2E_CHATGPT=1`, `apps/desktop/test/chatgpt.live.test.ts` signs in through the
  browser and runs the loop against OpenAI, and the contract test lets ChatGPT build the same box
  in an own SolidCraft instance; first passed on 2026-11-04 with `gpt-6.1-sol` (29 s, four
  checked tool calls, 4000 mm³).

## Pros and Cons of the Options

### ACP adapter for Claude

* Good, because one protocol would serve all external agents.
* Bad, because it is built on the Claude Agent SDK, for which Anthropic allows Claude.ai sign-in
  only after prior approval.

### Claude.ai OAuth in PartBuddy

* Bad, because Anthropic does not permit third-party apps to offer Claude.ai login or to collect
  Claude.ai credentials or session tokens.

### Codex CLI for ChatGPT

* Good, because Codex brings its own tools and sign-in.
* Bad, because PartBuddy would control fewer of the tools, and OpenAI documents Sign in with
  ChatGPT as the path for third-party apps; Codex app-server is described there only as a runtime
  fed with the app's own token.

### Gemini CLI tokens used directly

* Bad, because Google names this a violation that can lead to account suspension.
