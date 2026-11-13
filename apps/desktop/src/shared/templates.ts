/**
 * Templates (plan step F3): parametric starting points built with SolidCraft's own commands. Every
 * size is a user parameter (`parameters.add`) and the geometry refers to it by expression, so the
 * parameter panel changes a template without the assistant. Each was built and changed with
 * `solidcraft-cli eval` and stays printable as designed, Z up, without support (the stop of the slide stop on its top:
 * its print face is set).
 *
 * `solid.hole` keeps a position given as expressions but does not move with it (0.40.0-rc.2: the
 * hole stays where it was placed and warns), so plain holes are cut cylinders, which follow, and
 * countersunk holes are drilled at sketch points, which follow too.
 *
 * Parts that move take their geometry from the mechanisms the assistant uses (`mechanisms.ts`) and
 * are joined in the script itself: SolidCraft takes a component by the name of its body
 * (0.40.0-rc.4), so no occurrence id has to be read first.
 */

import { hingeSteps, lipSteps, pinDiameter, printTogether, slideSteps } from './mechanisms';

export const TEMPLATE_IDS = ['hingedBox', 'slideStop', 'housing', 'sign', 'wallHolder'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

type Step = { command: string; params: Record<string, unknown> };
type Expr = string | number;
type Vec3 = [number, number, number];

/** A user parameter with its starting value and what it means; the assistant reads the comment. */
const parameter = (name: string, expression: string, comment: string): Step => ({ command: 'parameters.add', params: { name, expression, comment } });

/** Makes the bodies components, the first one grounded; each is named after its body. */
const components = (...bodies: string[]): Step => ({ command: 'component.from_bodies', params: { bodies } });

/**
 * Joins two components where they stand. Each side is a place on its own body that SolidCraft keeps
 * by name (a round wall, a flat face): the joint then follows both when the sizes change (0.40.0-rc.4:
 * `joint.as_built` at a point stays behind, and kept on one body only it shifts the other). `rest` is
 * what else the joint needs to leave the parts where they are (offset, flip) and its `limits`, the
 * range clear of contact, found with `joint.sweep`.
 */
const joint = (type: 'revolute' | 'slider', fixed: string, moving: string, on: { fixed: Record<string, unknown>; moving: Record<string, unknown> }, rest: Record<string, unknown>, name: string): Step => ({
  command: 'joint.create',
  params: { type, a: { occurrence: fixed, ...on.fixed }, b: { occurrence: moving, ...on.moving }, ...rest, name, quiet: true },
});

/**
 * Two halves of one height side by side, open side up, with a print-in-place hinge on the rims
 * between them: the lid turns half a turn onto the box. The hinge keeps its length and stays in the
 * middle of the long side and on the rim when the sizes change. Its knuckles start 12 mm above the
 * bed and stand on the webs of the mechanism tool, down to the walls of their halves.
 */
function hingedBox(): Step[] {
  // The room between the halves; the hinge line runs in its middle, within reach of both walls.
  const between = 1;
  const [length, width, height, hinge] = [60, 40, 16, 40];
  const [diameter, gap, knuckles] = [8, 0.4, 5];
  const start = (length - hinge) / 2;
  const knuckle = (hinge - (knuckles - 1) * gap) / knuckles;
  const pin = pinDiameter(diameter);
  // Near the far end of the lid's first knuckle: from there the axis runs so that closing counts up.
  const far = start + 2 * knuckle + gap - 0.3;
  // The outside of the lid's front wall, away from the hinge.
  const front = between + width;
  // The wall at the start.
  const wall0 = 2.4;
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
    parameter('height', '16 mm', 'Height of each half; closed, the box is twice as high. At least 8 mm: the webs under the hinge reach 6.2 mm below the rim'),
    parameter('wall', '2.4 mm', 'Wall and floor thickness'),
    parameter('corner', '5 mm', 'Radius of the outer corners of box and lid; at least 2 mm more than the wall'),
    ...shell('Box', '-width', -width, (name) => `Box ${name}`),
    ...shell('Lid', between, between, (name) => `Lid ${name}`),
    // The snap closure of the mechanism tool on the lid's inner room, the catch on the front, away from the hinge:
    // the lid is built open and closes half a turn about the hinge line.
    ...lipSteps({
      fixed: 'Box',
      moving: 'Lid',
      min: [{ at: wall0, expr: 'wall' }, { at: between + wall0, expr: '1 mm + wall' }],
      max: [{ at: length - wall0, expr: 'length - wall' }, { at: front - wall0, expr: 'width + 1 mm - wall' }],
      rim: { at: height, expr: 'height' },
      up: 1,
      radius: { at: 5 - wall0, expr: 'corner - wall' },
      wall: { at: wall0, expr: 'wall' },
      side: 'y+',
      hinge: { along: 'x', across: between / 2, z: { at: height, expr: 'height' } },
      name: 'Closure',
    }),
    // The hinge of the mechanism tool, built at the starting sizes, then tied to the parameters.
    // The walls of both halves stand half the room between them from the line, down to the bed: every knuckle gets its web.
    ...hingeSteps({ fixed: 'Box', moving: 'Lid', from: [start, between / 2, height], to: [start + hinge, between / 2, height], diameter, gap, knuckles, name: 'Hinge', support: { bed: 0, fixed: { toward: [0, -1, 0], distance: between / 2 }, moving: { toward: [0, 1, 0], distance: between / 2 } } }).map((step, i, steps) => {
      // The profiles (the bore's roof, the webs and their rooms, the pin's flat) are drawn in the world's own y and z and
      // moved along x, so they follow the sizes as the cylinders do. One drawn looking back along x is turned round:
      // it starts where its extrusion ended. No web is drawn below the bed, however low the halves are set.
      const drawn = (steps[step.command === 'sketch.create' ? i : i - 1]?.params.plane ?? {}) as { origin?: Vec3; x_dir?: Vec3 };
      const back = (drawn.x_dir?.[1] ?? 1) < 0;
      if (step.command === 'sketch.create') return { ...step, params: { ...step.params, plane: 'YZ', offset: `length / 2 + ${String(Math.round(((drawn.origin?.[0] ?? 0) - (back ? parseFloat(String(steps[i + 2]?.params.distance)) : 0) - length / 2) * 1000) / 1000)} mm` } };
      // A web's third point is the foot of its face at 45°: where the bed cuts the web short, the foot comes in along
      // that face by as much, so the face keeps its 45° (at height 5 mm it leant 57° with the foot only lifted).
      const web = String(steps[i + 1]?.params.name).endsWith('◣');
      if (step.command === 'sketch.line') return { ...step, params: { ...step.params, points: (step.params.points as [number, number][]).map(([across, up], n) => [web && n === 2 ? `${String(between / 2)} mm ${back ? '-' : '+'} min(${String(across)} mm, height + ${String(Math.round((across + up) * 1000) / 1000)} mm)` : `${String(between / 2 + (back ? -across : across))} mm`, up < 0 && steps[i + 1]?.params.operation === 'join' ? `max(height + ${String(up)} mm, 0 mm)` : `height + ${String(up)} mm`]) } };
      if (step.command !== 'solid.cylinder') return step;
      const [x, y] = step.params.base as Vec3;
      return { ...step, params: { ...step.params, base: [`length / 2 + ${String(x - length / 2)} mm`, y, 'height'] } };
    }),
    components('Box', 'Lid'),
    // It closes all the way: the bead pressing past the box's rim on the last degrees is the snap. The joint is kept on top of the pin (underneath it is flat) and on the bore under it, inside the lid's first knuckle: faces no wall or lip cuts, whatever the sizes.
    joint('revolute', 'Box', 'Lid', { fixed: { circle: [far, between / 2, height + pin / 2], x: [0, 0, 1] }, moving: { circle: [far, between / 2, height - pin / 2 - gap], x: [0, 0, 1] } }, { flip: true, offset: -gap, limits: [[0, 180]] }, 'Hinge'),
    // Box and lid print as one piece, side by side as they are built.
    ...printTogether(['Box', 'Lid'], 'hinge', 'Hinge'),
  ];
}

