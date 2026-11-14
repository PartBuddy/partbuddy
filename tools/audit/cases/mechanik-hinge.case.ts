import { hingeOf, roomDepths } from '../../../apps/desktop/src/main/agents/mechanismTool';
import { templateSteps } from '../../../apps/desktop/src/shared/templates';
import { bodiesOf, box, downFaces, ray, refused, scene, segments, summarize, upstreamOf, type Audit, type Vec3 } from '../mechanik-helpers';

// Findings T3, G1, H-02, W4, W6, W7, W8, W9, T11, T12 and the hinge at its defaults and limits.

/** Two plates lying on the bed with the hinge line between them, half a barrel above it (the tool's own advice). */
function lying(d: number, width = 30, sep = d - 2) {
  const [long, thick] = [Math.max(40, 2 * d), d / 2 + 1];
  const x = long + sep / 2;
  return {
    steps: [box('Base', [0, 0, 0], [long, width, thick]), box('Flap', [long + sep, 0, 0], [long, width, thick])],
    args: { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [x, 0, d / 2], to: [x, width, d / 2] },
    x,
    long,
    thick,
  };
}

/** The same two plates standing, the line upright. */
function upright(d: number, height = 30) {
  const x = 40 + (d - 2) / 2;
  return {
    steps: [box('Base', [0, 0, 0], [40, d / 2 + 1, height]), box('Flap', [40 + d - 2, 0, 0], [40, d / 2 + 1, height])],
    args: { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [x, d / 2, 0], to: [x, d / 2, height] },
    x,
  };
}

/** Rays from the middle of the pin of a lying hinge: up through the roof, down, and along the line above the bore. */
function pinRays(bodies: Parameters<typeof ray>[0], x: number, width: number, d: number) {
  const mid: Vec3 = [x, width / 2, d / 2];
  return {
    up: segments(ray(bodies, mid, [0, 0, 1])),
    down: segments(ray(bodies, mid, [0, 0, -1])),
    toBase: segments(ray(bodies, mid, [-1, 0, 0])),
    toFlap: segments(ray(bodies, mid, [1, 0, 0])),
    // Between bore and barrel skin, 45° below the axis towards the base: knuckles and the gaps between them.
    alongLine: segments(ray(bodies, [x - d * 0.28, -1, d / 2 - d * 0.28], [0, 1, 0])),
  };
}

async function builtLying(audit: Audit, d: number, extra: Record<string, unknown> = {}, width = 30, sep = d - 2) {
  const s = lying(d, width, sep);
  await audit.batch(s.steps);
  const tool = await audit.tool('partbuddy_mechanism', { ...s.args, ...extra });
  const summary = await summarize(audit, ['Base', 'Flap'], { profiles: ['pla04', 'petg04', 'tpu04', 'pla06', 'pla08'] });
  return { tool, args: { ...s.args, ...extra }, ...summary, rays: pinRays(summary.measured as Parameters<typeof ray>[0], s.x, width, d) };
}

test('hinge lying: default and limits', async () => {
  await scene('hinge-default', 0.4, (audit) => builtLying(audit, 6));
  await scene('hinge-d5-gap02', 0.4, (audit) => builtLying(audit, 5, { diameter: 5, gap: 0.2 }));
  await scene('hinge-d40', 0.4, (audit) => builtLying(audit, 40, { diameter: 40 }));
  await scene('hinge-gap1-d9', 0.4, (audit) => builtLying(audit, 9, { diameter: 9, gap: 1 }));
  await scene('hinge-gap02', 0.4, (audit) => builtLying(audit, 6, { gap: 0.2 }));
  await scene('hinge-knuckles9', 0.4, (audit) => builtLying(audit, 6, { knuckles: 9 }));
  await scene('hinge-knuckle-2_5', 0.4, (audit) => builtLying(audit, 6, { knuckles: 3 }, 8.3));
  await scene('hinge-knuckle-2_6', 0.4, (audit) => builtLying(audit, 6, { knuckles: 3 }, 8.6));
  await scene('hinge-refused', 0.4, async (audit) => {
    const s = lying(6);
    await audit.batch(s.steps);
    const short = lying(6, 8.2);
    return {
      refused: await refused(audit, [
        { ...s.args, diameter: 3.9 },
        { ...s.args, diameter: 4, gap: 0.2 },
        { ...s.args, diameter: 40.1 },
        { ...s.args, gap: 0.19 },
        { ...s.args, gap: 1.01 },
        { ...s.args, gap: 1 },
        { ...s.args, knuckles: 4 },
        { ...s.args, knuckles: 11 },
        { ...s.args, knuckles: 1 },
        { ...s.args, from: short.args.from, to: short.args.to, knuckles: 3 },
        { ...s.args, moving: 'Base' },
        { ...s.args, moving: 'Nothing' },
        { ...s.args, to: s.args.from },
        { ...s.args, diameter: -6 },
        { ...s.args, gap: 0 },
      ]),
    };
  });
});

