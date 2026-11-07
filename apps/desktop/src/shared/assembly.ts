import { z } from 'zod';

/**
 * The assembly order of a project (ADR 0026): in which order the printed parts go together, which
 * of them form sub-assemblies first, what each step joins onto and from which direction. Kept as
 * `assembly.json` in the project folder; the assistant sets it with `partbuddy_assembly`, and
 * without it the view proposes one from the geometry. Checked here, because it comes back from
 * disk and from the model.
 */

const name = z.string().trim().min(1).max(80);
const partName = z.string().trim().min(1).max(200);
const finite = z.number();

/** A direction in model space (Z up); any length but zero, normalised where it is used. */
const direction = z
  .tuple([finite, finite, finite])
  .refine(([x, y, z]) => Math.hypot(x, y, z) > 1e-6, { message: 'the joining direction must not be zero' });

export const assemblyStepSchema = z
  .object({
    /** Shown in the step list, e.g. "Board into the housing". */
    name,
    /** What this step adds: a body of the design or a finished sub-assembly. */
    part: partName,
    /** What it joins onto (a body or a sub-assembly); null or missing for the first part a group starts with. */
    target: partName.nullable().optional(),
    /** The way the part moves into place, e.g. [0, 0, -1] when it comes down from above. */
    direction,
    /** The sub-assembly the step belongs to; null or missing for the main assembly. */
    group: name.nullable().optional(),
  })
  .strict();

export const assemblyGroupSchema = z
  .object({
    name,
    /** The assembly it goes into when it is complete; null for one that goes into the main assembly. */
    parent: name.nullable(),
  })
  .strict();

export const assemblyPlanSchema = z
  .object({
    version: z.literal(1),
    /** Who decided the order: the assistant while designing, or the geometry proposal. */
    source: z.enum(['assistant', 'suggested']),
    groups: z.array(assemblyGroupSchema).max(100),
    steps: z.array(assemblyStepSchema).min(1).max(500),
  })
  .strict()
  .superRefine((plan, context) => {
    const groups = new Set(plan.groups.map((group) => group.name));
    if (groups.size !== plan.groups.length) context.addIssue({ code: 'custom', message: 'group names must be unique' });
    for (const group of plan.groups) {
      if (group.parent !== null && !groups.has(group.parent)) context.addIssue({ code: 'custom', message: `group ${group.name}: unknown parent ${group.parent}` });
    }
    // A group may not end up inside itself.
    for (const group of plan.groups) {
      const seen = new Set<string>();
      let current: string | null = group.name;
      while (current !== null) {
        if (seen.has(current)) {
          context.addIssue({ code: 'custom', message: `group ${group.name} goes into itself` });
          break;
        }
        seen.add(current);
        current = plan.groups.find((entry) => entry.name === current)?.parent ?? null;
      }
    }
    for (const step of plan.steps) {
      if (step.group && !groups.has(step.group)) context.addIssue({ code: 'custom', message: `step ${step.name}: unknown group ${step.group}` });
    }
  });

export type AssemblyStep = z.infer<typeof assemblyStepSchema>;
export type AssemblyGroup = z.infer<typeof assemblyGroupSchema>;
export type AssemblyPlan = z.infer<typeof assemblyPlanSchema>;

/** One step as it plays: in order, with the bodies it moves (a sub-assembly moves all of its parts). */
export interface PlayStep {
  name: string;
  /** The bodies that move in this step. */
  bodies: string[];
  target: string | null;
  direction: [number, number, number];
  group: string | null;
}

/**
 * The order the steps play in: every sub-assembly is built first (the deepest first), then it goes
 * into its parent as one piece where a step of the parent names it as its part. Steps keep their
 * order within each group; a sub-assembly that no step of its parent names joins at its end.
 */
export function playbackOrder(plan: AssemblyPlan): PlayStep[] {
  const children = (parent: string | null) => plan.groups.filter((group) => group.parent === parent).map((group) => group.name);
  const groupNames = new Set(plan.groups.map((group) => group.name));
  const stepsOf = (group: string | null) => plan.steps.filter((step) => (step.group ?? null) === group);
  const bodiesOf = (group: string): string[] => [
    ...stepsOf(group).flatMap((step) => (groupNames.has(step.part) ? bodiesOf(step.part) : [step.part])),
    ...children(group).filter((child) => !stepsOf(group).some((step) => step.part === child)).flatMap(bodiesOf),
  ];
  const played: PlayStep[] = [];
  const build = (group: string | null) => {
    for (const child of children(group)) build(child);
    const steps = stepsOf(group);
    for (const step of steps) {
      played.push({
        name: step.name,
        bodies: groupNames.has(step.part) ? bodiesOf(step.part) : [step.part],
        target: step.target ?? null,
        direction: step.direction,
        group,
      });
    }
    // Sub-assemblies no step names go in at the end, from above.
    for (const child of children(group)) {
      if (steps.some((step) => step.part === child)) continue;
      played.push({ name: child, bodies: bodiesOf(child), target: null, direction: [0, 0, -1], group });
    }
  };
  build(null);
  // A body of a sub-assembly moves twice: into the sub-assembly, then with it into the parent.
  return played.filter((step) => step.bodies.length > 0);
}
