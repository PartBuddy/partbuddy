// PartBuddy mark for the title bar, 16 × 20 px. Path data is the pixel-snapped 32 px icon
// geometry from tools/brand/geometry.mjs (hinted[32], placed at the origin); see docs/brand.md.
// Colours follow the theme: the part takes the text colour, the companion the accent.

const part =
  'M2 0L8.25 0A0.75 0.75 0 0 1 9 0.75L9 6.25A0.75 0.75 0 0 0 9.75 7L15.25 7A0.75 0.75 0 0 1 16 7.75L16 9.5A3.5 3.5 0 0 1 12.5 13L7.75 13A0.75 0.75 0 0 0 7 13.75L7 19.25A0.75 0.75 0 0 1 6.25 20L0.75 20A0.75 0.75 0 0 1 0 19.25L0 2A2 2 0 0 1 2 0Z';
const buddy =
  'M10.75 0L14 0A2 2 0 0 1 16 2L16 5.25A0.75 0.75 0 0 1 15.25 6L10.75 6A0.75 0.75 0 0 1 10 5.25L10 0.75A0.75 0.75 0 0 1 10.75 0Z';

export function BrandMark() {
  return (
    <svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true" focusable="false" className="shrink-0">
      <path d={part} className="fill-text" />
      <path d={buddy} className="fill-accent" />
    </svg>
  );
}
