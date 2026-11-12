import { CAP_HEAD, HEAD_ALLOWANCE } from '../../../apps/desktop/src/shared/screwSizes';
import { smallOverhangReach } from '../../../packages/geometry/src/overhang';
import { cylinders, overhang, PLA_04 } from '../harness';
import { bodiesOf, box, downFaces, ray, refused, scene, segments, summarize, type Audit, type MeasuredBody, type Step, type Vec3 } from '../mechanik-helpers';

// Findings T5, T6, T11, T13 and every mechanism but the hinge at its defaults and limits.

const measuredOf = (summary: Record<string, unknown>) => summary.measured as MeasuredBody[];
const tool = (audit: Audit, args: Record<string, unknown>) => audit.tool('partbuddy_mechanism', args);

// ---- slide and plug dovetail -------------------------------------------------------------------------------------

/** A base plate 6 mm thick and a block lying over it, a gap above its face; the rail's line runs along x in the middle. */
function slideScene(width: number, height: number, gap: number) {
  const top = width + 2 * height;
  const [baseWide, stopWide, stopHigh] = [top + 24, top + 16, height + 8];
  return {
    steps: [box('Base', [0, -baseWide / 2, 0], [60, baseWide, 6]), box('Stop', [15, -stopWide / 2, 6 + gap], [30, stopWide, stopHigh])],
    args: { fixed: 'Base', moving: 'Stop', from: [0, 0, 6], to: [60, 0, 6] },
    far: -baseWide,
  };
}

async function builtSlide(audit: Audit, kind: Record<string, unknown>, width: number, height: number, gap: number, extra: Record<string, unknown> = {}) {
  const s = slideScene(width, height, gap);
  await audit.batch(s.steps);
  const answer = await tool(audit, { ...kind, ...s.args, ...extra });
  const summary = await summarize(audit, ['Base', 'Stop'], { profiles: ['pla04', 'petg04'] });
  const bodies = measuredOf(summary);
  return {
    tool: answer,
    args: { ...kind, ...s.args, ...extra },
    ...summary,
    // The print check's own overhang rule on each body: by angle alone, and with small overhangs left out as the check does.
    overhangRule: Object.fromEntries(bodies.map((body) => [body.name, { byAngle: overhang(body, PLA_04).support, asChecked: overhang(body, PLA_04, smallOverhangReach(0.4)).support }])),
    rays: {
      // Across the groove 0.01 mm under its ceiling: the stretch without material is the ceiling's width.
      ceiling: segments(ray(bodies, [27.3, s.far, 6 + height + gap - 0.01], [0, 1, 0])),
      // Across at half the rail's height: groove wall, gap, rail, gap, groove wall (level; the gap square to the flank is that / √2).
      halfHeight: segments(ray(bodies, [27.3, s.far, 6 + height / 2 + 0.013], [0, 1, 0])),
      // Up through the rail's middle and beside the rail through the base's face.
      upRail: segments(ray(bodies, [27.3, 0.37, -1], [0, 0, 1])),
      upBeside: segments(ray(bodies, [27.3, width / 2 + height + gap * 2 + 3.1, -1], [0, 0, 1])),
    },
  };
}

test('T5, slide: default and limits', async () => {
  await scene('slide-default', 0.4, (audit) => builtSlide(audit, { kind: 'slide' }, 6, 3, 0.4));
  await scene('slide-min', 0.4, (audit) => builtSlide(audit, { kind: 'slide' }, 2, 1.5, 0.2, { width: 2, height: 1.5, gap: 0.2 }));
  await scene('slide-max', 0.4, (audit) => builtSlide(audit, { kind: 'slide' }, 60, 20, 0.4, { width: 60, height: 20 }));
  await scene('slide-max-gap1', 0.4, (audit) => builtSlide(audit, { kind: 'slide' }, 60, 20, 1, { width: 60, height: 20, gap: 1 }));
  await scene('slide-w20-h3', 0.4, (audit) => builtSlide(audit, { kind: 'slide' }, 20, 3, 0.4, { width: 20 }));
  await scene('plug-dovetail-default', 0.4, (audit) => builtSlide(audit, { kind: 'plug', shape: 'dovetail' }, 6, 3, 0.2));
  await scene('slide-refused', 0.4, async (audit) => {
    const s = slideScene(6, 3, 0.4);
    await audit.batch(s.steps);
    const a = { kind: 'slide', ...s.args };
    return { refused: await refused(audit, [{ ...a, width: 1.9 }, { ...a, width: 60.1 }, { ...a, height: 1.4 }, { ...a, height: 20.1 }, { ...a, gap: 0.19 }, { ...a, gap: 1.01 }, { ...a, to: [4.9, 0, 6] }, { ...a, up: [1, 0, 0] }, { ...a, up: [0, 0, 0] }, { ...a, up: [0, 1, 1] }, { ...a, moving: 'Base' }]) };
  });
});

