# Provenance

PartBuddy grows out of a private CAD workspace. The repository starts empty and follows an
allow-list: only content written for the product is added
([ADR 0009](adr/0009-privacy-guardrails.md)). Anything taken over from the earlier workspace is
listed here with its source, the reason and how it was cleaned up. Files are never copied; content
is rewritten in English for the product.

| Item in this repository | Source in the earlier workspace | Reason | Clean-up |
| --- | --- | --- | --- |
| Verification levels R, L, TG, SC, SL, PD (`docs/feature-catalog.md`, click dummy translations) | Standards and quality notes of the knowledge base | Core quality rule the product makes visible | Definitions rewritten in English and German; workspace-specific proof file names removed |
| Print-gate concept (checks P1–P6, solution types for overhang findings, released / finding / not checked) | Print gate tool and its decision record | The product reproduces the gate as a rule-engine check (ADR 0010) | Described in own words; no code copied; device-specific limits left out |
| Separation of nominal dimension and print compensation, validity key of calibration values | Parametrics rules and calibration profile template | Domain rule shown in the parameter panel and data model | Rule rewritten; no calibration values or device data taken over |
| Timeline anti-pattern idea (TC rules) | Feature-selection matrix of the knowledge base | Basis for the timeline check in the product | Only the concept is referenced; rule texts will be rewritten when the check is implemented |

Not taken over (by design): project folders, profiles, calibration values, print records, renders,
memory files, transcripts, AI tool configuration, hooks, skills, absolute paths, user names and
e-mail addresses.

Synthetic test data: the sample model in `tools/fixtures` is designed from scratch for this
repository (a screw-mounted cable clip) and generated with the SolidCraft CLI.

## Brand identity

The brand ([brand guide](brand.md)) is written for the product; nothing is taken over from the
earlier workspace.

**Concept images.** The three concept boards in `docs/brand/concepts/` were generated on
2026-11-04 with the built-in `image_gen` tool of the OpenAI Codex CLI 0.166.0 (signed in with a
ChatGPT account; the bundled `imagegen` skill names `gpt-image-2` as its model, the tool does not
report the model per call). One image per direction, 1536 × 1024 px, quality high; stored here
downscaled to 1024 × 683 px, which also drops any embedded metadata. The boards are concepts only:
no generated pixels or shapes are used in an asset.

Shared part of every prompt:

> Brand: "PartBuddy", a free desktop app in which an AI assistant designs FDM 3D-print parts step
> by step in a parametric CAD kernel. Character: calm, precise, trustworthy, like professional
> engineering software; a helpful companion, not a toy. Visual rules: flat vector logo design built
> on a strict geometric grid, crisp straight edges and constant radii, no gradients, no glow, no 3D
> rendering, no shadows, no purple, no mascot, no emoji, no sparkles or AI stars, no circuit-board
> cliches, no nozzle or printer drawing. Colours only: graphite #1b1f24, white #ffffff, light grey
> #f3f4f6 and ONE accent blue #1f5fd1 used sparingly. Wordmark "PartBuddy" set in a clean neutral
> grotesque sans serif (similar to Segoe UI or Inter), medium weight, normal tracking, capital P and
> capital B, spelled exactly P-a-r-t-B-u-d-d-y. Layout of the presentation board (landscape, plain
> light grey #f3f4f6 background, generous whitespace): left half shows the symbol large, right half
> shows the horizontal lockup symbol + wordmark on a white card, below it the same lockup on a
> graphite #1b1f24 card in white and blue, and a row of the symbol alone as a rounded-square app
> icon at four decreasing sizes (large to tiny, like 256, 64, 32, 16 pixels) to show it stays
> legible small. No other text on the board, no captions, no labels.

Direction-specific part, placed before the shared part:

| Board | Prompt |
| --- | --- |
| A "Layers" | Logo concept board, direction "Layers". The symbol is a bold capital letter P constructed only from 5 horizontal stacked bars of equal height with small equal gaps, like the layers of an FDM 3D print seen from the side; the bowl of the P is formed by the upper bars, its counter is a clean rectangular opening with rounded inner corners. Exactly one bar (the topmost, the layer currently being built) is accent blue, all others graphite. Geometric, monoline-free, solid shapes. |
| B "Pair" | Logo concept board, direction "Pair". The symbol shows two simple solid machine parts that belong together: a larger graphite rounded-rectangle block with a precise rectangular notch cut into its top right corner, and a small accent-blue square part sitting in that notch with a thin, even clearance gap around it, like a part and its matching companion fitting together. Read together the silhouette suggests a capital letter P. Orthographic flat view, solid shapes, engineered fit. |
| C "Pinned face" | Logo concept board, direction "Pinned face". The symbol is a simple isometric cube drawn with uniform thick graphite strokes (rounded line joins), representing a CAD part; its top face is filled solid accent blue and a small round graphite pin marker sits on that blue face, like a note pinned to a face of the model by the assistant. Strictly isometric 30 degree geometry, equal stroke widths, minimal. |

**Terms of the image generation.** Checked on 2026-11-04: the OpenAI Europe Terms of Use (updated
2026-01-16, applying to residents of the EEA) and Terms of Use (effective 2026-01-01) assign the
output to the user ("you … own the Output") and state that output may not be unique, so other
users may receive similar output. They forbid presenting output as human-generated; this file and
the brand guide state where generated images were used. The Service Terms (updated 2026-10-16)
add no restriction for generated images. Because the final mark is a simple geometric
construction drawn from measurements, its rights do not depend on the generated boards; whether a
generated image is protected by copyright at all depends on the applicable law.

**Final assets.** Every file in `assets/brand/` is generated by `tools/brand/build.mjs` from the
construction in `tools/brand/geometry.mjs`, the colours in the design tokens and text outlines made
with `tools/brand/outline-text.py` (fontTools 4.68.0, uharfbuzz 0.57.0) from Inter 4.1 (SIL Open
Font License 1.1, release archive and checksum in the [brand guide](brand.md#typography)). The
font files are not stored in the repository.
