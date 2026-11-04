# Architecture

Status: proposal for the MVP (2026-11-04). Decisions behind it: [ADRs](adr/). Every component in
the diagram has a row in [building blocks](building-blocks.md).

## Components

Green: ready-made building block. Orange: own implementation (domain logic or glue, each with an
ADR). Grey: external programs and services, installed or chosen by the customer.

```mermaid
flowchart LR
  classDef buy fill:#e3f3ea,stroke:#1d7a46,color:#1b1f24
  classDef own fill:#fbf0d9,stroke:#8a5a00,color:#1b1f24
  classDef ext fill:#eceef1,stroke:#878f99,color:#1b1f24

  subgraph Renderer["Renderer process (sandboxed, context isolation)"]
    UI["UI shell<br/>React · React Aria · Tailwind tokens · dockview"]:::buy
    Viewer["3D viewer<br/>three.js · R3F · drei · three-mesh-bvh"]:::buy
    Geo["Geometry adapter<br/>tagged-3MF parser, edges (ADR 0004)"]:::own
    Anchor["Anchor resolver (ADR 0006)"]:::own
    Chat["Chat UI<br/>assistant-ui · Streamdown"]:::buy
    State["State<br/>Zustand · XState · i18next"]:::buy
  end

  Bridge["Typed IPC bridge<br/>preload + Zod (ADR 0013)"]:::own

  subgraph Main["Main process (Node, Electron)"]
    Agent["Agent runtime<br/>loop, skills, prompt layout (ADR 0005)"]:::own
    Gate["Gate proxy and agent adapters<br/>MCP over HTTP, Claude Code headless (ADR 0015)"]:::own
    Rules["Rule engine and check gates (ADR 0010)"]:::own
    Providers["Provider adapters<br/>Vercel AI SDK + provider packages"]:::buy
    PM["Provider manager<br/>detection, capabilities (ADR 0011)"]:::own
    MCP["MCP client<br/>@modelcontextprotocol/client"]:::buy
    SCS["SolidCraft supervisor<br/>control-port subscription"]:::own
    Store["Project store<br/>better-sqlite3 · Kysely"]:::buy
    Retrieval["Retrieval<br/>SQLite FTS5 · sqlite-vec"]:::buy
    Keys["Key store<br/>@napi-rs/keyring"]:::buy
    Sidecar["Sidecar manager<br/>JSON-RPC over stdio (ADR 0012)"]:::own
    Ops["Updates · logs · crash reports<br/>electron-updater · electron-log · Sentry (opt-in)"]:::buy
  end

  Tools["cad-tools (Python sidecar)<br/>mesh, overhang, print gate, measurements"]:::own
  SC["SolidCraft<br/>control port + MCP server"]:::ext
  Orca["OrcaSlicer CLI"]:::ext
  Blender["Blender (renders)"]:::ext
  Cloud["Cloud providers<br/>Anthropic · OpenAI · Google · Z.ai · DeepSeek · Mistral · OpenRouter"]:::ext
  AgentCLI["Agent programs<br/>Claude Code · Gemini CLI"]:::ext
  Local["Local model servers<br/>Strata · Ollama · LM Studio · llama.cpp · vLLM"]:::ext
  CredMan["Windows Credential Manager"]:::ext

  UI --- Viewer
  Viewer --- Geo
  Geo --- Anchor
  UI --- Chat
  UI --- State
  State <--> Bridge
  Bridge <--> Agent
  Bridge <--> Store
  Bridge <--> SCS
  Agent --> Rules
  Agent --> Providers
  Agent --> MCP
  Agent --> Retrieval
  Rules --> Sidecar
  PM --> Providers
  Providers --> Cloud
  Providers --> Local
  PM -.probe.-> Local
  Keys --> CredMan
  Providers -.key.-> Keys
  MCP <-->|stdio| SC
  Bridge <--> Gate
  Gate <-->|stdio, headless| AgentCLI
  AgentCLI -->|MCP over HTTP| Gate
  Gate <-->|stdio| SC
  SCS <-->|control port| SC
  Sidecar <--> Tools
  Tools --> Orca
  Tools --> Blender
```

