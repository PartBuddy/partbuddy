/** "Base plate length [50..90]" → { min: 50, max: 90 }: the range the designer wrote into the comment. */
export function rangeOf(comment: string): { min: number; max: number } | null {
  const match = /\[\s*(-?\d+(?:[.,]\d+)?)\s*\.\.\s*(-?\d+(?:[.,]\d+)?)\s*\]/.exec(comment);
  if (!match) return null;
  const min = Number.parseFloat((match[1] ?? '').replace(',', '.'));
  const max = Number.parseFloat((match[2] ?? '').replace(',', '.'));
  return Number.isFinite(min) && Number.isFinite(max) && min <= max ? { min, max } : null;
}

/** The comment without its range, which the row shows as its own hint. */
export function commentText(comment: string): string {
  return comment.replace(/\s*\[[^\]]*\.\.[^\]]*\]\s*/, ' ').trim();
}
