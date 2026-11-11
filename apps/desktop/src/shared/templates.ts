/**
 * Templates (plan step F3): parametric starting points built with SolidCraft's own commands. Every
 * size is a user parameter (`parameters.add`) and the geometry refers to it by expression, so the
 * parameter panel changes a template without the assistant. Each was built and changed with
 * `solidcraft-cli eval` and stays printable as designed, Z up, without support.
 *
 * `solid.hole` keeps a position given as expressions but does not move with it (0.40.0-rc.2: the
 * hole stays where it was placed and warns), so plain holes are cut cylinders, which follow, and
 * countersunk holes are drilled at sketch points, which follow too.
 *
 * Parts that move take their geometry from the mechanisms the assistant uses (`mechanisms.ts`) and
 * are joined in the script itself: SolidCraft takes a component by the name of its body
 * (0.40.0-rc.4), so no occurrence id has to be read first.
 */

import { hingeSteps } from './mechanisms';

export const TEMPLATE_IDS = ['hingedBox', 'housing', 'wallHolder', 'cableClip', 'adapter'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

type Step = { command: string; params: Record<string, unknown> };
type Expr = string | number;
type Vec3 = [number, number, number];

/** A user parameter with its starting value and what it means; the assistant reads the comment. */
const parameter = (name: string, expression: string, comment: string): Step => ({ command: 'parameters.add', params: { name, expression, comment } });

/** The gap between parts printed side by side, so they are separate objects in the slicer. */
const BESIDE = '10 mm';

/**
 * Makes the two bodies components and joins them where they stand, the fixed one grounded. Each side
 * is a round wall of its own body, which SolidCraft keeps by name: the joint then follows both when the
 * sizes change (0.40.0-rc.4: `joint.as_built` at a point stays behind, and kept on one body only it
 * shifts the other). The two ends face each other `offset` apart. `limits` is the range clear of
 * contact, found with `joint.sweep` at the starting sizes.
 */
const joined = (type: 'revolute' | 'slider', fixed: string, moving: string, on: { fixed: Vec3; moving: Vec3; offset: number }, name: string, limits: [number, number]): Step[] => {
  const origin = (occurrence: string, circle: Vec3) => ({ occurrence, circle, x: [0, 0, 1] });
  return [
    { command: 'component.from_bodies', params: { bodies: [fixed, moving] } },
    { command: 'joint.create', params: { type, a: origin(fixed, on.fixed), b: origin(moving, on.moving), offset: on.offset, name, limits: [limits], quiet: true } },
  ];
};

/**
 * Two halves of one height side by side, open side up, with a print-in-place hinge on the rims
 * between them: the lid turns half a turn onto the box. The hinge keeps its length and stays in the
 * middle of the long side and on the rim when the sizes change.
 */
function hingedBox(): Step[] {
  // The room between the halves; the hinge line runs in its middle, within reach of both walls.
  const between = 1;
  const [length, width, height, hinge] = [60, 40, 16, 40];
  const [diameter, gap, knuckles] = [8, 0.4, 5];
  const start = (length - hinge) / 2;
  const knuckle = (hinge - (knuckles - 1) * gap) / knuckles;
  const top = height + diameter / 2;
  // The outside of the lid's front wall, away from the hinge.
  const front = between + width;
  const shell = (body: string, y: Expr, y0: number, feature: (name: string) => string): Step[] => [
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'height', corner: [0, y, 0], operation: 'new', body_name: body, name: body } },
    // Edges by a point on them at the starting sizes; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[0, y0, 8], [length, y0, 8], [0, y0 + width, 8], [length, y0 + width, 8]], radius: 'corner', body, name: feature('corners') } },
    { command: 'solid.shell', params: { faces: [[length / 2, y0 + width / 2, height]], thickness: 'wall', body, name: feature('hollow') } },
    { command: 'solid.chamfer', params: { edges: [[length / 2, y0, 0]], distance: '0.6 mm', body, name: feature('bed chamfer') } },
  ];
  return [
    parameter('length', '60 mm', 'Outer length of box and lid; at least 54 mm, the hinge is 40 mm long'),
    parameter('width', '40 mm', 'Outer width of box and lid'),
    parameter('height', '16 mm', 'Height of each half; closed, the box is twice as high. At least 15 mm, for the latch'),
    parameter('wall', '2 mm', 'Wall and floor thickness'),
    parameter('corner', '5 mm', 'Radius of the outer corners of box and lid'),
    ...shell('Box', '-width', -width, (name) => `Box ${name}`),
    ...shell('Lid', between, between, (name) => `Lid ${name}`),
    // The latch: an arm on the lid's front, standing on a foot outside its wall, 0.3 mm clear of the box's wall
    // once closed. Its catch reaches 0.5 mm into a window in the box, whose upper edge prints as a short
    // bridge; both flanks of the catch slope, so it prints without support and the lid pulls open again.
    // Boxes over the parameters, not `plastic.snap_fit`: that keeps the place it was put (0.40.0-rc.4).
    { command: 'solid.box', params: { length: '8 mm', width: '1.8 mm', height: '4 mm', corner: ['length / 2 - 4 mm', 'width + 1 mm', 'height - 4 mm'], operation: 'join', targets: ['Lid'], name: 'Latch foot' } },
    { command: 'solid.chamfer', params: { edges: [[length / 2, front + 1.8, height - 4]], distance: '1.7 mm', body: 'Lid', name: 'Latch foot slope' } },
    { command: 'solid.box', params: { length: '6 mm', width: '1.5 mm', height: '12 mm', corner: ['length / 2 - 3 mm', 'width + 1.3 mm', 'height'], operation: 'join', targets: ['Lid'], name: 'Latch arm' } },
    { command: 'solid.box', params: { length: '6 mm', width: '0.8 mm', height: '2 mm', corner: ['length / 2 - 3 mm', 'width + 0.5 mm', 'height + 10 mm'], operation: 'join', targets: ['Lid'], name: 'Latch catch' } },
    { command: 'solid.chamfer', params: { edges: [[length / 2, front - 0.5, height + 10], [length / 2, front - 0.5, height + 12]], distance: '0.75 mm', body: 'Lid', name: 'Latch catch slopes' } },
    { command: 'solid.box', params: { length: '7 mm', width: 'wall + 2 mm', height: '2.7 mm', corner: ['length / 2 - 3.5 mm', '-width - 1 mm', 'height - 12.4 mm'], operation: 'cut', targets: ['Box'], name: 'Latch window' } },
    // The hinge of the mechanism tool, built at the starting sizes, then tied to the parameters.
    ...hingeSteps({ fixed: 'Box', moving: 'Lid', from: [start, between / 2, height], to: [start + hinge, between / 2, height], diameter, gap, knuckles, name: 'Hinge' }).map((step) => {
      const [x, y] = step.params.base as Vec3;
      return { ...step, params: { ...step.params, base: [`length / 2 + ${String(x - length / 2)} mm`, y, 'height'] } };
    }),
    // It turns until the catch meets the box's wall at 177°; the last 3° are the latch snapping in by hand.
    // Where the first knuckle of the box faces the first of the lid: a point on top of each barrel, near that end.
    ...joined('revolute', 'Box', 'Lid', { fixed: [start + knuckle - 0.5, between / 2, top], moving: [start + knuckle + gap + 0.5, between / 2, top], offset: gap }, 'Hinge', [0, 177]),
  ];
}

