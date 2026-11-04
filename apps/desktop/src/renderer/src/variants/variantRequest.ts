/** Numbers in "show me three" / "zeig mir drei" (M2c, ADR 0021). */
const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, zwei: 2, drei: 3, vier: 4, '2': 2, '3': 3, '4': 4 };

/** How many variants a message asks for ("show me three …", "zeig mir drei …"), or null. */
export function variantsAsked(text: string): number | null {
  const found = /\b(?:show me|zeig(?:e)? mir)\s+(two|three|four|zwei|drei|vier|[234])\b/iu.exec(text);
  return found?.[1] ? (WORDS[found[1].toLowerCase()] ?? null) : null;
}
