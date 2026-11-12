import { BLOCK_SIZES, defaultBlock, needsNormal, sizesOf, stepsOf, type BlockSize, type FeatureBlock } from '../../shared/blocks';
import { featureBlockSchema } from '../../shared/contract';
import { KNOB, KNOB_CLEARANCE, KNOB_SHAFTS, knobFlat, knobFlutes, knobInsert, knobProblem, knobSteps, type KnobShaft } from '../../shared/knob';
import { MAGNET, MAGNET_HOLDS, magnetPocket, magnetProblem, magnetSteps, type MagnetHold } from '../../shared/magnet';
import { KEYHOLE, WALL, WOOD_SCREWS, keyholeDepth, keyholeProblem, keyholeSteps, woodScrewSteps, type WoodScrew } from '../../shared/wallMount';
import { componentOf } from '../solidcraft/actions';
import { count } from '../solidcraft/mirror';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * `partbuddy_block` (plan step F1, standards of 2026-11-11): the function blocks of the interface
 * for the assistant. It names the block, the body, a point on a flat face and the screw; the sizes
 * come from the same standard tables the user's form starts from (ISO 273 clearance, ISO 4762 and
 * ISO 10642 heads, ISO 4032 nuts, common heat-set inserts), not from the model's memory.
 */

export const BLOCK_TOOL = 'partbuddy_block';

/** The blocks the assistant can ask for; a logo goes through its own tool, with the drawing. */
export const ASSISTANT_BLOCKS = ['screwHole', 'tappedHole', 'insertSeat', 'nutTrap', 'boss', 'slot', 'text', 'lip', 'snapFit'] as const;
type AssistantBlock = (typeof ASSISTANT_BLOCKS)[number];
/** Wall mounting (wallMount.ts): not blocks of the interface yet. */
export const WALL_BLOCKS = ['keyhole', 'woodScrew', 'magnet'] as const;
/** A part of its own (knob.ts): body is the name of the new body. */
export const PART_BLOCKS = ['knob'] as const;

