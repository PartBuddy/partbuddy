---
status: superseded
date: 2026-11-04
---

# Own CAD feature glyphs on the Tabler grid (own implementation)

> **Superseded on 2026-11-05 by [ADR 0023](0023-cad-icons-from-zoo.md):** CAD operations use Zoo
> Design Studio's icons instead of own glyphs.

## Context and Problem Statement

The timeline and the command palette show an icon per feature type. General icon sets cover boxes,
cylinders, cuts and holes, but not CAD operations such as fillet, chamfer, shell, draft, loft or
pattern in a recognisable form. Mixed icon sets break visual consistency. Where do these glyphs come
from?

## Considered Options

* Tabler Icons for general UI plus own CAD glyphs drawn on the Tabler grid
* A second icon set for CAD operations
* Text labels only for CAD features

## Decision Outcome

Chosen option: "Tabler plus own glyphs on the same grid", because Tabler (MIT, 5,203 icons on a
24 px grid with 2 px strokes) covers the general UI, and a small set of feature glyphs drawn to the
same grid, stroke and corner rules keeps the look consistent.

* Own glyphs: fillet, chamfer, shell, draft, loft, sweep, linear and circular pattern, mirror,
  thread, split, combine. Each is an SVG React component with the Tabler component signature.
* Glyphs live in a design-system package, are reviewed against Tabler originals side by side and
  carry an accessible name wherever they are not decorative.
* The click dummy uses the closest Tabler glyphs (for example `border-radius` for fillet,
  `border-corners` for chamfer) until the own glyphs exist.

### Consequences

* Good, because one visual language across UI and CAD features.
* Bad, because the glyphs are own work (about a dozen icons) and need design review.

## Pros and Cons of the Options

### Second icon set

* Bad, because no maintained, permissively licensed CAD icon set matching Tabler's grid was found.

### Text labels only

* Bad, because a dense timeline needs scannable symbols; text alone slows recognition.
