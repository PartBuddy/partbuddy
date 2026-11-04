---
status: accepted
date: 2026-11-04
---

# Free software under GPL-3.0-or-later, funded by donations

## Context and Problem Statement

CAD-Studio is offered free of charge. Its development is funded by voluntary donations, not by
sales. The app controls SolidCraft, OrcaSlicer and Blender, runs a Python sidecar and uses many
open-source libraries. Under which licence is it published, how are the obligations of the
integrated software met, and how do donations work?

Evidence: [research § Law and licences](../research.md#5-law-and-licences). The research assumed a
paid product; its findings on third-party licences and provider terms still apply. This is not
legal advice; points marked for counsel are reviewed before the first public release.

## Decision Drivers

* The product stays free; nobody may turn it into a closed paid version
* Licences of SolidCraft, OrcaSlicer, Blender, PyMeshLab and all building blocks must be compatible
* Low effort for contributors and for compliance

## Considered Options

* GPL-3.0-or-later, donations through GitHub Sponsors
* MIT or Apache-2.0 (permissive, like SolidCraft)
* Freeware with closed source code
* Proprietary paid product with an EULA (the earlier assumption)

## Decision Outcome

Chosen option: "GPL-3.0-or-later with GitHub Sponsors", decided by the product owner on
2026-11-04, because copyleft keeps every derived version free and matches the ecosystem the app
works with (OrcaSlicer AGPL-3.0, Blender GPL-3.0-or-later, PyMeshLab GPL-3.0).

| Component | Licence | Use | Rule |
| --- | --- | --- | --- |
| CAD-Studio | GPL-3.0-or-later | the product | `LICENSE` holds the full text; the About dialog shows the notice required by GPL section 0 ("Appropriate Legal Notices") |
| SolidCraft | MIT OR Apache-2.0 | separate process, control port and MCP | Compatible; the customer installs it or the app downloads the official installer and verifies its checksum. "Works with SolidCraft" only as plain text, no implied endorsement |
| OrcaSlicer | AGPL-3.0 | separate process (CLI) | Called, not linked; its printer profiles are read from the user's installation |
| Blender | GPL-3.0-or-later | separate process | The render script is part of this repository under the same licence |
| PyMeshLab | GPL-3.0 | sidecar library | Allowed; ADR 0012 keeps it where it checks better than trimesh |
| Open CASCADE builds (occt-import-js) | LGPL-2.1 | fallback only | Compatible with GPL-3.0; shipped with licence text and source reference |
| Libraries in the app | MIT, Apache-2.0, BSD, ISC, MPL-2.0, Zlib | bundled | Compatible with GPL-3.0; listed with licence texts in the third-party notices |

Licences that are incompatible with GPL-3.0 or restrict use (GPL-2.0-only, SSPL, BUSL, non-commercial
Creative Commons, proprietary) are blocked by the licence gate in CI
(`tools/licenses/check-licenses.mjs`); AGPL dependencies need an explicit exception with reason.

Donations: GitHub Sponsors for the owner's account (`.github/FUNDING.yml`), linked from the README
and from a "Support the project" item in the app's Help menu. Donations buy no features, priority or
licence rights; the app has no paywall and no licence keys.

AI providers are used only with the user's own API keys or local servers. Anthropic does not allow
third-party apps to sign in with Claude consumer plans; the app offers API keys only. Providers that
train on API data by default or store data outside the EU are marked in the provider settings (see
[architecture](../architecture.md#provider-policy)).

Contributions are accepted under the same licence (inbound = outbound), confirmed by a sign-off line
in each commit (Developer Certificate of Origin).

### Consequences

* Good, because the app and every fork stay free software; users can inspect what the assistant
  sends to which provider.
* Good, because GPL-licensed tools (PyMeshLab, Blender scripts) can be used without rewrites.
* Good, because a public repository (planned from the MVP on) gets branch protection, CodeQL,
  secret scanning and private vulnerability reporting free of charge.
* Neutral: SolidCraft, OrcaSlicer and Blender stay customer-installed to keep the installer small
  and updates independent, not for licence reasons.
* Open for counsel: whether donations make the distribution a "commercial activity" under the EU
  Cyber Resilience Act; free software without monetisation is generally outside its scope.

## Pros and Cons of the Options

### MIT or Apache-2.0

* Good, because it is maximally permissive and identical to SolidCraft's licence.
* Bad, because others may ship closed paid versions; PyMeshLab could not be used.

### Freeware with closed source

* Bad, because users cannot verify data handling and nobody can contribute; the obligations of
  bundled libraries remain.

### Proprietary paid product

* Bad, because it contradicts the decision to offer the product free of charge.