test('hinge upright: smallest diameter', async () => {
  await scene('hinge-upright-d4', 0.4, async (audit) => {
    const s = upright(4);
    await audit.batch(s.steps);
    const tool = await audit.tool('partbuddy_mechanism', { ...s.args, diameter: 4, gap: 0.2 });
    const summary = await summarize(audit, ['Base', 'Flap']);
    const bodies = summary.measured as Parameters<typeof ray>[0];
    return { tool, ...summary, rays: { across: segments(ray(bodies, [s.x - 5, 2, 5], [1, 0, 0])), acrossMoving: segments(ray(bodies, [s.x - 5, 2, 15], [1, 0, 0])) } };
  });
});

/** The halves of the template hingedBox without closure and hinge: parameters and the two shells. */
function templateShells() {
  const steps = templateSteps('hingedBox');
  const first = steps.findIndex((step) => String(step.params.name ?? '').startsWith('Closure') || String(step.params.name ?? '').startsWith('Hinge'));
  return steps.slice(0, first);
}

test('T3: template hingedBox against the tool on the same shells', async () => {
  const knuckleFaces = (down: ReturnType<typeof downFaces>) => ({ ...down, faces: down.faces.slice(0, 12) });
  await scene('t3-template-hingedbox', 0.4, async (audit) => {
    await audit.batch(templateSteps('hingedBox'));
    const summary = await summarize(audit, ['Box', 'Lid']);
    const bodies = summary.measured as Parameters<typeof ray>[0];
    // Straight up under the knuckles, 2 mm to either side of the line: where the material begins above the bed.
    const under = Object.fromEntries(
      [12, 20, 30, 40, 48].map((x) => [`x${String(x)}`, { boxSide: segments([{ body: 'bed', distance: 0, face: 'bed', entering: false }, ...ray(bodies, [x, -1.5, 0.0001], [0, 0, 1])]).slice(0, 3), lidSide: segments([{ body: 'bed', distance: 0, face: 'bed', entering: false }, ...ray(bodies, [x, 2.5, 0.0001], [0, 0, 1])]).slice(0, 3), line: ray(bodies, [x, 0.5, 0.0001], [0, 0, 1]).slice(0, 2) }]),
    );
    // The closure of the template: where the lid's lip with its bead ends towards the wall with the catch (the room's wall is at y = 38.6).
    const lid = bodies.filter((body) => body.name === 'Lid');
    const beadReach = Object.fromEntries([17.5, 18.2, 18.5, 18.8, 19.5].map((z) => [`z${String(z)}`, 20 + (ray(lid, [31.3, 20, z], [0, 1, 0]).find((hit) => !hit.entering)?.distance ?? NaN)]));
    return { ...summary, beadReach, under, downBox: knuckleFaces(downFaces(bodies.find((body) => body.name === 'Box')!)), downLid: knuckleFaces(downFaces(bodies.find((body) => body.name === 'Lid')!)) };
  });
  await scene('t3-tool-on-shells', 0.4, async (audit) => {
    await audit.batch(templateShells());
    const tool = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [10, 0.5, 16], to: [50, 0.5, 16], diameter: 8, gap: 0.4, knuckles: 5, wall: 2.4 });
    const summary = await summarize(audit, ['Box', 'Lid']);
    const bodies = summary.measured as Parameters<typeof ray>[0];
    const under = Object.fromEntries([12, 20, 30, 40, 48].map((x) => [`x${String(x)}`, ray(bodies, [x, 0.5, 0.0001], [0, 0, 1]).slice(0, 2)]));
    return { tool, ...summary, under };
  });
});

test('hinge with support: blocks 16 mm high, line on the rims', async () => {
  for (const [name, extra] of [['hinge-support-default', { diameter: 8 }], ['hinge-support-d6', {}], ['hinge-support-d40', { diameter: 40 }]] as const) {
    await scene(name, 0.4, async (audit) => {
      const d = (extra as { diameter?: number }).diameter ?? 6;
      const [high, sep] = [Math.max(16, d + 4), 1];
      await audit.batch([box('Box', [0, 0, 0], [40, 30, high]), box('Lid', [40 + sep, 0, 0], [40, 30, high])]);
      const tool = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [40.5, 0, high], to: [40.5, 30, high], ...extra });
      return { tool, ...(await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04', 'petg04', 'tpu04'] })) };
    });
  }
});

