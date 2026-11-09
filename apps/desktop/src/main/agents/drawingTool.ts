import { drawingColours, drawingFacts, drawingSvg, type Drawing } from '../../shared/svgDrawing';
import { uniqueLogoName } from '../../shared/drawingPlacement';
import { colourLayers, splitPieceSteps, stepsOf, type FeatureBlock } from '../../shared/blocks';
import { planLogoMove, type Run } from '../solidcraft/logoMove';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

export const MOVE_DRAWING_TOOL = 'partbuddy_move_drawing';
export const PLACE_DRAWING_TOOL = 'partbuddy_place_drawing';

const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const placeTool: UpstreamTool = {
  name: PLACE_DRAWING_TOOL,
  description:
    'Put an attached SVG drawing on a face as a logo: engraved (deboss) or built up (emboss), optionally a body per colour for multi-colour printing, ' +
    'and centred on the face. PartBuddy builds it like its logo block, in one step; the sketch is named "Logo <file name>".',
  inputSchema: {
    type: 'object',
    properties: {
      drawing: { type: 'string', description: 'The drawing id, e.g. "svg-1".' },
      body: { type: 'string', description: 'The body it goes on (or into).' },
      point: { ...vector, description: "A point on the face in mm: the logo's middle." },
      normal: { ...vector, description: 'The outward normal of the face there.' },
      mode: { type: 'string', enum: ['deboss', 'emboss'], description: 'deboss: into the face (in colours: an inlay flush with the face); emboss: standing on it.' },
      depth: { type: 'number', exclusiveMinimum: 0, maximum: 50, description: 'How deep or high, in mm.' },
      width: { type: 'number', exclusiveMinimum: 0, maximum: 1000, description: 'Width in mm, aspect kept; default the width the user chose.' },
      colours: { type: 'boolean', description: 'A body per colour, each coloured like its fill (only for a drawing with several fills).' },
      centre: { type: 'string', enum: ['x', 'y', 'both'], description: 'Then centre it on the face along its x, y or both.' },
    },
    required: ['drawing', 'body', 'point', 'normal', 'mode', 'depth'],
    additionalProperties: false,
  },
};

const moveTool: UpstreamTool = {
  name: MOVE_DRAWING_TOOL,
  description:
    'Move a placed logo (a drawing in sketches named "Logo <name>") exactly on its face, centre it on the face, turn it or resize it. ' +
    'Pocket, cut and colour bodies follow in one step. `width` comes first (about its middle), then `centre`, `by` and `rotate`.',
  inputSchema: {
    type: 'object',
    properties: {
      logo: { type: 'string', description: 'The sketch name, e.g. "Logo Badge".' },
      by: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: "mm along the logo's own x (its width, left to right as it reads) and y (up)." },
      centre: { type: 'string', enum: ['x', 'y', 'both'], description: "Onto the middle of the face it sits on: along the logo's x, its y, or both." },
      rotate: { type: 'number', minimum: -360, maximum: 360, description: 'Degrees to turn it counter-clockwise, looking at the face, about its middle (90 turns it a quarter left).' },
      width: { type: 'number', exclusiveMinimum: 0, maximum: 1000, description: 'Its new width in mm (along its own x), aspect kept, about its middle.' },
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

  get(id: string): KeptDrawing | undefined {
    return this.kept.get(id);
  }

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
    ` As a logo on a face (engraved, built up, in colours, centred), place it with \`${PLACE_DRAWING_TOOL}\` {drawing: "${id}", body, point, normal, mode, depth` +
    (facts.colours.length > 1 ? ', colours: true for a body per fill' : '') +
    `, centre}: PartBuddy builds it exactly; \`${MOVE_DRAWING_TOOL}\` moves it afterwards. ` +
    `Only for other uses (an outline to extrude, a cut-out through the part) put it into a sketch with \`sketch.insert_svg\` {text: "drawing:${id}", width: ${mm(facts.width)}, align: "center", at: [x, y]}: ` +
    'PartBuddy replaces that text with the exact contours, so never type, trace or redraw the paths. Build that with `solid.extrude` (a loop inside a hole stays material, as drawn); ' +
    '`solid.emboss` without `profiles` would fill the holes. ' +
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
  const rotate = typeof args.rotate === 'number' && Number.isFinite(args.rotate) && Math.abs(args.rotate) <= 360 ? args.rotate : null;
  if (args.rotate !== undefined && rotate === null) throw new Error('rotate must be degrees between -360 and 360');
  const width = typeof args.width === 'number' && args.width > 0 && args.width <= 1000 ? args.width : null;
  if (args.width !== undefined && width === null) throw new Error('width must be 0–1000 mm');
  if (!by && !centre && !rotate && !width) throw new Error('say how far (by), centre, rotate or width');
  const run: Run = async (commands) => {
    const reply = jsonOf(await upstream.callTool('batch', { commands }, callId)) as { results?: unknown[]; failed?: { error?: unknown } };
    if (reply.failed) throw new Error(`SolidCraft refused it: ${String(reply.failed.error)}`);
    return reply.results ?? [];
  };
  const move = await planLogoMove(run, name, { by, centre, rotate, width });
  await run(move.steps);
  const [du, dv] = move.by;
  const face = move.face ? ` on face ${move.face}` : '';
  const mm = (value: number) => String(Math.round(value * 100) / 100);
  const turned = (width ? `, now ${mm(width)} mm wide` : '') + (rotate ? `, turned by ${mm(rotate)}° (now ${mm(move.angle)}° from level)` : '');
  return `Moved ${move.name} by ${mm(du)} mm along its x and ${mm(dv)} mm along its y${face}${turned}; its middle is now at [${move.origin.map(mm).join(', ')}] mm.`;
}

const vec3 = (value: unknown): [number, number, number] | null =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as [number, number, number]) : null;