const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const blockTool: UpstreamTool = {
  name: BLOCK_TOOL,
  description:
    'Build a function block on one body at a point of a flat face, sized from the standard tables: ' +
    'screwHole (clearance hole for a screw, with a counterbore for a socket head, a countersink, or plain), tappedHole (a modelled thread, from M5 in print), ' +
    'insertSeat (the seat of a heat-set insert, M2 to M6), nutTrap (a hexagonal pocket with its clearance hole), boss (a screw boss with an insert seat, standing on the face), ' +
    'slot (a slot for a screw, to adjust), text (embossed or engraved), lip (a lip or a groove on the rim of a shelled body), snapFit (a cantilever snap hook standing on the face). ' +
    'To hang a part on a wall: keyhole (a keyhole slot on the face against the wall, over a screw already in the wall; point is where the screw rests, normal points to the wall, up is the way up as the part hangs) ' +
    'or woodScrew (a countersunk hole for a wood screw, at a point of the face away from the wall); screw is the wood screw in mm. ' +
    'To hold with magnets: magnet (a pocket for a disc magnet at a point of a face, normal out of that face; diameter and height are the magnet\'s, default 6 × 2 mm; hold glue to drop it in on a drop of glue, press to press it in). ' +
    "A knob for a shaft is a part of its own: knob (body is the new body's name, point the centre of its underside where the shaft goes in, normal the way the shaft points, up the way its pointer points; shaft d for a potentiometer's or encoder's D shaft, knurl for a split knurled one, round for a plain shaft with a set screw). " +
    'Give only what differs from the standard; everything else is filled in. For two parts screwed together use partbuddy_mechanism with kind screw instead, which makes both holes on one line.',
  inputSchema: {
    type: 'object',
    properties: {
      block: { type: 'string', enum: [...ASSISTANT_BLOCKS, ...WALL_BLOCKS, ...PART_BLOCKS] },
      body: { type: 'string', description: 'The body (exact name); for knob the name of the new body.' },
      point: { ...vector, description: 'A point on the flat face the block goes at, in mm: the centre of the hole, the foot of the boss, the middle of the text.' },
      normal: { ...vector, description: 'The way out of that face; needed for nutTrap, slot, text, snapFit, keyhole and magnet. knob: the way the shaft points, default +Z.' },
      up: { ...vector, description: 'keyhole: the way up as the part hangs, along the face; default +Z. knob: the way its pointer points, across the shaft; default +Y.' },
      screw: { type: 'number', enum: [...WOOD_SCREWS], description: 'keyhole, woodScrew: the wood screw, its thread diameter in mm; default 4.' },
      size: { type: 'string', enum: [...BLOCK_SIZES], description: 'The screw; default M3. Ignored for text, lip and snapFit.' },
      more: { type: 'array', items: vector, maxItems: 99, description: 'screwHole, tappedHole, insertSeat, keyhole, woodScrew, magnet: further points on the same face, one each.' },
      head: { type: 'string', enum: ['none', 'cap', 'countersunk'], description: 'screwHole: the room for the head; default cap (a counterbore).' },
      fit: { type: 'string', enum: ['close', 'normal', 'loose'], description: 'screwHole: the clearance by ISO 273; default normal.' },
      depth: { type: 'number', description: 'tappedHole, insertSeat, nutTrap, slot, text: depth in mm; default by the block (a slot and a tapped hole go through).' },
      diameter: { type: 'number', description: 'insertSeat: the hole for the insert; boss: its outer diameter; knob: its outer diameter, default 25; magnet: the diameter of the magnet, default 6. Default from the table.' },
      height: { type: 'number', description: 'boss: its height; text: the height of its capitals; lip: its height; knob: its height, default 16; magnet: the height of the magnet, default 2. Default by the block.' },
      length: { type: 'number', description: 'slot: its length; snapFit: the length of the arm. Default 10 and 12 mm.' },
      width: { type: 'number', description: 'slot, lip, snapFit: width in mm. Default by the block.' },
      along: { type: 'string', enum: ['x', 'y'], description: "slot: along the face's first or second direction." },
      text: { type: 'string', maxLength: 80, description: 'text: the words.' },
      mode: { type: 'string', enum: ['emboss', 'deboss'], description: 'text: raised or engraved; default engraved.' },
      type: { type: 'string', enum: ['lip', 'groove'], description: 'lip: a lip, or the groove that takes one.' },
      hold: { type: 'string', enum: [...MAGNET_HOLDS], description: 'magnet: glued in (0.3 mm of room, the default) or pressed in (0.1 mm).' },
      shaft: { type: 'string', enum: [...KNOB_SHAFTS], description: 'knob: the shaft it goes on; default d.' },
      shaftDiameter: { type: 'number', description: 'knob: the diameter of the shaft in mm; default 6.' },
      flat: { type: 'number', description: 'knob on a D shaft: the thickness of the shaft at its flat in mm; 4.5 on a 6 mm shaft, to be measured on any other.' },
      clearance: { type: 'number', description: "knob: added to the shaft's diameter in mm; default 0.2 (0 for knurl). More when the printed knob sits too tight." },
      hook: { type: 'string', enum: ['x+', 'x-', 'y+', 'y-'], description: "snapFit: the way the catch points, along the face's directions." },
    },
    required: ['block', 'body', 'point'],
    additionalProperties: false,
  },
};

type Vec3 = [number, number, number];
const vec3 = (value: unknown): Vec3 | null =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as Vec3) : null;

