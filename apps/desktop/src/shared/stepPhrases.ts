/**
 * Plain-language lines for the work log (M2a): what one assistant tool call or one action of the
 * user did to the design, as message keys with values. The renderer shows them in the user's
 * language; the main process writes the English text into notes for the model. Derived from the
 * command and its parameters, so it costs no tokens and does not rely on the model to label its
 * steps.
 */

import { stepOf, type FeatureBlock } from './blocks';

export const STEP_PHRASE_KEYS = [
  'sketch',
  'sketchOnFace',
  'rectangle',
  'circle',
  'curves',
  'dimensions',
  'extrude',
  'extrudeThrough',
  'revolve',
  'box',
  'cylinder',
  'sphere',
  'fillet',
  'chamfer',
  // Fixes at the light, removed in plan step R1; kept so stored work logs still read.
  'fixChamfer',
  'fixRoof',
  'fixBridge',
  'fixRibs',
  'hole',
  'shell',
  'pressPull',
  'thread',
  'combine',
  'pattern',
  'mirror',
  'move',
  'parameter',
  'dimension',
  'editFeature',
  'deleteFeature',
  'rollTo',
  'rollToEnd',
  'suppress',
  'unsuppress',
  'construction',
  // Import (B4): a file inserted into the design, a part repaired, a mesh converted to faces.
  'insertFile',
  'repairBody',
  'convertMesh',
  // A standard part seated in a hole (B7).
  'standardPart',
  // The face a body lies on in the slicer (B8).
  'printFace',
  'printFaceCleared',
  // Function blocks (F1).
  'tappedHole',
  'screwHole',
  'boss',
  'textBlock',
  'nutTrap',
  'slot',
  'lip',
  'groove',
  'snapFit',
  'logo',
  'logoMoved',
  'logoDepth',
  'logoRotated',
  'logoResized',
  // Parts that move (ADR 0027).
  'movableParts',
  'joint',
  'jointMove',
  'command',
] as const;

export type StepPhraseKey = (typeof STEP_PHRASE_KEYS)[number];

export interface StepPhrase {
  key: StepPhraseKey;
  values: Record<string, string | number>;
}

/** At most this many lines per card; the rest is counted. */
export const MAX_STEP_PHRASES = 6;
/** At most this many lines are kept per step. */
export const MAX_PHRASES_PER_STEP = 50;

type Params = Record<string, unknown>;

/** A size as SolidCraft takes it: a number in mm or an expression such as "width / 2". */
function size(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value === 'string' && value.trim() !== '') return value.trim().replace(/\s*mm$/i, '').slice(0, 40);
  return null;
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 60) : fallback;
}

/** The last part of a file path, without folders (`Teile\Platine.step` → `Platine.step`). */
function fileName(value: unknown): string {
  return typeof value === 'string' ? text(value.split(/[\\/]/).pop(), '?') : '?';
}

/** Corner points [x, y] of a rectangle, when both are plain numbers. */
function rectangleSize(p0: unknown, p1: unknown): { width: number; height: number } | null {
  if (!Array.isArray(p0) || !Array.isArray(p1)) return null;
  const [x0, y0] = p0 as unknown[];
  const [x1, y1] = p1 as unknown[];
  if (typeof x0 !== 'number' || typeof y0 !== 'number' || typeof x1 !== 'number' || typeof y1 !== 'number') return null;
  return { width: Math.round(Math.abs(x1 - x0) * 100) / 100, height: Math.round(Math.abs(y1 - y0) * 100) / 100 };
}

/** Commands that only read: they leave no line in the work log. */
const READ_ONLY = /(^|\.)(inspect|list|describe|measure|faces|edges|revision|dependents|users|graph|complete|export_dxf)$|^(document|model|inspect|view|ui|render)\.|^sketch\.finish/;

function diameter(params: Params): string | number | null {
  const d = size(params.diameter);
  if (d !== null) return d;
  const r = size(params.radius);
  if (typeof r === 'number') return Math.round(r * 200) / 100;
  return r === null ? null : `2 × ${r}`;
}