/**
 * An adjustable stop for a workbench or a drill stand: a base screwed down, with the dovetail rail of
 * the mechanism tool, and a stop that slides on it and is clamped by a screw in a heat-set insert.
 * The stop prints beside the base (plate view) and is pushed onto the rail from an end.
 */
function slideStop(): Step[] {
  // The base is 6 mm thick: the rail's sketch stands on its top, and a sketch plane takes no expression.
  const [length, baseWidth, thick, gap] = [120, 40, 6, 0.4];
  const screws: [Expr, Expr][] = [
    ['length * 0.15', '-(base_width / 2 - 7 mm)'],
    ['length * 0.85', 'base_width / 2 - 7 mm'],
  ];
  const stopX = 'length / 2 - stop_length / 2';
  return [
    parameter('length', '120 mm', 'Length of base and rail'),
    parameter('base_width', '40 mm', 'Width of the base; the stop is 24 mm wide'),
    parameter('stop_length', '30 mm', 'Length of the stop along the rail'),
    parameter('stop_height', '20 mm', 'Height of the stop above the base'),
    parameter('screw_hole', '4.5 mm', 'Holes in the base for 4 mm wood screws'),
    parameter('screw_head', '9 mm', 'Diameter of the counterbore for their heads, so the stop passes over them'),
    parameter('clamp_hole', '5.6 mm', 'Hole in the stop for an M4 heat-set insert; its screw clamps the stop on the rail'),
    { command: 'solid.box', params: { length: 'length', width: 'base_width', height: `${String(thick)} mm`, corner: [0, '-base_width / 2', 0], operation: 'new', body_name: 'Base', name: 'Base' } },
    // Edges by a point on them at the starting sizes; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[0, -baseWidth / 2, 3], [0, baseWidth / 2, 3], [length, -baseWidth / 2, 3], [length, baseWidth / 2, 3]], radius: '3 mm', body: 'Base', name: 'Base corners' } },
    { command: 'solid.chamfer', params: { edges: [[length / 2, -baseWidth / 2, 0]], distance: '0.6 mm', body: 'Base', name: 'Bed chamfer' } },
    ...screws.flatMap(([x, y], i) => [
      { command: 'solid.cylinder', params: { diameter: 'screw_hole', height: '8 mm', base: [x, y, '-1 mm'], operation: 'cut', targets: ['Base'], name: `Screw hole ${String(i + 1)}` } },
      { command: 'solid.cylinder', params: { diameter: 'screw_head', height: '4 mm', base: [x, y, '3 mm'], operation: 'cut', targets: ['Base'], name: `Counterbore ${String(i + 1)}` } },
    ]),
    { command: 'solid.box', params: { length: 'stop_length', width: '24 mm', height: 'stop_height', corner: [stopX, '-12 mm', `${String(thick + gap)} mm`], operation: 'new', body_name: 'Stop', name: 'Stop' } },
    { command: 'solid.fillet', params: { edges: [[45, -12, 12], [45, 12, 12], [75, -12, 12], [75, 12, 12]], radius: '2 mm', body: 'Stop', name: 'Stop corners' } },
    { command: 'solid.cylinder', params: { diameter: 'clamp_hole', height: 'stop_height', base: ['length / 2', 0, `${String(thick + gap)} mm`], operation: 'cut', targets: ['Stop'], name: 'Clamp hole' } },
    // The guide of the mechanism tool along the whole base; its length follows the parameter.
    ...slideSteps({ fixed: 'Base', moving: 'Stop', from: [0, 0, thick], to: [length, 0, thick], up: [0, 0, 1], width: 6, height: 3, gap, name: 'Guide' }).map((step) =>
      step.command === 'solid.extrude' ? { ...step, params: { ...step.params, distance: 'length' } } : step,
    ),
    // A slider only needs its direction, which no size changes, so it is joined as built at a point on the rail;
    // the stop travels until it is flush with either end of the rail at the starting sizes (limits take no expression).
    // Printed standing on its top, the groove needs no bridge: the plate view and the slicer export lay it so.
    { command: 'body.print_face', params: { body: 'Stop', point: [length / 2, 8, thick + gap + 20] } },
    components('Base', 'Stop'),
    {
      command: 'joint.as_built',
      params: { type: 'slider', a: 'Base', b: 'Stop', at: { occurrence: 'Base', point: [length / 2, 0, thick], z: [1, 0, 0] }, name: 'Guide', limits: [[-45, 45]], quiet: true },
    },
  ];
}