/** A slot through a housing ear at x: a box with a round end on both sides, so the screw can shift 4.5 mm along the wall. */
function earSlot(x: string, n: number): Step[] {
  const cut = { operation: 'cut', targets: ['Housing'] };
  return [
    { command: 'solid.box', params: { length: '4.5 mm', width: '4.5 mm', height: '6 mm', corner: [x + ' - 2.25 mm', 'width / 2 - 2.25 mm', '-1 mm'], ...cut, name: 'Ear slot ' + String(n) } },
    { command: 'solid.cylinder', params: { diameter: '4.5 mm', height: '6 mm', base: [x, 'width / 2 - 2.25 mm', '-1 mm'], ...cut, name: 'Ear slot ' + String(n) + ' end 1' } },
    { command: 'solid.cylinder', params: { diameter: '4.5 mm', height: '6 mm', base: [x, 'width / 2 + 2.25 mm', '-1 mm'], ...cut, name: 'Ear slot ' + String(n) + ' end 2' } },
  ];
}

function housing(): Step[] {
  // The bosses reach half a millimetre into both walls, so they join them in a face, not a line.
  const c = '(wall + boss / 2 - 0.5 mm)';
  const corners: [Expr, Expr][] = [
    [c, c],
    [`length - ${c}`, c],
    [c, `width - ${c}`],
    [`length - ${c}`, `width - ${c}`],
  ];
  const lidY = `width + ${BESIDE}`;
  return [
    parameter('length', '80 mm', 'Outer length of housing and lid'),
    parameter('width', '60 mm', 'Outer width of housing and lid'),
    parameter('height', '30 mm', 'Outer height of the housing without the lid'),
    parameter('wall', '2 mm', 'Wall, floor and lid thickness'),
    parameter('boss', '8 mm', 'Diameter of the screw bosses in the corners'),
    parameter('insert_hole', '4 mm', 'Hole for an M3 heat-set insert (ruthex: 4 mm)'),
    parameter('insert_depth', '6.7 mm', 'Depth of that hole: insert length plus 1 mm'),
    parameter('screw_hole', '3.4 mm', 'Hole in the lid for the M3 screws (ISO 273, normal)'),
    parameter('corner', '6 mm', 'Radius of the outer corners of housing and lid'),
    parameter('ear', '12 mm', 'How far the screw ears reach out on the short sides'),
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'height', operation: 'new', body_name: 'Housing', name: 'Housing' } },
    // Edges by a point on them at the starting sizes; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[0, 0, 15], [80, 0, 15], [0, 60, 15], [80, 60, 15]], radius: 'corner', body: 'Housing', name: 'Corner radius' } },
    { command: 'solid.shell', params: { faces: ['F1:+z'], thickness: 'wall', body: 'Housing', name: 'Hollow' } },
    // Against elephant's foot on the bed, and a soft rim where the lid sits.
    { command: 'solid.chamfer', params: { edges: [[40, 0, 0]], distance: '0.6 mm', body: 'Housing', name: 'Bed chamfer' } },
    { command: 'solid.fillet', params: { edges: [[40, 0, 30]], radius: '0.6 mm', body: 'Housing', name: 'Rim radius' } },
    // Vent slots in the long walls: upright, so their tops bridge only 2 mm.
    ...[-3, -2, -1, 0, 1, 2, 3].flatMap((i) =>
      ['-1 mm', 'width - wall - 1 mm'].map((y, side) => ({
        command: 'solid.box',
        params: { length: '2 mm', width: 'wall + 2 mm', height: 'height * 0.4', corner: [`length / 2 + ${String(i)} * 5 mm - 1 mm`, y, 'height * 0.3'], operation: 'cut', targets: ['Housing'], name: `Vent ${side ? 'back' : 'front'} ${String(i + 4)}` },
      })),
    ),
    // Ears on the short sides, with slots for two screws into a wall or a board.
    ...(['-ear', 'length'] as const).map((x, i) => ({
      command: 'solid.box',
      params: { length: 'ear', width: '22 mm', height: '4 mm', corner: [x, 'width / 2 - 11 mm', 0], operation: 'join', targets: ['Housing'], name: `Ear ${String(i + 1)}` },
    })),
    { command: 'solid.fillet', params: { edges: [[-12, 19, 2], [-12, 41, 2], [92, 19, 2], [92, 41, 2]], radius: '5 mm', body: 'Housing', name: 'Ear corners' } },
    { command: 'solid.fillet', params: { edges: [[-12, 30, 4], [92, 30, 4]], radius: '1 mm', body: 'Housing', name: 'Ear edges' } },
    ...earSlot('-ear / 2', 1),
    ...earSlot('length + ear / 2', 2),
    ...corners.map(([x, y], i) => ({ command: 'solid.cylinder', params: { diameter: 'boss', height: 'height - wall', base: [x, y, 'wall'], operation: 'join', targets: ['Housing'], name: `Boss ${String(i + 1)}` } })),
    ...corners.map(([x, y], i) => ({
      command: 'solid.cylinder',
      params: { diameter: 'insert_hole', height: 'insert_depth', base: [x, y, 'height - insert_depth'], operation: 'cut', targets: ['Housing'], name: `Insert ${String(i + 1)}` },
    })),
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'wall', corner: [0, lidY, 0], operation: 'new', body_name: 'Lid', name: 'Lid' } },
    { command: 'solid.fillet', params: { edges: [[0, 70, 1], [80, 70, 1], [0, 130, 1], [80, 130, 1]], radius: 'corner', body: 'Lid', name: 'Lid corners' } },
    { command: 'solid.chamfer', params: { edges: [[40, 70, 0]], distance: '0.6 mm', body: 'Lid', name: 'Lid bed chamfer' } },
    { command: 'solid.fillet', params: { edges: [[40, 70, 2]], radius: '0.8 mm', body: 'Lid', name: 'Lid edge radius' } },
    ...corners.map(([x, y], i) => ({
      command: 'solid.cylinder',
      params: { diameter: 'screw_hole', height: 'wall', base: [x, `${lidY} + ${String(y)}`, 0], operation: 'cut', targets: ['Lid'], name: `Screw hole ${String(i + 1)}` },
    })),
  ];
}

