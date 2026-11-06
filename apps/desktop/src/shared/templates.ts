/**
 * Templates (plan step F3): parametric starting points built with SolidCraft's own commands. Every
 * size is a user parameter (`parameters.add`) and the geometry refers to it by expression, so the
 * parameter panel changes a template without the assistant. Each was built and changed with
 * `solidcraft-cli eval` and stays printable as designed, Z up, without support.
 *
 * `solid.hole` keeps a position given as expressions but does not move with it (0.40.0-rc.2: the
 * hole stays where it was placed and warns), so plain holes are cut cylinders, which follow, and
 * countersunk holes are drilled at sketch points, which follow too.
 */

export const TEMPLATE_IDS = ['boxWithLid', 'housing', 'wallHolder', 'cableClip', 'adapter'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

type Step = { command: string; params: Record<string, unknown> };
type Expr = string | number;

/** A user parameter with its starting value and what it means; the assistant reads the comment. */
const parameter = (name: string, expression: string, comment: string): Step => ({ command: 'parameters.add', params: { name, expression, comment } });

/** The gap between parts printed side by side, so they are separate objects in the slicer. */
const BESIDE = '10 mm';

function boxWithLid(): Step[] {
  const lidY = `width + ${BESIDE}`;
  const inset = 'wall + fit';
  return [
    parameter('length', '60 mm', 'Outer length of box and lid'),
    parameter('width', '40 mm', 'Outer width of box and lid'),
    parameter('height', '30 mm', 'Outer height of the box'),
    parameter('wall', '2 mm', 'Wall, floor and lid thickness'),
    parameter('lip', '4 mm', 'How deep the lid\'s lip reaches into the box'),
    parameter('fit', '0.2 mm', 'Gap per side between the lip and the box wall'),
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'height', operation: 'new', body_name: 'Box', name: 'Box' } },
    { command: 'solid.shell', params: { faces: ['F1:+z'], thickness: 'wall', body: 'Box', name: 'Hollow' } },
    // The lid lies beside the box, outside down; its lip is a ring as thick as the wall.
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'wall', corner: [0, lidY, 0], operation: 'new', body_name: 'Lid', name: 'Lid' } },
    {
      command: 'solid.box',
      params: { length: `length - 2 * (${inset})`, width: `width - 2 * (${inset})`, height: 'lip', corner: [inset, `${lidY} + ${inset}`, 'wall'], operation: 'join', targets: ['Lid'], name: 'Lip' },
    },
    {
      command: 'solid.box',
      params: {
        length: `length - 2 * (2 * wall + fit)`,
        width: `width - 2 * (2 * wall + fit)`,
        height: 'lip',
        corner: ['2 * wall + fit', `${lidY} + 2 * wall + fit`, 'wall'],
        operation: 'cut',
        targets: ['Lid'],
        name: 'Lip inside',
      },
    },
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
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'height', operation: 'new', body_name: 'Housing', name: 'Housing' } },
    { command: 'solid.shell', params: { faces: ['F1:+z'], thickness: 'wall', body: 'Housing', name: 'Hollow' } },
    ...corners.map(([x, y], i) => ({ command: 'solid.cylinder', params: { diameter: 'boss', height: 'height - wall', base: [x, y, 'wall'], operation: 'join', targets: ['Housing'], name: `Boss ${String(i + 1)}` } })),
    ...corners.map(([x, y], i) => ({
      command: 'solid.cylinder',
      params: { diameter: 'insert_hole', height: 'insert_depth', base: [x, y, 'height - insert_depth'], operation: 'cut', targets: ['Housing'], name: `Insert ${String(i + 1)}` },
    })),
    { command: 'solid.box', params: { length: 'length', width: 'width', height: 'wall', corner: [0, lidY, 0], operation: 'new', body_name: 'Lid', name: 'Lid' } },
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
  ];
}

const BUILDERS: Record<TemplateId, () => Step[]> = { boxWithLid, housing, wallHolder, cableClip, adapter };

/** The parameter comments in German (polish round 2); names stay the same, so expressions and the assistant find them. */
const GERMAN: Record<string, string> = {
  'Outer length of box and lid': 'Außenlänge von Box und Deckel',
  'Outer width of box and lid': 'Außenbreite von Box und Deckel',
  'Outer height of the box': 'Außenhöhe der Box',
  'Wall, floor and lid thickness': 'Stärke von Wand, Boden und Deckel',
  "How deep the lid's lip reaches into the box":'Wie tief der Rand des Deckels in die Box greift',
  'Gap per side between the lip and the box wall': 'Spalt je Seite zwischen Deckelrand und Boxwand',
  'Outer length of housing and lid': 'Außenlänge von Gehäuse und Deckel',
  'Outer width of housing and lid': 'Außenbreite von Gehäuse und Deckel',
  'Outer height of the housing without the lid': 'Außenhöhe des Gehäuses ohne Deckel',
  'Diameter of the screw bosses in the corners': 'Durchmesser der Schraubdome in den Ecken',
  'Hole for an M3 heat-set insert (ruthex: 4 mm)': 'Loch für eine M3-Einschmelzmutter (ruthex: 4 mm)',
  'Depth of that hole: insert length plus 1 mm': 'Tiefe dieses Lochs: Länge der Mutter plus 1 mm',
  'Hole in the lid for the M3 screws (ISO 273, normal)': 'Loch im Deckel für die M3-Schrauben (ISO 273, mittel)',
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

/** A step with its parameter comment and the bodies it names in German. */
function inGerman(step: Step): Step {
  const params = { ...step.params };
  const comment = step.command === 'parameters.add' ? params.comment : undefined;
  if (typeof comment === 'string' && GERMAN[comment]) params.comment = GERMAN[comment];
  const body = (name: unknown) => (typeof name === 'string' ? (GERMAN_BODIES[name] ?? name) : name);
  for (const key of ['body_name', 'body'] as const) if (key in params) params[key] = body(params[key]);
  if (Array.isArray(params.targets)) params.targets = params.targets.map(body);
  return { ...step, params };
}

/** The SolidCraft script of a template: its parameters first, then the geometry over them; in German on request. */
export function templateSteps(id: TemplateId, german = false): Step[] {
  const steps = BUILDERS[id]();
  return german ? steps.map(inGerman) : steps;
}