/** The block the model asked for: the standard of its kind and size with what the model gave laid over it; or what is wrong. */
export function blockOf(args: Record<string, unknown>): FeatureBlock | string {
  const kind = args.block;
  if (typeof kind !== 'string' || !(ASSISTANT_BLOCKS as readonly string[]).includes(kind)) return `block must be one of ${ASSISTANT_BLOCKS.join(', ')}`;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const normal = args.normal === undefined ? null : vec3(args.normal);
  if (needsNormal(kind as AssistantBlock) && !normal) return `${kind} needs normal: the way out of the face, three numbers`;
  const size = (args.size ?? 'M3') as BlockSize;
  const head = args.head === 'countersunk' || args.head === 'none' ? args.head : 'cap';
  const sizes = sizesOf(kind as AssistantBlock, head);
  if (!sizes.includes(size)) return `${kind}${kind === 'screwHole' ? ` with head ${head}` : ''} has no size ${String(args.size)}; it has ${sizes.join(', ')}`;
  const standard = defaultBlock(kind as AssistantBlock, body, point, size, normal ?? [0, 0, 1]);
  // Only the fields this kind has are taken from the model; the schema then checks their values.
  const given = Object.fromEntries(Object.keys(standard).flatMap((key) => (key in args && !['block', 'body', 'point', 'normal', 'size'].includes(key) ? [[key, args[key]]] : [])));
  const more = args.more !== undefined && 'more' in { more: undefined, ...standard } && ['screwHole', 'tappedHole', 'insertSeat'].includes(kind) ? { more: args.more } : {};
  const parsed = featureBlockSchema.safeParse({ ...standard, ...given, ...more });
  if (!parsed.success) return `${parsed.error.issues[0]?.path.join('.') ?? kind}: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
  return parsed.data;
}

type Step = { command: string; params: Record<string, unknown> };

/** A wall mounting the model asked for: its steps and what to say; null when the block is none of them; or what is wrong. */
export function wallOf(args: Record<string, unknown>): { body: string; steps: Step[]; text: string } | string | null {
  if (args.block !== 'keyhole' && args.block !== 'woodScrew') return null;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const screw = (args.screw ?? 4) as WoodScrew;
  if (!(WOOD_SCREWS as readonly number[]).includes(screw)) return `screw must be one of ${WOOD_SCREWS.join(', ')} (mm, a wood screw)`;
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((entry) => entry === null)) return 'more must be a list of points, each three numbers';
  const count = more.length + 1;
  const size = WALL[screw];
  if (args.block === 'woodScrew') {
    return {
      body,
      steps: woodScrewSteps({ body, point, more: more as Vec3[], screw, name: 'Wall screw' }),
      text: `Built ${String(count)} countersunk hole${count > 1 ? 's' : ''} for ${String(screw)} mm wood screws in ${body}: ${String(size.clearance)} mm through, countersink ${String(size.countersink)} mm at 90°, so the head lies flush. Keep at least ${String(screw)} mm of plastic between a hole and an edge, and the plate thicker than the countersink is deep (${String(Math.round(((size.countersink - size.clearance) / 2) * 10) / 10)} mm).`,
    };
  }
  const normal = vec3(args.normal);
  if (!normal) return 'keyhole needs normal: the way out of the face against the wall, three numbers';
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec = { body, point, normal, up, screw, more: more as Vec3[], name: 'Keyhole' };
  const problem = keyholeProblem(spec);
  if (problem) return problem;
  return {
    body,
    steps: keyholeSteps(spec),
    text:
      `Built ${String(count)} keyhole slot${count > 1 ? 's' : ''} for ${String(screw)} mm wood screws in ${body}: entry ${String(size.entry)} mm for the head, a slot ${String(size.slot)} mm wide running ${String(KEYHOLE.travel)} mm up to where the screw rests, ` +
      `and behind its ${String(KEYHOLE.lip)} mm lip a pocket ${String(size.pocket)} mm deep for the head. The part must be at least ${String(keyholeDepth(screw))} mm thick there. ` +
      `It prints without support with that face on the bed (the pocket's roof is a bridge of ${String(size.entry)} mm); the screw in the wall stands out ${String(Math.round((KEYHOLE.lip + size.pocket / 2) * 10) / 10)} mm.`,
  };
}

