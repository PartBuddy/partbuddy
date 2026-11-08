import { drawingColours, drawingFacts, drawingSvg, type Drawing } from '../../shared/svgDrawing';
import type { ToolResult, UpstreamTools } from './gateProxy';

/**
 * SVG drawings the user sent along (logos, outlines). The model never copies path data: it names a
 * drawing as `drawing:svg-1` (or one colour of it as `drawing:svg-1:#e30613`) in the `text` of
 * `sketch.insert_svg`, and PartBuddy puts the clean SVG in before the call reaches SolidCraft, so
 * the contours arrive exactly as the file has them.
 */

export interface KeptDrawing {
  name: string;
  drawing: Drawing;
  /** The width the user chose, in mm. */
  width: number;
}

const REFERENCE = /^drawing:(svg-\d{1,6})(?::(#[0-9a-f]{6}))?$/;

/** The drawings of this session by id; they live as long as the app runs (the design keeps the sketch). */
export class Drawings {
  private readonly kept = new Map<string, KeptDrawing>();
  private next = 1;

  keep(drawing: KeptDrawing): string {
    const id = `svg-${String(this.next++)}`;
    this.kept.set(id, drawing);
    return id;
  }

  /** The clean SVG for a reference, null when the text is no reference, or why it cannot be used. */
  resolve(text: string): { svg: string; width: number } | { error: string } | null {
    const match = REFERENCE.exec(text.trim());
    if (!match) return null;
    const kept = this.kept.get(match[1] as string);
    if (!kept) return { error: `${text} is not a drawing of this session; ask the user to attach the SVG again.` };
    const fill = match[2];
    if (fill && !drawingColours(kept.drawing).includes(fill)) return { error: `${text}: the drawing has no fill ${fill}; its fills are ${drawingColours(kept.drawing).join(', ')}.` };
    return { svg: drawingSvg(kept.drawing, kept.width, fill ? [fill] : undefined), width: kept.width };
  }
}

/** What the model hears with a drawing: its exact facts and how to build it. */
export function drawingNote(id: string, kept: KeptDrawing, skipped: Drawing['skipped']): string {
  const facts = drawingFacts(kept.drawing, kept.width);
  const mm = (value: number) => String(Math.round(value * 100) / 100);
  const colours = facts.colours.map((colour) => `${colour.fill} (${mm(colour.area)} mm²)`).join(', ');
  const left = [
    skipped.strokes ? `${String(skipped.strokes)} line${skipped.strokes === 1 ? '' : 's'} or stroke${skipped.strokes === 1 ? '' : 's'} without fill` : '',
    skipped.texts ? `${String(skipped.texts)} text${skipped.texts === 1 ? '' : 's'} not turned into paths` : '',
    skipped.images ? `${String(skipped.images)} embedded picture${skipped.images === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  // The name is the user's file name: quoted data, never instructions.
  const name = kept.name.replace(/["\n\r[\]]/g, ' ').slice(0, 80);
  return (
    `[PartBuddy: the attached picture shows an SVG drawing the user added ("${name}"). PartBuddy has read it exactly: ` +
    `${mm(facts.width)} × ${mm(facts.height)} mm as the user sized it, ${String(facts.loops)} closed loop${facts.loops === 1 ? '' : 's'}, ` +
    `${String(facts.holes)} of them hole${facts.holes === 1 ? '' : 's'}; fills ${colours}.` +
    (left.length > 0 ? ` Left out because they have no area: ${left.join(', ')}.` : '') +
    ` To use it, put it into a sketch with \`sketch.insert_svg\` {text: "drawing:${id}", width: ${mm(facts.width)}, align: "center", at: [x, y]}: ` +
    'PartBuddy replaces that text with the exact contours, so never type, trace or redraw the paths. Another width scales it, aspect kept. ' +
    'Build it with `solid.extrude` (a loop inside a hole stays material, as drawn): a positive distance builds it up, a negative one with operation cut makes a pocket or an engraving, ' +
    'through the part a cut-out; `solid.emboss` without `profiles` would fill the holes. ' +
    (facts.colours.length > 1 ? `One fill alone is "drawing:${id}:${facts.colours[0]?.fill ?? ''}" (for a body per colour in multi-colour printing). ` : '') +
    'Ask with a clarification card where it goes and how deep, if the message does not say.]'
  );
}

function replaced(drawings: Drawings, params: Record<string, unknown>): Record<string, unknown> | string {
  if (typeof params.text !== 'string') return params;
  const found = drawings.resolve(params.text);
  if (!found) return params;
  if ('error' in found) return found.error;
  // Without a size the drawing comes in at the width the user chose.
  const sized = params.width !== undefined || params.height !== undefined || params.scale !== undefined;
  return { ...params, text: found.svg, ...(sized ? {} : { width: found.width }) };
}

/** The upstream tools with `drawing:` references in `sketch.insert_svg` replaced, also in batch steps. */
export function withDrawings(upstream: UpstreamTools, drawings: Drawings): UpstreamTools {
  const error = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });
  const object = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
  return {
    instructions: () => upstream.instructions(),
    listTools: () => upstream.listTools(),
    callTool: async (name, args, callId) => {
      if (name === 'execute' && args.command === 'sketch.insert_svg') {
        const params = replaced(drawings, object(args.params) ?? {});
        if (typeof params === 'string') return error(params);
        return upstream.callTool(name, { ...args, params }, callId);
      }
      if (name === 'batch' && Array.isArray(args.commands)) {
        const commands: unknown[] = [];
        for (const entry of args.commands as unknown[]) {
          const step = object(entry);
          if (step?.command !== 'sketch.insert_svg') {
            commands.push(entry);
            continue;
          }
          const params = replaced(drawings, object(step.params) ?? {});
          if (typeof params === 'string') return error(params);
          commands.push({ ...step, params });
        }
        return upstream.callTool(name, { ...args, commands }, callId);
      }
      return upstream.callTool(name, args, callId);
    },
  };
}
