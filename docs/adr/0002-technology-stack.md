---
status: accepted
date: 2026-11-04
---

# Electron with a React/TypeScript renderer and a three.js viewer

## Context and Problem Statement

PartBuddy is a free, Windows-first desktop app with a CAD-grade 3D view (face and edge
picking), dockable panels, a chat with AI providers and MCP tool calling, a Python sidecar and a
signed installer with auto-update. macOS and Linux may follow. Which application stack fits best at
the end of 2026?

Evidence: [research § Technology stack](../research.md#1-technology-stack), weighted matrix with
ten criteria.

## Decision Drivers

* Quality of the 3D view for B-rep-derived meshes, including picking (weight 20 %)
* UI maturity, accessibility (WCAG 2.2 AA) and localisation (15 %)
* Ready-made building blocks for AI providers, MCP, chat and 3D (12 %)
* Maintenance, distribution (installer, signing, updates, CI), effort (10 % each)
* Python sidecar, platforms, footprint, licence fit (5–8 % each)

## Considered Options

* Electron + TypeScript + React + three.js
* Tauri 2 + the same TypeScript front end
* .NET (WPF / WinUI 3) + Helix Toolkit
* Avalonia 12 + own 3D
* Rust native UI (egui / iced / Slint + wgpu)
* Qt 6 (C++/QML) + Open CASCADE
* Screened and dropped as not mature enough: Electrobun, Wails v3, Compose Multiplatform, Flutter

## Decision Outcome

Chosen option: "Electron + TypeScript + React + three.js" (weighted score 4.85 of 5; Tauri 2 4.20,
Avalonia 3.68, WPF 3.63, Qt 3.51, Rust native 2.98), because it leads in every criterion except
footprint:

* three.js with three-mesh-bvh is the most mature web 3D stack for picking; Electron ships the same
  Chromium on every platform.
* Two commercial CAD products use it: Plasticity (Electron + three.js) and Zoo Design Studio, which
  moved from Tauri to Electron in 2024.
* The main process is Node, so the official MCP TypeScript SDK (stdio transport), the AI provider
  SDK and the sidecar process management run in one language with the UI.
* electron-builder with electron-updater covers NSIS installers, differential updates and Windows
  signing on GitHub Actions.

Architecture rules that follow from the choice:

* Renderer sandboxed with context isolation; a typed, allow-listed preload bridge is the only path
  to the main process. API keys never reach the renderer.
* The renderer code uses no Electron API directly. A thin `platform` adapter keeps a later move to
  Tauri limited to the main-process layer.
* WebGLRenderer first; three.js still labels the WebGPU renderer experimental.

Exact versions are listed in [building blocks](../building-blocks.md).

### Consequences

* Good, because one language (TypeScript) covers UI, viewer, agent runtime and tooling.
* Bad, because the installer is about 106 MB and idle memory about 150 MB (Tauri: 1 MB installer,
  but 142 MB memory on Windows). Mitigated by differential updates and pruned locales.
* Bad, because only the latest three Electron majors receive fixes (new major every eight weeks);
  an Electron upgrade is planned every two to three months.
* Bad, because Electron needs deliberate hardening (fuses, ASAR integrity, no remote content in
  privileged windows).

### Confirmation

The click dummy in `prototypes/clickdummy` runs the chosen renderer libraries in a browser. The first
MVP milestone adds the Electron shell and an end-to-end test with Playwright's Electron support.

## Pros and Cons of the Options

### Tauri 2

* Good, because of a 1 MB installer and a Rust backend with capability scoping.
* Bad, because stdio MCP and local-provider requests need Rust or plugins (second language), Linux
  WebKitGTK has WebGL performance issues and macOS gets WebGPU only from version 26.

### .NET WPF / WinUI 3 / Avalonia

* Good, because of mature desktop controls and the team's .NET experience.
* Bad, because Helix Toolkit builds on the archived SharpDX and is Windows-only; a modern 3D view
  would be largely own work.

### Qt 6 + Open CASCADE

* Bad, because Qt Quick 3D is GPL-only for open-source users (commercial licence needed) and there
  is no ready-made MCP or multi-provider AI SDK for C++.

### Rust native UI

* Bad, because camera, picking, chat, Markdown and accessibility would be own work; iced lacks
  accessibility support.