/** Magnet pockets the model asked for: their steps and what to say; null when the block is none; or what is wrong. */
export function magnetOf(args: Record<string, unknown>): { body: string; steps: Step[]; text: string } | string | null {
  if (args.block !== 'magnet') return null;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const normal = vec3(args.normal);
  if (!normal) return 'magnet needs normal: the way out of the face the pocket opens in, three numbers';
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((entry) => entry === null)) return 'more must be a list of points, each three numbers';
  const hold = (args.hold ?? 'glue') as MagnetHold;
  if (!MAGNET_HOLDS.includes(hold)) return `hold must be one of ${MAGNET_HOLDS.join(', ')}`;
  const number = (value: unknown, standard: number) => (value === undefined ? standard : typeof value === 'number' ? value : Number.NaN);
  const spec = { body, point, normal, more: more as Vec3[], diameter: number(args.diameter, 6), height: number(args.height, 2), hold, name: 'Magnet' };
  const problem = magnetProblem(spec);
  if (problem) return problem;
  const pocket = magnetPocket(spec);
  const count = more.length + 1;
  return {
    body,
    steps: magnetSteps(spec),
    text:
      `Built ${String(count)} pocket${count > 1 ? 's' : ''} for ${String(spec.diameter)} × ${String(spec.height)} mm disc magnets in ${body}: ${String(pocket.diameter)} mm wide and ${String(pocket.depth)} mm deep, so the magnet lies ${String(MAGNET.sunk)} mm under the face, with a chamfered mouth. ` +
      (hold === 'glue' ? 'The magnet drops in and is held by a drop of superglue. ' : `The magnet is pressed in (${String(MAGNET.room.press)} mm of room on the diameter); with more than that missing the plastic splits along its layers, so try one pocket first. `) +
      `Keep at least 1.2 mm of plastic round a pocket and 0.6 mm under it. Mark the poles before gluing a pair: the two parts must attract. Neodymium magnets lose strength above 80 °C. No pocket of these sizes has been printed yet.`,
  };
}

/** A knob the model asked for: its steps and what to say; null when the block is none; or what is wrong. */
export function knobOf(args: Record<string, unknown>): { body: string; steps: Step[]; text: string; fresh: true } | string | null {
  if (args.block !== 'knob') return null;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body (the name of the new knob) and point (three numbers, the centre of its underside) are needed';
  const axis = args.normal === undefined ? ([0, 0, 1] as Vec3) : vec3(args.normal);
  if (!axis) return 'normal must be three numbers';
  // The pointer's usual way, or another when the shaft itself points that way.
  const usual: Vec3 = Math.abs(axis[0]) < 1e-9 && Math.abs(axis[2]) < 1e-9 ? [0, 0, 1] : [0, 1, 0];
  const toward = args.up === undefined ? usual : vec3(args.up);
  if (!toward) return 'up must be three numbers';
  const shaft = (args.shaft ?? 'd') as KnobShaft;
  if (!KNOB_SHAFTS.includes(shaft)) return `shaft must be one of ${KNOB_SHAFTS.join(', ')}`;
  const number = (value: unknown, standard: number) => (value === undefined ? standard : typeof value === 'number' ? value : Number.NaN);
  const shaftDiameter = number(args.shaftDiameter, 6);
  const flat = number(args.flat, knobFlat(shaftDiameter) ?? Number.NaN);
  if (shaft === 'd' && args.flat === undefined && Number.isNaN(flat)) return `a D shaft of ${String(shaftDiameter)} mm has no one flat: give flat, the shaft's thickness there, as measured`;
  const spec = { body, point, axis, toward, shaft, shaftDiameter, flat, diameter: number(args.diameter, 25), height: number(args.height, 16), clearance: number(args.clearance, KNOB_CLEARANCE[shaft]) };
  const problem = knobProblem(spec);
  if (problem) return problem;
  const bore = Math.round((shaftDiameter + spec.clearance) * 100) / 100;
  const insert = knobInsert(spec);
  const hold =
    shaft === 'd'
      ? `for a ${String(shaftDiameter)} mm D shaft (flat at ${String(flat)} mm): the bore is ${String(bore)} mm wide and ${String(insert)} mm deep, flat over its last ${String(Math.min(KNOB.flat, insert))} mm on the side away from the pointer, with a chamfered mouth, to push on`
      : shaft === 'knurl'
        ? `for a split knurled shaft of ${String(shaftDiameter)} mm: a plain bore ${String(bore)} mm wide and ${String(insert)} mm deep, which the shaft springs into`
        : `for a round ${String(shaftDiameter)} mm shaft: the bore is ${String(bore)} mm wide and ${String(insert)} mm deep, and an M3 set screw cuts its own thread in the ${String(KNOB.setScrew)} mm hole on the side away from the pointer`;
  return {
    body,
    fresh: true,
    steps: knobSteps(spec),
    text:
      `Built the knob "${body}" ${hold}. It is ${String(spec.diameter)} mm wide and ${String(spec.height)} mm high, with ${String(knobFlutes(spec.diameter))} flutes to grip and a groove on its top as the pointer. ` +
      `It prints standing on its top, the bore open upwards, without support (its print face is set). No knob of these sizes has been printed yet: when it sits too tight or too loose, build it again with another clearance.`,
  };
}

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('SolidCraft gave no answer');
  if (!result.isError) return JSON.parse(text) as unknown;
  // A batch that is taken back answers its failure as an error: say which command, not the whole reply.
  let failed: { command?: unknown; error?: unknown } | undefined;
  try {
    failed = (JSON.parse(text) as { failed?: { command?: unknown; error?: unknown } }).failed;
  } catch {
    failed = undefined;
  }
  throw new Error(failed ? `SolidCraft refused ${String(failed.command)}: ${String(failed.error).slice(0, 300)}` : text.slice(0, 300));
}