/** One engine command as zero or one phrase; sketch curves are merged by the caller. */
function phraseOf(command: string, params: Params): StepPhrase | 'curve' | 'dimension' | null {
  if (READ_ONLY.test(command)) return null;
  switch (command) {
    case 'sketch.create': {
      if (typeof params.plane === 'string') return { key: 'sketch', values: { plane: params.plane.slice(0, 40) } };
      return { key: 'sketchOnFace', values: {} };
    }
    case 'sketch.rectangle.two_point':
    case 'sketch.rectangle.rounded': {
      const dims = rectangleSize(params.p0, params.p1);
      return dims ? { key: 'rectangle', values: dims } : 'curve';
    }
    case 'sketch.rectangle.center': {
      const half = rectangleSize(params.center, params.corner);
      return half ? { key: 'rectangle', values: { width: half.width * 2, height: half.height * 2 } } : 'curve';
    }
    case 'sketch.circle.center': {
      const d = diameter(params);
      return d === null ? 'curve' : { key: 'circle', values: { diameter: d } };
    }
    case 'sketch.dimension':
      return 'dimension';
    case 'sketch.draw.dimensioned': {
      const inner = typeof params.command === 'string' ? params.command : '';
      const shape = phraseOf(inner, (params.params ?? {}) as Params);
      return shape ?? 'curve';
    }
    case 'solid.extrude': {
      if (params.through_all === true) return { key: 'extrudeThrough', values: {} };
      const distance = size(params.distance);
      return { key: 'extrude', values: { distance: distance ?? '?' } };
    }
    case 'solid.revolve':
      return { key: 'revolve', values: { angle: size(params.angle) ?? 360 } };
    case 'solid.box':
      return { key: 'box', values: { length: size(params.length) ?? '?', width: size(params.width) ?? '?', height: size(params.height) ?? '?' } };
    case 'solid.cylinder':
      return { key: 'cylinder', values: { diameter: diameter(params) ?? '?', height: size(params.height) ?? '?' } };
    case 'solid.sphere':
      return { key: 'sphere', values: { diameter: diameter(params) ?? '?' } };
    case 'solid.fillet':
      return { key: 'fillet', values: { radius: size(params.radius) ?? '?', count: Math.max(1, count(params.edges)) } };
    case 'solid.chamfer':
      return { key: 'chamfer', values: { distance: size(params.distance) ?? '?', count: Math.max(1, count(params.edges)) } };
    case 'solid.hole': {
      if (typeof params.thread === 'string') return { key: 'tappedHole', values: { thread: text(params.thread, 'M') } };
      if (typeof params.clearance === 'string') return { key: 'screwHole', values: { size: text(params.clearance, 'M') } };
      const depth = size(params.depth);
      return { key: 'hole', values: { diameter: diameter(params) ?? '?', depth: depth ?? 'through' } };
    }
    case 'solid.shell':
      return { key: 'shell', values: { thickness: size(params.thickness) ?? '?' } };
    case 'solid.press_pull':
    case 'solid.offset_face':
      return { key: 'pressPull', values: { distance: size(params.distance) ?? '?' } };
    case 'solid.thread':
      return { key: 'thread', values: { designation: text(params.designation, 'M') } };
    case 'solid.combine':
      return { key: 'combine', values: { operation: text(params.operation, 'join') } };
    case 'solid.pattern.rectangular':
      return { key: 'pattern', values: { count: (Number(params.count1) || 1) * (Number(params.count2) || 1) } };
    case 'solid.pattern.circular':
    case 'solid.pattern.path':
      return { key: 'pattern', values: { count: Number(params.count) || 1 } };
    case 'solid.mirror':
      return { key: 'mirror', values: {} };
    case 'solid.move':
    case 'solid.align':
      return { key: 'move', values: { count: Math.max(1, count(params.bodies)) } };
    case 'parameters.change':
    case 'parameters.add':
      return { key: 'parameter', values: { name: text(params.name, '?'), value: size(params.expression) ?? '?' } };
    case 'timeline.edit':
    case 'timeline.redefine':
      return { key: 'editFeature', values: { feature: typeof params.feature === 'number' ? params.feature : text(params.feature, '?') } };
    case 'timeline.delete':
      return { key: 'deleteFeature', values: { count: Math.max(1, count(params.features)) } };
    case 'timeline.roll_to':
    case 'timeline.rollback':
      return params.position === 'end' || params.position === undefined
        ? { key: 'rollToEnd', values: {} }
        : { key: 'rollTo', values: { position: Number(params.position) || 0 } };
    case 'timeline.suppress':
      return { key: params.suppressed === false ? 'unsuppress' : 'suppress', values: {} };
    case 'file.insert_step':
    case 'file.insert_mesh':
      return { key: 'insertFile', values: { name: fileName(params.path) } };
    case 'body.repair':
      return { key: 'repairBody', values: { name: text(params.body, '?') } };
    case 'mesh.convert':
      return { key: 'convertMesh', values: { name: text(params.body, '?') } };
    case 'body.print_face':
      return { key: params.point === undefined || params.point === null ? 'printFaceCleared' : 'printFace', values: {} };
    case 'solid.emboss':
      return { key: 'textBlock', values: { text: '…' } };
    case 'plastic.lip':
      return { key: params.type === 'groove' ? 'groove' : 'lip', values: { width: size(params.width) ?? '?' } };
    case 'plastic.snap_fit':
      return { key: 'snapFit', values: { length: size(params.length) ?? '?' } };
    case 'plastic.boss':
      return { key: 'boss', values: { diameter: size(params.diameter) ?? '?' } };
    case 'parts.insert':
    case 'parts.fastener':
      return { key: 'standardPart', values: { name: `${text(params.size, '?')}${typeof params.length === 'number' ? `×${String(params.length)}` : ''}` } };
    case 'component.from_bodies':
      return { key: 'movableParts', values: {} };
    case 'joint.create':
    case 'joint.as_built':
      return { key: 'joint', values: { name: text(params.name, text(params.type, '?')).slice(0, 60) } };
    case 'joint.drive':
      // The assistant names the joint or gives its id; the unit is the joint's own.
      return { key: 'jointMove', values: { name: String(size(params.joint) ?? '?').slice(0, 60), value: String(size(params.value) ?? '?').slice(0, 40) } };
  }
  if (command.startsWith('sketch.')) return 'curve';
  if (command.startsWith('construct.')) return { key: 'construction', values: {} };
  return { key: 'command', values: { command: command.slice(0, 80) } };
}

