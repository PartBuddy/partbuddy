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
