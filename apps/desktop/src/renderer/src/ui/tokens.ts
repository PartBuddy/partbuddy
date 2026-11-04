/**
 * Reads a pixel design token for APIs that take numbers (dockview sizes, popover offsets).
 * Returns 0 when the token is missing, which makes a typo visible in the layout.
 */
export function tokenPx(name: `--cs-${string}`): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}
