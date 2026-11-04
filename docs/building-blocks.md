# Building blocks

Status: 2026-11-04. Every component of the architecture with the chosen block, its exact version and
release date, licence, maintenance state, rejected alternatives and the reason. Evidence and
comparisons are in [research](research.md); decisions are in the [ADRs](adr/).

Policy:

* **Proven blocks before own code.** A component is built in-house only when no maintained block
  fits or the block would be the product's core logic. Every own implementation of a component that
  has ready-made alternatives gets its own ADR with the checked alternatives
  ([ADR 0001](adr/0001-record-architecture-decisions.md)); thin glue is listed at the end.
* **Exact pins.** No ranges and no floating versions; lockfiles (`pnpm-lock.yaml`, `uv.lock`) carry
  checksums.
* **Releases at least 7 days old.** pnpm enforces `minimumReleaseAge: 10080` (minutes) when it
  resolves versions; Renovate enforces `minimumReleaseAge: "7 days"` for update pull requests.
  Renovate does not read pnpm's setting, so both are configured [1]. Versions below were read from
  the registries on 2026-11-04 and are the newest stable releases published on or before 2026-10-28
  [2][3][4][5]; "newer" names a stable release that is still younger than 7 days.
* **No preview releases.** No alpha, beta, RC, canary or nightly versions.
* Tooling runtime: Node 26.13.0 LTS (2026-10-28) and pnpm 12.16.1 (2026-10-27) [6][2].

Maintenance figures (releases per year, open issues including pull requests, stars) come from the
npm registry and the GitHub REST API on 2026-11-04 [2][3].

## Components