function wallHolder(): Step[] {
  return [
    parameter('plate_height', '100 mm', 'Height of the plate on the wall'),
    parameter('plate_width', '50 mm', 'Width of the holder'),
    parameter('wall', '6 mm', 'Thickness of plate, floor and lip'),
    parameter('hook_width', '40 mm', 'Room between plate and lip'),
    parameter('lip_height', '25 mm', 'Height of the front lip'),
    parameter('screw_hole', '4.5 mm', 'Hole for the wall screws (4 mm wood screws)'),
    parameter('screw_head', '9 mm', 'Diameter of the countersink for their heads'),
    { command: 'solid.box', params: { length: 'plate_width', width: 'wall', height: 'plate_height', operation: 'new', body_name: 'Wall holder', name: 'Plate' } },
    {
      command: 'solid.box',
      params: { length: 'plate_width', width: 'hook_width + wall', height: 'wall', center: ['plate_width / 2', 'wall + (hook_width + wall) / 2', 'wall / 2'], operation: 'join', name: 'Floor' },
    },
    { command: 'solid.box', params: { length: 'plate_width', width: 'wall', height: 'lip_height', corner: [0, 'wall + hook_width', 0], operation: 'join', name: 'Lip' } },
    // The screw heads sit in front: points on the plate's front face (sketch x runs along -X there,
    // y up), drilled into the plate with the countersink on that face.
    { command: 'sketch.create', params: { plane: { face: [25, 6, 80] }, project_edges: false, name: 'Screw points' } },
    { command: 'sketch.point', params: { point: ['-plate_width / 2', 'plate_height * 0.8'] } },
    { command: 'sketch.point', params: { point: ['-plate_width / 2', 'plate_height * 0.4'] } },
    { command: 'solid.hole', params: { sketch: 'Screw points', diameter: 'screw_hole', type: 'countersink', cs_diameter: 'screw_head', cs_angle: '90 deg', name: 'Countersunk holes' } },
    // Edges by a point on them; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[25, 6, 6]], radius: '2 mm', name: 'Inner radius' } },
    { command: 'solid.fillet', params: { edges: [[0, 3, 100], [50, 3, 100]], radius: '5 mm', name: 'Outer corners' } },
    { command: 'solid.fillet', params: { edges: [[0, 49, 25], [50, 49, 25]], radius: '3 mm', name: 'Lip corners' } },
    { command: 'solid.fillet', params: { edges: [[25, 52, 0]], radius: '5 mm', name: 'Outer bend' } },
    { command: 'solid.fillet', params: { edges: [[25, 46, 25], [25, 52, 25], [25, 6, 100]], radius: '1.2 mm', name: 'Soft edges' } },
    // A slot in the floor: water runs out, a cable can pass.
    { command: 'solid.box', params: { length: 'plate_width * 0.4', width: '6 mm', height: 'wall + 2 mm', corner: ['plate_width * 0.3', 'wall + hook_width / 2 - 3 mm', '-1 mm'], operation: 'cut', name: 'Floor slot' } },
    { command: 'solid.cylinder', params: { diameter: '6 mm', height: 'wall + 2 mm', base: ['plate_width * 0.3', 'wall + hook_width / 2', '-1 mm'], operation: 'cut', name: 'Floor slot end 1' } },
    { command: 'solid.cylinder', params: { diameter: '6 mm', height: 'wall + 2 mm', base: ['plate_width * 0.7', 'wall + hook_width / 2', '-1 mm'], operation: 'cut', name: 'Floor slot end 2' } },
  ];
}