// ---- closure ---------------------------------------------------------------------------------------------------------

/** A box 20 mm high, open at the top, and its lid sitting on it open side down (rim at z = 20), or a flat plate. */
function closureScene(wall: number, inner: [number, number], radius: number, flat = false) {
  const [long, wide] = [inner[0] + 2 * wall, inner[1] + 2 * wall];
  const corners = (z: number): Vec3[] => [[0, 0, z], [long, 0, z], [0, wide, z], [long, wide, z]];
  const shell = (body: string, corner: Vec3, high: number, open: number): Step[] => [
    box(body, corner, [long, wide, high]),
    ...(radius > 0 ? [{ command: 'solid.fillet', params: { edges: corners(corner[2] + high / 2), radius: radius + wall, body } }] : []),
    { command: 'solid.shell', params: { faces: [[long / 2, wide / 2, open]], thickness: wall, body } },
  ];
  return {
    steps: [...shell('Box', [0, 0, 0], 20, 20), ...(flat ? [box('Lid', [0, 0, 20], [long, wide, 3])] : shell('Lid', [0, 0, 20], wall + 8, 20))],
    args: { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [wall, wall, 20], to: [long - wall, wide - wall, 20], up: [0, 0, -1], side: 'y+', wall, radius, ...(flat ? { flat: true } : {}) },
    long,
    wide,
  };
}

/** The y where the lid's lip (with its bead) ends towards the wall, from the room's middle. */
function lidReach(bodies: MeasuredBody[], x: number, y: number, z: number): number | null {
  const lid = ray(bodies.filter((body) => body.name === 'Lid'), [x, y, z], [0, 1, 0]);
  const leaving = lid.filter((hit) => !hit.entering)[0];
  return leaving ? Math.round((y + leaving.distance) * 1000) / 1000 : null;
}

async function builtClosure(audit: Audit, wall: number, inner: [number, number], radius: number, flat = false, extra: Record<string, unknown> = {}) {
  const s = closureScene(wall, inner, radius, flat);
  await audit.batch(s.steps);
  const args = { ...s.args, ...extra };
  const answer = await tool(audit, args);
  const summary = await summarize(audit, ['Box', 'Lid'], { up: { Lid: -1, Box: 1 }, profiles: ['pla04', 'pla06', 'pla08'] });
  const bodies = measuredOf(summary);
  const out = (z: number, x = s.long / 2) => segments(ray(bodies, [x, s.wide / 2, z], [0, 1, 0]));
  return {
    tool: answer,
    args,
    ...summary,
    // From the room's middle out through the wall with the catch: the lip alone, through the bead, and beside the bead.
    rays: { lip19: out(19), lip16_5: out(16.5), bead17_5: out(17.5), bead17_1: out(17.1), besideBead17_5: out(17.5, s.long / 2 + 9), inLid21: out(21), inLid22_5: out(22.5) },
    // How far the lid reaches towards the wall with the catch (its last face, as y) over the bead's height and along the bead.
    beadProfile: Object.fromEntries([16.9, 17.05, 17.2, 17.35, 17.5, 17.65, 17.8, 17.95, 18.1].map((z) => [`z${String(z)}`, lidReach(bodies, s.long / 2 + 1.3, s.wide / 2, z)])),
    beadAlong: Object.fromEntries([-7.5, -6.5, -3, 0.7, 3, 6.5, 7.5].map((dx) => [`x${String(dx)}`, lidReach(bodies, s.long / 2 + dx, s.wide / 2, 17.5)])),
  };
}