| Component | Chosen block (exact version) | Licence | Maintenance | Rejected alternatives | Reason |
|---|---|---|---|---|---|
| Desktop shell | `electron@45.1.0` (2026-10-27; Node 24.22.1, Chromium 156 [7]) | MIT (+ Chromium third-party notices) | Weekly security releases; latest three majors supported [8] | 45.2.2 (2026-11-03, newer), 44.10.0, 43.8.4; Tauri 2.12.5 (runner-up, [ADR 0002](adr/0002-technology-stack.md)) | Newest supported line that passes the 7-day rule; the app lags one or two security patches unless `electron` is excluded from the age gate |
| UI framework | `react@19.3.1`, `react-dom@19.3.1` (2026-10-14) | MIT | Active; inside the R3F peer range | – | Required by the R3F, React Aria and chat blocks; R3F 9.8.2 accepts `react >=19 <19.4` [2] |
| Build tooling | `electron-vite@6.0.0` (2026-10-14), `vite@8.3.5` (2026-10-21), `@vitejs/plugin-react@6.1.2` (2026-10-05) | MIT | 2 / 52 / 16 releases per year | Electron Forge Vite plugin (`@electron-forge/cli@8.0.1`) | Main, preload and renderer builds in one config; plugin-react 6 needs Vite 8 [2] |
| Packaging | `electron-builder@26.18.1` (2026-10-26), NSIS target | MIT | 39 releases per year, 62 open, 14.7k stars; v27 only in alpha | `@electron-forge/cli@8.0.1` (Squirrel.Windows), MSIX, Velopack | Per-user NSIS install with differential updates; MSIX virtualises `AppData` and HKCU writes, a risk for the uv cache and sidecars [9][10] |
| Updates | `electron-updater@6.8.12` (2026-10-26) | MIT | 16 releases per year | Squirrel.Windows | 6.8.12 stops credential headers from following redirects; verifies the Authenticode publisher [11][9] |
| Hardening | `@electron/fuses@2.1.3` (2026-06-29) | MIT | Electron org | – | Flip fuses at package time (RunAsNode off, ASAR integrity, only load app from ASAR); keep the inspect-arguments fuse on in E2E builds for Playwright [12] |
| Code signing | Route: OV code-signing certificate in a cloud HSM, `signtool` with the vendor's KSP from an electron-builder custom sign hook; **Azure Artifact Signing** instead if a company qualifies | Certificate or service terms | OV/EV validity at most 460 days since 2026-03-01; keys in FIPS 140-2 L2 hardware [13] | Artifact Signing as an individual (only US and Canada); EV certificate (SmartScreen benefit in 2026 not verified) | Artifact Signing serves EU organisations, not EU individuals [14]; electron-builder supports both routes [9] |
| Typed IPC bridge | **Own build**: preload `contextBridge` with one shared contract of Zod-validated channels and sender checks ([ADR 0013](adr/0013-typed-ipc-bridge.md)) | Own code | Own | `electron-trpc@0.7.1` (2024-12-07, does not work in sandboxed renderers), `electron-trpc@1.0.0` (2026-10-30, not yet 7 days old; eligible 2026-11-06), `@electron-toolkit/typed-ipc@1.0.2` (no release in 12 months) | Security-critical, about 150 lines, sandbox-safe [15] |
| UI primitives | `react-aria-components@1.22.1` (2026-10-09), with `@internationalized/number@3.6.9` (2026-10-08) | Apache-2.0 | 12 releases per year; 677 open, 16.0k stars | Fluent UI v9 9.75.0, Base UI 1.9.0 (no Tree), Radix 1.8.1 (no Tree, number input or combobox), Mantine 9.7.4, Blueprint 6.21.0, Ant Design 6.6.8, Spectrum S2 1.8.2 | Unstyled, deepest ARIA and keyboard model for WCAG 2.2 AA, locale-aware `NumberField` ("12,5 mm"), Tree and Autocomplete included; Toast is alpha and wrapped behind an own API [16][17] |
| Styling | `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` (2026-07-16), `tailwindcss-react-aria-components@2.2.0` (2026-06-18); tokens as CSS custom properties in one `tokens.css` | MIT / Apache-2.0 (plugin) | 13 releases per year | CSS Modules, `@vanilla-extract/css@1.21.3` | Tokens live in `@theme` variables, light/dark by redefining them; Streamdown and assistant-ui assume Tailwind [18][19] |
| Icons | `@tabler/icons-react@3.50.0` (2026-10-27) | MIT | 18 releases per year; 92 open, 22.5k stars | `lucide-react@1.62.0` (ISC, drop-in alternative), Fluent icons 2.0.344, Phosphor 2.1.10 (no release in 12 months), Material Symbols 0.48.2 | 5,203 icons on one 24 px grid with the most CAD-relevant glyphs [17] |
| CAD icon glyphs | **Own build**: about a dozen SVGs on the Tabler grid ([ADR 0014](adr/0014-cad-icon-glyphs.md)) | Own code | Own | Lucide, Fluent, Phosphor, Material Symbols | No checked set has extrude, fillet, chamfer, shell, section-plane, view-cube or print-orientation glyphs [17] |
| Docking | `dockview-react@8.7.1`, `dockview@8.7.1`, `dockview-core@8.7.1` (2026-10-27) | MIT; `dockview-enterprise` is proprietary and blocked by an ESLint `no-restricted-imports` rule | 42 releases per year; 95 open, 3.5k stars | 8.8.3 (newer); `flexlayout-react@0.11.1`, `rc-dock@4.1.0`, `golden-layout@2.6.0` (no release since 2022), `react-mosaic-component@7.2.1` | Floating groups, popout windows, ARIA, CSS-variable theming in the MIT tier; keyboard docking is Enterprise-only, so panel moves go through own palette commands [20] |
| 3D renderer | `three@0.186.1` (2026-09-24), `@types/three@0.186.0` (2026-09-11) | MIT | 12 releases per year, 117k stars | 0.187.0 (2026-10-30, eligible 2026-11-06); Babylon.js | WebGLRenderer, `LineSegments2` for edges, clipping planes for sections; the benchmark ran on 0.187.0 [2] |
| React binding | `@react-three/fiber@9.8.2` (2026-10-14) | MIT | 9 releases per year; 29 open, 33.5k stars | Imperative three.js only | Declarative scene graph and the R3F ecosystem [2] |
| Helpers | `@react-three/drei@10.7.9` (2026-09-25) | MIT | 3 releases per year; 151 open | `three-viewport-gizmo@2.2.0` (no release in 12 months) | Gizmo/ViewCube, `CameraControls`, `Html` note pins, `Edges`, `Line`, `Bvh` [17] |
| Picking | `three-mesh-bvh@0.9.16` (2026-10-08) | MIT | 16 releases per year; 89 open | 0.9.18 (2026-11-03, newer) | Face-ID raycasts and closest-point queries; build with `indirect: true` [21] |
| Camera controls | `camera-controls@3.1.2` (2025-11-17), used through drei `CameraControls` | MIT | 1 release per year; 104 open | Orbit, Trackball and Arcball controls | CAD-like orbit, dolly to cursor, fit to box; stable API |
| Post-processing | `@react-three/postprocessing@3.2.2` (2026-10-21) + `postprocessing@6.39.5` (2026-09-09) | MIT + Zlib | 8 / 11 releases per year | drei `Outlines` (inverted hull) | Screen-space selection outline (`OutlineEffect`) [17] |
| 3MF unzip | `fflate@0.8.3` (2026-05-16) | MIT | 5 releases per year; 57 open | three.js `3MFLoader` (drops `ft:face`), `fast-xml-parser@5.11.2` | Fastest path in the benchmark; runs in a worker |
| Tagged-3MF parser and edge derivation | **Own build** ([ADR 0004](adr/0004-geometry-pipeline.md)) | Own code | Own | three.js `3MFLoader`, STEP + occt-import-js, glTF `EXT_mesh_features` | Keeps SolidCraft's face numbering; edges named `faceA\|faceB` |
| STEP fallback | `occt-import-js@0.0.23` (2024-12-03), optional and lazily loaded | LGPL-2.1 | No release since 2024-12; 28 open | `opencascade.js@1.1.1` (stale since 2020; newer only as beta), `replicad@1.2.0` | Foreign STEP files only; shipped as a separate, replaceable `.wasm` with licence text and source offer [22] |
| Note anchoring | **Own build** ([ADR 0006](adr/0006-note-anchoring.md)) | Own code | Own | World point only, face index, geometric-hashing library (none maintained) | Persistent face names with signature fallback |
| UI state | `zustand@5.0.16` (2026-10-22) | MIT | 8 releases per year; 5 open, 58.9k stars | `jotai@3.0.1`, `@reduxjs/toolkit@2.13.0` | Selector subscriptions without re-render storms; usable outside React |
| Flows | `xstate@5.33.3` (2026-10-17) + `@xstate/react@6.1.0` (2026-02-26) | MIT | 20 releases per year; 127 open, 30.4k stars | Ad-hoc reducers | Explicit state machines for agent runs, check gates and the SolidCraft connection |
| Local database | `better-sqlite3@13.0.3` (2026-08-05), rebuilt for Electron with `@electron/rebuild@4.2.1` (2026-10-06, MIT) | MIT (SQLite: public domain) | 14 releases per year; 76 open, 7.5k stars | `node:sqlite` (release candidate; exposure in Electron not verified) | Synchronous, fast, bundles SQLite with FTS5 [23] |
| Query builder | `kysely@0.29.7` (2026-10-17) | MIT | 20 releases per year; 214 open, 14.3k stars | 0.29.8 (newer); `drizzle-orm@0.45.4` (2,061 open), `umzug@3.8.3` | Typed SQL with a built-in `Migrator`, no code generation |
| Settings store | `electron-store@12.0.0` (2026-10-12) | MIT | 1 release per year; 0 open, 5.0k stars | `conf@16.0.0` directly | JSON-Schema-validated preferences (theme, locale, window bounds, consent flags) |
| Chat state | `@ai-sdk/react@4.0.159` (2026-10-27) | Apache-2.0 | Very high churn (about 670 releases per year) | 4.0.166 (newer); own stream parser | Message parts incl. tool calls; custom `ChatTransport` over IPC [2] |
| Chat UI | `@assistant-ui/react@0.15.32` (2026-10-28) | MIT | 105 releases per year; 48 open, 12.9k stars; still 0.x | `ai-elements@1.9.1` (deprecated end of November 2026, shadcn/Radix) | Unstyled thread, message, composer and tool-UI primitives; kept behind an own `ChatThread` component [19][24] |
| Markdown streaming | `streamdown@2.7.1` (2026-10-19) + `@streamdown/code@2.0.0` (2026-09-30) | Apache-2.0 | 24 releases per year; 41 open | `react-markdown@10.1.0` + `remark-gfm@4.0.1` + `rehype-sanitize@6.0.0` (no releases in 12 months) | Handles unterminated blocks, hardened with `rehype-harden`; raw HTML and remote images off [18] |
| Code highlighting | `shiki@4.5.0` (2026-10-01) via `@streamdown/code` | MIT | 23 releases per year | 4.6.0 (newer) | Peer of `@streamdown/code` [18] |
| Forms | `react-hook-form@7.91.0` (2026-10-23) + `@hookform/resolvers@6.0.1` (2026-10-27) | MIT | 30 releases per year; 8 open, 44.9k stars | `@tanstack/react-form@1.33.5` | Mature; `Controller` wraps React Aria fields |
| Schemas | `zod@4.6.7` (2026-10-12) | MIT | 27 releases per year; 126 open, 44.3k stars | `valibot@1.5.0` | Schema language of the AI SDK and the MCP SDK; validates IPC payloads and tool calls |
| Localisation | `i18next@26.5.11` + `react-i18next@17.1.9` (2026-10-25), `i18next-icu@2.6.1` (2026-10-17), `intl-messageformat@12.1.4` (2026-10-19) | MIT; BSD-3-Clause | 85 / 59 / 7 releases per year; 1 open each | 26.7.1 / 17.1.12 (newer); Lingui 6.10.1, `react-intl@12.1.6` | Largest ecosystem, typed keys, ICU plurals, no compile step |
| Command palette | React Aria `Autocomplete` + `Menu` (in `react-aria-components@1.22.1`) | Apache-2.0 | See UI primitives | `cmdk@1.1.1` (no release in 12 months), `kbar@1.0.0` | No extra dependency, full keyboard and ARIA support [17] |
| Shortcuts | `react-hotkeys-hook@5.3.3` (2026-06-26) | MIT | 7 releases per year; 58 open | `tinykeys@4.0.1` (no scopes), `@tanstack/react-hotkeys@0.17.0` (0.x) | Scopes for viewer, text input and dialogs |
| AI provider abstraction | `ai@7.0.155` (2026-10-27) | Apache-2.0 | Daily releases; vercel/ai 1,515 open | 7.0.162 (newer); LangChain.js 1.6.1, LiteLLM 1.108.0 (compromised twice in 2026), Claude Agent SDK 0.3.318 (proprietary) | Tool loop, streaming, abort, structured output; Apache-2.0 ([ADR 0005](adr/0005-ai-layer.md)) [25] |
| Providers | `@ai-sdk/anthropic@4.0.90`, `@ai-sdk/openai@4.0.104`, `@ai-sdk/google@4.0.107`, `@ai-sdk/deepseek@3.0.75`, `@ai-sdk/mistral@4.0.74`, `@ai-sdk/openai-compatible@3.0.80` (all 2026-10-27); `@openrouter/ai-sdk-provider@3.1.0` (2026-09-19) | Apache-2.0 | Released together with `ai` | Newer patches of 2026-11-03; `ollama-ai-provider-v2@4.1.0` (community; Ollama runs through `openai-compatible`) | First-party providers; Z.ai GLM, Strata, llama.cpp, vLLM, LM Studio and Ollama via `openai-compatible` [25] |
| Model prices | models.dev `api.json` data, snapshot bundled per release | MIT (data) | Updated continuously (last push 2026-11-04) | OpenRouter prices only; LiteLLM cost map | The AI SDK reports tokens but no cost [26] |
| MCP client | `@modelcontextprotocol/client@2.4.0` (2026-10-23) | Apache-2.0 (new code; older code MIT) | v2 is the stable line since 2026-07-27 | `@ai-sdk/mcp@2.0.90` (stdio transport experimental), `@modelcontextprotocol/sdk@1.32.2` (v1 maintenance line) | Official stdio client for the SolidCraft MCP server [27] |
| Agent loop, skill loader, prompt layout, reasoning normalisation | **Own build** ([ADR 0005](adr/0005-ai-layer.md)) | Own code | Own | OpenCode v1 1.19.5 / `@opencode/sdk@2.2.5` (plan B), Claude Agent SDK 0.3.318, `@openai/agents@0.21.0`, Mastra 1.82.0, Goose v1.57.0 | Gates, skills and local-model guards are product logic; OpenCode's formats are reused |
| Skill frontmatter | `yaml@2.9.1` (2026-09-11) | ISC | Verified for this document [2] | `gray-matter@4.0.3` (2021-04-24, unmaintained) | Plain YAML parse of the split frontmatter block |
| Rule engine and check gates | **Own build** ([ADR 0010](adr/0010-rule-engine-and-check-gates.md)) | Own code | Own | Checks as optional model tools, Open Policy Agent | Gates run outside the model's control; a dozen fixed rules need no policy language |
| Provider manager and local-server detection | **Own build** ([ADR 0011](adr/0011-provider-manager.md)) | Own code | Own | AI SDK alone, a router service (OpenRouter, LiteLLM) | Detection, context limits and loading states are not covered by provider packages |
| Retrieval | SQLite FTS5 in `better-sqlite3@13.0.3` + `sqlite-vec@0.1.9` (2026-03-31); indexing and rank fusion are glue in the agent runtime ([ADR 0005](adr/0005-ai-layer.md)) | Public domain; MIT OR Apache-2.0 | sqlite-vec pre-1.0, last push 2026-05-18 | `@lancedb/lancedb@0.41.0` (heavier), `@orama/orama@3.1.18` (no release for about 10 months) | Lexical precision for rule IDs first, vectors second, one database file |
| Embeddings (optional) | `@huggingface/transformers@4.3.2` (2026-10-27) with `Xenova/multilingual-e5-small`; backend `onnxruntime-node@1.31.1` (2026-10-26) | Apache-2.0; model MIT; MIT | Active | `Qwen3-Embedding-0.6B`, `bge-m3` (larger), `embeddinggemma-300m` (Gemma terms), `jina-embeddings-v3` (CC-BY-NC-4.0), Rust `fastembed` (`ort` 2.0 RC only) | Small multilingual model for German rules [28] |
| API key storage | `@napi-rs/keyring@2.1.2` (2026-10-19) | MIT | Prebuilt napi binaries; 107 stars, bus factor 1 | Electron `safeStorage` async API (DPAPI; protects only against other Windows users, not against other apps of the same user; sync API removed in Electron 46), `keytar@7.9.0` (archived) | Windows Credential Manager, one credential per key ([ADR 0011](adr/0011-provider-manager.md)) [29][30] |
| Crash reports | `@sentry/electron@8.3.0` (2026-10-19) with exact peer `@sentry/node-native@11.8.0` (2026-10-15); disabled until opt-in | MIT | 25 releases per year; 11 open | Raw `crashReporter`, PostHog 1.440.0, OpenTelemetry | JS errors and native minidumps from main and renderer; `beforeSend` scrubbing, EU region or self-hosted [31] |
| Logging | `electron-log@5.4.4` (2026-05-14) | MIT | 1 release per year; 2 open, bus factor 1 | `pino@10.4.0` | Main, renderer and preload with rotation and a redaction hook |
| Python runtime | `uv` 0.13.6 (2026-10-27) + python-build-standalone 20261026 (2026-10-26) | MIT OR Apache-2.0; MPL-2.0 (+ CPython PSF and bundled libraries) | Very active | uv 0.13.7 (newer); PyInstaller 6.22.3 (one frozen exe per tool) | Offline environment from a wheelhouse with `uv sync --frozen --offline`, created in `%LOCALAPPDATA%` [32][33] |
| SolidCraft supervisor | **Own build** (glue): detects the SolidCraft process, holds the `control.subscribe` connection, tracks `{document_id, revision}` and requests the mirror batch ([ADR 0004](adr/0004-geometry-pipeline.md)) | Own code | Own | Polling `document.revision` only | SolidCraft documents the subscription as the way to keep a renderer in step; no client library exists |
| Python sidecar worker protocol | **Own build**: JSON-RPC 2.0 over stdio, pydantic and Zod on both sides ([ADR 0012](adr/0012-python-sidecar.md)) | Own code | Own | One-off processes per call, port to TypeScript | Interpreter start and imports stay loaded |
| Python libraries | `trimesh` 5.2.0 (2026-10-24), `numpy` 2.5.4 (2026-10-10), `scipy` 1.18.1 (2026-08-21), `pydantic` 2.14.1 (2026-10-11) | MIT; BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 (PyPI metadata); BSD-3-Clause; MIT | Active | pydantic 2.14.2 (newer); **PyMeshLab removed** (GPL-3.0) | Proven numerics of the existing checks; trimesh replaces PyMeshLab [5][34] |
| Unit tests | `vitest@5.0.5` (2026-10-15) | MIT | 34 releases per year; 365 open | 5.1.0 (newer) | Same Vite config as the renderer |
| Component tests | Vitest browser mode: `@vitest/browser-playwright@5.0.5` (2026-10-15) + `vitest-browser-react@2.3.0` (2026-09-04) | MIT | With Vitest | jsdom with Testing Library (logic only), Storybook test runner | Real Chromium, visual and ARIA snapshots [35] |
| E2E tests | `@playwright/test@1.64.1` (2026-10-14) | Apache-2.0 | 14 releases per year; 25 open | WebdriverIO | `_electron.launch` (Electron support is experimental) [12] |
| Visual tests | Playwright `toHaveScreenshot`; `@argos-ci/playwright@7.8.0` (2026-10-21) optional | Apache-2.0; MIT (client) | – | Chromatic CLI 18.13.3, Lost Pixel 3.22.0 (archived) | Baselines in the repository, Windows runner |
| Accessibility tests | `@axe-core/playwright@4.14.0` (2026-10-15) with `axe-core@4.14.0` (2026-10-05) | MPL-2.0 (dev only) | 6 releases per year | `eslint-plugin-jsx-a11y@6.10.2` (no ESLint 10 support) | WCAG 2.2 AA rule set in E2E and component tests |
| TypeScript | `typescript` → `npm:@typescript/typescript6@6.0.2` (2026-07-06) for compiling, type checks (`tsc6`) and typescript-eslint; `typescript@7.0.2` (2026-07-08) to be added side by side for fast type checks in the MVP | Apache-2.0 | Microsoft | TypeScript 7 alone (no programmatic API until 7.1; typescript-eslint requires `<6.1.0`) | Microsoft's side-by-side recipe; the Phase 1 prototype uses TS 6 only; switch to TS 7 alone once typescript-eslint supports it [36][37] |
| Lint and format | `eslint@10.13.0` (2026-10-16), `@eslint/js@10.0.1` (2026-02-06), `typescript-eslint@8.72.1` (2026-10-26), `eslint-plugin-react-hooks@7.1.1` (2026-04-17), `@eslint-react/eslint-plugin@5.28.8` (2026-10-23); `stylelint@17.16.0` (2026-10-01) + `stylelint-config-standard@40.0.0` (2026-01-15); `prettier@3.9.10` (2026-10-10) | MIT | Active (22–185 releases per year) | Biome 2.6.3, oxlint 1.90.0 / oxfmt 0.75.0 (0.x) | Type-aware rules; stylelint enforces semantic tokens and allows Tailwind at-rules |
| Release and changelog | `googleapis/release-please-action@v5.0.0` (2026-04-22), CLI `release-please@17.11.2` (2026-08-24) | Apache-2.0 | 21 releases per year; 378 open | changesets 3.0.3, semantic-release 25.0.9 | Conventional Commits to a reviewable release pull request |
| Commit rules | `@commitlint/cli@21.2.4` + `@commitlint/config-conventional@21.2.4` (2026-10-18) | MIT | 20 releases per year | – | Enforces Conventional Commits |
| Git hooks | `lefthook@2.2.2` (2026-10-13) | MIT | 33 releases per year; 110 open | `husky@9.1.7` (no release in about 2 years) | Single binary, parallel hooks, Windows-friendly |
| Secret scanning | gitleaks v8.30.1 (2026-03-21) | MIT | 524 open, 30.7k stars | trufflehog v3.99.7 (AGPL-3.0, optional CI only) | Pre-commit and CI ([ADR 0009](adr/0009-privacy-guardrails.md)); GitHub secret scanning is unavailable on this plan [38] |
| Workflow lint and security | actionlint v1.7.12 (2026-03-30), zizmor v1.31.1 (2026-10-15) | MIT | zizmor 176 open, 6.9k stars | v1.32.0 of zizmor (newer); CodeQL (not licensed for closed source) | Template injection, permissions and unpinned actions [39] |
| Dependency updates | Renovate hosted GitHub App (reference `renovate@44.190.1`, 2026-10-28) | AGPL-3.0-only (tool, not shipped) | 646 releases per year | Dependabot version updates (misses dependencies in a two-document pnpm 12 lockfile; default cooldown 3 days) | 7-day age gate, grouping, digest-pinned actions, uv support [1][40][41] |
| Vulnerability and licence gate | `pnpm audit` (pnpm 12.16.1) in CI; licence gate on the `pnpm sbom` output | MIT | – | Dependency review action (not available on a private personal repository) | Reads both lockfile shapes; blocks GPL, AGPL and SSPL in production dependencies [41][38] |
| SBOM | `pnpm sbom` (CycloneDX 1.7 / SPDX 2.3, pnpm 12.16.1) + syft v1.55.0 (2026-10-19) for the packaged app | MIT; Apache-2.0 | syft 710 open | `@cyclonedx/cyclonedx-npm@6.0.1` (npm only), `@cyclonedx/cdxgen@12.9.0` | CRA-ready SBOM per release, attached to the GitHub release [42] |


