import { assemblyGroupSchema, assemblyPlanSchema, assemblyStepSchema, type AssemblyPlan } from '../../shared/assembly';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { MECHANISM_TOOL } from './mechanismTool';

/**
 * `partbuddy_assembly` (ADR 0026): the assistant sets the assembly order of a design of several
 * parts while it designs them, with sub-assemblies, what each step joins onto and from where.
 * PartBuddy checks it against the schema and the bodies of the design, keeps it in the project and
 * plays it in the view. Without it the view proposes an order from the geometry.
 */

export const ASSEMBLY_TOOL = 'partbuddy_assembly';

const direction = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const assemblyTool: UpstreamTool = {
  name: ASSEMBLY_TOOL,
  description:
    'Set the order in which the printed parts of this design are assembled, shown to the user as an animation in ' +
    "PartBuddy's view and used for its exploded view. Call it once the bodies exist, and again when bodies are added, " +
    'removed or renamed. Each step adds one body (or a finished sub-assembly) onto a target, moving along a direction ' +
    'in model space (Z up), e.g. [0, 0, -1] when the part comes down from above. Put parts that go together first into ' +
    'groups (sub-assemblies, which can be nested); a step of the parent then adds the group by its name. Order the main ' +
    'assembly from the base up, fasteners last. Name each step in the language the user writes in, e.g. "Board into the housing".',
  inputSchema: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        maxItems: 100,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 80, description: 'The sub-assembly, e.g. "Hinge".' },
            parent: { type: ['string', 'null'], maxLength: 80, description: 'The group it goes into when complete; null: the main assembly.' },
          },
          required: ['name', 'parent'],
          additionalProperties: false,
        },
      },
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 80, description: 'What happens, e.g. "Lid onto the housing".' },
            part: { type: 'string', maxLength: 200, description: 'The body (exact name) or the group this step adds.' },
            target: { type: ['string', 'null'], maxLength: 200, description: 'The body or group it joins onto; null for the first part of a group.' },
            direction: { ...direction, description: 'The way the part moves into place, in model space.' },
            group: { type: ['string', 'null'], maxLength: 80, description: 'The group the step belongs to; null: the main assembly.' },
          },
          required: ['name', 'part', 'direction'],
          additionalProperties: false,
        },
      },
    },
    required: ['steps'],
    additionalProperties: false,
  },
};

const error = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** Checks the model's input; the plan, or what is wrong with it in words the model can act on. */
export function checkAssembly(args: Record<string, unknown>, bodies: readonly string[]): { plan: AssemblyPlan } | { problem: string } {
  const groups = assemblyGroupSchema.array().safeParse(args.groups ?? []);
  const steps = assemblyStepSchema.array().safeParse(args.steps);
  if (!groups.success) return { problem: `groups: ${groups.error.issues[0]?.message ?? 'invalid'}` };
  if (!steps.success) return { problem: `steps: ${steps.error.issues[0]?.message ?? 'invalid'}` };
  const parsed = assemblyPlanSchema.safeParse({ version: 1, source: 'assistant', groups: groups.data, steps: steps.data });
  if (!parsed.success) return { problem: parsed.error.issues[0]?.message ?? 'invalid' };
  const known = new Set([...bodies, ...parsed.data.groups.map((group) => group.name)]);
  const unknown = parsed.data.steps.flatMap((step) => [step.part, step.target ?? null]).filter((name): name is string => name !== null && !known.has(name));
  if (unknown.length > 0) return { problem: `unknown bodies or groups: ${[...new Set(unknown)].join(', ')}. Bodies of the design: ${bodies.join(', ') || 'none'}` };
  return { plan: parsed.data };
}

/** The upstream tools plus `partbuddy_assembly`; `save` keeps the plan, or fails when no project is open. */
export function withAssemblyTool(upstream: UpstreamTools, bodies: () => string[], save: (plan: AssemblyPlan) => void): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), assemblyTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== ASSEMBLY_TOOL) return upstream.callTool(name, args, callId);
      const checked = checkAssembly(args, bodies());
      if ('problem' in checked) return error(`The assembly order was not kept: ${checked.problem}`);
      try {
        save(checked.plan);
      } catch (cause) {
        return error(`The assembly order was not kept: ${(cause as Error).message}`);
      }
      const parts = new Set(checked.plan.steps.map((step) => step.part)).size;
      return { content: [{ type: 'text', text: `Kept: ${String(checked.plan.steps.length)} steps, ${String(parts)} parts and groups, ${String(checked.plan.groups.length)} sub-assemblies. The user can play it in the view.` }] };
    },
  };
}

/** Added to the role prompt of every route. */
export const ASSEMBLY_GUIDANCE = `For a design of two or more printed parts, set their assembly order with ${ASSEMBLY_TOOL} once the parts exist.`;

/**
 * Parts that move (ADR 0027), added to the role prompt of every route: hinges and guides come from
 * partbuddy_mechanism (audit R23), other moving parts from SolidCraft's own joints, and the user
 * moves them with a slider in the view.
 */
export const JOINT_GUIDANCE =
  `For a hinge or a guide use ${MECHANISM_TOOL}, which also makes the joint. Only for other moving parts (a wheel on its axle, a lever) make them movable yourself once the bodies exist: ` +
  'turn those bodies into components with component.from_bodies {bodies}, then join each pair with joint.as_built ' +
  '{type: revolute or slider, a, b: the occurrences such as "Lid:1" (a stays, b moves), at: {occurrence, point: [x, y, z] on the axis, z: the direction of the axis}, ' +
  "name in the user's language} and set its range with joint.limits {joint, min, max} (degrees or mm; 0 is the position as designed). " +
  'Check the range with joint.sweep {joint, from, to}, which reports where parts first touch, and widen the gap or narrow the limits when they do; ' +
  "it reports touching, not a gap narrower than the printer's: PartBuddy's ready-to-print check measures those gaps after each change. " +
  // audit S-20: these links move the view only (SolidCraft 0.40.1 command docs, not measured).
  'joint.gear, joint.rack_pinion, joint.screw, joint.cam and joint.motion_link only couple the motion in the view: they make no teeth, thread or cam, ' +
  'so the printed parts do not drive each other unless you model that geometry; say so to the user when you use one. ' +
  'Finish the geometry of a body before you join it. To change a body that is a component afterwards, drive the joints to 0, make its component active (component.activate {component: "<its name>"}), build, then go back with component.activate {component: 0}: ' +
  'what is built from the design level onto such a body stays behind when the joint moves it, and SolidCraft then warns that the body is in separate pieces. ' +
  "Leave the joints at 0 when you are done; the user moves them with sliders in PartBuddy's view.";