test('T13, closure: default, limits and the 0.6 mm nozzle', async () => {
  await scene('closure-default', 0.4, (audit) => builtClosure(audit, 2, [56, 36], 0));
  await scene('closure-default-n06', 0.6, (audit) => builtClosure(audit, 2, [56, 36], 0));
  await scene('closure-wall-1_6', 0.4, (audit) => builtClosure(audit, 1.6, [56, 36], 0));
  await scene('closure-wall-10', 0.4, (audit) => builtClosure(audit, 10, [56, 36], 0));
  await scene('closure-room-20x12', 0.4, (audit) => builtClosure(audit, 2, [20, 12], 0));
  await scene('closure-radius-2', 0.4, (audit) => builtClosure(audit, 2, [56, 36], 2));
  await scene('closure-radius-8', 0.4, (audit) => builtClosure(audit, 2, [56, 36], 8));
  await scene('closure-flat', 0.4, (audit) => builtClosure(audit, 2, [56, 36], 0, true));
  await scene('closure-refused', 0.4, async (audit) => {
    const s = closureScene(2, [56, 36], 0);
    await audit.batch(s.steps);
    const a = s.args;
    return {
      refused: await refused(audit, [
        { ...a, wall: 1.5 },
        { ...a, wall: 10.1 },
        { ...a, to: [21.9, 38, 20] },
        { ...a, to: [58, 13.9, 20] },
        { ...a, side: 'x+', to: [58, 21.9, 20] },
        { ...a, radius: -1 },
        { ...a, radius: 30 },
        { ...a, side: 'top' },
        { ...a, up: [1, 0, 0] },
        { ...a, to: [58, 38, 21] },
        { ...a, hinge_from: [0, -1, 20], hinge_to: [10, 5, 20] },
      ]),
    };
  });
});

// ---- screw -----------------------------------------------------------------------------------------------------------

async function builtScrew(audit: Audit, cover: number, base: number, extra: Record<string, unknown> = {}) {
  await audit.batch([box('Base', [0, 0, 0], [40, 40, base]), box('Cover', [0, 0, base], [40, 40, cover])]);
  const args = { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [20, 20, base + cover], to: [20, 20, base], ...extra };
  const answer = await tool(audit, args);
  const summary = await summarize(audit, ['Base', 'Cover'], { profiles: ['pla04', 'pla06'] });
  const bodies = measuredOf(summary).filter((body) => body.name === 'Base' || body.name === 'Cover');
  return {
    tool: answer,
    args,
    ...summary,
    cylinders: Object.fromEntries(bodies.map((body) => [body.name, cylinders(body).map((c) => `${c.face} Ø${String(c.diameter)}`)])),
    rays: {
      // Down the screw's line, and down 0.2 mm outside the clearance hole's wall (under the head).
      axis: segments([{ body: 'top', distance: 0, face: '', entering: false }, ...ray(bodies, [20, 20, base + cover + 1], [0, 0, -1])]),
      underHead: segments([{ body: 'top', distance: 0, face: '', entering: false }, ...ray(bodies, [20 + Number((extra.probe as number | undefined) ?? 1.9), 20, base + cover + 1], [0, 0, -1])]),
    },
  };
}

