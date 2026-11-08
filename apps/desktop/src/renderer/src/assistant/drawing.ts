import { drawingSize, loopsPathData, naturalWidth, parseDrawing, SVG_MAX_BYTES, type Drawing, type DrawingProblem } from '../../../shared/svgDrawing';
import { PHOTO_EDGE } from './photo';

/** An SVG drawing for the next message: the file's text goes to the main process, which reads it again. */
export interface OutgoingDrawing {
  name: string;
  svg: string;
  drawing: Drawing;
  /** The width the user wants, in mm; the height follows. */
  width: number;
  png: Uint8Array;
  thumbnail: string;
}

/** Without a size in the file, a drawing starts this wide: a logo on a lid or a name plate. */
export const DRAWING_WIDTH = 40;

/** Whether a file is an SVG drawing rather than a photo. */
export const isSvg = (file: File) => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

/** Pasted text that is SVG markup (Inkscape, Figma and Illustrator copy it that way). */
export const isSvgText = (text: string) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);

/** The drawing's shapes in their colours on a light ground, `edge` px on the long side. */
function render(drawing: Drawing, edge: number): HTMLCanvasElement {
  const size = drawingSize(drawing);
  const scale = edge / Math.max(size.width, size.height, 1e-9);
  const canvas = document.createElement('canvas');
  // A margin of 4 % so outlines at the edge stay visible.
  const pad = Math.round(edge * 0.04);
  canvas.width = Math.max(1, Math.round(size.width * scale)) + 2 * pad;
  canvas.height = Math.max(1, Math.round(size.height * scale)) + 2 * pad;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D canvas');
  // Light grey, so white parts of a logo still show.
  // eslint-disable-next-line no-restricted-syntax -- the assistant's picture keeps one ground in light and dark
  context.fillStyle = '#e9ebee';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(pad, pad);
  for (const shape of drawing.shapes) {
    context.fillStyle = shape.fill;
    context.fill(new Path2D(loopsPathData(drawing, shape.loops, scale)), 'evenodd');
  }
  return canvas;
}

/** Reads an SVG text into a drawing for the composer, or says why it cannot be one. */
export async function drawingFrom(name: string, svg: string): Promise<OutgoingDrawing | { problem: DrawingProblem }> {
  const result = parseDrawing(svg);
  if (!result.ok) return { problem: result.problem };
  const picture = render(result.drawing, PHOTO_EDGE);
  const blob = await new Promise<Blob | null>((done) => {
    picture.toBlob(done, 'image/png');
  });
  if (!blob) throw new Error('the drawing could not be drawn');
  return {
    name: name.replace(/\.svg$/i, '').slice(0, 200) || 'drawing',
    svg,
    drawing: result.drawing,
    width: naturalWidth(result.drawing) ?? DRAWING_WIDTH,
    png: new Uint8Array(await blob.arrayBuffer()),
    thumbnail: render(result.drawing, 160).toDataURL('image/png'),
  };
}

/** An SVG file for the composer; files over the limit are not read at all. */
export async function drawingFile(file: File): Promise<OutgoingDrawing | { problem: DrawingProblem | 'unreadable' }> {
  if (file.size > SVG_MAX_BYTES) return { problem: 'tooBig' };
  try {
    return await drawingFrom(file.name, await file.text());
  } catch {
    return { problem: 'unreadable' };
  }
}
