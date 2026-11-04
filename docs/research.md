# Research

Status: 2026-11-04. This document collects the evidence behind the
[architecture decision records](adr/) and the [building blocks](building-blocks.md). ADRs link here
instead of repeating the evidence.

Method and markers:

* Versions and release dates were read live on 2026-11-04 from the npm registry, the GitHub REST
  API, crates.io, PyPI and NuGet [1][2][3][4][5]. "Latest" means the newest stable release on that
  date. The pins in [building blocks](building-blocks.md) follow the 7-day release-age rule and can
  be one or more patch releases older.
* Preview, beta, RC, canary and nightly releases are never recommended. **measured**: own benchmark
  or observation (SolidCraft 0.30.1 headless CLI, Node 26.13.0, Windows 11). *possibly outdated*:
  not verifiable live on 2026-11-04. *(snippet)*: taken from a search-engine extract because the
  page itself could not be fetched; lower confidence.
* Nothing in this document is legal advice. **[counsel]** marks points that need review by a lawyer
  qualified in EU IT, copyright and data-protection law before the first paid release.
* Fetched pages were treated as data. Project documentation addressed to AI agents (Strata, Kiln,
  Partwright) was noted and not acted on; no prompt-injection attempt was found.

## 1. Technology stack

Question: which application stack fits a commercial, Windows-first desktop app with a CAD-grade 3D
view (face and edge picking), docking, multi-provider AI chat with MCP tool calling, a Python
sidecar and a signed, auto-updating installer, with macOS and Linux possible later? Decision:
[ADR 0002](adr/0002-technology-stack.md).

**Criteria and weights**

| # | Criterion | Weight | Why |
|---|---|---|---|
| C1 | 3D view for B-rep-derived meshes incl. face/edge picking | 20 | Live mirror and topology notes depend on it |
| C2 | UI maturity: docking, components, palette, WCAG 2.2 AA, DE/EN | 15 | Professional CAD-grade UI; accessibility is a hard requirement |
| C3 | Ecosystem: AI providers, MCP client, chat/Markdown, 3D helpers | 12 | Multi-provider chat with MCP is a large feature |
| C4 | Currency and maintenance | 10 | Security fixes and long-lived dependencies |
| C5 | Python sidecar via uv | 8 | Domain checks already exist in Python |
| C6 | Distribution: installer, auto-update, signing, CI | 10 | Required for a commercial Windows release |
| C7 | Platforms (Windows first) | 5 | Cross-platform is "later" |
| C8 | Memory and disk footprint | 5 | Noticed, rarely decisive next to CAD, slicer and renderer |
| C9 | Effort and maintainability (languages, talent pool) | 10 | Small team; every extra language multiplies cost |
| C10 | Licence fit for commercial distribution | 5 | Knock-out only if obligations are unacceptable |

**Weighted matrix** (scores 1–5; evidence per cell in the bullets below)

| Criterion (weight) | Electron + TS + three.js | Tauri 2 + TS + three.js | .NET WPF/WinUI + Helix | Avalonia 12 + own 3D | Rust native (egui/iced/Slint + wgpu) | Qt 6.12 + OCCT / Quick 3D |
|---|---|---|---|---|---|---|
| C1 3D (20) | 5 | 4 | 3 | 2 | 3 | 4 |
| C2 UI (15) | 5 | 5 | 4 | 4 | 2 | 4 |
| C3 Ecosystem (12) | 5 | 4 | 4 | 4 | 3 | 2 |
| C4 Currency (10) | 5 | 4 | 3 | 5 | 3 | 5 |
| C5 Sidecar (8) | 5 | 4 | 5 | 5 | 4 | 4 |
| C6 Distribution (10) | 5 | 5 | 4 | 4 | 3 | 3 |
| C7 Platforms (5) | 5 | 3 | 1 | 3 | 4 | 5 |
| C8 Footprint (5) | 2 | 3 | 5 | 4 | 5 | 4 |
| C9 Effort (10) | 5 | 4 | 3 | 3 | 1 | 2 |
| C10 Licence (5) | 5 | 5 | 5 | 5 | 5 | 2 |
| **Total (max 500)** | **485 (4.85)** | **420 (4.20)** | **363 (3.63)** | **368 (3.68)** | **298 (2.98)** | **351 (3.51)** |

Sensitivity: Electron leads in every criterion except footprint. Tauri overtakes only if the
footprint weight rises by about 20 points, or if macOS/Linux are dropped and download size becomes a
primary goal.

**Evidence per candidate** (latest stable on 2026-11-04)

* **Electron** 45.2.2 (2026-11-03) ships Chromium 156 and Node 24.22.2 on every OS [6]. New major
  every 8 weeks, latest three majors supported [7]. One-window Windows 11 test: 106.1 MB installer,
  367 MB on disk, 149 MB private memory idle [8]. Signing via Azure Artifact Signing or EV/OV
  certificates is documented [9].
* **three.js** r187 (0.187.0, 2026-10-30) [10] and **three-mesh-bvh** 0.9.18 (2026-11-03) [11] are
  the most mature web blocks for picking. three.js still labels WebGPURenderer experimental;
  custom-shader paths are unsupported there and the manual recommends WebGLRenderer for WebGL2 apps
  [12].
* **Tauri** 2.12.5 (2026-10-21) [13] uses the OS web view: WebView2 on Windows (Edge 156 on
  2026-11-01 [14]), WKWebView, WebKitGTK. WebGPU on macOS needs 26+ [15]. On Linux WebGL can
  silently take a slow path; sidecars need target-triple names and shell capabilities; the updater
  requires signed bundles [16]. 1.05 MB installer, but 142 MB private memory on Windows because
  WebView2 runs Chromium (7 processes) [8]. stdio MCP needs Rust (rmcp 3.8.0, 2026-10-26) or plugins
  [17].
* **.NET**: .NET 10.0.14 LTS (2026-10-25, end of support 2028-11-14) [18]. Helix Toolkit 3.1.2
  (2025-11-25) builds on SharpDX, archived since 2020, and is DirectX 11, Windows only [19][20]. WPF
  idle memory 74 MB [8]. MCP C# SDK 2.3.1 (2026-11-03) and Microsoft.Extensions.AI 10.11.0
  (2026-10-14) exist [21][5].
* **Avalonia** 12.1.5 (2026-11-02); 12.0 released 2026-04-07 [22]. The Helix Avalonia backend is
  DirectX 11 (Windows only) [19]; cross-platform 3D exists only as community demos [23]. Paid
  add-ons from about €299 per seat and year [22].
* **Rust native**: wgpu 30.0.1 (2026-08-22) [24]; iced 0.14 (2025-12-07) still has accessibility as
  an open issue [25]; Slint 1.18.1 (2026-09-21) is royalty-free for proprietary desktop apps with an
  attribution [26]. Camera, picking, docking and chat would be own work.
* **Qt** 6.12.0 LTS (2026-09-30, five-year maintenance) [27]. Qt Quick 3D is GPL-only for
  open-source users [28]; small-business licence €546 per developer and year, capped at €1M revenue
  and 3 seats [27]; LGPL parts carry relink and source obligations [28]. No first-party MCP or
  multi-provider AI SDK for C++ was found.
* **Screened out**: Electrobun 2.0.5 (2026-10-26; runtime switched back from its own runtime to Bun
  in 2.0.4) [29]; Wails v3, stable only since 2026-10-26, 205–209 MB memory [30][8]; Compose
  Multiplatform 1.12.2 (2026-10-15), no CAD-grade 3D component [31]; Flutter 3.47.9 (2026-10-29)
  with flutter_scene 0.24.3 (2026-10-09, pre-1.0) and experimental multi-window [32].

**Real-product evidence**