function cableClip(): Step[] {
  const axis = 'cable / 2 + wall';
  return [
    parameter('cable', '6 mm', 'Diameter of the cable'),
    parameter('wall', '1.6 mm', 'Wall of the clip'),
    parameter('width', '8 mm', 'Width of the clip along the cable'),
    parameter('tab', '10 mm', 'Length of the tab with the screw hole'),
    parameter('screw_hole', '3.4 mm', 'Hole for an M3 screw (ISO 273, normal)'),
    { command: 'solid.cylinder', params: { diameter: 'cable + 2 * wall', height: 'width', base: [0, 0, axis], axis: 'Y', operation: 'new', body_name: 'Cable clip', name: 'Ring' } },
    { command: 'solid.box', params: { length: `${axis} + tab`, width: 'width', height: 'wall', corner: [0, 0, 0], operation: 'join', name: 'Tab' } },
    { command: 'solid.cylinder', params: { diameter: 'cable', height: 'width', base: [0, 0, axis], axis: 'Y', operation: 'cut', name: 'Cable' } },
    // The opening is 80 % of the cable: it snaps in and stays.
    { command: 'solid.box', params: { length: 'cable * 0.8', width: 'width', height: axis, corner: ['-cable * 0.4', 0, axis], operation: 'cut', name: 'Opening' } },
    { command: 'solid.cylinder', params: { diameter: 'screw_hole', height: 'wall', base: [`${axis} + tab / 2`, 'width / 2', 0], operation: 'cut', name: 'Screw hole' } },
    // Edges by a point on them at the starting sizes; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[14.6, 0, 0.8], [14.6, 8, 0.8]], radius: '3 mm', name: 'Tab corners' } },
    { command: 'solid.fillet', params: { edges: [[3.49, 4, 1.6]], radius: '1.5 mm', name: 'Root radius' } },
  ];
}

