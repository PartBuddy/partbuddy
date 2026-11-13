/**
 * How finely PartBuddy's STL and 3MF files follow curved faces (audit D22): SolidCraft's `quality: 'fine'`, a chord
 * of FINE_CHORD of each body's size, never under 1 µm (`file.export` and `solidcraft-cli run --quality`, 0.40.1).
 * The export menu names it from here.
 */
export const EXPORT_QUALITY = 'fine';
export const FINE_CHORD = 5e-5;