| Product | Stack | Relevance |
|---|---|---|
| Plasticity (Parasolid-based CAD) | Public repository: TypeScript, `package.json` lists `electron` and `three` (old pins: Electron 17, three 0.140); viewport selection on three.js [33][34]. Latest release v26.2.4 (2026-10-29) [35] | Electron + three.js carries a professional B-rep modeller UI. Current versions are not public (see conflict in section 8). |
| Zoo Design Studio (v1.5.3, 2026-10-28) | Electron 40 + three.js 0.184 + electron-builder; moved from Tauri v2 to Electron in 2024 (PR #3812, merged 2024-09-06) [36] | A CAD team chose Electron over Tauri; the public reason was not found. |
| Shapr3D | C++20 core, own DirectX 11 / Metal renderer, native UI per platform [37] | Native-per-platform needs a large team. |
| Zed | Rust + GPUI, 120 fps [38] | Rust-native excellence at the cost of an own UI framework. |
| FreeCAD 1.1.4 (2026-09-28) | Qt + Open CASCADE [39] | Classic Qt + OCCT reference. |

**Risks of the recommended stack**

1. Picking and note anchoring need stable topology IDs, independent of the stack (section 2).
2. WebGPU in three.js is experimental: start on WebGLRenderer [12].
3. Footprint (about 106 MB installer, 150 MB idle memory) [8]: differential updates, pruned Chromium
   locales (48 MB of `locales` in the test build) [8].
4. Hardening discipline: context isolation, sandboxed renderers, typed preload allow-list,
   `@electron/fuses`, ASAR integrity, no remote content in privileged windows.
5. Upgrade cadence: only the latest three majors get fixes [7]; plan an Electron bump every two to
   three months behind a thin `platform` adapter.
6. Code signing eligibility (section 4).
7. Some npm `latest` tags lag GitHub tags (electron-updater, Velopack) [40][41]: pin exact versions
   in the lockfile.

**Recommendation**: Electron + React/TypeScript + three.js (4.85), with the Node main process as
orchestrator for MCP, AI providers and the uv sidecar. Runner-up: Tauri 2 with the same front end
(4.20), if installer size or a Rust backend becomes important; the renderer stays free of Electron
APIs so that only the main-process layer would change, as Zoo did in the opposite direction [36].

## 2. Geometry pipeline

Decision: [ADR 0004](adr/0004-geometry-pipeline.md). Facts about SolidCraft:

* SolidCraft's B-rep kernel is a crate implemented with `truck`; OCCT is used only as an external
  test oracle [42]. Licence MIT OR Apache-2.0 at v0.30.1 (2026-11-02); GitHub's detector shows only
  Apache-2.0 [43][44]. v0.40.0 exists only as release candidates [44].
* `file.export {format: "3mf-tagged"}` writes a plain 3MF in which every triangle carries `ft:face`,
  the B-rep face index of its body; welded watertight, f64 shortest-round-trip coordinates,
  deterministic bytes; format "Version 1 (2026-10)" with a versioned namespace; quality `standard`,
  `fine`, `finest` [45].
* **measured**: `ft:face` equals the `index` reported by `model.faces` (closest-point test of every
  face's `point`: 30 of 30 and 410 of 410 faces matched; per-face mesh area within 2.7 %, worst
  11.6 % on small annular counterbore floors at `standard` quality).
* **measured**: face indices are not stable across rebuilds, face names are. After one
  `parameters.change` (L + 40 mm), 18 of 30, 93 of 110 and 392 of 410 indices pointed to another
  face; the name sets were identical, unique and all `exact: true`.
* Names come from kernel history (`F2:side:l1`, `F3:blend:F2:side:l1|F2:side:l2`,
  `F5:bore:side:0@F6.1`); references resolve by exact name, then merge/split lineage, then nearest
  piece, otherwise they are reported as lost. Features without kernel history (loft sides, sheet
  metal, plastic, surface features, emboss, rib, replace-face, faceted threads, hole tools) get
  geometric names marked `exact: false` [46]. A proposal for lineage fallback and ordinals exists
  but is not adopted [47].
* Following the design: `control.subscribe` delivers `design.changed {document_id, revision}`
  (coalesced to at most about 10 per second); `document.revision` changes on every design change
  including undo/redo, never on view or selection; exports run on a copy and block nothing;
  `ui.pick` returns body, face index, world point, normal and edge/vertex hits, also headless [48].
* MCP: `body_topology` returns edges (index, midpoint, length, ends) and faces (index, name, area,
  centroid, normal, point, cylinder origin/axis/radius); it cannot be a `batch` step, where
  `model.edges` and `model.faces` are used instead. The `export` tool lists `step`, `3mf`,
  `3mf-tagged`, `stl`, `stla`, `obj`, `urdf`; exports need `--allow-path` [49].

### 2.1 Paths compared

| Path | Face mapping to SolidCraft | Edges | Cost per step | Licence | Verdict |
|---|---|---|---|---|---|
| Tagged 3MF + `model.faces` (fflate 0.8.3, 2026-05-16 [1], + own parser) | Exact index; joined to persistent names per revision | Derived where neighbouring triangles carry different `ft:face`; named `faceA\|faceB` like SolidCraft edges [46] | Parse 2.0–18.3 ms (**measured**) | MIT | **Chosen** |
| STEP + occt-import-js 0.0.23 (2024-12-03) | `brep_faces` triangle ranges [50], but the STEP face set differs: 22 vs 30, 70 vs 110, 346 vs 410 faces (cylinder halves merged) (**measured**) | None in output (**measured**) | 40.6–650.8 ms plus STEP export 12–230 ms (**measured**) | LGPL-2.1 | Fallback for foreign STEP only |
| replicad 1.2.0 (2026-10-23) on replicad-opencascadejs 1.1.0 (2026-09-04) | `faceGroups` with `faceId` | `meshEdges()` → `edgeGroups` [51] | Not measured | MIT / LGPL-2.1-only | Alternative fallback |
| opencascade.js 1.1.1 (2020-09-27) | Full OCCT API | Do it yourself | – | LGPL-2.1-only | Rejected: stale, newer only as beta [1] |
| Native OCCT 8.0.1 (2026-07-30) / cadquery-ocp 8.0.1.1.0 (2026-10-05) | Full API | Full API | – | LGPL-2.1 + exception / Apache-2.0 (*possibly outdated*) | Rejected: second CAD runtime to ship [52][53] |
| glTF + `EXT_mesh_features` (Draft) | Per-vertex feature IDs; border vertices must be split per face [54] | – | Extra conversion | – | Export/cache format only [55][56] |

* three.js `3MFLoader` reads only the v1/v2/v3 namespaces and drops `ft:face` [57], so a small own
  parser is needed.
* three-mesh-bvh offers `raycastFirst`, `closestPointToPoint`, `shapecast`, worker builds and a
  clipped-edges example; `MeshBVH` reorders the index buffer in place unless built with `indirect:
  true` [11].
* **measured**: deriving face-boundary edges took 1.2 / 2.3 / 5.0 ms with 0 open half-edges
  (watertight). Smooth seams (two halves of a cylinder) need filtering by face data or dihedral
  angle.
* Fallback chain: tagged 3MF → plain 3MF with faces assigned by closest point to
  `model.faces[].point` → STEP with occt-import-js (signature-only anchoring) → rendered image only.

### 2.2 Latency

Method (**measured**): Intel Core i7-14700KF, 64 GB RAM, Windows 11; SolidCraft CLI 0.30.1 headless
(`run --results --timings --profile`); Node 26.13.0 (2026-10-28) with occt-import-js 0.0.23, fflate
0.8.3, three 0.187.0 (2026-10-30), three-mesh-bvh 0.9.18 (2026-11-03) (exact pins, install scripts
disabled); medians of 7 runs. Synthetic FDM plate (L × W × 6 mm, R5 corners, counterbored M3 holes
in a rectangular pattern): p4 = 2 × 2 holes, p20 = 5 × 4, p80 = 10 × 8. Script: build →
`model.faces` → export 3mf-tagged and STEP → `parameters.change L += 40` → `model.faces` → export
again.

| Step (**measured**) | p4 (30 faces) | p20 (110 faces) | p80 (410 faces) |
|---|---|---|---|
| SolidCraft rebuild after `parameters.change` (of which booleans) | 408 ms (347) | 2,978 ms (2,806) | 23,137 ms (22,555) |
| `file.export` 3mf-tagged | 9.9–12.0 ms | 24–38 ms | 91–96 ms |
| `model.faces` | 37–58 ms (11 KB JSON) | 154 ms (44 KB) | 524–596 ms (167 KB) |
| `file.export` STEP (comparison) | 12–14 ms | 44–47 ms | 230 ms |
| Tagged-3MF size / triangles | 50 KB / 3,548 | 159 KB / 11,244 | 410 KB / 26,772 |
| Unzip + parse tagged 3MF (JS) | 2.0 ms | 6.5 ms | 18.3 ms |
| Derive face-boundary edges | 1.2 ms | 2.3 ms | 5.0 ms |
| three-mesh-bvh build (indirect) | 0.8 ms | 2.7 ms | 6.3 ms |
| STEP → occt-import-js (alternative) | 40.6 ms | 125.5 ms | 650.8 ms |
| **Pipeline overhead (3MF route, without rebuild and upload)** | **55–75 ms** | **190–205 ms** | **650–720 ms** |

* The rebuild dominates, mostly kernel booleans. Earlier live sessions saw much slower rebuilds:
  228 s for six sequential `parameters.change`, sketch batches up to 98 s (**measured**);
  `coalesce_parameters` avoids repeated rebuilds [49].
* `model.faces` is the largest pipeline item for big parts (mostly naming). Mitigation: export and
  `model.faces` in one `batch` [49], only for bodies whose revision changed.
* 1,000 closest-point queries took 6–11 ms (**measured**). Files are local (50–410 KB per step).

Budget targets: small part (≤ 50 faces) viewer updated < 0.6 s after the step; medium (100–150
faces) rebuild 1–3 s + about 0.2 s; large (400–500 faces) rebuild 10–25 s + about 0.7 s. The viewer
keeps the previous mesh with a "rebuilding" state and never blocks.

### 2.3 Note anchoring

Decision: [ADR 0006](adr/0006-note-anchoring.md) (own implementation).

| System | Approach |
|---|---|
| FreeCAD 1.0 (2024-11-19) | Merged a topological-naming mitigation, active in Sketcher and PartDesign, officially "not finished" [58] |
| Onshape | Features store queries (`qCreatedBy(id)`, `qContainsPoint`) keyed by hierarchical operation IDs, re-evaluated on every regeneration; transient IDs are valid only inside one evaluation [59]; a split face loses identity unless tracked [60] *(forum)* |
| Autodesk Fusion | `entityToken` resolved via `findEntityByToken`; tokens for the same entity can differ and must not be compared as strings [61] *(snippet; page returned 404)* |
| Plasticity | Direct modeller, "no history tree required", so no persistent-naming problem of this kind [34] |
| SolidCraft | History-derived names, lineage lookup, explicit split/merged/found-by-geometry/no-longer-exists messages [46] |
| Literature | Boundary-based scoring of candidate faces (topological entity matching, 2003) [62] *(search result, not read in full)* |

Chosen anchor: persistent face name (what a SolidCraft pick stores internally [46]) plus a
face-local position; signature and free point as fallbacks. Re-resolution order: exact name (place
by face-local u/v or angle/height, snap with three-mesh-bvh restricted to that face ID [11]) →
lineage piece (`name#[…]`, `#k`) nearest the old point, status `moved` → signature score (type gate,
normal/axis < 5°, radius ± 5 %, area ratio, centroid distance, neighbour-name overlap; accept ≥ 0.75
with margin ≥ 0.15, else `ambiguous`; weights are a first proposal) → free point relative to the
body bounding box → `orphaned` with a re-attach action. Edges re-resolve as face pairs `A|B`; `~k`
multi-edges need the point fallback; pattern instances (`@F…k`) and `exact: false` faces always get
the signature check [46]. Names were migrated once already (designs before format 14), so the
SolidCraft version is pinned per design [46]. No maintained geometric-hashing library for B-rep face
matching was found; brute-force matching over ≤ 500 faces needs no library.

## 3. AI layer

Decision: [ADR 0005](adr/0005-ai-layer.md) (own thin agent runtime), with
[ADR 0010](adr/0010-rule-engine-and-check-gates.md) and [ADR 0011](adr/0011-provider-manager.md).

### 3.1 Provider abstraction and agent cores

**Provider abstractions** (latest stable 2026-11-04)

| Option | Version (date) | Licence | Providers | Tool loop | Usage / cost | Notes |
|---|---|---|---|---|---|---|
| Vercel AI SDK (`ai`) | 7.0.162 (2026-11-03) | Apache-2.0 | First-party Anthropic, OpenAI, Google, DeepSeek, Mistral, OpenAI-compatible; OpenRouter 3.1.0 (2026-09-19) | Multi-step (`stopWhen`, `prepareStep`), `repairToolCall` | Input/output/reasoning/cache tokens; **no cost** | `abortSignal`, `timeout {totalMs, stepMs, firstChunkMs}`, `maxRetries`, `Output.object` with Zod; `extractReasoningMiddleware` [1][63] |
| LangChain.js | 1.6.1 (2026-11-03) | MIT | Via `@langchain/*` | Yes | Tokens | Heavier abstraction [1] |
| LiteLLM (Python) | 1.108.0 (2026-11-04) | MIT (core) | About all | Normalised | **Cost map** | Compromised twice in 2026 (below) [4] |
| rig / genai (Rust) | 0.46.0 (2026-10-31) / 0.7.3 (2026-11-03) | MIT / MIT OR Apache-2.0 | 20+ / about 40 incl. Z.ai | Yes | Tokens | Still 0.x [64][65] |
| Microsoft.Extensions.AI | 10.11.0 (2026-10-14) | MIT | Via `IChatClient` packages | `FunctionInvokingChatClient` | – | .NET only [66] |

Supply chain: LiteLLM was compromised on PyPI on 2026-03-24 (1.82.7/1.82.8) and on 2026-10-21
(1.107.0, also Docker images, about 2 h, credential stealer and remote-access trojan published
through the project's own release workflow) [67][68]. A Python proxy on the API-key path is a
high-value target.

**MCP SDKs with stdio client**: TypeScript v2 `@modelcontextprotocol/client` 2.4.0 (2026-10-23,
Apache-2.0 for new code, MIT for old code; stable line since 2026-07-27; implements spec 2026-07-28;
v1 `@modelcontextprotocol/sdk` 1.32.2 keeps fixes for at least six months) [69][1]; `@ai-sdk/mcp`
2.0.90 (2026-11-03) with `Experimental_StdioMCPTransport`, Node only [70]; Python `mcp` 2.3.0
(2026-10-02); Rust `rmcp` 3.8.0 (2026-10-26); C# `ModelContextProtocol` 2.3.1 (2026-11-03)
[4][17][21]. Use the official TS v2 client and wrap each MCP tool as an AI SDK tool; supervise the
SolidCraft stdio process.

**Embeddable agent cores**

| Core | Licence | Providers | Fit |
|---|---|---|---|
| OpenCode v1 1.19.5 (2026-10-28) / v2 `@opencode/sdk` 2.2.5 (2026-10-30) | MIT [71] | Many, via AI SDK and models.dev | Agent Skills, MCP, allow/ask/deny permissions with `doom_loop` guard; v1 HTTP server, v2 in-process host [72]; breaking v1 → v2 transition with several releases a day [73]; built-in tools target coding. **Plan B and format reference.** |
| Claude Agent SDK 0.3.318 (2026-11-03) | Proprietary (Anthropic Commercial Terms) | Claude only | Excluded: not all providers equal, branding rules [74][75] |
| OpenAI Agents SDK 0.21.0 (JS, 2026-10-20) | MIT | OpenAI-first | 0.x, OpenAI-centric [1] |
| Mastra 1.82.0 (2026-11-04) | Apache-2.0 except `ee/` | Via AI SDK | Licence split, heavy [76] |
| Goose v1.57.0 (2026-10-28) | Apache-2.0 | 15+ | Rust application; plan B only for a Rust stack [77] |

Embed a core only if all hold: permissive licence; all providers equal including local servers;
built-in tools and system prompt fully replaceable; gates fail-closed outside the model's control;
stable API (≤ monthly breaking changes); controllable compaction with a byte-stable prefix; no extra
runtime on Windows. OpenCode fails stability and partly replaceability, so the product runs its own
loop on the AI SDK and the MCP client and copies OpenCode's formats (Agent Skills, permission rules)
to keep a switch possible. Stack coupling: the MCP stdio clients need Node, which the Electron main
process provides; Tauri would need a Node sidecar or a Rust runtime [70].

**Chat UI blocks**: assistant-ui 0.15.32 (2026-10-28, MIT, still 0.x) with AI SDK runtime and tool
UIs [78]; AI Elements 1.9.1 (2026-10-14) is **deprecated end of November 2026** in favour of a
shadcn/ui version [79]; Streamdown 2.7.1 (2026-10-19) for streaming-safe Markdown [80].

### 3.2 Capability matrix

Tool-calling reliability: no independent benchmark covers the November 2026 models. BFCL v4 was last
updated 2026-04-12 (top: Claude Opus 4.5, 77.47 %) [81]; τ²-bench leaders Qwen3.5-397B-A17B 87.9 %,
Gemini 3.0 Pro 85.4 %, Claude Opus 4.5 85.3 %; τ³-Banking Qwen 3.8 Max 55.2 %, Claude Opus 5 48.7 %
[82]. Vendor cards report only their own suites [83]. CAD-Studio needs its own replayable eval set
of SolidCraft tasks per model.

Prices in USD per million tokens (input / output, standard tier). † = from OpenRouter's model API or
models.dev because the provider page is JavaScript-rendered. All rows support tool calling.

| Provider | Model | Role | Context | Image in | Thinking control | Price | Source |
|---|---|---|---|---|---|---|---|
| Anthropic | Claude Fable 5.1 | Top reasoning | 1M | Yes | Adaptive, default `high` | 10 / 50 | [84] |
| Anthropic | Claude Opus 5.5 | Default | 1M | Yes | Adaptive, default `medium` | 4 / 20 | [84] |
| Anthropic | Claude Sonnet 5.5 | Balanced | 1M | Yes | Adaptive (`disabled` not supported) | 2 / 10 | [84] |
| Anthropic | Claude Haiku 5.5 | Small | 1M | Yes | Adaptive | from 0.10 / 0.50 | [84] |
| OpenAI | GPT-6 Astra | Flagship | 1.05M | Yes | low…max | 10 / 50 | [85] |
| OpenAI | GPT-6.1 Sol / Terra | Balanced / fast | 1.05M | Yes | low…max / none…max | 2 / 10, 1 / 5 | [85] |
| OpenAI | GPT-6 Luna | Small | 1.05M | Yes | none…max | 0.10 / 0.50 | [85] |
| Google | Gemini 4 Argon | Flagship | 1,048,576 | Yes (+ audio, video) | Supported | 2 / 10 † | [86][87] |
| Google | Gemini 3.8 Flash | Fast | 1,048,576 | Yes | Yes | 0.75 / 3.75 † (OpenRouter 0.83 / 4.12) | [86][87] |
| Google | Gemini 3.5 Flash-Lite | Small | 1,048,576 | Yes | Yes | 0.30 / 2.50 † | [86][87] |
| Z.ai | GLM-5.3 / GLM-5.3-Flash | Flagship / small, open weights | 1M | No / yes | Yes | 1.40 / 4.40 †, 0.15 / 0.50 † | [87] |
| DeepSeek | `deepseek-flash` (V4.1-Flash-1017) | Fast, open weights | 1M (out 384K) | Yes | Default on, switchable | Peak 0.30 / 1.20, off-peak 0.15 / 0.60 | [88] |
| DeepSeek | `deepseek-v4-pro` | Flagship | 1M | No | Switchable | Peak 1.32 / 3.96 | [88] |
| Mistral | Mistral Large 4 (v26.10) | Flagship, **Public Preview** | 1M | Yes | Listed | 0.70 / 2.10 (pricing FAQ: 0.5 / 1.5, conflicting) | [89][90] |
| Mistral | Mistral Medium 3.5 | Deprecated 2026-10-31, retires 2027-04-30 | 262K | Yes | – | 1.50 / 7.50 † | [91][86] |
| Mistral | Mistral Small 4 | GA, Apache-2.0, 119B / 6.5B active | 256K | Yes | Hybrid | 0.15 / 0.60 | [92] |
| OpenRouter | Any of the above + 455 models | Router | Per model | Per model | `supported_parameters` | Per model | [86] |

**Local models**

| Model | Size | Licence | Notes | Source |
|---|---|---|---|---|
| Qwen3.8-Flash-Next | 125B total, 6B active; 262,144 context native | **Qwen Community License 1.0** (not Apache): separate licence for "Model as a Service" or "AI Work Assistant" businesses; name display above 100M MAU / $20M monthly revenue | Preserved thinking by default; Strata flagship | [83][93][94] |
| Qwen3.6-35B-A3B | 35B / 3B active | Apache-2.0 | Strata, Ollama, llama.cpp | [94][86] |
| Qwen3.8-27B | 27B dense | See card | Ollama `tools` tag | [95] |
| DeepSeek-V4.1-Flash-1017 | Very large (239–274 GB at 1.75–2.25 bpw) | Open weights | Strata; llama.cpp v0.8.0 adds the architecture | [94][96] |
| Gemma 4 (26B-A4B, 31B) | MoE / dense | Gemma terms | Ollama, llama.cpp | [86] |
| Mistral Small 4 | 119B / 6.5B active | Apache-2.0 | Open weights | [92] |

BFCL shows models ≤ 8B scoring 80–90 % on single calls but collapsing in multi-turn (Qwen3-8B
41.75 %, Qwen3-4B 22 %, Llama-3.2-3B 4 %) [81]. CAD sessions are long multi-turn tool chains.

### 3.3 Requirements for local models

| Server | Default address | Health / models | Prompt cache | Reasoning field | Tool calling / structured output |
|---|---|---|---|---|---|
| Strata 0.2.10 (2026-11-02) | `127.0.0.1:8080`; OpenAI and Anthropic APIs | `/health`, `/v1/models` (context, modalities), `/props`, `/status`, `/slots`, `/metrics` | Checkpoints at turn starts and every 16K tokens; system-prompt checkpoint kept | `reasoning_content` / `thinking`; `reasoning_effort` default **high**; `reasoning_budget_tokens` | Only declared tools; `tool_call_recovery` (98.3 % vs 92.9 % read correctly on 1,462 turns); JSON-schema output **refused together with tools** [94] |
| llama.cpp server v0.8.0 (2026-10-28) | `127.0.0.1`, port **9931** (older docs: 8080) | `/health` (503 while loading), `/v1/models`, `/props`, `/slots`, `/metrics` | `cache_prompt` on; `--cache-reuse`; slot save/restore | `--reasoning-format` → `reasoning_content`; `--reasoning-budget`; `reasoning_end` control | Needs `--jinja`; grammar-constrained `json_schema` [97] |
| vLLM 0.33.0 (2026-11-02) | Port 8000 | `/health`, `/v1/models` | Automatic prefix caching, full blocks only | Renamed **`reasoning_content` → `reasoning`**; needs `--reasoning-parser` | `--enable-auto-tool-choice --tool-call-parser`; named/`required` tool choice uses structured outputs [98] |
| Ollama v0.40.14 (2026-11-03) | `127.0.0.1:11434` | `/api/tags`, `/api/ps`, `/api/show`, `/v1/models` | Model kept 5 min | `thinking` / `reasoning_effort` | **Default context 4K below 24 GiB VRAM** (32K at 24–48, 256K ≥ 48); OpenAI endpoint cannot set context; no `tool_choice` there [99] |
| LM Studio (version not verifiable, *possibly outdated*) | `localhost:1234` | `/v1/models` (may list all downloaded models) | JIT load, idle TTL 60 min | `reasoning_content` and `reasoning` (two names) | Unparsed calls end up in `content`; `required` only on llama.cpp engine [100] |

Requirements for the runtime:

1. **Long prefill**: Strata measured about 87–360 tok/s prompt processing for DeepSeek V4.1 on
   consumer hardware [94]; an uncached 32K prompt then takes roughly 1.5–6 min. Cloud requests use a
   first-chunk timeout; local requests use a long budget with `return_progress` (llama.cpp, Strata)
   and `/slots` or `/status` polling [94][97].
2. **Cancel** by closing the stream; Strata stops on disconnect, llama.cpp offers `reasoning_end`
   [94][97].
3. **Context limits** read before the first request; refuse agent sessions below a minimum (Ollama
   recommends ≥ 64,000 for agents) [99]; Strata refuses over-long requests instead of truncating
   [94].
4. **Cache-friendly compaction**: byte-stable prefix (system prompt, tool schemas in fixed order,
   skill index), append-only history, compaction replaces a middle range, dynamic instructions
   appended later [94][98][73].
5. **Tool output budget**: cap results, store the full result locally, give the model a handle and a
   summary; drop images from older turns.
6. **Reasoning normalisation** of `reasoning_content`, `reasoning`, `thinking` and `<think>` tags
   [63][98][100]; decide per model whether to send reasoning back [83][94].
7. **Weak tool calling**: Zod validation, one repair round (`repairToolCall`), constrained decoding
   where available, detection of undeclared or garbled calls, loop guard (identical call × 3), no
   JSON-schema output with tools on Strata, gates run by the runtime [63][98][94][72].
8. **Detection** by parallel probes with short timeouts (ports above); Strata and llama.cpp at 8080
   are distinguished via `/props` and Strata's own endpoints [94][97].
9. **Local auth and lifecycle**: Strata recommends an API key beyond localhost [94]. Ollama unloads
   after 5 min, LM Studio after 60 min idle; show "warming up" instead of a timeout error [99][100].

### 3.4 Skills, gates, memory and retrieval

* **Skills**: Agent Skills format: a folder with `SKILL.md`, frontmatter `name` (1–64 characters,
  `^[a-z0-9]+(-[a-z0-9]+)*$`, equals the folder name), `description` (1–1024), optional `license`,
  `compatibility`, `metadata`, experimental `allowed-tools`; progressive disclosure (about 100
  tokens of metadata, body < 5000 tokens on activation) [101]. OpenCode implements it and also reads
  `.claude/skills/` [72]. Loader: validated frontmatter, a sorted skill index in the cached prefix,
  one `load_skill` tool whose result carries the body, path-traversal check for skill files.
  `gray-matter` 4.0.3 (2021-04-24) is unmaintained [1]; a plain YAML parser on the split frontmatter
  block suffices.
* **Gates**: declarative rules evaluated by the runtime around tool calls (`allow | ask | deny`,
  last match wins, as in OpenCode [72]; `runCheck` fail-closed or warn; appended messages); checks
  run in the Python sidecar ([ADR 0010](adr/0010-rule-engine-and-check-gates.md),
  [ADR 0012](adr/0012-python-sidecar.md)).
* **Retrieval** over about 330 Markdown rules with IDs: SQLite FTS5 (BM25) and exact ID lookup
  first, sqlite-vec for semantic recall, fused by reciprocal rank. FTS5 is part of SQLite as bundled
  by better-sqlite3 13.0.3 (2026-08-05) [1] (FTS5 documentation not re-fetched, *possibly
  outdated*). sqlite-vec 0.1.9 (2026-03-31) is pre-1.0 with low activity since May 2026 [1][2].
  LanceDB 0.41.0 (2026-10-29) is heavier; Orama 3.1.18 (2025-12-19) has had no release for about 10
  months [1].
* **Embeddings** (German content needs multilingual models) [102]: `intfloat/multilingual-e5-small`
  (MIT; ONNX port for transformers.js 4.3.2, 2026-10-27), `Qwen3-Embedding-0.6B` (Apache-2.0),
  `bge-m3` (MIT, larger), `embeddinggemma-300m` (Gemma terms). Avoid `jina-embeddings-v3`
  (CC-BY-NC-4.0). Rust `fastembed` depends on `ort` 2.0 RC only [3].
* **Memory**: Markdown files with frontmatter, same loader as skills, indexed in the same database;
  written through an explicit tool behind an `ask`/`allow` rule.

### 3.5 API key storage

| Stack | Option | Mechanism (Windows) | Status |
|---|---|---|---|
| Electron main | **`@napi-rs/keyring` 2.1.2 (2026-10-19)** | Windows Credential Manager | Maintained, prebuilt napi binaries; 107 stars, bus factor 1 [103][2] |
| Electron main | `safeStorage` async API | DPAPI | Protects against other Windows users, **not against other apps of the same user**; sync API deprecated in Electron 45, removed in 46 [104] |
| Tauri | `keyring-core` 1.0.1 (2026-10-13) + `windows-native-keyring-store` 1.1.0 (2026-05-24) | Credential Manager | keyring v4 docs recommend core + specific store [105] |
| Tauri | Stronghold plugin 2.4.0 (2026-09-26) | Vault file with password | Status contradictory: documented without deprecation note [106], a maintainer reply says removal in v3 [107], crates.io shows `3.0.0-alpha.3` (2026-10-14) [3] |
| Any | keytar 7.9.0 (2022-02-17) | – | **Archived**; do not use [108] |

Choice: `@napi-rs/keyring` (credential stored per entry in the Credential Manager), as in
[ADR 0011](adr/0011-provider-manager.md). Keys are loaded per request and never written to config
files, logs, crash reports, telemetry, URLs or command lines; `Authorization`, `x-api-key` and
`api-key` headers are redacted; local-server keys are handled the same way. The sidecar never sees
provider keys.

## 4. Building blocks

The full selection with exact pins, licences and rejected alternatives is in
[building blocks](building-blocks.md). Pins follow the 7-day release-age rule (pnpm
`minimumReleaseAge: 10080`, Renovate `minimumReleaseAge: "7 days"`) [109]. Notable findings:

* **TypeScript 7.0.2** (native compiler) is GA since 2026-07-08 but has no programmatic API until
  7.1 [110]; typescript-eslint 8.72.1 (2026-10-26) declares `typescript >=4.8.4 <6.1.0` [111].
  Microsoft's side-by-side recipe: `typescript` aliased to `@typescript/typescript6` 6.0.2
  (2026-07-06) for tools, TS 7 as `@typescript/native` for fast type checks [110].
* **pnpm 12 lockfile vs Dependabot**: when the pnpm version is pinned, the lockfile is written as
  two YAML documents and Dependabot's dependency graph misses dependencies, so there are no alerts
  or security updates for them [112][113]. `pnpm audit` reads both shapes [113]. Renovate does not
  read pnpm's `minimumReleaseAge`; pnpm enforces it itself [109].
* **electron-trpc**: 0.7.1 (2024-12-07) does not work in sandboxed renderers; 1.0.0 (2026-10-30)
  fixes it and adds a sender check, but is younger than 7 days (eligible from 2026-11-06) [114]. The
  typed IPC bridge is an own build ([ADR 0013](adr/0013-typed-ipc-bridge.md)).
* **dockview**: floating groups, popout windows and ARIA are MIT; keyboard docking, spatial keyboard
  navigation and layout history are in the proprietary `dockview-enterprise` [115][116].
* **React Aria Toast** is marked alpha [117]; it is wrapped behind an own notification API.
* **Electron security releases** are weekly; with a 7-day gate the app lags one or two patches
  (`electron` could be listed in pnpm's `minimumReleaseAgeExclude`) [7].
* **Icons**: no set has extrude, fillet, chamfer, shell or section-plane glyphs; own glyphs on the
  Tabler grid ([ADR 0014](adr/0014-cad-icon-glyphs.md)) [118].
* **Installer**: MSIX virtualises new `AppData` files and HKCU writes per package, a risk for the uv
  cache and sidecar processes; NSIS is used [119].
* **Code signing**: Azure Artifact Signing issues public-trust certificates to organisations in the
  EU (and other regions), to individual developers only in the US and Canada [120]; a community
  answer claims ≥ 3 years of tax history is required (*unverified*) [121]; prices render client-side
  (*possibly outdated*) [122]. OV/EV certificates are limited to 460 days since 2026-03-01 and need
  hardware or cloud HSM keys [123]. Route: OV in a cloud HSM unless a company qualifies for Artifact
  Signing.

## 5. Law and licences

Decision: [ADR 0007](adr/0007-licensing-model.md); privacy in the repository:
[ADR 0009](adr/0009-privacy-guardrails.md). Not legal advice.

| Area | Finding | Counsel |
|---|---|---|
| SolidCraft | MIT OR Apache-2.0 (README, both licence files, NOTICE) [124][125]; copyright "SolidCraft contributors", operated by Tangency Labs [125][126]. Driving it over the control channel and MCP is unrestricted. Control channel on `127.0.0.1:27878` (or next free port) with a per-launch token readable only by the user account; read the token file, never log it, prefer it over `--token` [49]. Redistribution needs licence texts, NOTICE and THIRD-PARTY-LICENSES (537 crates, copyleft only as options of dual licences) [127]. No trademark policy found; DISCLAIMER forbids implied endorsement [126][128]. Skills in the same repository, same licence [129]. Recommended: customer installs, or download the official MSI and check `SHA256SUMS.txt` [130]. | Before filing any mark |
| OrcaSlicer | AGPL-3.0; latest GA v2.4.2 (2026-07-07) [131]. Unmodified CLI as a separate process is fine (separate programs [132]); §13 applies only to modified versions offered over a network. Never link libslic3r [132]. Printer/process profile JSON copied from the repository may be AGPL-covered: read profiles from the user's installation. The earlier workflow uses a 2.5.0 release candidate, which is not a version to certify against. | Copyrightability of profile JSON |
| Blender | Source GPL-2.0-or-later, binaries GPL-3.0-or-later; Cycles Apache-2.0 [133]. Scripts using the Python API must be GPL when published [133][134]. Ship the render script as a separate GPL file; the closed app only writes inputs, runs `blender -b -P` and reads PNGs [134][132]. Customer installs Blender. | Boundary script / app |
| Open CASCADE | LGPL-2.1 + OCCT exception 1.0 (header material may be distributed under own terms with prominent notice) [135]. Dynamic linking with notices, source offer, replaceable DLLs; avoid static linking [132]. occt-import-js and opencascade.js are LGPL-2.1: ship the `.wasm` as a separate, replaceable file with source [50]. | Whether the exception covers Emscripten builds |
| PyMeshLab | **GPL-3.0** [136]; importing it into the shipped sidecar makes a combined work [132]. Removed; replaced by trimesh (MIT). numpy, scipy BSD-3-Clause (wheels bundle OpenBLAS/gfortran notices), pydantic MIT, Pillow MIT-CMU [137]. | – |
| OpenCode | MIT [71]; no code path that logs into a Claude consumer subscription [138]. | – |
| Electron / Chromium | MIT plus Chromium third-party licences (`LICENSES.chromium.html`, *not re-verified*); rebrand binaries [139][140]. | – |

**AI providers with bring your own key (BYOK)**: the end user is the provider's customer; the app
never collects, proxies or resells keys.

| Provider | Training on API data | Retention | DPA | Location | BYOK notes |
|---|---|---|---|---|---|
| Anthropic | No [141] | 30 days; flagged content up to 2 years, classifier scores up to 7 years [142] | Incorporated [141] | US; Anthropic Ireland contracts for EEA | Console API keys only: third-party apps may not offer Claude.ai login or route through Free/Pro/Max/Ultra credentials [138][143]. Physical-actions rule excludes plans reviewed by a qualified person before execution, so keep human confirmation before printing [143]. |
| OpenAI | No [144][145] | 30 days abuse logs; stateful endpoints until deleted [145] | Offered (not fetched) | US; OpenAI Ireland for EEA | From 2026-11-20 model-access intermediaries need approval; a feature integration is exempt [146] |
| Google Gemini unpaid | **Yes**, human review [147] | Not stated | No | Global | **Apps for EEA/CH/UK users may use only Paid Services** [147][148]; "not for consumer use" [147] *(snippet of the official page)* |
| Google Gemini paid | No [147] | Limited period for abuse | Processor DPA | Any country | Require a billing-enabled key in the EEA |
| Z.ai (GLM) | No (processor DPA) | Content not stored [149] | Yes | Singapore | Outputs to be marked as AI-generated [149]; Zhipu group companies on the US Entity List since 2025-01-16 [150] |
| DeepSeek | **Yes, with opt-out right** [151] | While the account exists | Not found | **PRC**, PRC law [151] | Italian DPA limited the consumer service (2025-01-30) [152]; off by default with warning |
| Mistral | Paid: no unless opted in or product default (verify); Free: yes with opt-out [153] | 30 days, ZDR on pay-as-you-go [153] | Yes | EU | Labs/preview models may train regardless of opt-out [153] |
| OpenRouter | OpenRouter no; depends on provider [154] | Not persisted unless prompt logging | Yes | US + providers | Prompt logging grants a broad licence [154]; default to no-training routing |

**GDPR** [155][156]: with pure BYOK and direct calls, the seller is normally neither controller nor
processor of prompt content; the user is (or falls under the household exemption). The seller is
controller for licensing, updates, crash reports and telemetry. Relaying traffic would make the
seller controller or processor and may breach provider terms. Must-dos: strip EXIF/XMP by default,
offer face/plate blur, remove user names and paths from exported metadata, per-provider consent with
data location and training default, telemetry and crash reports opt-in (ePrivacy Art. 5(3),
implemented in Austria by the TKG 2021 [157]) **[counsel]**. The EU-US Data Privacy Framework is in
force [158]; the appeal C-703/25 P is pending [159]; US-side developments reported in October 2026
come from a secondary source [160]. Singapore and the PRC have no adequacy decision.

**EU AI Act** (Regulation (EU) 2024/1689) [161]: generally applicable from 2026-08-02; Art. 50
transparency obligations apply from that date; the AI Omnibus moved Annex III high-risk rules to
2027-12-02 and Annex I rules to 2028-08-02 but not Art. 50 [162]; systems on the market before
2026-08-02 have until 2026-12-02 for the Art. 50(2) marking duty [162]. CAD-Studio is likely a
"provider" of an AI system: label the chat as AI, check machine-readable marking of generated
content and the Code of Practice on Transparency (final 2026-06-10) [162] **[counsel]**; AI literacy
duty since 2025-02-02 [162]. Not high-risk for general CAD and print preparation; keep human review
before printing.

**Cyber Resilience Act** (Regulation (EU) 2024/2847) [163]: in force 2024-12-10; reporting of
actively exploited vulnerabilities and severe incidents from **2026-09-11** (24 h early warning,
72 h notification, final report 14 days after a fix or 1 month for incidents, via ENISA's Single
Reporting Platform) [164]; main obligations from **2027-12-11**: risk assessment, secure by default,
due diligence on components, SBOM covering at least top-level dependencies, vulnerability handling
with `SECURITY.md`, a stated support period (general minimum five years unless expected use is
shorter), self-assessment and CE marking [164][163]. Open-source upstreams are generally not
manufacturers; CAD-Studio carries the duties for what it ships [164]. Customer-installed external
tools stay outside the product boundary **[counsel]**.

**Licence model**: proprietary EULA plus a complete third-party notices bundle (chosen in ADR 0007);
publish the Blender render script (GPL-3.0-or-later, required anyway) and possibly thin adapters
under MIT/Apache-2.0. FSL-1.1 converts to Apache-2.0/MIT after two years and allows non-competing
use [165]; BSL-1.1 restricts production use and converts within four years [166]; both kept as later
options. EULA must not restrict rights in LGPL/GPL/AGPL parts, must pass on "as is" disclaimers,
include the BYOK clause and the CRA support period; Austrian consumer-law limits on disclaimers
**[counsel]**. Avoid third-party marks in branding [128][126].

## 6. Role models, competitors and names

**CAD UI patterns to adopt**

| Pattern | Role model |
|---|---|
| One command palette (Ctrl+K) with descriptions, parameters, shortcuts, recency ranking; settings are commands | Zoo Command Bar [167], Plasticity command palette (F) [168] |
| Feature list with search, tool icons, draggable rollback bar, separate parts list | Onshape [169]; Zoo feature tree linked to code ranges, separate Bodies pane [167] |
| Workspaces, contextual tabs and environments; browser tree; timeline at the bottom | Fusion [170] |
| Non-modal, dockable parameter panel (Fusion's Change Parameters is modal and cannot be docked) | [171] *(snippet)*; Shapr3D Parameter Cards in the modeling space [172] |
| Transparent preview of a pending feature | FreeCAD 1.1 [173] *(snippet)* |
| Selection grammar (loops, parallel faces, convert selection) and radial menus | Plasticity [168]; Fusion marking menu [174] *(snippet)* |
| View cube with Home view | Plasticity [168] |
| Direct + history modeling, editable History | Shapr3D [172] |
| Token-based theme editor | FreeCAD 1.1 [173] *(snippet)* |
| Docs that state limits ("What you cannot do") | Zoo [167] |

**AI UI patterns**

| Pattern | Role model |
|---|---|
| Model picker in the composer with provider logo and favourites; permission mode next to the prompt | Zed [175], Claude Desktop [176] |
| Provider setup with API key or local servers (Ollama, LM Studio, llama.cpp, custom base URL) | OpenCode [72] |
| Per-tool allow/deny/confirm; agent profiles choose tools | Zed [175], OpenCode [72] |
| Checkpoints and restore per message | Zed [175], Cursor [177], OpenCode `/undo` [72] |
| Change review per hunk (CAD analogue: per-feature diff with volume/bbox delta) | Zed [175] |
| Editable Markdown plan before building | Cursor Plan Mode [177], Claude Desktop [176] |
| Clarifying questions while working; message queue and steering | Cursor [177] |
| `@` context attachments; selection as context | Zed [175], Cursor [177], Zookeeper [178], Fusion Assistant [179] |
| Token count, automatic compaction, "follow the agent"; project instruction file (`AGENTS.md`) | Zed [175], Zookeeper [178] |

**AI + CAD market (2026-11-04)**

| Product | What it is | Pricing | Models | Print readiness |
|---|---|---|---|---|
| Zoo Design Studio + Zookeeper | Desktop CAD on Zoo's cloud engine; agent (2026-02-05) edits KCL code-CAD, selection-aware | At launch Free / Plus $20 / Pro $99 per month; now one metered credit for agent and API [178] | Zoo-hosted, no local | Not advertised |
| Adam | Copilot inside Fusion, Onshape, SOLIDWORKS and others; open-source CADAM (GPL-3.0) | Free tier; paid prices not rendered [180] | Cloud | DFM checks advertised |
| Fusion – Autodesk Assistant | Docked agent: commands, parameter edits, scripts since April 2026 | Part of subscription [179][181] | Cloud | Not advertised |
| Onshape AI Advisor | Doc-grounded assistant | Most plans [182] | Cloud | No |
| Backflip AI | Scan/mesh to CAD | Credit plans $20–$380 per month [183] | Cloud | n/a |
| Leo AI | Mechanical Q&A, PLM-grounded | About $15/user/month (aggregator, unconfirmed) [184] | Cloud | No |
| MecAgent V2 | Agent inside SOLIDWORKS | Free; $84 / $417 per month [185] | Cloud | Standards checks |
| PrintPal CAD Agent | Browser OpenSCAD agent with checklists and 2–5 questions | Credits or $20/month [186] | Cloud | 3MF export, no gate |
| CAD Studio (open source, MIT, created 2026-10-06) | Native macOS app driving Claude Code or Codex with build123d; FDM/resin/SLS rules, print plate | Free [187] | Bring your own agent | Rules + plate |
| Partwright Studio (source-available) | Browser CAD for AI agents, manifold assertions | Free, non-commercial [188] | Any agent | Manifold validation |
| text-to-cad (MIT, about 25k stars) | Agent skills: build123d → STEP/3MF, DFM checks | Free [189] | Any agent | DFM checks |
| Kiln (AGPL-3.0) | MCP server: check printability → slice → queue | Free [190] | Any MCP client | Print loop |
| FreeCAD AI (LGPL) | Workbench: chat, Plan/Act, 50 tools, 24 providers incl. Ollama | Free [191] | Local + cloud | No |
| MCP servers | freecad-mcp, Fusion, Onshape, OpenSCAD, build123d | Free [192] | Any | Varies |

Gap: commercial players are cloud-only and target professional mechanical CAD; print-focused tools
are code-CAD in a browser or on macOS without a clickable B-rep timeline. Open differentiators: a
Windows-native desktop app for makers (the closest competitor is macOS-only [187]); local models as
a first-class path (only FreeCAD AI among CAD agents [191]); a live, step-by-step feature timeline
driven by the agent; notes pinned to topology as persistent AI context (none found); a
printer/material-specific print gate with calibration; honest verification levels; clarification
cards with a recommended default. The open-source field moves fast [189][187].

**Repository structures of reference projects** (read 2026-11-04)

| Repository | Shell | Workspace tool | CI (notable) | Release tooling | Deps bot | Security |
|---|---|---|---|---|---|---|
| OpenCode (224k stars) | Electron + TUI | Bun + Turborepo | 22 workflows | Custom release + dry run | None found | SECURITY.md, gitleaks ignore file [71] |
| Zed (93k) | Rust/GPUI | Cargo | About 50 incl. autofix, compliance | Custom bump workflows | Renovate (digest-pinned actions) | actionlint, zizmor [193] |
| FreeCAD (35k) | Qt | CMake + pixi | CodeQL, Scorecards, dependency review | `build_release.yml` | Dependabot | SECURITY.md, pre-commit [39] |
| Zoo modeling-app (1.3k) | Electron Forge + Vite | npm + Cargo | e2e, performance regression, security | `publish-apps.yml` | Dependabot | `security.yml` [36] |
| Spacedrive (39k) | Tauri | Cargo + Bun | 7 | Custom | – | gitleaks [193] |
| Cap (24k) | GPUI | Cargo + Bun + Turborepo | Perf budget, Windows targets | Custom + nightly | – | actionlint, SignPath signing [193] |
| Jan (45k) | Tauri | Yarn | Per-OS build templates, conventional-commit labels, signed commits | release-drafter | Dependabot | SECURITY.md [193] |
| Bruno (48k) | Electron | npm | Per-OS tests, flaky-test detector | Manual | Dependabot | security.md [193] |
| Hoppscotch (81k) | Tauri | pnpm | 4 | CalVer bumps | Dependabot | commitlint, SECURITY.md [193] |
| Insomnia (40k) | Electron | npm | Staged release, SAST | Staged workflows | – | SECURITY.md [193] |

No probed repository uses release-please or changesets at the root (a gap in role models, not
evidence against the tools); `AGENTS.md`/`CLAUDE.md` is common. Current tool releases:
release-please v17.11.2 (2026-08-24; action v5.0.0, 2026-04-22), pnpm v12.16.1 (2026-10-27)
[194][1]. Layout decision: [ADR 0003](adr/0003-repository-structure.md).

**Name candidates** (domains via registry RDAP, 404 = likely unregistered; GitHub search; web
search; **trademarks not verified**, WIPO and EUIPO returned no machine-readable results) [195][196]

| Rank | Name | Meaning | .com | .app | .io | Collisions | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Strakto | From German *Strak* (fair design line) | Registered | Free | Free | None found | Best: distinctive, ownable |
| 2 | Layerpilot | FDM layers + pilot | Registered | Free | Free | Two small repos [197] | "pilot" is common in AI branding |
| 3 | Tolerix | Tolerance | Registered | Free | Free | Tolerx Inc. (biotech, wound down) [197] | Good |
| 4 | Formwright | Maker of forms | Registered | Free | Free | React form engine "formwright"; FlowWright [197] | Awkward in German |
| 5 | Plycad | Ply + CAD | Free | Free | Free | A packaging firm (weak source) [197] | Descriptive, weak mark |
| 6 | Plydra | Ply + hydra | Free | Free | Free | None | Clean, meaning unclear |
| 7 | Konstrukta | Construct | Registered | Free | Free | Konstrukta Bau GmbH (DE); Konstrukt AB [197] | Risk in Germany |
| 8 | Partwright | Maker of parts | Registered | Registered | Free | Partwright Studio (same niche) [188] | Eliminated |
| – | CAD Studio | Working title | Registered (1999) | Registered | Free | Open-source CAD Studio for 3D printing (2026-10) [187]; CAD Studio a.s. (Czech Autodesk partner since 1991) [198]; CAD Studio (India, since 1987) [198] | **Taken; do not use** |

RDAP 404 is no guarantee (premium or reserved names). A professional trademark search (EUIPO, DPMA,
USPTO; Nice classes 9 and 42) is required before any decision **[counsel]**.

## 7. GitHub features on a private personal repository

| Feature | GitHub Free | GitHub Pro | Source |
|---|---|---|---|
| Repository rulesets | No (public repos only) | Yes | [199] |
| Push rulesets | No | No (Team, organisations) | [199] |
| Protected branches (required checks, linear history, signed commits) | No | Yes | [199] |
| Required reviewers, CODEOWNERS enforcement | No | Yes | [199] |
| Code scanning (CodeQL) | No | No | [200] |
| CodeQL CLI in CI on closed source | Not licensed | Not licensed | [201] |
| Secret scanning alerts; Secret Protection | No | No | [200] |
| Push protection | Only "for users" (pushes to public repos) | Same | [200] |
| Dependency graph, Dependabot alerts, security and version updates | Yes (pnpm 12 caveat, section 4) | Yes | [200][112] |
| Dependabot malware alerts | Yes | Yes | [200] |
| Dependency review action | No | No (needs Code Security) | [200] |
| Environment secrets and variables | No | Yes | [199] |
| Environment required reviewers, wait timers | No (public only) | No (public only) | [199] |
| Private vulnerability reporting; repository advisories | Public repos only | Public repos only | [200] |
| Artifact attestations | No | No | [200] |
| SBOM export from dependency graph | Yes | Yes | [200] |
| User-level Projects | Yes | Yes | [199] |
| Wikis, insights (private) | No | Yes | [199] |
| Actions included compute (private) | $12/month ≈ 2,000 Linux or 1,200 Windows min | $18/month ≈ 3,000 Linux or 1,800 Windows min | [199] |
| Artifact storage / cache | 500 MB / 10 GB per repo | 1 GB / 10 GB per repo | [199] |

Substitutes used:

| Missing feature | Substitute |
|---|---|
| Secret scanning, push protection | gitleaks v8.30.1 (2026-03-21) [205] in the pre-commit hook and CI ([ADR 0009](adr/0009-privacy-guardrails.md)) |
| Code scanning | typescript-eslint strict type-checked rules, zizmor v1.31.1 (2026-10-15), actionlint v1.7.12 (2026-03-30) [2] |
| Dependency review (licence and vulnerability diff) | `pnpm audit` gate in CI; a licence gate that fails on GPL, AGPL and SSPL in the production dependency tree, computed from the `pnpm sbom` output [202]. ADR 0007 names this licence gate. |
| Dependabot alerts with a two-document pnpm lockfile | Renovate (hosted app, `minimumReleaseAge: "7 days"`, digest-pinned actions) [109] plus `pnpm audit` |
| Windows minutes budget | Windows runners only for packaging and E2E; everything else on Linux |

## 8. Open questions and verification gaps

**Conflicts between the research notes**

| Topic | Conflict | Resolution in this repository |
|---|---|---|
| Plasticity stack | The stack study verified `electron` and `three` in Plasticity's public `package.json` (old pins) [33]; the competitor study marked the Electron/three.js claim "not verified" from an encyclopedia source [203] | Treated as verified for the public repository; current versions are not public |
| Electron, three, three-mesh-bvh, dockview, i18next, `ai` versions | The stack and geometry studies name the latest releases (Electron 45.2.2, three 0.187.0, three-mesh-bvh 0.9.18, dockview 8.8.3); the 7-day rule gives 45.1.0, 0.186.1, 0.9.16, 8.7.1 | Pins follow the 7-day rule; the benchmark ran on 0.187.0 / 0.9.18 |
| electron-builder / electron-updater | npm `latest` 26.18.0 / 6.8.11 vs. 26.18.1 / 6.8.12 on the `v26` tag [40] | 26.18.1 / 6.8.12 (6.8.12 is a security fix) |
| TypeScript | Stack study: TypeScript 7; building-block study: TS 6.0.2 API alias + TS 7 binary | Alias pair, because typescript-eslint requires < 6.1 [111] |
| MCP SDK | Stack study: v1 `@modelcontextprotocol/sdk` 1.32.2 (MIT); AI study: v2 `@modelcontextprotocol/client` 2.4.0 (Apache-2.0 for new code) | v2 client ([ADR 0005](adr/0005-ai-layer.md)) |
| API key storage | AI study: `@napi-rs/keyring`; building-block study: Electron `safeStorage` | `@napi-rs/keyring` ([ADR 0011](adr/0011-provider-manager.md)); `safeStorage` does not protect against other apps of the same user [104] |
| SolidCraft glTF | Earlier capability notes: glTF import only; the MCP `export` tool lists no glTF [49]; README: "glTF in and out where supported" [124] | Not on the hot path either way; verify before offering a glTF snapshot export |
| MCP C# SDK licence | Stack study: MIT (not re-verified); AI study: Apache-2.0 [21] | Not used |
| Mistral Large 4 price | Model page 0.70 / 2.10 vs. pricing FAQ 0.5 / 1.5 [89][90] | Prices come from models.dev data at build time |
| Tauri Stronghold | Documented without deprecation; maintainer says removal in v3; 3.0.0 alpha published | Not used |
| Licence gate in CI | Resolved: ADR 0007 and the security workflow use the licence gate instead of the dependency-review action [200] | – |

**Open questions and gaps**

1. Legal **[counsel]**: Blender script boundary; OrcaSlicer profile JSON; OCCT exception for wasm
   builds; Gemini "not for consumer use" with hobbyist BYOK; written confirmation from Anthropic
   before any use of a user's own Claude Code login; Mistral pay-as-you-go training default; Z.ai
   Entity List and export control; ePrivacy/TKG consent for telemetry; AI Act Art. 50(2) scope for
   CAD outputs; CRA product boundary for controlled external apps, support-period length, exact SBOM
   wording; Austrian consumer-law limits on EULA disclaimers; trademark search for the product name.
2. Code signing: SmartScreen reputation of OV vs. EV in 2026 not verified; Artifact Signing
   eligibility rules for young companies unverified; Artifact Signing prices *possibly outdated*
   [122].
3. Geometry: multi-body designs, components and assemblies, and the bridged app path (the benchmark
   was headless CLI) are not verified; cost of `fine` tessellation not measured; three.js clipping
   API not re-fetched (*possibly outdated*); signature weights must be tuned on test designs.
4. AI layer: no independent tool-calling benchmark for current models; LM Studio version not
   verifiable; Strata/llama.cpp/vLLM behaviour changes between releases (llama.cpp default port
   moved to 9931, vLLM renamed the reasoning field) [97][98].
5. Building blocks: `pnpm sbom` availability in exactly pnpm 12.16.1 and Renovate's handling of the
   two-document lockfile not verified [202][109]; `node:sqlite` is a release candidate and its
   exposure in Electron's Node not verified [204]; electron-trpc 1.0.0 to be re-evaluated after
   2026-11-06.
6. Python sidecar: the installer size added by Python has no measurement yet; ADR 0012 defers it to the first sidecar build
   in the research notes; antivirus behaviour with unsigned bundled `python.exe` not verified.
7. Not re-verified: the Chromium licence file name in current Electron builds; the EU-US DPF
   developments of October 2026 (secondary source [160]).

## References

1. npm registry, package metadata (versions, publish times, licences, peer dependencies), https://registry.npmjs.org/, accessed 2026-11-04
2. GitHub REST API, repository and release metadata, https://api.github.com/repos/, accessed 2026-11-04
3. crates.io API, https://crates.io/api/v1/crates/, accessed 2026-11-04
4. PyPI JSON API, https://pypi.org/pypi/, accessed 2026-11-04
5. NuGet registration API, https://api.nuget.org/v3/registration5-gz-semver2/, accessed 2026-11-04
6. Electron releases and release metadata, https://github.com/electron/electron/releases ; https://releases.electronjs.org/releases.json, accessed 2026-11-04
7. Electron release timelines and support policy, https://www.electronjs.org/docs/latest/tutorial/electron-timelines, accessed 2026-11-04
8. Dawloom, "Tauri vs Electron vs WPF benchmark", https://dawloom.com/blog/tauri-vs-electron-vs-wpf-benchmark/, accessed 2026-11-04
9. Electron, code signing, https://www.electronjs.org/docs/latest/tutorial/code-signing, accessed 2026-11-04
10. three.js releases, https://github.com/mrdoob/three.js/releases, accessed 2026-11-04
11. three-mesh-bvh README and API, https://github.com/gkjohnson/three-mesh-bvh, accessed 2026-11-04
12. three.js WebGPURenderer documentation; Utsubo, "Migrate Three.js to WebGPU (2026)"; three.js forum, "WebGPU suitable for a CAD-style drawing tool?", https://threejs.org/docs/pages/WebGPURenderer.html ; https://www.utsubo.com/blog/webgpu-threejs-migration-guide ; https://discourse.threejs.org/t/webgpu-suitable-for-a-cad-style-drawing-tool/83101, accessed 2026-11-04
13. Tauri releases, https://github.com/tauri-apps/tauri/releases, accessed 2026-11-04
14. Microsoft Edge update API, https://edgeupdates.microsoft.com/api/products, accessed 2026-11-04
15. Tauri issue #6381 "WebGPU support?", https://github.com/tauri-apps/tauri/issues/6381, accessed 2026-11-04
16. Tauri v2 documentation (webview versions, Linux graphics, sidecar, updater), https://v2.tauri.app/reference/webview-versions/ ; https://v2.tauri.app/develop/debug/linux-graphics/ ; https://v2.tauri.app/develop/sidecar/ ; https://v2.tauri.app/plugin/updater/, accessed 2026-11-04
17. rmcp crate (Rust MCP SDK), https://crates.io/crates/rmcp, accessed 2026-11-04
18. .NET release index, https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json, accessed 2026-11-04
19. Helix Toolkit, https://github.com/helix-toolkit/helix-toolkit, accessed 2026-11-04
20. SharpDX (archived), https://github.com/sharpdx/SharpDX, accessed 2026-11-04
21. NuGet: ModelContextProtocol, https://www.nuget.org/packages/ModelContextProtocol ; Microsoft.Extensions.AI, https://www.nuget.org/packages/Microsoft.Extensions.AI, accessed 2026-11-04
22. Avalonia releases, 12 and 12.1 announcements, pricing, https://github.com/AvaloniaUI/Avalonia/releases ; https://avaloniaui.net/blog/avalonia-12 ; https://avaloniaui.net/blog/release-12-1 ; https://avaloniaui.net/pricing, accessed 2026-11-04
23. Avalonia showcase and community 3D examples, https://avaloniaui.net/showcase ; https://github.com/danipen/Avalonia3DViewer ; https://occt3d.com/dev/content/occt-avalonia-ui/ ; KinetiCAD, https://github.com/AndrewBlumson/KinetiCAD, accessed 2026-11-04
24. wgpu releases, https://github.com/gfx-rs/wgpu/releases, accessed 2026-11-04
25. iced accessibility issue #552 and WIP PR #1849, https://github.com/iced-rs/iced/issues/552 ; https://github.com/iced-rs/iced/pull/1849, accessed 2026-11-04
26. Slint pricing and terms, https://www.slint.dev/pricing ; https://slint.dev/terms-and-conditions, accessed 2026-11-04
27. Qt 6.12 LTS release and Qt for Small Business, https://www.qt.io/blog/qt-6.12-released ; https://www.qt.io/development/qt-for-small-business, accessed 2026-11-04
28. Qt licensing (GPL-only modules) and LGPL obligations, https://doc.qt.io/qt-6/licensing.html ; https://www.qt.io/development/open-source-lgpl-obligations, accessed 2026-11-04
29. Electrobun changelog and 2.0 announcement, https://docs.electrobun.dev/electrobun/guides/changelog/ ; https://electrobun.dev/blog/electrobun-2-0/, accessed 2026-11-04
30. Wails releases, https://github.com/wailsapp/wails/releases, accessed 2026-11-04
31. Compose Multiplatform releases, https://github.com/JetBrains/compose-multiplatform/releases, accessed 2026-11-04
32. Flutter releases JSON, flutter_scene, multi-window issue, https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json ; https://pub.dev/packages/flutter_scene ; https://github.com/flutter/flutter/issues/191166, accessed 2026-11-04
33. Plasticity repository and package.json, https://github.com/nkallen/plasticity ; https://github.com/nkallen/plasticity/blob/master/package.json, accessed 2026-11-04
34. Plasticity product pages, https://www.plasticity.xyz/ ; https://www.plasticity.xyz/product, accessed 2026-11-04
35. Plasticity releases, https://github.com/nkallen/plasticity/releases, accessed 2026-11-04
36. Zoo modeling-app repository (README, package.json, PR #3812, issue #3528, .github), https://github.com/KittyCAD/modeling-app ; https://github.com/KittyCAD/modeling-app/pull/3812 ; https://github.com/KittyCAD/modeling-app/issues/3528, accessed 2026-11-04
37. Shapr3D job posting (tech stack), https://jobs.ashbyhq.com/shapr3d/7ef234c8-d02e-4ca4-9384-a330edb2a3f1, accessed 2026-11-04
38. Zed, "Leveraging Rust and the GPU to render user interfaces at 120 FPS", https://zed.dev/blog/videogame, accessed 2026-11-04
39. FreeCAD repository, https://github.com/FreeCAD/FreeCAD, accessed 2026-11-04
40. electron-builder releases (incl. electron-updater), https://github.com/electron-userland/electron-builder/releases, accessed 2026-11-04
41. Velopack releases, https://github.com/velopack/velopack/releases, accessed 2026-11-04
42. SolidCraft architecture and kernel crate, https://github.com/tangency-labs/solidcraft/blob/v0.30.1/docs/architecture.md ; https://github.com/tangency-labs/solidcraft/blob/v0.30.1/crates/kernel/Cargo.toml, accessed 2026-11-04
43. SolidCraft Cargo.toml at v0.30.1, https://github.com/tangency-labs/solidcraft/blob/v0.30.1/Cargo.toml, accessed 2026-11-04
44. SolidCraft releases, https://github.com/tangency-labs/solidcraft/releases, accessed 2026-11-04
45. SolidCraft, "3MF with B-rep face tags", https://github.com/tangency-labs/solidcraft/blob/main/docs/formats/3mf-face-tags.md, accessed 2026-11-04
46. SolidCraft, "Persistent naming", https://github.com/tangency-labs/solidcraft/blob/v0.30.1/docs/book/src/dev/naming.md, accessed 2026-11-04
47. SolidCraft, persistent-naming proposal (not adopted), https://github.com/tangency-labs/solidcraft/blob/v0.30.1/docs/design/persistent-naming-proposal.md, accessed 2026-11-04
48. SolidCraft, control protocol, https://github.com/tangency-labs/solidcraft/blob/v0.30.1/docs/control-protocol.md, accessed 2026-11-04
49. SolidCraft, MCP server documentation, https://github.com/tangency-labs/solidcraft/blob/v0.30.1/docs/mcp.md, accessed 2026-11-04
50. occt-import-js and opencascade.js repositories, https://github.com/kovacsv/occt-import-js ; https://github.com/donalffons/opencascade.js, accessed 2026-11-04
51. replicad mesh API, https://github.com/sgenoud/replicad/blob/main/packages/replicad/src/shapeFunctions/mesh.ts, accessed 2026-11-04
52. OCCT releases, https://github.com/Open-Cascade-SAS/OCCT/releases, accessed 2026-11-04
53. cadquery-ocp on PyPI, https://pypi.org/project/cadquery-ocp/, accessed 2026-11-04
54. EXT_mesh_features (Draft), https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_mesh_features, accessed 2026-11-04
55. glTF-Transform, https://github.com/donmccurdy/glTF-Transform, accessed 2026-11-04
56. 3DTilesRendererJS GLTFMeshFeaturesExtension, https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/three/plugins/gltf/GLTFMeshFeaturesExtension.js, accessed 2026-11-04
57. three.js 3MFLoader source, https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/3MFLoader.js, accessed 2026-11-04
58. FreeCAD 1.0 release news (2024-11-19) and FreeCAD-Bundle 1.0.0, https://freecad.github.io/Website/news/freecad-version-1-0-released/ ; https://github.com/FreeCAD/FreeCAD-Bundle/releases/tag/1.0.0, accessed 2026-11-04
59. Onshape FeatureScript, queries and standard library, https://cad.onshape.com/FsDoc/modeling.html ; https://cad.onshape.com/FsDoc/library.html, accessed 2026-11-04
60. Onshape forum, identity tracking, https://forum.onshape.com/discussion/16911/how-does-the-identity-tracking-rebustness-system-work, accessed 2026-11-04
61. Autodesk Fusion API, entityToken, https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/Feature_entityToken.htm, accessed 2026-11-04
62. LIAS, "A Topological Entity Matching Technique…" (2003), https://www.lias-lab.fr/publications/7076/2003-ICSMA-AGBODAN.pdf, accessed 2026-11-04
63. AI SDK documentation (streamText, settings, structured data, middleware, OpenAI-compatible providers), https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text ; https://ai-sdk.dev/docs/ai-sdk-core/settings ; https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data ; https://ai-sdk.dev/docs/ai-sdk-core/middleware ; https://ai-sdk.dev/providers/openai-compatible-providers, accessed 2026-11-04
64. rig README, https://github.com/0xPlaygrounds/rig, accessed 2026-11-04
65. genai README, https://github.com/jeremychone/rust-genai, accessed 2026-11-04
66. Microsoft.Extensions.AI documentation, https://learn.microsoft.com/en-us/dotnet/ai/microsoft-extensions-ai, accessed 2026-11-04
67. Datadog Security Labs, LiteLLM compromise (October 2026), https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-docker/, accessed 2026-11-04
68. PureAI, compromised LiteLLM releases removed (March 2026), https://pureai.com/Articles/2026/03/25/PyPI-Removes-Compromised-LiteLLM-Releases-After-Warnings-of-Stolen-Credentials.aspx, accessed 2026-11-04
69. MCP TypeScript SDK README, https://github.com/modelcontextprotocol/typescript-sdk, accessed 2026-11-04
70. AI SDK, MCP tools and stdio transport, https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools ; https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-stdio-transport, accessed 2026-11-04
71. OpenCode repository, https://github.com/anomalyco/opencode, accessed 2026-11-04
72. OpenCode documentation (providers, skills, permissions, server, TUI) and `@opencode/sdk`, https://opencode.ai/docs/providers/ ; https://opencode.ai/docs/skills/ ; https://opencode.ai/docs/permissions/ ; https://opencode.ai/docs/server/ ; https://opencode.ai/docs/tui/ ; https://www.npmjs.com/package/@opencode/sdk, accessed 2026-11-04
73. OpenCode releases, https://github.com/anomalyco/opencode/releases, accessed 2026-11-04
74. Claude Agent SDK overview, https://code.claude.com/docs/en/agent-sdk/overview, accessed 2026-11-04
75. Claude Agent SDK TypeScript repository, https://github.com/anthropics/claude-agent-sdk-typescript, accessed 2026-11-04
76. Mastra LICENSE.md, https://github.com/mastra-ai/mastra/blob/main/LICENSE.md, accessed 2026-11-04
77. Goose README, https://github.com/aaif-goose/goose, accessed 2026-11-04
78. assistant-ui, https://github.com/assistant-ui/assistant-ui, accessed 2026-11-04
79. AI Elements README, https://github.com/vercel/ai-elements, accessed 2026-11-04
80. Streamdown README, https://github.com/vercel/streamdown, accessed 2026-11-04
81. Berkeley Function Calling Leaderboard v4, https://gorilla.cs.berkeley.edu/leaderboard.html, accessed 2026-11-04
82. τ-bench, https://taubench.com/, accessed 2026-11-04
83. Qwen3.8-Flash-Next model card, https://huggingface.co/Qwen/Qwen3.8-Flash-Next, accessed 2026-11-04
84. Anthropic, models overview, https://platform.claude.com/docs/en/models/overview, accessed 2026-11-04
85. OpenAI, models, https://developers.openai.com/api/docs/models, accessed 2026-11-04
86. OpenRouter models API, https://openrouter.ai/api/v1/models, accessed 2026-11-04
87. models.dev catalogue (MIT), https://models.dev/api.json ; https://github.com/anomalyco/models.dev, accessed 2026-11-04
88. DeepSeek, models and pricing, https://api-docs.deepseek.com/quick_start/pricing, accessed 2026-11-04
89. Mistral Large 4, https://docs.mistral.ai/models/mistral-large-4-0, accessed 2026-11-04
90. Mistral pricing (FAQ), https://mistral.ai/pricing, accessed 2026-11-04
91. Mistral models overview, https://docs.mistral.ai/models, accessed 2026-11-04
92. Mistral Small 4, https://docs.mistral.ai/models/mistral-small-4-0-26-03, accessed 2026-11-04
93. Qwen Community License 1.0, https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/main/LICENSE, accessed 2026-11-04
94. Strata README, engine/server reference and models guide, https://github.com/Niko1221/Strata ; https://github.com/Niko1221/Strata/blob/main/docs/DETAILS.md ; https://github.com/Niko1221/Strata/blob/main/docs/MODELS.md, accessed 2026-11-04
95. Ollama model search, tools filter, https://ollama.com/search?c=tools, accessed 2026-11-04
96. llama.cpp release v0.8.0, https://github.com/ggml-org/llama.cpp/releases/tag/v0.8.0, accessed 2026-11-04
97. llama.cpp server README and common.h (default port), https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md ; https://github.com/ggml-org/llama.cpp/blob/master/common/common.h, accessed 2026-11-04
98. vLLM documentation (reasoning outputs, prefix caching, tool calling, serve), https://docs.vllm.ai/en/latest/features/reasoning_outputs/ ; https://docs.vllm.ai/en/latest/design/prefix_caching/ ; https://docs.vllm.ai/en/latest/features/tool_calling/ ; https://docs.vllm.ai/en/latest/cli/serve/, accessed 2026-11-04
99. Ollama documentation (thinking, context length, FAQ, OpenAI compatibility, structured outputs), https://github.com/ollama/ollama/tree/main/docs, accessed 2026-11-04
100. LM Studio developer documentation (OpenAI compatibility, tools, structured output, TTL, API changelog), https://github.com/lmstudio-ai/docs/tree/main/1_developer, accessed 2026-11-04
101. Agent Skills specification, https://agentskills.io/specification, accessed 2026-11-04
102. Hugging Face model API (multilingual-e5-small, Qwen3-Embedding-0.6B, bge-m3, embeddinggemma-300m, jina-embeddings-v3), https://huggingface.co/api/models/intfloat/multilingual-e5-small, accessed 2026-11-04
103. keyring-node (`@napi-rs/keyring`), https://github.com/Brooooooklyn/keyring-node, accessed 2026-11-04
104. Electron, safeStorage, https://www.electronjs.org/docs/latest/api/safe-storage, accessed 2026-11-04
105. keyring crate documentation, https://docs.rs/keyring/latest/keyring/, accessed 2026-11-04
106. Tauri Stronghold plugin, https://v2.tauri.app/plugin/stronghold/, accessed 2026-11-04
107. Tauri discussion #7846 (secure storage), https://github.com/orgs/tauri-apps/discussions/7846, accessed 2026-11-04
108. node-keytar (archived), https://github.com/atom/node-keytar, accessed 2026-11-04
109. Renovate, minimum release age, https://docs.renovatebot.com/key-concepts/minimum-release-age/, accessed 2026-11-04
110. Microsoft, "Announcing TypeScript 7.0", https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, accessed 2026-11-04
111. typescript-eslint, dependency versions, https://typescript-eslint.io/users/dependency-versions/, accessed 2026-11-04
112. GitHub Docs, Dependabot supported ecosystems, https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories, accessed 2026-11-04
113. pnpm, lockfile format, https://pnpm.io/lockfile, accessed 2026-11-04
114. electron-trpc releases, https://github.com/jsonnull/electron-trpc/releases, accessed 2026-11-04
115. dockview, licence and feature matrix, https://dockview.dev/docs/overview/licence, accessed 2026-11-04
116. dockview LICENCE.md, https://github.com/dockview/dockview/blob/master/LICENCE.md, accessed 2026-11-04
117. React Aria, Toast (alpha), https://react-aria.adobe.com/Toast, accessed 2026-11-04
118. jsDelivr package file listings, https://data.jsdelivr.com/v1/packages/npm/, accessed 2026-11-04
119. Microsoft Learn, how packaged desktop apps run on Windows, https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes, accessed 2026-11-04
120. Microsoft Learn, Artifact Signing quickstart, https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart, accessed 2026-11-04
121. Microsoft Q&A, sole trader eligibility (community answer), https://learn.microsoft.com/en-us/answers/questions/5915697/can-an-irish-sole-trader-(non-incorporated)-qualif, accessed 2026-11-04
122. Azure Artifact Signing pricing, https://azure.microsoft.com/en-us/pricing/details/artifact-signing/, accessed 2026-11-04
123. GlobalSign, code signing validity changes (CSC-31), https://www.globalsign.com/en/blog/code-signing-validity-changes, accessed 2026-11-04
124. SolidCraft README, https://github.com/tangency-labs/solidcraft/blob/main/README.md, accessed 2026-11-04
125. SolidCraft NOTICE, https://github.com/tangency-labs/solidcraft/blob/main/NOTICE, accessed 2026-11-04
126. SolidCraft DISCLAIMER.md, https://github.com/tangency-labs/solidcraft/blob/main/DISCLAIMER.md, accessed 2026-11-04
127. SolidCraft THIRD-PARTY-LICENSES.txt, https://github.com/tangency-labs/solidcraft/blob/main/THIRD-PARTY-LICENSES.txt, accessed 2026-11-04
128. Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0, accessed 2026-11-04
129. SolidCraft skills, https://github.com/tangency-labs/solidcraft/tree/main/skills, accessed 2026-11-04
130. SolidCraft release v0.30.1 (assets incl. SHA256SUMS.txt), https://github.com/tangency-labs/solidcraft/releases/tag/v0.30.1, accessed 2026-11-04
131. OrcaSlicer repository, https://github.com/OrcaSlicer/OrcaSlicer, accessed 2026-11-04
132. GNU GPL FAQ, https://www.gnu.org/licenses/gpl-faq.en.html, accessed 2026-11-04
133. Blender license page and COPYING, https://www.blender.org/about/license/ ; https://raw.githubusercontent.com/blender/blender/main/COPYING, accessed 2026-11-04
134. Blender FAQ, https://www.blender.org/support/faq/, accessed 2026-11-04
135. Open CASCADE Technology page and OCCT LGPL exception, https://occt3d.com/open-cascade-technology/ ; https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt, accessed 2026-11-04
136. PyMeshLab, https://github.com/cnr-isti-vclab/PyMeshLab, accessed 2026-11-04
137. trimesh, numpy, scipy, Pillow, pydantic licences, https://github.com/mikedh/trimesh ; https://github.com/numpy/numpy/blob/main/LICENSE.txt ; https://github.com/scipy/scipy ; https://github.com/python-pillow/Pillow/blob/main/LICENSE ; https://github.com/pydantic/pydantic, accessed 2026-11-04
138. Claude Code, legal and compliance, https://code.claude.com/docs/en/legal-and-compliance, accessed 2026-11-04
139. Electron, Tauri and three.js repositories (licences), https://github.com/electron/electron ; https://github.com/tauri-apps/tauri ; https://github.com/mrdoob/three.js, accessed 2026-11-04
140. Electron, application packaging, https://www.electronjs.org/docs/latest/tutorial/application-distribution, accessed 2026-11-04
141. Anthropic Commercial Terms of Service, https://www.anthropic.com/legal/commercial-terms, accessed 2026-11-04
142. Anthropic Privacy Center, data retention for organisations, https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data, accessed 2026-11-04
143. Anthropic Usage Policy, https://www.anthropic.com/legal/aup, accessed 2026-11-04
144. OpenAI Services Agreement, https://openai.com/policies/services-agreement/, accessed 2026-11-04
145. OpenAI, data controls in the platform, https://developers.openai.com/api/docs/guides/your-data, accessed 2026-11-04
146. OpenAI Usage Policies (effective 2026-11-20), https://openai.com/policies/usage-policies/, accessed 2026-11-04
147. Gemini API Additional Terms of Service (read via search-engine extract), https://ai.google.dev/gemini-api/terms, accessed 2026-11-04
148. Google AI Developers Forum, "Only Paid Services" for EEA/CH/UK, https://discuss.ai.google.dev/t/clarification-on-only-paid-services-for-eea-ch-uk/107860, accessed 2026-11-04
149. Z.ai privacy policy, API DPA and terms of use, https://docs.z.ai/legal-agreement/privacy-policy ; https://docs.z.ai/legal-agreement/terms-of-use, accessed 2026-11-04
150. Federal Register, additions to the Entity List (2025-01-16), https://www.federalregister.gov/documents/2025/01/16/2025-00704/addition-of-entities-to-and-revision-of-entry-on-the-entity-list, accessed 2026-11-04
151. DeepSeek Open Platform Terms and Privacy Policy, https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html ; https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html, accessed 2026-11-04
152. Garante per la protezione dei dati personali, decision of 2025-01-30, https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/10098477, accessed 2026-11-04
153. Mistral AI commercial terms, privacy policy and Help Center (training, zero data retention), https://legal.mistral.ai/terms/commercial-terms-of-service ; https://legal.mistral.ai/terms/privacy-policy ; https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models ; https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr, accessed 2026-11-04
154. OpenRouter privacy policy and terms of service, https://openrouter.ai/privacy ; https://openrouter.ai/terms, accessed 2026-11-04
155. GDPR, Regulation (EU) 2016/679, https://eur-lex.europa.eu/eli/reg/2016/679/oj, accessed 2026-11-04
156. EDPB Guidelines 07/2020 on controller and processor, https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en, accessed 2026-11-04
157. ePrivacy Directive 2002/58/EC, https://eur-lex.europa.eu/eli/dir/2002/58/oj, accessed 2026-11-04
158. Commission Implementing Decision (EU) 2023/1795 (EU-US DPF), https://eur-lex.europa.eu/eli/dec_impl/2023/1795/oj, accessed 2026-11-04
159. Case C-703/25 P, appeal, https://eur-lex.europa.eu/eli/C/2025/6610/oj/eng, accessed 2026-11-04
160. Clairancy, "EU–US transfers: the DPF holds, so prepare plan B" (secondary source), https://clairancy.com/insights/eu-us-transfers-data-privacy-framework, accessed 2026-11-04
161. AI Act, Regulation (EU) 2024/1689, https://eur-lex.europa.eu/eli/reg/2024/1689/oj, accessed 2026-11-04
162. European Commission AI Act pages (timeline, enforcement FAQ, Art. 50 transparency guidelines), https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai ; https://ai-act-service-desk.ec.europa.eu/en/ai-act/faq/when-does-enforcement-start ; https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations, accessed 2026-11-04
163. Cyber Resilience Act, Regulation (EU) 2024/2847, https://eur-lex.europa.eu/eli/reg/2024/2847/oj, accessed 2026-11-04
164. European Commission CRA pages (reporting obligations, summary, open source), https://digital-strategy.ec.europa.eu/en/policies/cra-reporting ; https://digital-strategy.ec.europa.eu/en/policies/cra-summary ; https://digital-strategy.ec.europa.eu/en/policies/cra-open-source, accessed 2026-11-04
165. Functional Source License, https://fsl.software/, accessed 2026-11-04
166. Business Source License 1.1, https://mariadb.com/bsl11/, accessed 2026-11-04
167. Zoo Design Studio documentation (command bar, feature tree), https://zoo.dev/docs/zoo-design-studio/features/workspace/command-bar ; https://zoo.dev/docs/zoo-design-studio/features/workspace/feature-tree, accessed 2026-11-04
168. Plasticity documentation (what's new, selecting objects, radial menu), https://doc.plasticity.xyz/whats-new ; https://doc.plasticity.xyz/plasticity-essentials/selecting-objects ; https://doc.plasticity.xyz/plasticity-essentials/radial-menu, accessed 2026-11-04
169. Onshape, features and parts lists, https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm, accessed 2026-11-04
170. Autodesk Fusion, the Fusion interface, https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GS-THE-FUSION-INTERFACE.htm, accessed 2026-11-04
171. Autodesk forum, docking Change Parameters (snippet), https://forums.autodesk.com/t5/fusion-support-forum/dock-quot-change-parameters-quot-dialog/m-p/10586307, accessed 2026-11-04
172. Shapr3D Help Center (history, parameter cards), https://support.shapr3d.com/hc/en-us/articles/13079145254172 ; https://support.shapr3d.com/hc/en-us/search?query=parameter+cards, accessed 2026-11-04
173. FreeCAD 1.1 release notes (bot-protected; facts via secondary articles), https://wiki.freecad.org/Release_notes_1.1 ; https://ostechnix.com/freecad-1-1-released/, accessed 2026-11-04
174. Autodesk Fusion, basic operations (snippet), https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GS-BASIC-OPERATIONS.htm, accessed 2026-11-04
175. Zed, agent panel, https://zed.dev/docs/ai/agent-panel, accessed 2026-11-04
176. Claude Code, desktop, https://code.claude.com/docs/en/desktop, accessed 2026-11-04
177. Cursor documentation (agent, plan mode), https://cursor.com/docs/agent/overview ; https://cursor.com/docs/agent/plan-mode, accessed 2026-11-04
178. Zoo Zookeeper announcement, documentation and pricing, https://zoo.dev/blog/announcing-zookeeper ; https://zoo.dev/docs/zoo-design-studio/zookeeper ; https://zoo.dev/zoo-pricing, accessed 2026-11-04
179. Autodesk, April 2026 Fusion product update, https://www.autodesk.com/products/fusion-360/blog/april-2026-product-update-whats-new/, accessed 2026-11-04
180. Adam home, open source page and CADAM repository, https://adam.new/ ; https://adam.new/opensource ; https://github.com/Adam-CAD/CADAM, accessed 2026-11-04
181. Architosh, AU 2026 agentic ecosystems, https://architosh.com/2026/10/au2026-autodesk-shifts-ai-from-chatbots-to-agentic-ecosystems/, accessed 2026-11-04
182. Onshape, AI Advisor, https://www.onshape.com/en/blog/ai-advisor-artificial-intelligence-cad-engineering-software, accessed 2026-11-04
183. Backflip AI pricing, https://www.backflip.ai/pricing, accessed 2026-11-04
184. Leo AI, https://www.getleo.ai/ ; third-party pricing (snippet), https://www.getapp.com/emerging-technology-software/a/leo-ai, accessed 2026-11-04
185. MecAgent home and DEVELOP3D article on V2, https://mecagent.com/ ; https://develop3d.com/cad/mecagent-targets-complex-cad-tasks-with-gpt-6-astra-powered-v2/, accessed 2026-11-04
186. PrintPal CAD Agent and pricing, https://printpal.io/cad-agent ; https://printpal.io/cad-agent-pricing, accessed 2026-11-04
187. CAD Studio (open source, macOS), https://filippofinke.github.io/cad-studio/ ; https://github.com/filippofinke/cad-studio, accessed 2026-11-04
188. Partwright Studio, https://www.partwrightstudio.com/ ; https://github.com/kemper/partwright, accessed 2026-11-04
189. text-to-cad, https://github.com/earthtojake/text-to-cad, accessed 2026-11-04
190. Kiln, https://github.com/codeofaxel/Kiln, accessed 2026-11-04
191. FreeCAD AI workbench, https://github.com/ghbalf/freecad-ai, accessed 2026-11-04
192. CAD MCP servers, https://github.com/neka-nat/freecad-mcp ; https://github.com/jdilla1277/agentcad ; https://github.com/pzfreo/build123d-mcp ; https://github.com/faust-machines/fusion360-mcp-server ; https://github.com/hedless/onshape-mcp ; https://github.com/jhacksman/OpenSCAD-MCP-Server, accessed 2026-11-04
193. Reference repositories read via the GitHub API, https://github.com/zed-industries/zed ; https://github.com/spacedriveapp/spacedrive ; https://github.com/CapSoftware/Cap ; https://github.com/janhq/jan ; https://github.com/usebruno/bruno ; https://github.com/hoppscotch/hoppscotch ; https://github.com/Kong/insomnia, accessed 2026-11-04
194. Release pages: https://github.com/googleapis/release-please/releases ; https://github.com/googleapis/release-please-action/releases ; https://github.com/pnpm/pnpm/releases ; https://github.com/renovatebot/renovate/releases, accessed 2026-11-04
195. RDAP registries, https://rdap.verisign.com/com/v1/domain/ ; https://pubapi.registry.google/rdap/domain/ ; https://rdap.identitydigital.services/rdap/domain/, accessed 2026-11-04
196. WIPO Global Brand Database and EUIPO eSearch (not machine-readable), https://branddb.wipo.int/ ; https://euipo.europa.eu/eSearch/, accessed 2026-11-04
197. Name collision sources (partly snippets), https://github.com/hughlee824/layerpilot ; https://github.com/adarshaacharya/formwright ; https://en.wikipedia.org/wiki/Tolerx ; https://www.g2.com/products/flowwright/discuss ; https://prospeo.io/c/polycad ; https://implisense.com/en/companies/konstrukta-bau-gmbh-arnsberg-DE7T42SFAF68 ; https://www.capterra.in/software/208728/konstrukt, accessed 2026-11-04
198. CAD Studio companies (snippets), https://www.cadstudio.cz/en/company.asp ; https://www.crunchbase.com/organization/cad-studio ; https://www.ithistory.org/db/companies/cad-studio, accessed 2026-11-04
199. GitHub Docs: plans, rulesets, protected branches, environments, Projects, Actions billing, https://docs.github.com/en/get-started/learning-about-github/githubs-plans ; https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets ; https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches ; https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments ; https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects ; https://docs.github.com/en/billing/concepts/product-billing/github-actions, accessed 2026-11-04
200. GitHub Docs: security features by plan, code scanning, secret scanning, push protection, dependency review, private vulnerability reporting, https://docs.github.com/en/code-security/getting-started/github-security-features ; https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning ; https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning ; https://docs.github.com/en/code-security/concepts/secret-security/push-protection ; https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review ; https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository, accessed 2026-11-04
201. CodeQL CLI licence, https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md, accessed 2026-11-04
202. pnpm, `pnpm sbom`, https://pnpm.io/cli/sbom, accessed 2026-11-04
203. Plasticity (software), Wikipedia, https://en.wikipedia.org/wiki/Plasticity_(software), accessed 2026-11-04
204. Node.js `node:sqlite` (v24 and current), https://nodejs.org/docs/latest-v24.x/api/sqlite.html ; https://nodejs.org/api/sqlite.html, accessed 2026-11-04
205. gitleaks releases (v8.30.1, 2026-03-21), https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1, accessed 2026-11-04