function adapter(): Step[] {
  const top = 'length_a + transition';
  const end = `${top} + length_b`;
  return [
    parameter('inner_a', '32 mm', 'Inner diameter at the bottom end'),
    parameter('inner_b', '20 mm', 'Inner diameter at the top end'),
    parameter('wall', '2 mm', 'Wall thickness'),
    parameter('length_a', '25 mm', 'Length of the bottom end'),
    parameter('length_b', '25 mm', 'Length of the top end'),
    parameter('transition', '15 mm', 'Length of the cone; at least half the difference of the diameters, so it prints without support'),
    { command: 'sketch.create', params: { plane: 'YZ', name: 'Profile' } },
    {
      command: 'sketch.line',
      params: {
        closed: true,
        points: [
          ['inner_a / 2', 0],
          ['inner_a / 2', 'length_a'],
          ['inner_b / 2', top],
          ['inner_b / 2', end],
          ['inner_b / 2 + wall', end],
          ['inner_b / 2 + wall', top],
          ['inner_a / 2 + wall', 'length_a'],
          ['inner_a / 2 + wall', 0],
        ],
      },
    },
    { command: 'solid.revolve', params: { axis: 'Z', body_name: 'Adapter', name: 'Adapter' } },
    // Edges by a point on them at the starting sizes; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[0, 18, 25], [0, 12, 40]], radius: '4 mm', name: 'Soft transition' } },
    { command: 'solid.chamfer', params: { edges: [[0, 18, 0], [0, 12, 65], [0, 16, 0], [0, 10, 65]], distance: '0.6 mm', name: 'End chamfers' } },
  ];
}

