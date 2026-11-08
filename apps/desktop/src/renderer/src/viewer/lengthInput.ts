/** A length as typed into the dimension field: digits with a comma or a point; anything else is not a number. */
export function parseLength(text: string): number {
  const clean = text.trim().replace(/\s*mm$/i, '').replace(',', '.');
  return /^\d+(?:\.\d*)?$|^\.\d+$/.test(clean) ? Number.parseFloat(clean) : Number.NaN;
}

/**
 * The field's text after ↑ or ↓: 1 a press, 10 with Shift, 0.1 with Alt, written with the
 * language's decimal mark. Null for any other key, for text that is no number, and for a step to
 * zero or below, so the field stays as it is.
 */
export function stepLength(text: string, key: string, modifiers: { shiftKey: boolean; altKey: boolean }, decimal: string): string | null {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
  const value = parseLength(text);
  if (!Number.isFinite(value)) return null;
  const step = modifiers.shiftKey ? 10 : modifiers.altKey ? 0.1 : 1;
  const next = Math.round((value + (key === 'ArrowUp' ? step : -step)) * 1000) / 1000;
  return next > 0 ? String(next).replace('.', decimal) : null;
}