test('G1: a lid plate 27 mm above the bed, hinged to a box 30 mm high', async () => {
  await scene('g1-lid-in-the-air', 0.4, async (audit) => {
    await audit.batch([box('Box', [0, 0, 0], [40, 30, 30]), box('Lid', [44, 0, 27], [40, 30, 3])]);
    const before = await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] });
    const tool = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [42, 0, 28.5], to: [42, 30, 28.5] });
    const after = await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] });
    const strip = ({ measured: _measured, ...rest }: Record<string, unknown>) => rest;
    return { tool, before: strip(before), after: strip(after) };
  });
});

test('G1: a lid block whose underside is its own lowest point, 22 mm above the bed', async () => {
  await scene('g1-lid-underside-lowest', 0.4, async (audit) => {
    await audit.batch([box('Box', [0, 0, 0], [40, 30, 30]), box('Lid', [44, 0, 22], [40, 30, 8])]);
    const tool = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [42, 0, 28.5], to: [42, 30, 28.5] });
    return { tool, ...(await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] })) };
  });
});

test('H-02: both bodies in one component, so the joint cannot be made', async () => {
  await scene('h02-one-component', 0.4, async (audit) => {
    const s = lying(6);
    await audit.batch([{ command: 'component.create', params: { name: 'Both' } }, ...s.steps, { command: 'component.activate', params: { component: 0 } }]);
    const state = async () => ({ bodies: await bodiesOf(audit), joints: await audit.batch([{ command: 'joint.list', params: {} }]).then(([list]) => ((list as { joints?: unknown[] }).joints ?? []).length), features: await audit.batch([{ command: 'component.list', params: {} }]).then(([list]) => ((list as { components?: { features?: unknown[] }[] }).components ?? []).reduce((sum, component) => sum + (component.features?.length ?? 0), 0)) });
    const before = await state();
    const first = await audit.tool('partbuddy_mechanism', s.args);
    const afterFirst = await state();
    const again = await audit.tool('partbuddy_mechanism', s.args);
    const afterAgain = await state();
    return { before, first, afterFirst, again, afterAgain };
  });
});

test('H-02: a second hinge with the default name', async () => {
  await scene('h02-second-hinge', 0.4, async (audit) => {
    const s = lying(6);
    await audit.batch([...s.steps, box('Flap2', [-44, 0, 0], [40, 30, 4])]);
    const state = async () => ({ bodies: await bodiesOf(audit), joints: await audit.batch([{ command: 'joint.list', params: {} }]).then(([list]) => ((list as { joints?: { name?: unknown; a?: unknown; b?: unknown; values?: unknown }[] }).joints ?? []).map((joint) => ({ name: joint.name, a: joint.a, b: joint.b, values: joint.values }))), design: await audit.tool('inspect_design', {}).then((answer) => answer.text.slice(0, 3000)) });
    const first = await audit.tool('partbuddy_mechanism', s.args);
    const afterFirst = await state();
    const second = await audit.tool('partbuddy_mechanism', { ...s.args, moving: 'Flap2', from: [-2, 0, 3], to: [-2, 30, 3] });
    const afterSecond = await state();
    const again = await audit.tool('partbuddy_mechanism', { ...s.args, moving: 'Flap2', from: [-2, 0, 3], to: [-2, 30, 3] });
    const afterAgain = await state();
    return { first, afterFirst, second, afterSecond, again, afterAgain };
  });
});

test('W4, W6, T12: the hinge with a 0.6 and a 0.8 mm nozzle', async () => {
  const s = lying(6);
  const pure = { nozzle06: hingeOf(s.args, 0.6), nozzle08: hingeOf(s.args, 0.8), nozzle04: hingeOf(s.args, 0.4) };
  for (const nozzle of [0.6, 0.8]) {
    const tag = String(nozzle).replace('.', '');
    await scene(`w4-default-lying-n${tag}`, nozzle, async (audit) => {
      await audit.batch(s.steps);
      return { pure, refused: await refused(audit, [s.args]) };
    });
    await scene(`t12-default-upright-n${tag}`, nozzle, async (audit) => {
      const u = upright(6);
      await audit.batch(u.steps);
      const tool = await audit.tool('partbuddy_mechanism', u.args);
      const summary = await summarize(audit, ['Base', 'Flap'], { profiles: ['pla04', 'pla06', 'pla08'] });
      return { tool, ...summary, rays: { across: segments(ray(summary.measured as Parameters<typeof ray>[0], [u.x - 5, 3, 15], [1, 0, 0])) } };
    });
  }
  // The advice of the refusal at 0.6 mm, taken both ways.
  await scene('w4-n06-smaller-gap', 0.6, (audit) => builtLying(audit, 6, { gap: 0.45 }));
  await scene('w4-n06-gap05', 0.6, async (audit) => {
    await audit.batch(s.steps);
    return { refused: await refused(audit, [{ ...s.args, gap: 0.5 }]) };
  });
  await scene('w4-n06-d7', 0.6, (audit) => builtLying(audit, 7, { diameter: 7 }));
  await scene('w6-n06-d8', 0.6, (audit) => builtLying(audit, 8, { diameter: 8 }));
  await scene('t12-n08-d7-upright', 0.8, async (audit) => {
    const u = upright(7);
    await audit.batch(u.steps);
    const tool = await audit.tool('partbuddy_mechanism', { ...u.args, diameter: 7 });
    const summary = await summarize(audit, ['Base', 'Flap'], { profiles: ['pla08'] });
    return { tool, ...summary, rays: { across: segments(ray(summary.measured as Parameters<typeof ray>[0], [u.x - 6, 3.5, 15], [1, 0, 0])) } };
  });
});