## External programs and services (not shipped)

These appear in the architecture diagram but are installed or chosen by the customer; the product
only calls them as separate processes or over the network ([ADR 0007](adr/0007-licensing-model.md)).

| Component | Version referenced | Licence | Use |
|---|---|---|---|
| SolidCraft | 0.30.1 (2026-11-02), pinned per PartBuddy release | MIT OR Apache-2.0 | CAD kernel, control port and MCP server (stdio) |
| OrcaSlicer | 2.4.2, current stable (the 2.5.0 line is a release candidate) | AGPL-3.0 | Slicing through its command-line interface |
| Blender | current LTS of the customer's installation | GPL-3.0-or-later | Studio renders through a separately published GPL script |
| Cloud AI providers | Anthropic, OpenAI, Google, Z.ai, DeepSeek, Mistral, OpenRouter | Provider terms | Customer's own API keys |
| Local model servers | Strata 0.2.10, Ollama 0.40.14, LM Studio, llama.cpp, vLLM 0.33.0 | MIT and others; model weights under their own licences | OpenAI-compatible endpoints on localhost |
| Windows Credential Manager | part of Windows | – | Storage of API keys through `@napi-rs/keyring` |

## Licence compatibility

Checked for distribution of the packaged app under GPL-3.0-or-later ([ADR 0007](adr/0007-licensing-model.md)); the table was first
written for a closed-source product and every listed licence is also compatible with GPL-3.0.