Responsibilities:

| Component | Owns | Never does |
| --- | --- | --- |
| Renderer | Layout, viewer, chat display, forms, local UI state | Holds API keys, spawns processes, reads arbitrary files |
| Typed IPC bridge | The only channel between renderer and main, schema-validated | Generic `invoke`, pass-through of file paths outside projects |
| Agent runtime | Steps, streaming, tool-call validation, compaction, permissions | Lets the model skip a gate |
| Rule engine | Hooks and gates around tool calls (export → mesh check, print → gate) | Interprets free text |
| SolidCraft supervisor | Process detection, `control.subscribe`, revision tracking, mirror requests | Model geometry itself |
| Sidecar | Numerical checks with tested Python libraries | Sees provider keys |
| Gate proxy | The only SolidCraft access of external agents; tool policy on every call | Hands out SolidCraft's own MCP server or reads agent credentials |

## Data flow: from a note to a print package

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as Renderer
  participant Agent as Agent runtime
  participant Rules as Rule engine
  participant LLM as Model (cloud or local)
  participant SC as SolidCraft
  participant Tools as cad-tools
  participant Orca as OrcaSlicer CLI

  User->>UI: Pick face, add note "R2 instead of R1"
  UI->>UI: Anchor = face name + local position + signature
  User->>UI: "Apply my notes"
  UI->>Agent: Request + notes + selection (IPC)
  Agent->>LLM: Stable prefix (system, tools, skill index) + context messages
  LLM-->>Agent: Clarifying question
  Agent-->>UI: Clarification card (options, recommendation, reason)
  User->>UI: Answer
  UI->>Agent: Answer
  LLM-->>Agent: Tool call batch (parameters.change, solid.fillet …)
  Agent->>Rules: beforeTool: schema, permissions, parameter range
  Rules-->>Agent: allow
  Agent->>SC: MCP batch
  SC-->>Agent: Result
  SC-->>UI: design.changed {document, revision} (via supervisor)
  UI->>SC: export 3mf-tagged + model.faces (one batch, via supervisor)
  UI->>UI: Parse, derive edges, BVH, swap geometry, re-resolve anchors
  Agent->>Rules: afterTool(export)
  Rules->>Tools: Mesh check, timeline check (fail closed)
  Tools-->>Rules: passed / finding / not_checked + file hash
  Rules-->>UI: Verification level TG with proof
  User->>UI: Create print package
  UI->>Agent: Print request
  Agent->>Rules: beforePrintJob
  Rules->>Tools: Overhang findings, slicing via OrcaSlicer, print gate P1–P6
  Tools->>Orca: Slice project (separate process)
  Orca-->>Tools: G-code, statistics
  Tools-->>Rules: released / finding
  Rules-->>UI: Package released (SL) or findings with required solutions