/** Volume in mm³ of every body by name as `inspect.measure` answers; NaN for a body that is not closed. */
function volumesOf(measured: unknown): Map<string, number> {
  const bodies = (measured as { bodies?: { name?: unknown; volume_mm3?: unknown }[] } | undefined)?.bodies ?? [];
  return new Map(bodies.flatMap((entry) => (typeof entry.name === 'string' ? [[entry.name, typeof entry.volume_mm3 === 'number' ? entry.volume_mm3 : NaN] as const] : [])));
}

/** Why a block would not land on the body it names, from the volumes before and after a trial; null when it does. */
export function misplaced(body: string, before: Map<string, number>, after: Map<string, number>): string | null {
  if (!before.has(body)) return `there is no body named ${body}; the design has ${[...before.keys()].join(', ') || 'no body'}`;
  const changed = (name: string) => Math.abs((after.get(name) ?? 0) - (before.get(name) ?? 0)) > 1e-6;
  const others = [...new Set([...before.keys(), ...after.keys()])].filter((name) => name !== body && changed(name));
  if (others.length > 0) return `at this point it would change ${others.join(', ')}, not only ${body}; give a point on a face of ${body} alone, away from other bodies`;
  if (Number.isFinite(before.get(body)) && !changed(body)) return `it would change nothing on ${body}: the point is not on a face of ${body}`;
  return null;
}

/** What was built, with the sizes it took from the tables, for the model to tell the user. */
function built(block: FeatureBlock): string {
  const { block: kind, body, point, ...sizes } = block;
  const listed = Object.entries(sizes)
    .filter(([key, value]) => key !== 'normal' && key !== 'more' && value !== undefined && value !== null)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(', ');
  const count = 'more' in block && block.more ? block.more.length + 1 : 1;
  return `Built ${count > 1 ? `${String(count)} × ` : ''}${kind} on ${body} at [${point.join(', ')}]: ${listed}.`;
}