interface Step {
  command: string;
  params: Params;
}

/** The engine commands an MCP tool call runs, as far as its arguments tell. */
function commandsOf(tool: string, args: Params): Step[] | null {
  if (tool === 'execute' && typeof args.command === 'string') return [{ command: args.command, params: (args.params ?? {}) as Params }];
  if (tool === 'batch' && Array.isArray(args.commands)) {
    return args.commands
      .filter((step): step is { command: string; params?: unknown } => typeof (step as { command?: unknown } | null)?.command === 'string')
      .map((step) => ({ command: step.command, params: (step.params ?? {}) as Params }));
  }
  if (tool === 'set_parameter') return [{ command: 'parameters.change', params: { name: args.name, expression: args.value ?? args.expression } }];
  return null;
}

/** Turns a list of engine commands into phrases: sketch curves and dimensions are counted. */
export function describeCommands(steps: Step[]): StepPhrase[] {
  const phrases: StepPhrase[] = [];
  let curves = 0;
  let dimensions = 0;
  const flush = () => {
    if (curves > 0) phrases.push({ key: 'curves', values: { count: curves } });
    if (dimensions > 0) phrases.push({ key: 'dimensions', values: { count: dimensions } });
    curves = 0;
    dimensions = 0;
  };
  for (const step of steps) {
    const phrase = phraseOf(step.command, step.params);
    if (phrase === null) continue;
    if (phrase === 'curve') curves += 1;
    else if (phrase === 'dimension') dimensions += 1;
    else {
      if (!phrase.key.startsWith('sketch') && phrase.key !== 'rectangle' && phrase.key !== 'circle') flush();
      phrases.push(phrase);
    }
  }
  flush();
  return phrases;
}

