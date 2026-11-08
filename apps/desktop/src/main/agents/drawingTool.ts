import { drawingColours, drawingFacts, drawingSvg, type Drawing } from '../../shared/svgDrawing';
import { centring, hostFace, LOGO_PREFIX, movedPlane, placedLogos, type BodyFaces } from '../../shared/drawingPlacement';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

export const MOVE_DRAWING_TOOL = 'partbuddy_move_drawing';

const moveTool: UpstreamTool = {
  name: MOVE_DRAWING_TOOL,
  description:
    'Move a placed logo (a drawing in sketches named "Logo <name>") exactly on its face, or centre it on the face. ' +
    'Pocket, cut and colour bodies follow in one step. `centre` comes first, then `by`.',
  inputSchema: {
    type: 'object',
    properties: {
      logo: { type: 'string', description: 'The sketch name, e.g. "Logo Badge".' },
      by: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: "mm along the logo's own x (its width, left to right as it reads) and y (up)." },
      centre: { type: 'string', enum: ['x', 'y', 'both'], description: "Onto the middle of the face it sits on: along the logo's x, its y, or both." },
    },
    required: ['logo'],
    additionalProperties: false,
  },
};

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
    `Name the sketch "${LOGO_PREFIX}<short name>" (\`sketch.create\` name, one no other sketch has) and insert the drawing with its middle at the sketch origin (at: [0, 0]); ` +
    'then `partbuddy_move_drawing` moves it exactly or centres it on its face. ' +
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

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (result.isError || typeof text !== 'string') throw new Error(typeof text === 'string' ? text.slice(0, 300) : 'SolidCraft gave no answer');
  return JSON.parse(text) as unknown;
}

/** `partbuddy_move_drawing`: every sketch of the logo gets the moved plane through `sketch.redefine`. */
async function moveDrawing(upstream: UpstreamTools, args: Record<string, unknown>, callId: string | undefined): Promise<string> {
  const name = typeof args.logo === 'string' ? args.logo.trim() : '';
  const by = Array.isArray(args.by) && args.by.length === 2 && args.by.every((value) => typeof value === 'number' && Number.isFinite(value)) ? (args.by as [number, number]) : null;
  const centre = args.centre === 'x' || args.centre === 'y' || args.centre === 'both' ? (args.centre) : null;
  if (args.by !== undefined && !by) throw new Error('by must be two numbers in mm');
  if (!by && !centre) throw new Error('say how far (by) or centre');
  const inspect = jsonOf(await upstream.callTool('inspect_design', {}, callId));
  const logos = placedLogos(inspect);
  const sketches = logos.get(name) ?? logos.get(`${LOGO_PREFIX}${name}`);
  const first = sketches?.[0];
  if (!sketches || !first) throw new Error(`there is no logo "${name}"; placed logos: ${[...logos.keys()].join(', ') || 'none'}`);
  let [du, dv] = [0, 0];
  let face = '';
  if (centre) {
    const origin = first.plane.origin;
    type Body = { name?: unknown; bbox?: { min?: number[]; max?: number[] } };
    const around = (body: Body) => origin.every((value, i) => value >= (body.bbox?.min?.[i] ?? Infinity) - 1e-3 && value <= (body.bbox?.max?.[i] ?? -Infinity) + 1e-3);
    const read: BodyFaces[] = [];
    for (const body of ((inspect as { bodies?: Body[] }).bodies ?? []).filter(around)) {
      if (typeof body.name !== 'string') continue;
      const commands = [
        { command: 'model.faces', params: { body: body.name } },
        { command: 'model.edges', params: { body: body.name } },
      ];
      const reply = jsonOf(await upstream.callTool('batch', { commands }, callId)) as { results?: unknown[] };
      read.push({ body: body.name, faces: reply.results?.[0], edges: reply.results?.[1] });
    }
    const host = hostFace(first.plane, read);
    if (!host) throw new Error(`no flat face under the middle of ${first.name} to centre it on`);
    [du, dv] = centring(host.extent, centre);
    face = ` on face ${host.face} of ${host.body}`;
  }
  du += by?.[0] ?? 0;
  dv += by?.[1] ?? 0;
  const commands = sketches.map((sketch) => ({ command: 'sketch.redefine', params: { sketch: sketch.id, plane: movedPlane(sketch.plane, du, dv) } }));
  jsonOf(await upstream.callTool('batch', { commands }, callId));
  const mm = (value: number) => String(Math.round(value * 100) / 100);
  return `Moved ${first.name} by ${mm(du)} mm along its x and ${mm(dv)} mm along its y${face}; its middle is now at [${movedPlane(first.plane, du, dv).origin.map(mm).join(', ')}] mm.`;
}

/**
 * The upstream tools with `drawing:` references in `sketch.insert_svg` replaced, also in batch
 * steps, plus `partbuddy_move_drawing`.
 */
export function withDrawings(upstream: UpstreamTools, drawings: Drawings): UpstreamTools {
  const error = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });
  const object = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), moveTool],
    callTool: async (name, args, callId) => {
      if (name === MOVE_DRAWING_TOOL) {
        try {
          return { content: [{ type: 'text', text: await moveDrawing(upstream, args, callId) }] };
        } catch (cause) {
          return error(`Not moved: ${(cause as Error).message}`);
        }
      }
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