test('screw: default and limits', async () => {
  const capDepth = (size: 'M3' | 'M2' | 'M10') => CAP_HEAD[size][1] + HEAD_ALLOWANCE.depth;
  await scene('screw-default', 0.4, (audit) => builtScrew(audit, 6, 12));
  await scene('screw-m2', 0.4, (audit) => builtScrew(audit, 6, 12, { size: 'M2', probe: 1.4 }));
  await scene('screw-m6-insert', 0.4, (audit) => builtScrew(audit, 10, 20, { size: 'M6', probe: 3.5 }));
  await scene('screw-m5-tapped', 0.4, (audit) => builtScrew(audit, 8, 20, { size: 'M5', thread: 'tapped', probe: 2.95 }));
  await scene('screw-m10-tapped', 0.4, (audit) => builtScrew(audit, 14, 32, { size: 'M10', thread: 'tapped', probe: 5.7 }));
  await scene('screw-countersunk-m3', 0.4, (audit) => builtScrew(audit, 6, 12, { head: 'countersunk' }));
  await scene('screw-head-none', 0.4, (audit) => builtScrew(audit, 6, 12, { head: 'none' }));
  await scene('screw-more-3', 0.4, (audit) => builtScrew(audit, 6, 12, { more: [[8, 8, 18], [32, 8, 18], [8, 32, 18]] }));
  await scene('screw-thinnest-cover', 0.4, (audit) => builtScrew(audit, capDepth('M3') + 1.2, 12));
  await scene('screw-no-screws', 0.4, (audit) => builtScrew(audit, 6, 12, { screws: false }));
  // The seat is 6.7 mm deep: a fixed body thinner than that.
  await scene('screw-base-5', 0.4, (audit) => builtScrew(audit, 6, 5));
  // A screw 1 mm from the edge of both bodies.
  await scene('screw-at-edge', 0.4, (audit) => builtScrew(audit, 6, 12, { from: [1, 20, 18], to: [1, 20, 12] }));
  await scene('screw-refused', 0.4, async (audit) => {
    await audit.batch([box('Base', [0, 0, 0], [40, 40, 12]), box('Cover', [0, 0, 12], [40, 40, 6])]);
    const a = { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [20, 20, 18], to: [20, 20, 12] };
    return {
      refused: await refused(audit, [
        { ...a, from: [20, 20, 12 + capDepth('M3') + 1.19] },
        { ...a, size: 'M2', head: 'countersunk' },
        { ...a, size: 'M4', thread: 'tapped' },
        { ...a, size: 'M8' },
        { ...a, size: 'M7' },
        { ...a, from: [20, 20, 12.9] },
        { ...a, head: 'flat' },
        { ...a, more: Array.from({ length: 41 }, (_, i) => [i, 1, 18]) },
      ]),
    };
  });
});

// ---- lid -------------------------------------------------------------------------------------------------------------

async function builtLid(audit: Audit, diameter: number, extra: Record<string, unknown> = {}) {
  await audit.batch([{ command: 'solid.cylinder', params: { diameter, height: 40, base: [0, 0, 0], operation: 'new', body_name: 'Jar' } }]);
  const args = { kind: 'lid', fixed: 'Jar', moving: 'Cap', from: [0, 0, 40], diameter, ...extra };
  const started = Date.now();
  const answer = await tool(audit, args);
  const seconds = (Date.now() - started) / 1000;
  const summary = await summarize(audit, ['Jar', 'Cap'], { up: { Jar: 1, Cap: -1 }, profiles: ['pla04', 'petg04'] });
  const bodies = measuredOf(summary);
  const r = diameter / 2;
  // The thread's section as PartBuddy sent it (sketch.line of the first coil of each body): foot, crest, crest, foot.
  const sections = audit.sent.flatMap((batch) => batch.commands).filter((step) => step.command === 'sketch.line').map((step) => step.params.points);
  // Thread faces only: everything that is neither a plane nor a cylinder.
  const flanks = (body: MeasuredBody, up: 1 | -1) => {
    const kinds = new Map(body.faces.faces.map((face) => [face.name, face.planeNormal ? 'plane' : face.cylinder ? 'cylinder' : 'other']));
    const all = downFaces(body, up).faces.filter((face) => kinds.get(face.face) === 'other');
    return { maxAngle: Math.max(0, ...all.map((face) => face.maxAngle)), over45: all.reduce((sum, face) => sum + face.over45, 0), over40: all.reduce((sum, face) => sum + face.over40, 0), faces: all.slice(0, 6).map((face) => `${face.face}: ${String(face.maxAngle)}° ${String(face.over45)} mm²`) };
  };
  const jar = bodies.find((body) => body.name === 'Jar');
  const cap = bodies.find((body) => body.name === 'Cap');
  return {
    tool: answer,
    args,
    seconds,
    ...summary,
    sections,
    flanks: { Jar: jar ? flanks(jar, 1) : null, Cap: cap ? flanks(cap, -1) : null },
    rays: {
      // Up through both threads at the middle of the neck's thread depth, at the angle where both coils start.
      upInThread: segments(ray(bodies, [r + 0.55, 0, 20], [0, 0, 1])),
      upInGap: segments(ray(bodies, [r + 0.05, 0, 20], [0, 0, 1])),
      // Out from the axis at four heights 1 mm apart, the same angle.
      ...Object.fromEntries([31, 32, 33, 34].map((z) => [`out${String(z)}`, segments(ray(bodies, [0, 0, z], [1, 0, 0]))])),
      top: segments(ray(bodies, [0, 0, 39], [0, 0, 1])),
    },
  };
}

