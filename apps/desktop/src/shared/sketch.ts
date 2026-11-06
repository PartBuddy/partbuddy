import { z } from 'zod';

/**
 * A whole hand sketch (F9, F10) as it travels to the main process and is kept in the project's
 * "sketches" folder: checked here, because a kept sketch comes back from disk.
 */

/** A point on the paper (640 × 420 px), with some room for elements dragged past the edge. */
const point = z.tuple([z.number().min(-2000).max(3000), z.number().min(-2000).max(3000)]);
const words = z.string().max(80);

export const sketchItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pen'), points: z.array(point).min(1).max(5000) }).strict(),
  z.object({ kind: z.literal('line'), from: point, to: point }).strict(),
  z.object({ kind: z.literal('rect'), from: point, to: point }).strict(),
  z.object({ kind: z.literal('circle'), center: point, radius: z.number().nonnegative().max(3000) }).strict(),
  z.object({ kind: z.literal('arc'), from: point, through: point, to: point }).strict(),
  z.object({ kind: z.literal('dimension'), from: point, to: point, value: words }).strict(),
  z.object({ kind: z.literal('text'), at: point, text: words }).strict(),
]);

const sheet = z.array(sketchItemSchema).max(500);
/** A photo under a sheet (F10): a PNG data URL the renderer made, at most 6 MB of text. */
const background = z
  .string()
  .max(6 * 1024 * 1024)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);

export const sketchStateSchema = z
  .object({
    sheets: z.object({ free: sheet, front: sheet, top: sheet, side: sheet }).strict(),
    scale: z.number().positive().max(1000).nullable(),
    backgrounds: z.object({ free: background, front: background, top: background, side: background }).partial().strict().optional(),
  })
  .strict();

export type SketchItem = z.infer<typeof sketchItemSchema>;
export type SketchState = z.infer<typeof sketchStateSchema>;

/** A sketch kept in the project, newest first in a listing. */
export const keptSketchSchema = z
  .object({
    id: z.string().regex(/^sketch-\d{8}-\d{6}$/),
    savedAt: z.string().max(40),
    elements: z.number().int().nonnegative(),
  })
  .strict();
export type KeptSketch = z.infer<typeof keptSketchSchema>;