/**
 * A sign to screw on: a door, a drawer, a shelf. Its words are a text parameter, so the parameter
 * panel relabels it; the raised letters stay in the middle of the plate.
 */
function sign(): Step[] {
  const [length, width] = [80, 25];
  return [
    { command: 'parameters.add', params: { name: 'label', expression: 'PartBuddy', unit: 'text', comment: 'The words on the sign' } },
    parameter('length', '80 mm', 'Length of the sign'),
    parameter('width', '25 mm', 'Width of the sign'),
    parameter('thickness', '3 mm', 'Thickness of the plate'),
    parameter('text_height', '9 mm', 'Height of the capital letters'),
    parameter('screw_hole', '3.4 mm', 'Holes for M3 screws (ISO 273, normal)'),
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'thickness', operation: 'new', body_name: 'Sign', name: 'Plate' } },
    // Edges by a point on them at the starting sizes; SolidCraft follows them when the sizes change.
    { command: 'solid.fillet', params: { edges: [[0, 0, 1.5], [length, 0, 1.5], [0, width, 1.5], [length, width, 1.5]], radius: '4 mm', name: 'Outer corners' } },
    { command: 'solid.chamfer', params: { edges: [[length / 2, 0, 0]], distance: '0.6 mm', name: 'Bed chamfer' } },
    ...(['6 mm', 'length - 6 mm'] as const).map((x, i) => ({
      command: 'solid.cylinder',
      params: { diameter: 'screw_hole', height: 'thickness', base: [x, 'width / 2', 0], operation: 'cut', name: `Screw hole ${String(i + 1)}` },
    })),
    // On the plate's top, in the world's own x and y. Arial has a bold face; SolidCraft's built-in font has none.
    { command: 'sketch.create', params: { plane: 'XY', offset: 'thickness', project_edges: false, name: 'Label' } },
    { command: 'sketch.text', params: { text_expression: 'label', at: ['length / 2', 'width / 2'], height: 'text_height', align: 'center', vertical_align: 'middle', font: 'Arial', bold: true } },
    { command: 'solid.extrude', params: { distance: '0.8 mm', operation: 'join', name: 'Letters' } },
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
  // Where the bosses stand at the starting sizes, for the screws.
  const c0 = 2 + 8 / 2 - 0.5;
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
    // The lid lies on the housing, as it is assembled; the plate view lays the two side by side for printing.
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'wall', corner: [0, 0, 'height'], operation: 'new', body_name: 'Lid', name: 'Lid' } },
    { command: 'solid.fillet', params: { edges: [[0, 0, 31], [80, 0, 31], [0, 60, 31], [80, 60, 31]], radius: 'corner', body: 'Lid', name: 'Lid corners' } },
    { command: 'solid.chamfer', params: { edges: [[40, 0, 30]], distance: '0.6 mm', body: 'Lid', name: 'Lid bed chamfer' } },
    { command: 'solid.fillet', params: { edges: [[40, 0, 32]], radius: '0.8 mm', body: 'Lid', name: 'Lid edge radius' } },
    ...corners.map(([x, y], i) => ({
      command: 'solid.cylinder',
      params: { diameter: 'screw_hole', height: 'wall', base: [x, y, 'height'], operation: 'cut', targets: ['Lid'], name: `Screw hole ${String(i + 1)}` },
    })),
    // The screws as standard parts, each seated on the rim of its hole in the lid: they are not printed. One
    // part per hole, since the view shows a part placed four times only once.
    ...[[c0, c0], [80 - c0, c0], [c0, 60 - c0], [80 - c0, 60 - c0]].flatMap(([x, y], i) => [
      { command: 'parts.insert', params: { family: 'button_head_cap_screw', size: 'M3', length: 8, at: [(x ?? 0) + 1.7, y, 32] } },
      // SolidCraft calls the bodies of inserted parts Body1, Body2, … in turn.
      { command: 'body.rename', params: { body: `Body${String(i + 1)}`, name: `M3 screw ${String(i + 1)}` } },
    ]),
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