/** What one tool call of the assistant did; a call PartBuddy cannot read gets one generic line. */
export function describeToolCall(tool: string, args: Params): StepPhrase[] {
  const steps = commandsOf(tool, args);
  const phrases = steps ? describeCommands(steps).slice(0, MAX_PHRASES_PER_STEP) : [];
  return phrases.length > 0 ? phrases : [{ key: 'command', values: { command: tool.slice(0, 80) } }];
}

/** The phrase of one action of the user (M1b dimension field, M1b-2 actions, M1c timeline). */
export function describeUserAction(
  action:
    | { kind: 'dimension'; parameter: string; value: number }
    | { kind: 'action'; action: 'fillet' | 'chamfer' | 'extrude' | 'hole' | 'shell'; size: number; count: number; depth?: number | undefined }
    | { kind: 'rollTo'; position: number | 'end' }
    | { kind: 'suppress'; suppressed: boolean }
    | { kind: 'insertFile'; name: string }
    | { kind: 'repairBody' | 'convertMesh'; body: string }
    | { kind: 'standardPart'; name: string }
    | { kind: 'printFace'; cleared: boolean }
    | { kind: 'jointMove'; name: string; value: number; unit: 'deg' | 'mm' },
): StepPhrase {
  const round = (value: number) => Math.round(value * 100) / 100;
  switch (action.kind) {
    case 'jointMove':
      return { key: 'jointMove', values: { name: action.name.slice(0, 60), value: `${String(round(action.value))}${action.unit === 'deg' ? '°' : ' mm'}` } };
    case 'dimension':
      return { key: 'dimension', values: { name: action.parameter.slice(0, 60), value: round(action.value) } };
    case 'rollTo':
      return action.position === 'end' ? { key: 'rollToEnd', values: {} } : { key: 'rollTo', values: { position: action.position } };
    case 'suppress':
      return { key: action.suppressed ? 'suppress' : 'unsuppress', values: {} };
    case 'insertFile':
      return { key: 'insertFile', values: { name: action.name.slice(0, 60) } };
    case 'repairBody':
    case 'convertMesh':
      return { key: action.kind, values: { name: action.body.slice(0, 60) } };
    case 'standardPart':
      return { key: 'standardPart', values: { name: action.name.slice(0, 60) } };
    case 'printFace':
      return { key: action.cleared ? 'printFaceCleared' : 'printFace', values: {} };
    case 'action':
      switch (action.action) {
        case 'fillet':
          return { key: 'fillet', values: { radius: round(action.size), count: action.count } };
        case 'chamfer':
          return { key: 'chamfer', values: { distance: round(action.size), count: action.count } };
        case 'extrude':
          return { key: 'pressPull', values: { distance: round(action.size) } };
        case 'hole':
          return { key: 'hole', values: { diameter: round(action.size), depth: action.depth === undefined ? 'through' : round(action.depth) } };
        case 'shell':
          return { key: 'shell', values: { thickness: round(action.size) } };
      }
  }
}

/** The work-log line of a function block the user built (F1). */
export function blockPhrase(block: FeatureBlock): StepPhrase {
  const round = (value: number) => Math.round(value * 100) / 100;
  switch (block.block) {
    case 'text':
      return { key: 'textBlock', values: { text: block.text.slice(0, 40) } };
    case 'nutTrap':
      return { key: 'nutTrap', values: { size: block.size } };
    case 'slot':
      return { key: 'slot', values: { length: round(block.length) } };
    case 'lip':
      return { key: block.type, values: { width: round(block.width) } };
    case 'snapFit':
      return { key: 'snapFit', values: { length: round(block.length) } };
    case 'logo':
      return { key: 'logo', values: { name: block.name.slice(0, 40) || 'SVG', mode: block.mode } };
    default:
      return describeCommands([stepOf(block)])[0] ?? { key: 'command', values: { command: block.block } };
  }
}

