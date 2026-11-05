/**
 * A CSS colour as `#rrggbb` for the native window buttons. The production build's CSS minifier
 * shortens `#ffffff` to `#fff`, and computed styles may report `rgb(…)`; anything else is null.
 */
export function hexColor(value: string): string | null {
  const text = value.trim().toLowerCase();
  const long = /^#([0-9a-f]{6})$/.exec(text);
  if (long) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return `#${short.slice(1).map((digit) => digit + digit).join('')}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(text);
  if (rgb) {
    const parts = rgb.slice(1, 4).map(Number);
    if (parts.some((part) => part > 255)) return null;
    return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}
