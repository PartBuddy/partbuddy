/** A length as typed into the dimension field: digits with a comma or a point; anything else is not a number. */
export function parseLength(text: string): number {
  const clean = text.trim().replace(/\s*mm$/i, '').replace(',', '.');
  return /^\d+(?:\.\d*)?$|^\.\d+$/.test(clean) ? Number.parseFloat(clean) : Number.NaN;
}