const BUILDERS: Record<TemplateId, () => Step[]> = { hingedBox, housing, wallHolder, cableClip, adapter };

/** The parameter comments in German (polish round 2); names stay the same, so expressions and the assistant find them. */
const GERMAN: Record<string, string> = {
  'Outer length of box and lid; at least 54 mm, the hinge is 40 mm long': 'Außenlänge von Box und Deckel; mindestens 54 mm, das Scharnier ist 40 mm lang',
  'Outer width of box and lid': 'Außenbreite von Box und Deckel',
  'Height of each half; closed, the box is twice as high. At least 15 mm, for the latch': 'Höhe jeder Hälfte; geschlossen ist die Box doppelt so hoch. Mindestens 15 mm, für den Verschluss',
  'Wall and floor thickness': 'Stärke von Wand und Boden',
  'Wall, floor and lid thickness': 'Stärke von Wand, Boden und Deckel',
  'Outer length of housing and lid': 'Außenlänge von Gehäuse und Deckel',
  'Outer width of housing and lid': 'Außenbreite von Gehäuse und Deckel',
  'Outer height of the housing without the lid': 'Außenhöhe des Gehäuses ohne Deckel',
  'Diameter of the screw bosses in the corners': 'Durchmesser der Schraubdome in den Ecken',
  'Hole for an M3 heat-set insert (ruthex: 4 mm)': 'Loch für eine M3-Einschmelzmutter (ruthex: 4 mm)',
  'Depth of that hole: insert length plus 1 mm': 'Tiefe dieses Lochs: Länge der Mutter plus 1 mm',
  'Hole in the lid for the M3 screws (ISO 273, normal)': 'Loch im Deckel für die M3-Schrauben (ISO 273, mittel)',
  'Radius of the outer corners of box and lid': 'Radius der Außenecken von Box und Deckel',
  'Radius of the outer corners of housing and lid': 'Radius der Außenecken von Gehäuse und Deckel',
  'How far the screw ears reach out on the short sides': 'Wie weit die Schraublaschen an den Schmalseiten abstehen',
  'Height of the plate on the wall': 'Höhe der Platte an der Wand',
  'Width of the holder': 'Breite des Halters',
  'Thickness of plate, floor and lip': 'Stärke von Platte, Boden und Rand',
  'Room between plate and lip': 'Platz zwischen Platte und Rand',
  'Height of the front lip': 'Höhe des vorderen Rands',
  'Hole for the wall screws (4 mm wood screws)': 'Loch für die Wandschrauben (4-mm-Holzschrauben)',
  'Diameter of the countersink for their heads': 'Durchmesser der Senkung für ihre Köpfe',
  'Diameter of the cable': 'Durchmesser des Kabels',
  'Wall of the clip': 'Wand des Clips',
  'Width of the clip along the cable': 'Breite des Clips entlang des Kabels',
  'Length of the tab with the screw hole': 'Länge der Lasche mit dem Schraubloch',
  'Hole for an M3 screw (ISO 273, normal)': 'Loch für eine M3-Schraube (ISO 273, mittel)',
  'Inner diameter at the bottom end': 'Innendurchmesser am unteren Ende',
  'Inner diameter at the top end': 'Innendurchmesser am oberen Ende',
  'Wall thickness': 'Wandstärke',
  'Length of the bottom end': 'Länge des unteren Endes',
  'Length of the top end': 'Länge des oberen Endes',
  'Length of the cone; at least half the difference of the diameters, so it prints without support': 'Länge des Kegels; mindestens die halbe Durchmesser-Differenz, damit er ohne Stützen druckt',
};

/** The body names in German (polish round 3); every step that names a body follows. */
const GERMAN_BODIES: Record<string, string> = { Box: 'Box', Lid: 'Deckel', Housing: 'Gehäuse', 'Wall holder': 'Wandhalter', 'Cable clip': 'Kabelclip', Adapter: 'Adapter' };