/** `partbuddy_place_drawing`: the logo block's steps for a drawing of this session, then centring. */
async function placeDrawing(upstream: UpstreamTools, drawings: Drawings, args: Record<string, unknown>, callId: string | undefined): Promise<string> {
  const id = typeof args.drawing === 'string' ? args.drawing.trim().replace(/^drawing:/, '') : '';
  const kept = drawings.get(id);
  if (!kept) throw new Error(`"${id}" is not a drawing of this session; ask the user to attach the SVG again`);
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  const normal = vec3(args.normal);
  const mode = args.mode === 'emboss' || args.mode === 'deboss' ? args.mode : null;
  const depth = typeof args.depth === 'number' && args.depth > 0 && args.depth <= 50 ? args.depth : null;
  const width = args.width === undefined ? kept.width : typeof args.width === 'number' && args.width > 0 && args.width <= 1000 ? args.width : null;
  const centre = args.centre === 'x' || args.centre === 'y' || args.centre === 'both' ? args.centre : null;
  if (!body || !point || !normal || Math.hypot(...normal) < 1e-9) throw new Error('body, point and normal (not zero) are needed');
  if (!mode || !depth || !width) throw new Error('mode must be deboss or emboss, depth 0–50 mm, width 0–1000 mm');
  if (args.centre !== undefined && !centre) throw new Error('centre must be x, y or both');
  const block: Extract<FeatureBlock, { block: 'logo' }> = { block: 'logo', body, point, normal, size: 'M3', name: kept.name, svg: drawingSvg(kept.drawing, width), width, depth, mode, colours: args.colours === true };
  const sketches = (jsonOf(await upstream.callTool('inspect_design', {}, callId)) as { sketches?: { name?: unknown }[] }).sketches ?? [];
  const sketch = uniqueLogoName(kept.name, sketches.flatMap((entry) => (typeof entry.name === 'string' ? [entry.name] : [])));
  const reply = jsonOf(await upstream.callTool('batch', { commands: stepsOf(block, sketch) }, callId)) as { failed?: { error?: unknown } };
  if (reply.failed) throw new Error(`SolidCraft refused it: ${String(reply.failed.error)}`);
  const layers = colourLayers(block);
  if (layers.length > 0) {
    // Pieces a cut split off keep their colour, as with the logo block.
    const recolour = splitPieceSteps(layers, jsonOf(await upstream.callTool('inspect_design', {}, callId)));
    if (recolour.length > 0) jsonOf(await upstream.callTool('batch', { commands: recolour }, callId));
  }
  const how = `${mode === 'deboss' ? (layers.length > 0 ? 'inlaid' : 'engraved') : 'built up'} ${String(depth)} mm, ${String(width)} mm wide` + (layers.length > 0 ? `, ${String(layers.length)} colour bodies` : '');
  const placed = `Placed "${sketch}" on ${body} (${how}).`;
  return centre ? `${placed} ${await moveDrawing(upstream, { logo: sketch, centre }, callId)}` : placed;
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
    listTools: async () => [...(await upstream.listTools()), placeTool, moveTool],
    callTool: async (name, args, callId) => {
      if (name === PLACE_DRAWING_TOOL) {
        try {
          return { content: [{ type: 'text', text: await placeDrawing(upstream, drawings, args, callId) }] };
        } catch (cause) {
          return error(`Not placed: ${(cause as Error).message}`);
        }
      }
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