const BUILDERS: Record<TemplateId, () => Step[]> = { hingedBox, slideStop, housing, sign, wallHolder };

/** The parameter comments in German (polish round 2); names stay the same, so expressions and the assistant find them. */
const GERMAN: Record<string, string> = {
  'Outer length of box and lid; at least 54 mm, the hinge is 40 mm long': 'Außenlänge von Box und Deckel; mindestens 54 mm, das Scharnier ist 40 mm lang',
  'Outer width of box and lid': 'Außenbreite von Box und Deckel',
  'Length of base and rail': 'Länge von Grundplatte und Schiene',
  'Width of the base; the stop is 24 mm wide': 'Breite der Grundplatte; der Anschlag ist 24 mm breit',
  'Length of the stop along the rail': 'Länge des Anschlags entlang der Schiene',
  'Height of the stop above the base': 'Höhe des Anschlags über der Grundplatte',
  'Holes in the base for 4 mm wood screws': 'Löcher in der Grundplatte für 4-mm-Holzschrauben',
  'Diameter of the counterbore for their heads, so the stop passes over them': 'Durchmesser der Senkung für ihre Köpfe, damit der Anschlag darüber fährt',
  'Hole in the stop for an M4 heat-set insert; its screw clamps the stop on the rail': 'Loch im Anschlag für eine M4-Einschmelzmutter; ihre Schraube klemmt den Anschlag auf der Schiene',
  'The words on the sign': 'Der Text auf dem Schild',
  'Length of the sign': 'Länge des Schilds',
  'Width of the sign': 'Breite des Schilds',
  'Thickness of the plate': 'Stärke der Platte',
  'Height of the capital letters': 'Höhe der Großbuchstaben',
  'Holes for M3 screws (ISO 273, normal)': 'Löcher für M3-Schrauben (ISO 273, mittel)',
  'Height of each half; closed, the box is twice as high. At least 8 mm: the webs under the hinge reach 6.2 mm below the rim': 'Höhe jeder Hälfte; geschlossen ist die Box doppelt so hoch. Mindestens 8 mm: die Stege unter dem Scharnier reichen 6,2 mm unter den Rand',
  'Wall and floor thickness': 'Stärke von Wand und Boden',
  'Wall, floor and lid thickness': 'Stärke von Wand, Boden und Deckel',
  'Outer length of housing and lid': 'Außenlänge von Gehäuse und Deckel',
  'Outer width of housing and lid': 'Außenbreite von Gehäuse und Deckel',
  'Outer height of the housing without the lid': 'Außenhöhe des Gehäuses ohne Deckel',
  'Diameter of the screw bosses in the corners': 'Durchmesser der Schraubdome in den Ecken',
  'Hole for an M3 heat-set insert (ruthex: 4 mm)': 'Loch für eine M3-Einschmelzmutter (ruthex: 4 mm)',
  'Depth of that hole: insert length plus 1 mm': 'Tiefe dieses Lochs: Länge der Mutter plus 1 mm',
  'Hole in the lid for the M3 screws (ISO 273, normal)': 'Loch im Deckel für die M3-Schrauben (ISO 273, mittel)',
  'Radius of the outer corners of box and lid; at least 2 mm more than the wall': 'Radius der Außenecken von Box und Deckel; mindestens 2 mm mehr als die Wand',
  'Radius of the outer corners of housing and lid': 'Radius der Außenecken von Gehäuse und Deckel',
  'How far the screw ears reach out on the short sides': 'Wie weit die Schraublaschen an den Schmalseiten abstehen',
  'Height of the plate on the wall': 'Höhe der Platte an der Wand',
  'Width of the holder': 'Breite des Halters',
  'Thickness of plate, floor and lip': 'Stärke von Platte, Boden und Rand',
  'Room between plate and lip': 'Platz zwischen Platte und Rand',
  'Height of the front lip': 'Höhe des vorderen Rands',
  'Hole for the wall screws (4 mm wood screws)': 'Loch für die Wandschrauben (4-mm-Holzschrauben)',
  'Diameter of the countersink for their heads': 'Durchmesser der Senkung für ihre Köpfe',
};

