# <picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/svg/logo-inverse.svg"><img src="assets/brand/svg/logo.svg" alt="PartBuddy" height="48"></picture>

[![CI](https://github.com/ManuelStaggl/partbuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/ManuelStaggl/partbuddy/actions/workflows/ci.yml)
[![Privacy scan](https://github.com/ManuelStaggl/partbuddy/actions/workflows/privacy.yml/badge.svg)](https://github.com/ManuelStaggl/partbuddy/actions/workflows/privacy.yml)
[![Security checks](https://github.com/ManuelStaggl/partbuddy/actions/workflows/security.yml/badge.svg)](https://github.com/ManuelStaggl/partbuddy/actions/workflows/security.yml)
[![Licence: GPL-3.0-or-later](https://img.shields.io/badge/licence-GPL--3.0--or--later-355f8c)](LICENSE)

Free desktop app for AI-assisted parametric design of FDM 3D-print parts. An assistant builds the part
step by step in the SolidCraft CAD kernel while PartBuddy mirrors every step in its own 3D view.
Notes pinned to faces, edges and features become context for the assistant; clarifying questions
arrive as cards with options and a recommendation; every part carries honest verification levels
from "created" to "confirmed by print". Users choose their model freely: cloud providers with their
own API key or local servers such as Strata, Ollama or LM Studio.

![Main view of the click dummy](docs/screens/main-1440-light.png)

## Status

Phase 1 (research, concept, click dummy, repository) is complete; no product code exists yet.

| Area | State |
| --- | --- |
| Research and decisions | [Research](docs/research.md), [building blocks](docs/building-blocks.md), [ADRs](docs/adr/) (accepted except 0003, the folder structure) |
| Concept | [Architecture](docs/architecture.md), [design system](docs/design-system.md), [brand guide](docs/brand.md), [feature catalogue](docs/feature-catalog.md) |
| Click dummy | [`prototypes/clickdummy`](prototypes/clickdummy): main view with mock data, real sample geometry |
| Repository | CI, privacy and security checks, release automation; [GitHub setup](docs/github-setup.md) pending |

## Repository layout

```text
.github/       workflows, issue forms, pull request template, CODEOWNERS
assets/brand/  logo, app icon, favicon and social preview (generated, see docs/brand.md)
docs/          research, building blocks, architecture, design system, brand, ADRs, screenshots
packages/      shared TypeScript packages (design tokens)
prototypes/    click dummy, never imported by product code
tools/         sample-model generator, brand asset build, privacy scan helper, licence gate, GitHub setup script
```

`apps/` (Electron desktop app, Python sidecar) is added with the MVP. The structure is explained in
[ADR 0003](docs/adr/0003-repository-structure.md).

## Development

Requirements and rules: [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```sh
pnpm install                                   # Node 26.13.0, pnpm 12.16.1; installs Git hooks
pnpm --filter @partbuddy/clickdummy dev       # click dummy on http://localhost:5173
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @partbuddy/clickdummy test:e2e  # Playwright flows, console and accessibility checks
```

The sample model is regenerated with `node tools/fixtures/generate.mjs <output-dir>` (needs the
SolidCraft CLI); CI uses the committed files.

## Security and privacy

See [SECURITY.md](SECURITY.md). Every commit is scanned for secrets and personal data before it is
created and again in CI ([ADR 0009](docs/adr/0009-privacy-guardrails.md)).

## Licence

Copyright (C) 2026 ManuelStaggl and contributors.

PartBuddy is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY; see [LICENSE](LICENSE) for details. Third-party components and
their licences are listed in [building blocks](docs/building-blocks.md).

## Support

PartBuddy is free and stays free. If it helps you, you can support its development through
[GitHub Sponsors](https://github.com/sponsors/ManuelStaggl). Donations buy no features or priority.