test('T6, T11, lid: default and limits', async () => {
  for (const diameter of [16, 20, 24, 25, 40, 77, 78, 200]) await scene(`lid-d${String(diameter)}`, 0.4, (audit) => builtLid(audit, diameter));
  await scene('lid-d40-starts3', 0.4, (audit) => builtLid(audit, 40, { starts: 3 }));
  await scene('lid-d40-starts2', 0.4, (audit) => builtLid(audit, 40, { starts: 2 }));
  await scene('lid-d40-gap02', 0.4, (audit) => builtLid(audit, 40, { gap: 0.2 }));
  await scene('lid-d40-gap06', 0.4, (audit) => builtLid(audit, 40, { gap: 0.6 }));
  await scene('lid-d40-n08', 0.8, (audit) => builtLid(audit, 40));
  // The neck must be plain over the skirt (11.25 mm at 40 mm): a jar only 8 mm high.
  await scene('lid-short-jar', 0.4, async (audit) => {
    await audit.batch([{ command: 'solid.cylinder', params: { diameter: 40, height: 8, base: [0, 0, 0], operation: 'new', body_name: 'Jar' } }]);
    const answer = await tool(audit, { kind: 'lid', fixed: 'Jar', moving: 'Cap', from: [0, 0, 8], diameter: 40 });
    return { tool: answer, ...(await summarize(audit, ['Jar', 'Cap'], { up: { Jar: 1, Cap: -1 }, profiles: ['pla04'] })) };
  });
  // The diameter given does not match the neck: 40 said, 44 built.
  await scene('lid-wrong-diameter', 0.4, async (audit) => {
    await audit.batch([{ command: 'solid.cylinder', params: { diameter: 44, height: 40, base: [0, 0, 0], operation: 'new', body_name: 'Jar' } }]);
    const answer = await tool(audit, { kind: 'lid', fixed: 'Jar', moving: 'Cap', from: [0, 0, 40], diameter: 40 });
    return { tool: answer, ...(await summarize(audit, ['Jar', 'Cap'], { up: { Jar: 1, Cap: -1 }, profiles: ['pla04'] })) };
  });
  await scene('lid-refused', 0.4, async (audit) => {
    await audit.batch([{ command: 'solid.cylinder', params: { diameter: 40, height: 40, base: [0, 0, 0], operation: 'new', body_name: 'Jar' } }, box('Other', [60, 0, 0], [10, 10, 10])]);
    const a = { kind: 'lid', fixed: 'Jar', moving: 'Cap', from: [0, 0, 40], diameter: 40 };
    return { refused: await refused(audit, [{ ...a, diameter: 15.9 }, { ...a, diameter: 200.1 }, { ...a, starts: 4 }, { ...a, starts: 0 }, { ...a, gap: 0.19 }, { ...a, gap: 0.61 }, { ...a, moving: 'Other' }, { ...a, moving: 'Jar' }, { ...a, fixed: 'None' }, { kind: 'lid', fixed: 'Jar', moving: 'Cap', from: [0, 0, 40] }]) };
  });
});

// ---- snap ------------------------------------------------------------------------------------------------------------

async function builtSnap(audit: Audit, wall: number, extra: Record<string, unknown> = {}) {
  // The wall stands 0.5 mm above the plate, so the smallest gap is the hook's, not the seat of the cover.
  await audit.batch([box('Base', [0, 0, 0], [40, 40, 3]), box('Cover', [20, 0, 3.5], [wall, 40, 20])]);
  const args = { kind: 'snap', fixed: 'Base', moving: 'Cover', from: [20, 20, 3], to: [22, 20, 3], wall, ...extra };
  const answer = await tool(audit, args);
  const summary = await summarize(audit, ['Base', 'Cover'], { profiles: ['pla04', 'pla06'] });
  const bodies = measuredOf(summary);
  return {
    tool: answer,
    args,
    ...summary,
    rays: {
      arm: segments(ray(bodies, [10, 20, 9], [1, 0, 0])),
      catch: segments(ray(bodies, [10, 20, 14.25], [1, 0, 0])),
      // Up through the catch 0.4 mm inside the wall: window edge, seat, catch, air, window top.
      upInWindow: segments(ray(bodies, [20.4, 20, 4], [0, 0, 1])),
      acrossWindow: segments(ray(bodies, [20.4, 10, 14.25], [0, 1, 0])),
      upArm: segments(ray(bodies, [19, 20, -1], [0, 0, 1])),
    },
  };
}