/** The body names in German (polish round 3); every step that names a body follows. */
const GERMAN_BODIES: Record<string, string> = { Box: 'Box', Lid: 'Deckel', Base: 'Grundplatte', Stop: 'Anschlag', Sign: 'Schild', Housing: 'Gehäuse', 'Wall holder': 'Wandhalter' };

/** Feature and sketch names in German, so the timeline speaks the tree's language (audit B-03). */
const GERMAN_FEATURES: Record<string, string> = {
  ...GERMAN_BODIES,
  'Base corners': 'Grundplatten-Ecken',
  'Bed chamfer': 'Fase am Bett',
  'Clamp hole': 'Klemmloch',
  Closure: 'Verschluss',
  Counterbore: 'Senkung',
  Guide: 'Führung',
  Label: 'Beschriftung',
  Letters: 'Buchstaben',
  'M3 screw': 'M3-Schraube',
  'Stop corners': 'Anschlag-Ecken',
  'Box bed chamfer': 'Box-Fase am Bett',
  'Box corners': 'Box-Ecken',
  'Box hollow': 'Box aushöhlen',
  'Corner radius': 'Eckenradius',
  'Countersunk holes': 'Senkbohrungen',
  Ear: 'Lasche',
  'Ear corners': 'Laschenecken',
  'Ear edges': 'Laschenkanten',
  'Ear slot': 'Laschenschlitz',
  Floor: 'Boden',
  Hinge: 'Scharnier',
  'Floor slot': 'Bodenschlitz',
  Hollow: 'Aushöhlen',
  Boss: 'Schraubdom',
  'Inner radius': 'Innenradius',
  Insert: 'Einschmelzmutter',
  'Lid bed chamfer': 'Deckel-Fase am Bett',
  'Lid corners': 'Deckelecken',
  'Lid edge radius': 'Deckel-Kantenradius',
  'Lid hollow': 'Deckel aushöhlen',
  Lip: 'Rand',
  'Lip corners': 'Randecken',
  'Outer bend': 'Außenbogen',
  'Outer corners': 'Außenecken',
  Plate: 'Platte',
  'Rim radius': 'Randradius',
  'Screw hole': 'Schraubloch',
  'Screw points': 'Schraubpunkte',
  'Soft edges': 'Weiche Kanten',
  'Vent back': 'Lüftung hinten',
  'Vent front': 'Lüftung vorn',
};

/** "Ear slot 2 end 1" → "Laschenschlitz 2 Ende 1": the base from the list, numbers and a mechanism's mark (·, ○, ● …) kept. */
export function germanFeatureName(name: string): string {
  const match = /^(.*?)((?: \d+)?)((?: end \d+)?)((?: [·○●◢◆◠△◣◤▬])?)$/.exec(name);
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
  for (const key of ['a', 'b', 'at'] as const) {
    const origin = params[key] as { occurrence?: unknown } | string | undefined;
    if (!step.command.startsWith('joint.') || origin === undefined) continue;
    params[key] = typeof origin === 'string' ? body(origin) : { ...origin, occurrence: body(origin.occurrence) };
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

/** The print faces a template's script sets, by body and a point on the face: PartBuddy keeps them for its plate view as well. */
export function templatePrintFaces(id: TemplateId, german = false): { body: string; point: [number, number, number] }[] {
  return templateSteps(id, german).flatMap((step) => (step.command === 'body.print_face' ? [{ body: step.params.body as string, point: step.params.point as [number, number, number] }] : []));
}
