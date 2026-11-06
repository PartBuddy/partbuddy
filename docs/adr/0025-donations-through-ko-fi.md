---
status: accepted
date: 2026-11-06
---

# Donations through Ko-fi

## Context and Problem Statement

[ADR 0007](0007-licensing-model.md) publishes PartBuddy under GPL-3.0-or-later and funds it by
donations through GitHub Sponsors. Before the first public release the product owner chose another
place for donations. Where do donations go, and where does PartBuddy link to it?

## Considered Options

* Ko-fi
* GitHub Sponsors (ADR 0007)

## Decision Outcome

Chosen option: **Ko-fi**, page `ko-fi.com/partbuddy`, decided by the product owner on 2026-11-06.

* GitHub shows the "Sponsor" button through `.github/FUNDING.yml` (`ko_fi: partbuddy`).
* The README's "Support" section and the "Support PartBuddy on Ko-fi" link under Settings → About
  point to the page.
* As before, donations buy no features, priority or licence rights; the app has no paywall.

### Consequences

* Good, because the page belongs to the project, not to the owner's GitHub account.
* Neutral, because the legal questions about donations (imprint, trade law) are parked until the
  link is public, as decided on 2026-11-06.