test('snap: default and limits', async () => {
  await scene('snap-default', 0.4, (audit) => builtSnap(audit, 2));
  await scene('snap-wall-1_6', 0.4, (audit) => builtSnap(audit, 1.6));
  await scene('snap-wall-10', 0.4, (audit) => builtSnap(audit, 10));
  await scene('snap-more-2', 0.4, (audit) => builtSnap(audit, 2, { more: [[20, 8, 3], [20, 32, 3]] }));
  await scene('snap-default-n06', 0.6, (audit) => builtSnap(audit, 2));
  // The wall said thinner than it is: the window does not go through.
  await scene('snap-wall-said-2-is-4', 0.4, async (audit) => {
    await audit.batch([box('Base', [0, 0, 0], [40, 40, 3]), box('Cover', [20, 0, 3.5], [4, 40, 20])]);
    const answer = await tool(audit, { kind: 'snap', fixed: 'Base', moving: 'Cover', from: [20, 20, 3], to: [22, 20, 3], wall: 2 });
    const summary = await summarize(audit, ['Base', 'Cover'], { profiles: ['pla04'] });
    return { tool: answer, ...summary, rays: { catch: segments(ray(measuredOf(summary), [10, 20, 14.25], [1, 0, 0])) } };
  });
  // A wall only 10 mm high: the window (13.3 to 15.5 above the foot) lies above it.
  await scene('snap-low-wall', 0.4, async (audit) => {
    await audit.batch([box('Base', [0, 0, 0], [40, 40, 3]), box('Cover', [20, 0, 3.5], [2, 40, 10])]);
    const answer = await tool(audit, { kind: 'snap', fixed: 'Base', moving: 'Cover', from: [20, 20, 3], to: [22, 20, 3], wall: 2 });
    return { tool: answer, ...(await summarize(audit, ['Base', 'Cover'], { profiles: ['pla04'] })) };
  });
  await scene('snap-refused', 0.4, async (audit) => {
    await audit.batch([box('Base', [0, 0, 0], [40, 40, 3]), box('Cover', [20, 0, 3.5], [2, 40, 20])]);
    const a = { kind: 'snap', fixed: 'Base', moving: 'Cover', from: [20, 20, 3], to: [22, 20, 3], wall: 2 };
    return { refused: await refused(audit, [{ ...a, wall: 1.5 }, { ...a, wall: 10.1 }, { ...a, up: [0, 0, 0] }, { ...a, to: [20, 20, 9] }, { ...a, more: Array.from({ length: 21 }, (_, i) => [20, i, 3]) }, { ...a, moving: 'Base' }]) };
  });
});

// ---- plug (pegs) ------------------------------------------------------------------------------------------------------

async function builtPeg(audit: Audit, diameter: number, extra: Record<string, unknown> = {}, topHigh = 1.5 * diameter + 6) {
  const side = Math.max(30, 3 * diameter);
  await audit.batch([box('Base', [0, 0, 0], [side, side, 10]), box('Top', [0, 0, 10], [side, side, topHigh])]);
  const args = { kind: 'plug', fixed: 'Base', moving: 'Top', from: [side / 2, side / 2, 10], to: [side / 2, side / 2, 15], ...extra };
  const answer = await tool(audit, args);
  const summary = await summarize(audit, ['Base', 'Top'], { up: { Base: 1, Top: -1 }, profiles: ['pla04', 'pla06'] });
  const bodies = measuredOf(summary);
  return {
    tool: answer,
    args,
    ...summary,
    cylinders: Object.fromEntries(bodies.map((body) => [body.name, cylinders(body).map((c) => `${c.face} Ø${String(c.diameter)}`)])),
    rays: { across: segments(ray(bodies, [-1, side / 2, 10 + 0.75 * diameter], [1, 0, 0])), axis: segments(ray(bodies, [side / 2, side / 2, -1], [0, 0, 1])), mouth: segments(ray(bodies, [-1, side / 2, 10.1], [1, 0, 0])) },
  };
}

