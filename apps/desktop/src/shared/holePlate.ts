/**
 * The hole plate of the tolerance pieces and the hole allowance built on it. A leaf module without imports, so the
 * material catalog can use it while screwSizes.ts and contract.ts load the catalog (BC-20 review B1: an import cycle
 * through tolerances.ts left `toStep` undefined at load).
 */

/** The nominal sizes of the hole plate (decided 2026-11-08). */
export const HOLE_SIZES = [3, 5, 8, 10] as const;
/** The largest hole the hole plate measures. */
export const LARGEST_HOLE = Math.max(...HOLE_SIZES);
/** Bambu Studio compensates circular holes only up to this diameter (wiki, Auto Circle Contour-Hole Compensation). */
export const COMPENSATED_CIRCLE = 50;

/**
 * On 0.05 mm, halves away from zero, so −0.075 rounds like 0.075; smoothed to 0.000001 first, so 10 − 9.925 rounds like
 * 3 − 2.925 (audit T53).
 */
export const toStep = (value: number) => (Math.sign(value) * Math.round(Math.round(Math.abs(value) * 20 * 1e6) / 1e6)) / 20;

/**
 * How much smaller than drawn a hole prints apart from the material's shrinkage, on the diameter: Bambu Lab's M6 hole
 * measured 5.9 mm with no hole compensation ("XY Hole / Contour compensation", wiki, read 2026-11-13). One printer and
 * one filament, and no second source with a number (audit MG-27), so PartBuddy's own choice as a start. That 5.9 mm holds
 * the shrinkage of the filament it was printed in already; the catalog adds the shrinkage on top, which counts it twice
 * by up to its share on a 10 mm hole (0.05 mm for PLA).
 */
export const PRINT_UNDERSIZE = 0.1;

/**
 * The allowance on the diameter of a hole of `diameter` mm (audit MG-26). `holeShrink` is read on (or derived for) the
 * holes of HOLE_SIZES and holds up to LARGEST_HOLE. Shrinkage is a share of the size (Bambu Lab, Filament2Print),
 * so above it the part of `holeShrink` beyond PRINT_UNDERSIZE grows in proportion: ABS 0.25 mm on 10 mm is 0.85 mm on
 * 50 mm. Above COMPENSATED_CIRCLE not even Bambu Studio compensates; it is a guide value there too.
 */
export function holeAllowance(holeShrink: number, diameter: number): number {
  if (!(diameter > LARGEST_HOLE)) return holeShrink;
  const share = Math.max(0, holeShrink - PRINT_UNDERSIZE) / LARGEST_HOLE;
  return Math.round((holeShrink + share * (diameter - LARGEST_HOLE)) * 1000) / 1000;
}