/** Two walls standing, `wall` thick, their faces `near` and `far` from the hinge line at x = 0, the line 3 mm under their tops. */
function walls(wall: number, toFixed: number, toMoving: number) {
  return {
    steps: [box('Base', [-toFixed - wall, 0, 0], [wall, 30, 20]), box('Flap', [toMoving, 0, 0], [wall, 30, 20])],
    args: { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [0, 0, 17], to: [0, 30, 17] },
  };
}

test('W7: a skin of 0.8 mm behind the rooms, with and without wall', async () => {
  await scene('w7-skin', 0.4, async (audit) => {
    const s = walls(1.8, 2.4, 2.4);
    await audit.batch(s.steps);
    const withWall = await refused(audit, [{ ...s.args, wall: 1.8 }]);
    const depths = await roomDepths(upstreamOf(audit), hingeOf(s.args, 0.4) as never, undefined);
    const tool = await audit.tool('partbuddy_mechanism', s.args);
    const summary = await summarize(audit, ['Base', 'Flap'], { profiles: ['pla04'] });
    const bodies = summary.measured as Parameters<typeof ray>[0];
    // Through both walls at the height of the line: in the middle knuckle (the flap's, its room in the base) and in an outer one.
    return { withWall, depths, tool, ...summary, rays: { middle: segments(ray(bodies, [-10, 15, 17], [1, 0, 0])), outer: segments(ray(bodies, [-10, 5, 17], [1, 0, 0])) } };
  });
});

test('W8: the line further from the bodies than the text allows', async () => {
  for (const [name, sep] of [['w8-line-2_9', 5.8], ['w8-line-2_99', 5.98], ['w8-line-2_5', 5]] as const) {
    await scene(name, 0.4, async (audit) => {
      const built = await builtLying(audit, 6, {}, 30, sep);
      const bodies = built.measured as Parameters<typeof ray>[0];
      // Straight up 0.01 mm outside the base's face, inside the first knuckle: how high the knuckle hangs on its plate.
      return { ...built, neck: { base: segments(ray(bodies, [40.01, 5, -1], [0, 0, 1])), flap: segments(ray(bodies, [40 + sep - 0.01, 15, -1], [0, 0, 1])) } };
    });
  }
});

test('W9: the line 0.5 mm inside a wall', async () => {
  await scene('w9-line-in-wall', 0.4, async (audit) => {
    const s = walls(4.5, -0.5, 2);
    await audit.batch(s.steps);
    const spec = hingeOf(s.args, 0.4);
    const depths = await roomDepths(upstreamOf(audit), spec as never, undefined);
    const tool = await audit.tool('partbuddy_mechanism', { ...s.args, wall: 4.5 });
    const summary = await summarize(audit, ['Base', 'Flap'], { profiles: ['pla04'] });
    const bodies = summary.measured as Parameters<typeof ray>[0];
    const rays = { middle: segments(ray(bodies, [-10, 15, 17], [1, 0, 0])), outer: segments(ray(bodies, [-10, 5, 17], [1, 0, 0])) };
    return { depths, tool, ...summary, rays };
  });
  // What the probe of roomDepths sees on the untouched walls: the same rod and the same question, kept.
  await scene('w9-probe', 0.4, async (audit) => {
    const s = walls(4.5, -0.5, 2);
    await audit.batch([...s.steps, { command: 'solid.cylinder', params: { diameter: 0.1, height: 30, base: [0, 0, 17], axis: [0, 30, 0], operation: 'new', body_name: 'Rod' } }]);
    const [clearance] = await audit.batch([{ command: 'inspect.clearance', params: { bodies: ['Rod'], against: ['Base', 'Flap'], clearance: 6 } }]);
    return { clearance };
  });
});