test('plug with pegs: default and limits', async () => {
  await scene('peg-default', 0.4, (audit) => builtPeg(audit, 5));
  await scene('peg-d3-gap005', 0.4, (audit) => builtPeg(audit, 3, { diameter: 3, gap: 0.05 }));
  await scene('peg-d20-gap05', 0.4, (audit) => builtPeg(audit, 20, { diameter: 20, gap: 0.5 }));
  await scene('peg-more-1', 0.4, (audit) => builtPeg(audit, 5, { more: [[5, 5, 10]] }));
  // The moving body thinner than the pocket is deep (8.5 mm at 5 mm): 6 mm.
  await scene('peg-top-6', 0.4, (audit) => builtPeg(audit, 5, {}, 6));
  await scene('peg-refused', 0.4, async (audit) => {
    await audit.batch([box('Base', [0, 0, 0], [30, 30, 10]), box('Top', [0, 0, 10], [30, 30, 14])]);
    const a = { kind: 'plug', fixed: 'Base', moving: 'Top', from: [15, 15, 10], to: [15, 15, 15] };
    return { refused: await refused(audit, [{ ...a, diameter: 2.9 }, { ...a, diameter: 20.1 }, { ...a, gap: 0.04 }, { ...a, gap: 0.51 }, { ...a, shape: 'square' }, { ...a, more: Array.from({ length: 21 }, (_, i) => [i, 1, 10]) }, { ...a, moving: 'Base' }]) };
  });
});

// ---- latch -----------------------------------------------------------------------------------------------------------

async function builtLatch(audit: Audit, boxHigh: number, lidHigh: number, extra: Record<string, unknown> = {}) {
  await audit.batch([box('Box', [0, 0, 0], [60, 40, boxHigh]), box('Lid', [0, 0, boxHigh], [60, 40, lidHigh])]);
  const args = { kind: 'latch', fixed: 'Box', moving: 'Lid', from: [30, 0, boxHigh], to: [30, -5, boxHigh], ...extra };
  const answer = await tool(audit, args);
  const summary = await summarize(audit, ['Box', 'Lid'], { up: { Box: 1, Lid: -1 }, profiles: ['pla04', 'pla06'] });
  const bodies = measuredOf(summary);
  const towards = (dz: number) => segments(ray(bodies, [30, -8, boxHigh + dz], [0, 1, 0])).slice(0, 5);
  return {
    tool: answer,
    args,
    ...summary,
    // Towards the wall at heights measured from the joint: arm above the joint, arm alone, bead's crest, hook's crest, finger tab.
    rays: { root3: towards(3), arm_m5: towards(-5), bead_m10_2: towards(-10.2), between_m10_6: towards(-10.6), hook_m11: towards(-11), tab_m13: towards(-13), upArm: segments(ray(bodies, [30, -2.3, -20], [0, 0, 1])) },
  };
}

test('latch: default and limits', async () => {
  await scene('latch-default', 0.4, (audit) => builtLatch(audit, 20, 10));
  await scene('latch-width-5', 0.4, (audit) => builtLatch(audit, 20, 10, { width: 5 }));
  await scene('latch-width-40', 0.4, (audit) => builtLatch(audit, 20, 10, { width: 40 }));
  await scene('latch-default-n06', 0.6, (audit) => builtLatch(audit, 20, 10));
  // Less flat wall than the text asks for: the lid 6 mm high (8.1 needed), the box 10 mm high (14.1 needed).
  await scene('latch-lid-6', 0.4, (audit) => builtLatch(audit, 20, 6));
  await scene('latch-box-10', 0.4, (audit) => builtLatch(audit, 10, 10));
  await scene('latch-refused', 0.4, async (audit) => {
    await audit.batch([box('Box', [0, 0, 0], [60, 40, 20]), box('Lid', [0, 0, 20], [60, 40, 10])]);
    const a = { kind: 'latch', fixed: 'Box', moving: 'Lid', from: [30, 0, 20], to: [30, -5, 20] };
    return { refused: await refused(audit, [{ ...a, width: 4.9 }, { ...a, width: 40.1 }, { ...a, up: [0, 0, 0] }, { ...a, to: [30, 0, 25] }, { ...a, moving: 'Box' }]), bodies: await bodiesOf(audit) };
  });
});