/** The upstream tools plus `partbuddy_block`. */
export function withBlockTool(upstream: UpstreamTools, keepFace: (body: string, face: string) => void = () => undefined): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), blockTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== BLOCK_TOOL) return upstream.callTool(name, args, callId);
      const wall = wallOf(args) ?? knobOf(args) ?? magnetOf(args);
      if (typeof wall === 'string') return { content: [{ type: 'text', text: `Not built: ${wall}` }], isError: true };
      const block = wall ? null : blockOf(args);
      if (typeof block === 'string') return { content: [{ type: 'text', text: `Not built: ${block}` }], isError: true };
      try {
        const run = async (commands: { command: string; params: Record<string, unknown> }[], rollback = false) => {
          const reply = jsonOf(await upstream.callTool('batch', { commands, ...(rollback ? { rollback } : {}) }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
          if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 300)}`);
          return reply.results ?? [];
        };
        // A sketch belongs to the component of its body: built with that component active, the block moves with the body.
        const steps = wall ? wall.steps : block ? stepsOf(block) : [];
        const body = wall ? wall.body : (block?.body ?? '');
        const [listing] = steps.some((step) => step.command === 'sketch.create') ? await run([{ command: 'component.list', params: {} }]) : [undefined];
        const component = listing === undefined ? 0 : componentOf(listing, body);
        // A new part must not take the name of a body there is: its cuts would go into that one.
        const taken = ((listing as { components?: { bodies?: unknown }[] } | undefined)?.components ?? []).some((entry) => Array.isArray(entry.bodies) && entry.bodies.includes(body));
        if (wall && 'fresh' in wall && taken) return { content: [{ type: 'text', text: `Not built: there is a body named ${body} already; give the knob another name` }], isError: true };
        const sequence = component === 0 ? steps : [{ command: 'component.activate', params: { component } }, ...steps, { command: 'component.activate', params: { component: 0 } }];
        const fresh = wall !== null && 'fresh' in wall;
        const measure = { command: 'inspect.measure', params: {} };
        const inspect = { command: 'document.inspect', params: {} };
        const depth = (inspected: unknown) => count((inspected as { undo?: unknown } | undefined)?.undo);
        const [measured, inspected] = await run([measure, inspect]);
        const before = volumesOf(measured);
        const missing = fresh ? null : misplaced(body, before, before);
        if (missing?.startsWith('there is no body')) return { content: [{ type: 'text', text: `Not built: ${missing}` }], isError: true };
        let results: unknown[];
        try {
          results = await run([...sequence, measure]);
          // The point decides what SolidCraft cuts, so the named body is checked before the block stays.
          const wrong = fresh ? null : misplaced(body, before, volumesOf(results[results.length - 1]));
          if (wrong) throw new Error(wrong);
        } catch (cause) {
          // Nothing of a block that failed half way or landed on another body stays: undone step by step, as the work
          // log goes back. (A batch with `rollback` or a checkpoint is no way back in SolidCraft 0.40.1: after the one
          // the same modelled thread fails for real, and the other is gone once a batch has run.)
          const steps = depth((await run([inspect]))[0]) - depth(inspected);
          if (steps > 0) await run(Array.from({ length: steps }, () => ({ command: 'edit.undo', params: {} })));
          throw cause;
        }
        // The plate view lays the part on the face SolidCraft names (print-faces.json), as the slicer will.
        const face = results.map((result) => (result as { face?: unknown } | undefined)?.face).find((entry) => typeof entry === 'string');
        if (face) keepFace(body, face);
        const warnings = results.flatMap((result) => {
          const warning = (result as { warning?: unknown } | undefined)?.warning;
          return typeof warning === 'string' ? [warning.slice(0, 200)] : [];
        });
        return { content: [{ type: 'text', text: `${wall ? wall.text : block ? built(block) : ''}${warnings.length > 0 ? ` SolidCraft warns: ${warnings.join(' ')}` : ''}` }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route. */
export const BLOCK_GUIDANCE = `For a screw hole, a tapped hole, the seat of a heat-set insert, a nut trap, a screw boss, a slot, text, a lid's lip or a snap hook on one body call ${BLOCK_TOOL} instead of drilling or modelling it yourself: it takes clearance, head, nut and insert sizes from the standard tables. For a part that hangs on a wall use its keyhole (hung over screws in the wall) or woodScrew (screwed on through countersunk holes) blocks, two of them level for anything wider than 60 mm. For parts held by magnets (a lid, a tool holder, a sign) use its magnet block for each pocket instead of drilling a hole of the magnet's size; ask for the magnet's diameter and height when the user has not said. For a knob on a potentiometer, an encoder or any other shaft use its knob block, which makes the knob as a part of its own; ask for the shaft (D, knurled or round, and its diameter) when the user has not said.`;
