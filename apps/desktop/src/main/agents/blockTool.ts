import { BLOCK_SIZES, defaultBlock, needsNormal, sizesOf, stepsOf, type BlockSize, type FeatureBlock } from '../../shared/blocks';
import { featureBlockSchema } from '../../shared/contract';
import { KEYHOLE, WALL, WOOD_SCREWS, keyholeDepth, keyholeProblem, keyholeSteps, woodScrewSteps, type WoodScrew } from '../../shared/wallMount';
import { componentOf } from '../solidcraft/actions';
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
export const WALL_BLOCKS = ['keyhole', 'woodScrew'] as const;

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
    'Give only what differs from the standard; everything else is filled in. For two parts screwed together use partbuddy_mechanism with kind screw instead, which makes both holes on one line.',
  inputSchema: {
    type: 'object',
    properties: {
      block: { type: 'string', enum: [...ASSISTANT_BLOCKS, ...WALL_BLOCKS] },
      body: { type: 'string', description: 'The body (exact name).' },
      point: { ...vector, description: 'A point on the flat face the block goes at, in mm: the centre of the hole, the foot of the boss, the middle of the text.' },
      normal: { ...vector, description: 'The way out of that face; needed for nutTrap, slot, text, snapFit and keyhole.' },
      up: { ...vector, description: 'keyhole: the way up as the part hangs, along the face; default +Z.' },
      screw: { type: 'number', enum: [...WOOD_SCREWS], description: 'keyhole, woodScrew: the wood screw, its thread diameter in mm; default 4.' },
      size: { type: 'string', enum: [...BLOCK_SIZES], description: 'The screw; default M3. Ignored for text, lip and snapFit.' },
      more: { type: 'array', items: vector, maxItems: 99, description: 'screwHole, tappedHole, insertSeat, keyhole, woodScrew: further points on the same face, one each.' },
      head: { type: 'string', enum: ['none', 'cap', 'countersunk'], description: 'screwHole: the room for the head; default cap (a counterbore).' },
      fit: { type: 'string', enum: ['close', 'normal', 'loose'], description: 'screwHole: the clearance by ISO 273; default normal.' },
      depth: { type: 'number', description: 'tappedHole, insertSeat, nutTrap, slot, text: depth in mm; default by the block (a slot and a tapped hole go through).' },
      diameter: { type: 'number', description: 'insertSeat: the hole for the insert; boss: its outer diameter. Default from the table.' },
      height: { type: 'number', description: 'boss: its height; text: the height of its capitals; lip: its height. Default by the block.' },
      length: { type: 'number', description: 'slot: its length; snapFit: the length of the arm. Default 10 and 12 mm.' },
      width: { type: 'number', description: 'slot, lip, snapFit: width in mm. Default by the block.' },
      along: { type: 'string', enum: ['x', 'y'], description: "slot: along the face's first or second direction." },
      text: { type: 'string', maxLength: 80, description: 'text: the words.' },
      mode: { type: 'string', enum: ['emboss', 'deboss'], description: 'text: raised or engraved; default engraved.' },
      type: { type: 'string', enum: ['lip', 'groove'], description: 'lip: a lip, or the groove that takes one.' },
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

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (result.isError || typeof text !== 'string') throw new Error(typeof text === 'string' ? text.slice(0, 300) : 'SolidCraft gave no answer');
  return JSON.parse(text) as unknown;
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
export function withBlockTool(upstream: UpstreamTools): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), blockTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== BLOCK_TOOL) return upstream.callTool(name, args, callId);
      const wall = wallOf(args);
      if (typeof wall === 'string') return { content: [{ type: 'text', text: `Not built: ${wall}` }], isError: true };
      const block = wall ? null : blockOf(args);
      if (typeof block === 'string') return { content: [{ type: 'text', text: `Not built: ${block}` }], isError: true };
      try {
        const run = async (commands: { command: string; params: Record<string, unknown> }[]) => {
          const reply = jsonOf(await upstream.callTool('batch', { commands }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
          if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 300)}`);
          return reply.results ?? [];
        };
        // A sketch belongs to the component of its body: built with that component active, the block moves with the body.
        const steps = wall ? wall.steps : block ? stepsOf(block) : [];
        const body = wall ? wall.body : (block?.body ?? '');
        const [listing] = steps.some((step) => step.command === 'sketch.create') ? await run([{ command: 'component.list', params: {} }]) : [undefined];
        const component = listing === undefined ? 0 : componentOf(listing, body);
        const results = await run(component === 0 ? steps : [{ command: 'component.activate', params: { component } }, ...steps, { command: 'component.activate', params: { component: 0 } }]);
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
export const BLOCK_GUIDANCE = `For a screw hole, a tapped hole, the seat of a heat-set insert, a nut trap, a screw boss, a slot, text, a lid's lip or a snap hook on one body call ${BLOCK_TOOL} instead of drilling or modelling it yourself: it takes clearance, head, nut and insert sizes from the standard tables. For a part that hangs on a wall use its keyhole (hung over screws in the wall) or woodScrew (screwed on through countersunk holes) blocks, two of them level for anything wider than 60 mm.`;