```

Latency budget per step (measured headless, see [research § 2.2](research.md#22-latency)): SolidCraft
rebuild 0.4 s to 23 s depending on the part; mirror pipeline 70 ms to 0.7 s on top. The viewer keeps
the previous revision visible with a "rebuilding" state and never blocks.

## Data model

```mermaid
erDiagram
  PROJECT ||--o{ PART : contains
  PART ||--o{ PART_VERSION : "is released as"
  PART_VERSION ||--o{ CHECK_RUN : "is checked by"
  PART_VERSION ||--o{ NOTE : "carries"
  NOTE ||--|| ANCHOR : "is placed by"
  PART_VERSION ||--o{ PRINT_JOB : "is printed in"
  PRINT_JOB ||--o{ PRINT_RECORD : "gets feedback"
  PROJECT ||--o{ CHAT_SESSION : "has"
  CHAT_SESSION ||--o{ MESSAGE : "contains"
  MESSAGE ||--o{ TOOL_CALL : "requests"
  CHAT_SESSION }o--|| PROVIDER_PROFILE : "uses"
  CALIBRATION_VALUE }o--|| VALIDITY_KEY : "is valid for"

  PROJECT { string id string title string state string next_step }
  PART { string id string name }
  PART_VERSION { string semver string design_file int revision string levels }
  CHECK_RUN { string kind string status string file_sha256 string report }
  NOTE { string id string text datetime created }
  ANCHOR { string kind string body string face_name bool exact string local string signature string status }
  PRINT_JOB { string id string gate_status string run_folder }
  PRINT_RECORD { string feature string result float measured_mm float nominal_mm string tool }
  CHAT_SESSION { string id string title }
  MESSAGE { string role string content int tokens_in int tokens_out float cost }
  TOOL_CALL { string name string args string status }
  PROVIDER_PROFILE { string id string kind string endpoint string model string key_ref }
  CALIBRATION_VALUE { string feature_class float correction_mm string proof_status }
  VALIDITY_KEY { string printer string nozzle string material string slicer_profile }
```

Rules carried over from the earlier workflow:

* Nominal dimensions and print compensation are separate parameters; compensation comes only from
  calibration values with a complete validity key.
* A verification level (R, L, TG, SC, SL, PD) is shown only with its proof; PD shows the number of
  print records.
* Check results are tied to the file hash they were computed on; a changed file resets the levels.

## Where user data lives at runtime

Nothing of this is part of the repository.

| Data | Location (Windows) | Notes |
| --- | --- | --- |
| Settings | `%APPDATA%\PartBuddy\settings.json` | electron-store with schema |
| Projects index, chats, notes, check results | `%APPDATA%\PartBuddy\studio.db` | SQLite, migrations with Kysely |
| User skills and rules | `%APPDATA%\PartBuddy\skills\`, `rules\` | Agent Skills format, JSON rules |
| Mirrored meshes, thumbnails | `%LOCALAPPDATA%\PartBuddy\cache\` | Disposable, keyed by document and revision |
| Logs | `%LOCALAPPDATA%\PartBuddy\logs\` | electron-log rotation; no prompts, keys or personal data |
| Python environment | `%LOCALAPPDATA%\PartBuddy\sidecar\` | Created offline from the bundled wheelhouse |
| Project files (designs, exports, print packages) | User-chosen folder, default `Documents\PartBuddy` | Plain files the user owns |
| API keys and ChatGPT tokens | Windows Credential Manager, target `PartBuddy/<profile id>` (ChatGPT: `PartBuddy/chatgpt/tokens#n`, chunked) | Never in files, logs, crash reports or command lines |
| ChatGPT host ID | `%APPDATA%\PartBuddy\chatgpt-host-id` | Opaque `urn:uuid`, not a credential |
| Crash reports | Local minidumps; uploaded only after opt-in | Scrubbed of paths and user names |

## Provider policy

* Every provider is used with the customer's own key or local server; there is no PartBuddy cloud
  in the request path.
* The provider manager shows per profile: data location, training default for API traffic, and
  whether images may be sent. Providers that store data outside the EU or train on API data by
  default (for example DeepSeek) are off until the user enables them after a notice.
* Photos are stripped of metadata (GPS, device serials) before they leave the machine.
* A local-only mode disables all cloud profiles.
* Subscription plans ([ADR 0015](adr/0015-subscription-access.md)): Claude through the user's own,
  unmodified Claude Code with its own sign-in; ChatGPT through Sign in with ChatGPT; Gemini through
  the user's Gemini CLI. PartBuddy never offers Claude.ai or Google sign-in itself and never reads
  those credentials.

## Security boundaries

* Renderer: sandbox, context isolation, no Node integration, strict content security policy, no
  remote content in privileged windows.
* Electron fuses at package time: RunAsNode off, ASAR integrity on, load only from ASAR.
* Tool calls: schema validation, per-tool permissions (allow, ask, deny), loop guard; gates run in
  the rule engine, not in the model.
* External processes (SolidCraft, OrcaSlicer, Blender, sidecar) start with argument arrays, never
  through a shell with concatenated strings; file paths are checked against the project folder.