| Licence | Shipped blocks | Obligation | Verdict |
|---|---|---|---|
| MIT, ISC, BSD-2/3-Clause, 0BSD, Zlib, CC0-1.0 | Electron, React, three.js, R3F, drei, three-mesh-bvh, camera-controls, dockview, Zustand, XState, better-sqlite3, Kysely, electron-store, assistant-ui, shiki, react-hook-form, Zod, i18next, `intl-messageformat` (BSD-3-Clause), react-hotkeys-hook, Tabler icons, fflate, `@napi-rs/keyring`, Sentry SDK, electron-log, `yaml` (ISC), `postprocessing` (Zlib), onnxruntime-node, trimesh, numpy, scipy, pydantic, the embedding model (MIT) | Copyright and licence text in the third-party notices; numpy and scipy wheels bundle OpenBLAS and gfortran runtime licences that must be collected [43] | OK |
| Apache-2.0 | React Aria, AI SDK and providers, MCP client, Streamdown, transformers.js, Tailwind React Aria plugin, uv (dual MIT) | Licence text plus any NOTICE file content; mark modified files | OK |
| MPL-2.0 | python-build-standalone (build of CPython) | File-level copyleft only for modified MPL files; plus the CPython PSF licence and the licences of bundled libraries (OpenSSL, SQLite, zlib and others) | OK with notices |
| PSF-2.0 | CPython runtime | Include the PSF licence | OK |
| Public domain | SQLite (in better-sqlite3) | None | OK |
| LGPL-2.1 | `occt-import-js` (optional STEP fallback) | Separate, replaceable `.wasm`/JS file (never bundled into a minified chunk), licence text, notice, source offer; the EULA must not forbid modification or reverse engineering of that part [44] | **OK only as a separate module; otherwise omit** |
| Chromium third-party licences | Electron binary | Ship `LICENSE` and the Chromium licence file that electron-builder includes (file name not re-verified) [45] | OK |
| Proprietary | `dockview-enterprise` | Commercial licence | **Not used**; import banned by a lint rule [20] |
| GPL-3.0 | PyMeshLab | Combined work if imported by the shipped sidecar [34][44] | **Removed** |

