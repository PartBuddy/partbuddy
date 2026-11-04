---
status: proposed
date: 2026-11-04
---

# Proprietary EULA with third-party notices; external tools installed by the customer

## Context and Problem Statement

CAD-Studio is sold commercially from the EU. It controls SolidCraft, OrcaSlicer and Blender, runs a
Python sidecar and uses many open-source libraries. Which licence model does the product use, and
how are the obligations of the integrated software met?

Evidence: [research § Law and licences](../research.md#5-law-and-licences). This is not legal
advice; points marked for counsel are reviewed before the first paid release.

## Decision Drivers

* Commercial, closed-source distribution must be lawful for every bundled component
* Copyleft code (GPL, AGPL) must not become part of the closed application
* Low obligations under the EU Cyber Resilience Act for third-party components

## Considered Options

* Proprietary EULA, third-party notices, copyleft tools only installed by the customer
* Source-available licence (Functional Source Licence or Business Source Licence)
* Open core (open base, paid modules)

## Decision Outcome

Chosen option: "Proprietary EULA", with these rules:

| Component | Licence | Use | Rule |
| --- | --- | --- | --- |
| SolidCraft | MIT OR Apache-2.0 | separate process, control port and MCP | Customer installs it, or the app downloads the official installer and verifies its checksum. "Works with SolidCraft" only as plain text, no implied endorsement. |
| OrcaSlicer | AGPL-3.0 | separate process (CLI) | Never linked or bundled; its printer profiles are read from the user's installation. |
| Blender | GPL-3.0-or-later | separate process | Customer installs it. The render script runs inside Blender and is published separately under the GPL. |
| PyMeshLab | GPL-3.0 | not used | Replaced by trimesh (MIT) in the shipped sidecar. |
| Open CASCADE builds (occt-import-js) | LGPL-2.1 | fallback only | Shipped as a separate, replaceable file with licence text and source offer; never statically linked. |
| Libraries in the app | MIT, Apache-2.0, BSD, ISC | bundled | Listed with licence texts in the third-party notices; CI blocks copyleft and source-available licences in shipped dependencies (licence gate `tools/licenses/check-licenses.mjs`). |

AI providers are used only with the customer's own API keys (bring your own key). Anthropic does
not allow third-party apps to sign in with Claude consumer plans; the app offers API keys only.
Providers that train on API data by default or store data outside the EU are marked in the
provider settings (see [architecture](../architecture.md#provider-policy)).

### Consequences

* Good, because no copyleft code is distributed as part of the closed product.
* Good, because SolidCraft, Blender and OrcaSlicer stay outside the product's CRA patch
  obligations.
* Bad, because first-run setup must detect and guide the installation of three external programs.
* Neutral: a later source-available release (FSL) of the adapters remains possible.

## Pros and Cons of the Options

### Functional or Business Source Licence

* Good, because the code becomes inspectable, which builds trust.
* Bad, because FSL allows free use for non-competing purposes, which for a desktop app is close to
  free use; each BSL release is effectively a custom licence. Kept as a later option.

### Open core

* Bad, because the value of the product lies in the integrated workflow; splitting it adds a second
  product line without a clear paid boundary.