/** Feature and sketch names in German, so the timeline speaks the tree's language (audit B-03). */
const GERMAN_FEATURES: Record<string, string> = {
  ...GERMAN_BODIES,
  'Bed chamfer': 'Fase am Bett',
  'Box bed chamfer': 'Box-Fase am Bett',
  'Box corners': 'Box-Ecken',
  'Box hollow': 'Box aushöhlen',
  Cable: 'Kabel',
  'Corner radius': 'Eckenradius',
  'Countersunk holes': 'Senkbohrungen',
  Ear: 'Lasche',
  'Ear corners': 'Laschenecken',
  'Ear edges': 'Laschenkanten',
  'Ear slot': 'Laschenschlitz',
  'End chamfers': 'Endfasen',
  Floor: 'Boden',
  Hinge: 'Scharnier',
  'Floor slot': 'Bodenschlitz',
  Hollow: 'Aushöhlen',
  Boss: 'Schraubdom',
  'Inner radius': 'Innenradius',
  'Latch arm': 'Verschlussarm',
  'Latch catch': 'Rastnase',
  'Latch catch slopes': 'Rastnasen-Schrägen',
  'Latch foot': 'Verschlussfuß',
  'Latch foot slope': 'Verschlussfuß-Schräge',
  'Latch window': 'Rastfenster',
  Insert: 'Einschmelzmutter',
  'Lid bed chamfer': 'Deckel-Fase am Bett',
  'Lid corners': 'Deckelecken',
  'Lid edge radius': 'Deckel-Kantenradius',
  'Lid hollow': 'Deckel aushöhlen',
  Lip: 'Rand',
  'Lip corners': 'Randecken',
  Opening: 'Öffnung',
  'Outer bend': 'Außenbogen',
  'Outer corners': 'Außenecken',
  Plate: 'Platte',
  Profile: 'Profil',
  'Rim radius': 'Randradius',
  Ring: 'Ring',
  'Root radius': 'Fußradius',
  'Screw hole': 'Schraubloch',
  'Screw points': 'Schraubpunkte',
  'Soft edges': 'Weiche Kanten',
  'Soft transition': 'Weicher Übergang',
  Tab: 'Lasche',
  'Tab corners': 'Laschenecken',
  'Vent back': 'Lüftung hinten',
  'Vent front': 'Lüftung vorn',
};

/** "Ear slot 2 end 1" → "Laschenschlitz 2 Ende 1": the base from the list, numbers and a mechanism's mark (·, ○, ●) kept. */
export function germanFeatureName(name: string): string {
  const match = /^(.*?)((?: \d+)?)((?: end \d+)?)((?: [·○●])?)$/.exec(name);
  const base = match?.[1] ?? name;
  const german = GERMAN_FEATURES[base];
  if (german === undefined) return name;
  return german + (match?.[2] ?? '') + (match?.[3] ?? '').replace(' end ', ' Ende ') + (match?.[4] ?? '');
}

/** A step with its parameter comment, the bodies and the features it names in German. */
function inGerman(step: Step): Step {
  const params = { ...step.params };
  const comment = step.command === 'parameters.add' ? params.comment : undefined;
  if (typeof comment === 'string' && GERMAN[comment]) params.comment = GERMAN[comment];
  const body = (name: unknown) => (typeof name === 'string' ? (GERMAN_BODIES[name] ?? name) : name);
  for (const key of ['body_name', 'body'] as const) if (key in params) params[key] = body(params[key]);
  for (const key of ['targets', 'bodies'] as const) if (Array.isArray(params[key])) params[key] = params[key].map(body);
  // A joint names its two components, which carry their bodies' names.
  for (const key of ['a', 'b'] as const) {
    const origin = params[key] as { occurrence?: unknown } | undefined;
    if (step.command === 'joint.create' && origin) params[key] = { ...origin, occurrence: body(origin.occurrence) };
  }
  // A sketch is referred to by its name, so the reference follows the translation.
  for (const key of ['name', 'sketch'] as const) if (step.command !== 'parameters.add' && typeof params[key] === 'string') params[key] = germanFeatureName(params[key]);
  return { ...step, params };
}

/** The SolidCraft script of a template: its parameters first, then the geometry over them; in German on request. */
export function templateSteps(id: TemplateId, german = false): Step[] {
  const steps = BUILDERS[id]();
  return german ? steps.map(inGerman) : steps;
}