Dev-only and service tools (not shipped, no obligation for the app): Renovate (AGPL-3.0, hosted
app), trufflehog (AGPL-3.0, optional CI), axe-core and `@axe-core/playwright` (MPL-2.0), all
linters, formatters and test runners. Service terms (Sentry SaaS, Argos, Azure Artifact Signing,
certificate authority) are contracts and data-processing agreements, checked separately under GDPR.
Model weights and model servers are installed by the user and never bundled
([ADR 0007](adr/0007-licensing-model.md)).

## Remaining own builds

With an ADR:

1. Tagged-3MF parser, worker pipeline and edge derivation
   ([ADR 0004](adr/0004-geometry-pipeline.md)).
2. Note anchoring to topology ([ADR 0006](adr/0006-note-anchoring.md)).
3. Agent loop, skill loader, cache-friendly prompt layout, reasoning normalisation
   ([ADR 0005](adr/0005-ai-layer.md)).
4. Rule engine and check gates ([ADR 0010](adr/0010-rule-engine-and-check-gates.md)).
5. Provider manager and local-server detection ([ADR 0011](adr/0011-provider-manager.md)).
6. Python sidecar worker protocol ([ADR 0012](adr/0012-python-sidecar.md)).
7. Typed IPC bridge ([ADR 0013](adr/0013-typed-ipc-bridge.md)).
8. CAD icon glyphs ([ADR 0014](adr/0014-cad-icon-glyphs.md)).