/**
 * ICU messages of the phrases. English is also what the model reads in notes; German is the
 * second UI language (the renderer adds both to its translations under `steps`).
 */
export const stepMessages: Record<'en' | 'de', Record<StepPhraseKey, string>> = {
  en: {
    sketch: 'Sketch on {plane}',
    sketchOnFace: 'Sketch on a face',
    rectangle: 'Rectangle {width} × {height} mm',
    circle: 'Circle ⌀ {diameter} mm',
    curves: '{count, plural, one {# sketch curve} other {# sketch curves}}',
    dimensions: '{count, plural, one {# sketch dimension} other {# sketch dimensions}}',
    extrude: 'Extruded by {distance} mm',
    extrudeThrough: 'Extruded through everything',
    revolve: 'Revolved by {angle}°',
    box: 'Box {length} × {width} × {height} mm',
    cylinder: 'Cylinder ⌀ {diameter} mm, {height} mm high',
    sphere: 'Sphere ⌀ {diameter} mm',
    fillet: 'Fillet {radius} mm on {count, plural, one {# edge} other {# edges}}',
    chamfer: 'Chamfer {distance} mm on {count, plural, one {# edge} other {# edges}}',
    fixChamfer: 'Rounds facing the bed made chamfers ({count, plural, one {# fillet} other {# fillets}})',
    fixRoof: '{count, plural, one {Roof over a lying hole} other {Roofs over # lying holes}}',
    fixBridge: '{count, plural, one {Stepped bridge over a counterbore} other {Stepped bridges over # counterbores}}',
    fixRibs: '{count, plural, one {Support wall printed into the model} other {# support walls printed into the model}}',
    hole: '{depth, select, through {Hole ⌀ {diameter} mm, through} other {Hole ⌀ {diameter} mm, {depth} mm deep}}',
    shell: 'Shelled with {thickness} mm walls',
    pressPull: 'Face moved by {distance} mm',
    thread: 'Thread {designation}',
    combine: '{operation, select, cut {Bodies cut} intersect {Bodies intersected} other {Bodies joined}}',
    pattern: 'Pattern with {count} copies',
    mirror: 'Mirrored',
    move: '{count, plural, one {Body moved} other {# bodies moved}}',
    parameter: 'Parameter {name} = {value}',
    dimension: 'Dimension {name} set to {value} mm',
    editFeature: 'Feature {feature} changed',
    deleteFeature: '{count, plural, one {Feature deleted} other {# features deleted}}',
    rollTo: 'Timeline rolled back to step {position}',
    rollToEnd: 'Timeline rolled to the end',
    suppress: 'Feature suppressed',
    unsuppress: 'Feature switched on again',
    construction: 'Construction geometry',
    insertFile: 'Inserted {name}',
    repairBody: 'Repaired {name}',
    convertMesh: 'Converted {name} to faces',
    standardPart: 'Standard part {name} seated',
    printFace: 'Print face set',
    printFaceCleared: 'Print face cleared',
    tappedHole: 'Tapped hole {thread}',
    screwHole: 'Screw hole {size}',
    boss: 'Screw boss ⌀ {diameter} mm',
    textBlock: 'Text “{text}”',
    nutTrap: 'Nut trap {size}',
    slot: 'Slot {length} mm',
    lip: 'Lip {width} mm',
    groove: 'Groove {width} mm',
    snapFit: 'Snap fit {length} mm',
    logo: '{mode, select, emboss {Logo “{name}” embossed} other {Logo “{name}” engraved}}',
    logoMoved: 'Logo “{name}” moved',
    logoDepth: 'Logo “{name}” set to {depth} mm',
    logoRotated: 'Logo “{name}” turned by {angle}°',
    logoResized: 'Logo “{name}” made {width} mm wide',
    movableParts: 'Made the bodies into parts that can move',
    joint: 'Joint “{name}”',
    jointMove: 'Moved “{name}” to {value}',
    command: 'SolidCraft: {command}',
  },
  de: {
    sketch: 'Skizze auf {plane}',
    sketchOnFace: 'Skizze auf einer Fläche',
    rectangle: 'Rechteck {width} × {height} mm',
    circle: 'Kreis ⌀ {diameter} mm',
    curves: '{count, plural, one {# Skizzenlinie} other {# Skizzenlinien}}',
    dimensions: '{count, plural, one {# Skizzenmaß} other {# Skizzenmaße}}',
    extrude: 'Um {distance} mm extrudiert',
    extrudeThrough: 'Durch alles extrudiert',
    revolve: 'Um {angle}° rotiert',
    box: 'Quader {length} × {width} × {height} mm',
    cylinder: 'Zylinder ⌀ {diameter} mm, {height} mm hoch',
    sphere: 'Kugel ⌀ {diameter} mm',
    fillet: 'Verrundung {radius} mm an {count, plural, one {# Kante} other {# Kanten}}',
    chamfer: 'Fase {distance} mm an {count, plural, one {# Kante} other {# Kanten}}',
    fixChamfer: 'Rundungen zum Druckbett zu Fasen gemacht ({count, plural, one {# Verrundung} other {# Verrundungen}})',
    fixRoof: '{count, plural, one {Dach über einer liegenden Bohrung} other {Dächer über # liegenden Bohrungen}}',
    fixBridge: '{count, plural, one {Gestufte Brücke über einer Stufenbohrung} other {Gestufte Brücken über # Stufenbohrungen}}',
    fixRibs: '{count, plural, one {Stützwand ins Modell gesetzt} other {# Stützwände ins Modell gesetzt}}',
    hole: '{depth, select, through {Bohrung ⌀ {diameter} mm, durchgehend} other {Bohrung ⌀ {diameter} mm, {depth} mm tief}}',
    shell: 'Schale mit {thickness} mm Wand',
    pressPull: 'Fläche um {distance} mm verschoben',
    thread: 'Gewinde {designation}',
    combine: '{operation, select, cut {Körper abgezogen} intersect {Körper geschnitten} other {Körper vereint}}',
    pattern: 'Muster mit {count} Kopien',
    mirror: 'Gespiegelt',
    move: '{count, plural, one {Körper verschoben} other {# Körper verschoben}}',
    parameter: 'Parameter {name} = {value}',
    dimension: 'Maß {name} auf {value} mm gesetzt',
    editFeature: 'Feature {feature} geändert',
    deleteFeature: '{count, plural, one {Feature gelöscht} other {# Features gelöscht}}',
    rollTo: 'Zeitleiste auf Schritt {position} zurückgerollt',
    rollToEnd: 'Zeitleiste ans Ende gerollt',
    suppress: 'Feature unterdrückt',
    unsuppress: 'Feature wieder eingeschaltet',
    construction: 'Hilfsgeometrie',
    insertFile: '{name} eingefügt',
    repairBody: '{name} repariert',
    convertMesh: '{name} in Flächen umgewandelt',
    standardPart: 'Normteil {name} eingesetzt',
    printFace: 'Druckfläche festgelegt',
    printFaceCleared: 'Druckfläche zurückgesetzt',
    tappedHole: 'Gewindebohrung {thread}',
    screwHole: 'Schraubenloch {size}',
    boss: 'Schraubdom ⌀ {diameter} mm',
    textBlock: 'Text „{text}“',
    nutTrap: 'Mutternfalle {size}',
    slot: 'Langloch {length} mm',
    lip: 'Deckelrand {width} mm',
    groove: 'Nut {width} mm',
    snapFit: 'Schnapphaken {length} mm',
    logo: '{mode, select, emboss {Logo „{name}“ erhaben} other {Logo „{name}“ vertieft}}',
    logoMoved: 'Logo „{name}“ verschoben',
    logoDepth: 'Logo „{name}“ auf {depth} mm gesetzt',
    logoRotated: 'Logo „{name}“ um {angle}° gedreht',
    logoResized: 'Logo „{name}“ auf {width} mm Breite',
    movableParts: 'Körper zu beweglichen Teilen gemacht',
    joint: 'Gelenk „{name}“',
    jointMove: '„{name}“ auf {value} bewegt',
    command: 'SolidCraft: {command}',
  },
};