Glue on top of chosen blocks, no ADR yet (an ADR is due if one grows beyond glue):

* Selection model by face and edge ID, measuring tool, section caps and CAD-semantic ViewCube
  behaviour on top of drei and three-mesh-bvh.
* Design tokens (`tokens.css`), light/dark and density themes, styled wrappers around React Aria.
* Central command registry feeding palette, menus, toolbar, shortcuts and panel-docking commands.
* Chat glue: AI SDK `ChatTransport` over IPC, tool-approval UI, tool result renderers.
* Consent dialog, PII scrubbing for crash reports and logs, diagnostics export.
* Unit formatting (mm, degrees, tolerances in DE/EN) and a CI check for missing translation keys.

## Sources

1. Renovate, minimum release age, https://docs.renovatebot.com/key-concepts/minimum-release-age/, accessed 2026-11-04
2. npm registry, package metadata (versions, publish times, licences, peer dependencies), https://registry.npmjs.org/, accessed 2026-11-04
3. GitHub REST API, repository metadata (open issues incl. pull requests, stars, last push, archived flag), https://api.github.com/repos/, accessed 2026-11-04
4. GitHub releases API (gitleaks, actionlint, zizmor, syft, uv, python-build-standalone, release-please-action, lefthook), https://api.github.com/repos/{owner}/{repo}/releases, accessed 2026-11-04
5. PyPI JSON API (trimesh, numpy, scipy, pydantic, PyInstaller), https://pypi.org/pypi/, accessed 2026-11-04
6. Node.js release index, https://nodejs.org/dist/index.json, accessed 2026-11-04
7. Electron releases index (Node and Chromium per release), https://releases.electronjs.org/releases.json, accessed 2026-11-04
8. Electron release timelines and support policy, https://www.electronjs.org/docs/latest/tutorial/electron-timelines, accessed 2026-11-04
9. electron-builder Windows documentation (signing, publisherName, Azure), https://github.com/electron-userland/electron-builder/blob/master/website/docs/win.md, accessed 2026-11-04
10. Microsoft Learn, how packaged desktop apps run on Windows, https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes, accessed 2026-11-04
11. electron-builder releases (26.18.1, electron-updater 6.8.12, v27 alphas), https://github.com/electron-userland/electron-builder/releases, accessed 2026-11-04
12. Playwright Electron class (experimental) and Electron automated testing, https://playwright.dev/docs/api/class-electron ; https://www.electronjs.org/docs/latest/tutorial/automated-testing, accessed 2026-11-04
13. GlobalSign, code signing validity changes (CSC-31, 460 days), https://www.globalsign.com/en/blog/code-signing-validity-changes, accessed 2026-11-04
14. Microsoft Learn, Artifact Signing quickstart (eligibility), https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart, accessed 2026-11-04
15. electron-trpc releases (1.0.0 notes, issue #116), https://github.com/jsonnull/electron-trpc/releases, accessed 2026-11-04
16. React Aria, Toast (alpha), https://react-aria.adobe.com/Toast, accessed 2026-11-04
17. jsDelivr package file listings (component and icon coverage), https://data.jsdelivr.com/v1/packages/npm/, accessed 2026-11-04
18. Streamdown README, https://github.com/vercel/streamdown, accessed 2026-11-04
19. assistant-ui README and documentation, https://github.com/assistant-ui/assistant-ui ; https://www.assistant-ui.com/docs, accessed 2026-11-04
20. dockview licence and feature matrix, https://dockview.dev/docs/overview/licence ; https://github.com/dockview/dockview/blob/master/LICENCE.md, accessed 2026-11-04
21. three-mesh-bvh README and API, https://github.com/gkjohnson/three-mesh-bvh, accessed 2026-11-04
22. occt-import-js, https://github.com/kovacsv/occt-import-js, accessed 2026-11-04
23. Node.js `node:sqlite` (stability 1.2), https://nodejs.org/docs/latest-v24.x/api/sqlite.html, accessed 2026-11-04
24. AI Elements README (deprecation notice), https://github.com/vercel/ai-elements, accessed 2026-11-04
25. npm registry, AI SDK packages (`ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider`), publish times checked for this document, https://registry.npmjs.org/ai, accessed 2026-11-04
26. models.dev catalogue (MIT), https://models.dev/api.json ; https://github.com/anomalyco/models.dev, accessed 2026-11-04
27. MCP TypeScript SDK README (v2 stable line), https://github.com/modelcontextprotocol/typescript-sdk, accessed 2026-11-04
28. Hugging Face model API, https://huggingface.co/api/models/intfloat/multilingual-e5-small ; https://huggingface.co/api/models/Xenova/multilingual-e5-small, accessed 2026-11-04
29. keyring-node (`@napi-rs/keyring`), https://github.com/Brooooooklyn/keyring-node, accessed 2026-11-04
30. Electron safeStorage, https://www.electronjs.org/docs/latest/api/safe-storage, accessed 2026-11-04
31. Sentry Electron SDK README, https://github.com/getsentry/sentry-electron, accessed 2026-11-04
32. uv releases and Python version documentation, https://github.com/astral-sh/uv/releases ; https://docs.astral.sh/uv/concepts/python-versions/, accessed 2026-11-04
33. python-build-standalone releases, https://github.com/astral-sh/python-build-standalone/releases, accessed 2026-11-04
34. PyMeshLab (GPL-3.0), https://github.com/cnr-isti-vclab/PyMeshLab, accessed 2026-11-04
35. Vitest browser mode, https://vitest.dev/guide/browser/, accessed 2026-11-04
36. Microsoft, "Announcing TypeScript 7.0", https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, accessed 2026-11-04
37. typescript-eslint, dependency versions, https://typescript-eslint.io/users/dependency-versions/, accessed 2026-11-04
38. GitHub Docs, security features by plan and dependency review, https://docs.github.com/en/code-security/getting-started/github-security-features ; https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review, accessed 2026-11-04
39. CodeQL CLI licence, https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md, accessed 2026-11-04
40. GitHub Docs, Dependabot supported ecosystems and options (cooldown), https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories ; https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference, accessed 2026-11-04
41. pnpm, lockfile format, https://pnpm.io/lockfile, accessed 2026-11-04
42. pnpm, `pnpm sbom`, https://pnpm.io/cli/sbom, accessed 2026-11-04
43. numpy and scipy licences, https://github.com/numpy/numpy/blob/main/LICENSE.txt ; https://github.com/scipy/scipy, accessed 2026-11-04
44. GNU GPL FAQ, https://www.gnu.org/licenses/gpl-faq.en.html, accessed 2026-11-04
45. Electron, application packaging, https://www.electronjs.org/docs/latest/tutorial/application-distribution, accessed 2026-11-04
