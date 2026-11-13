/**
 * Tool policy of the gate proxy (ADR 0010, ADR 0015). Every SolidCraft tool an external agent
 * calls passes here first; the model cannot skip it, because the agent sees SolidCraft only
 * through PartBuddy's proxy.
 */

import { METADATA_PREFIX } from '../notes/noteRecord';
import type { ToolResult, UpstreamTools } from './gateProxy';
import { isKeptPhoto } from './photoNote';

export type ToolDecision = { allow: true } | { allow: false; reason: string };

/** Tools that read, model or render without touching files or discarding work. */
const ALLOWED = new Set([
  'list_commands',
  'describe_command',
  'execute',
  'batch',
  'inspect_design',
  'measure',
  'body_topology',
  'set_parameter',
  'check_parameters',
  'screenshot',
  'compare_picture',
  'running',
  'pending',
  'undo',
  'redo',
  'skill_reference',
  // Answered by PartBuddy itself from its own view (viewContext.ts), never forwarded.
  'partbuddy_view',
  // Cards in PartBuddy's chat (questions.ts), never forwarded.
  'partbuddy_ask',
  'partbuddy_plan',
  // The assembly order (assemblyTool.ts), kept by PartBuddy, never forwarded.
  'partbuddy_assembly',
  // The design rule groups of the project (designTool.ts), kept by PartBuddy, never forwarded.
  'partbuddy_design_rules',
  // Moves a placed logo through sketch.redefine (drawingTool.ts), answered by PartBuddy.
  'partbuddy_move_drawing',
  // Places an attached SVG as a logo with the logo block's steps (drawingTool.ts), answered by PartBuddy.
  'partbuddy_place_drawing',
  // Builds a print-in-place hinge with its joint from engine commands (mechanismTool.ts), answered by PartBuddy.
  'partbuddy_mechanism',
  // Builds a function block or a wall mounting from the standard tables (blockTool.ts), answered by PartBuddy.
  'partbuddy_block',
  // The rules and sizes for a kind of part (standardTool.ts), answered by PartBuddy; it builds nothing.
  'partbuddy_standard',
]);

/**
 * Tools that discard the design or read and write files. They need the confirmation and export
 * gates of ADR 0010, which the preview does not have yet, so they are refused with a reason the
 * model can pass on.
 */
const NEEDS_CONFIRMATION: Record<string, string> = {
  new_design: 'starting a new design discards the current one',
  open: 'opening a file replaces the design',
  save: 'PartBuddy saves the design by itself after every change',
  export: 'the user exports with PartBuddy’s Export button (3MF, STL, STEP)',
};

/**
 * Tools SolidCraft also runs as `batch` steps (SolidCraft 0.30.1, batch tool description). Such a
 * step is decided like a call of that tool, so `{command: "save"}` in a batch is refused as well.
 */
const BATCH_TOOL_STEPS = new Set([
  'set_parameter',
  'list_commands',
  'describe_command',
  'execute',
  'measure',
  'compare_picture',
  'inspect_design',
  'undo',
  'redo',
  'export',
  'save',
  'open',
  'new_design',
  'crash_reports',
]);

const FILES_REASON =
  'reads or writes files or settings; PartBuddy does not allow it for the assistant. PartBuddy saves the design by itself, ' +
  'and the user exports with the Export button. Continue without it.';
const WINDOW_REASON =
  "works on SolidCraft's window, which the user does not see: PartBuddy shows the model in its own view. Look at the model " +
  'with screenshot (view or camera), and name bodies, faces and edges in the commands themselves.';
const REORDER_REASON =
  'moves features in the history, where later features can then drop out without an error; PartBuddy shows the history ' +
  'as steps in order. Build in the order you need, or undo and build again.';
const MOVE_REASON =
  'moves a part away from where it was designed, and PartBuddy checks, lays out and exports the parts as designed (joints ' +
  'count from there too). Move the body itself with solid.move, or make it movable with a joint.';

/**
 * The command groups (the id up to its first dot) the assistant may use, from the catalogue of
 * SolidCraft 0.40.1 (`solidcraft-cli commands`, 634 commands): modelling, inspecting and the
 * history. A group that is not listed, one a later SolidCraft adds among them, is refused until
 * someone has looked at it (audit H-30, S-31). Raw modelling commands stay open here; which of
 * them PartBuddy takes over is BC-13's decision.
 */
export const COMMAND_GROUPS = new Set([
  'appearance', 'assembly', 'body', 'browser', 'canvas', 'component', 'construct', 'contact', 'explode', 'expr', 'face',
  'frame', 'inspect', 'joint', 'mesh', 'model', 'motion', 'note', 'occurrence', 'parameters', 'parts', 'plastic', 'sheet',
  'sketch', 'solid', 'surface', 'timeline',
]);

/** Single commands of a group that is not listed: undo and redo, and the saved views `screenshot {view}` shows. */
export const GROUP_EXCEPTIONS = new Set(['edit.undo', 'edit.redo', 'view.save', 'view.apply', 'view.list']);

/** Why a group is refused, where the general sentence would not tell the assistant what to do instead. */
const GROUP_REASONS: Record<string, string> = {
  file: FILES_REASON,
  doc: FILES_REASON,
  settings: FILES_REASON,
  diagnostics: FILES_REASON,
  library: FILES_REASON,
  pointcloud: FILES_REASON,
  render: 'renders pictures and reads and writes their files; PartBuddy does not use renderings. Look at the model with screenshot.',
  // audit N-normteile-policy-3: units, metadata and revision of the design document.
  document:
    "works on the design document itself (its units, metadata and revision): the design stays in millimetres, and PartBuddy keeps its own data there. Read the design with inspect_design and continue without it.",
  // audit S-27: SolidCraft's material is not the one the part is printed in.
  material:
    "sets SolidCraft's physical material, which is not the material the part is printed in: PartBuddy takes that from the print profile the user chose. Continue without it.",
  // audit S-26: PartBuddy's parameter list, print check and export know one design, not configurations.
  config: 'works on configurations, which PartBuddy does not show: its parameters, print check and export see one design. Change sizes with set_parameter instead.',
  // audit S-31.
  layout: WINDOW_REASON,
  panel: WINDOW_REASON,
  ui: WINDOW_REASON,
  view: WINDOW_REASON,
  select: WINDOW_REASON,
  selection: WINDOW_REASON,
};

/** Commands of a listed group (or an exception's group) that are refused, each with its reason. */
export const REFUSED_COMMANDS: Record<string, string> = {
  // Checkpoints restore around PartBuddy's undo-based work log (ADR 0018) and drop its later steps.
  'edit.checkpoint': 'is not available in PartBuddy: PartBuddy keeps the history as steps the user can go back to. Use undo and redo instead.',
  'edit.restore_checkpoint': 'is not available in PartBuddy: PartBuddy keeps the history as steps the user can go back to. Use undo and redo instead.',
  'edit.repeat': WINDOW_REASON,
  // audit S-26: state PartBuddy does not show.
  'timeline.add': 'puts in a recorded feature as raw data, which PartBuddy cannot check (it may hold a file to import). Build the feature with its own command instead.',
  'timeline.reorder': REORDER_REASON,
  'timeline.reorder_many': REORDER_REASON,
  // Measured with 0.40.1: {features: ["Base"], position: 4, active: false} put Base behind the marker, 2 bodies became 1.
  'timeline.move_many': REORDER_REASON,
  'parameters.import': 'sets many parameters at once from a table, past the check PartBuddy makes for each name. Change each with set_parameter, or add a new one with parameters.add.',
  // Moving a placement takes a part away from where it was designed; drag and align do the same as move.
  'occurrence.move': MOVE_REASON,
  'occurrence.drag': MOVE_REASON,
  'occurrence.align': MOVE_REASON,
};

/** An engine command id as SolidCraft lists them, after {@link commandId}: ASCII groups and names joined by dots. */
const COMMAND_ID = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/**
 * The arguments through which an engine command reads or writes a file, from the catalogue of
 * SolidCraft 0.40.1, for the groups above (audit N-normteile-policy-4): such an argument is refused
 * in any form, a list or a short text included, except the user's photo. `font` of a text takes an
 * installed font by its family too, which stays allowed.
 */
const FILE_ARGUMENTS: Record<string, readonly string[]> = {
  'sketch.insert_dxf': ['path'],
  'sketch.insert_svg': ['path'],
  'sketch.drawing_bounds': ['path'],
  'sketch.export_dxf': ['path'],
  'sketch.replace': ['file'],
  'sketch.text': ['font'],
  'sketch.edit_text': ['font'],
  'canvas.insert': ['path'],
  'canvas.decal': ['path'],
  'component.insert_design': ['path'],
  'component.relink': ['path'],
  'component.extract': ['path'],
  'component.replace_with_link': ['path'],
  'motion.export': ['path'],
  'motion.export_animation': ['path'],
  'sheet.export_dxf': ['path'],
  'sheet.export_bend_table': ['path'],
  'assembly.bom': ['path'],
  'timeline.export_script': ['path'],
  'parameters.export': ['path'],
  'inspect.compare_picture': ['reference'],
};

/** A font family such as "Segoe UI", not a file: no dot, slash, colon or other sign a file name needs. */
const FONT_FAMILY = /^[\p{L}\p{N} _-]{0,64}$/u;

/**
 * The only text a geometry `path` holds: a sketch curve id such as "l1". SolidCraft also uses
 * `path` for curve lists, occurrence paths and edge refs (arrays and objects); any other text in
 * `path` is taken as a file name, so an unknown form is refused rather than written. This is the
 * net under {@link FILE_ARGUMENTS} for a command it does not list.
 */
const CURVE_ID = /^[a-z]{1,3}\d{1,6}$/;

/** Metadata commands and the keys they write: PartBuddy's own keys hold the user's notes (ADR 0020). */
const METADATA_WRITES = new Set(['document.metadata.set', 'document.metadata.remove', 'component.metadata.set']);

function metadataKeys(params: Record<string, unknown>): string[] {
  const keys: string[] = [];
  if (typeof params.key === 'string') keys.push(params.key);
  if (Array.isArray(params.keys)) keys.push(...params.keys.filter((key): key is string => typeof key === 'string'));
  // audit N-normteile-policy-5: `properties` is a map of keys as well.
  for (const map of [params.values, params.properties]) {
    if (typeof map === 'object' && map !== null) keys.push(...Object.keys(map));
  }
  return keys;
}

const refuse = (reason: string): ToolDecision => ({ allow: false, reason });

/** A record's own entry: `constructor` or `toString` as a name finds nothing, not Object's. */
const entryOf = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function objectOr(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

/**
 * A command id as the rules below compare it. SolidCraft reads ids in any case (`File.Export`,
 * `COMPONENT.METADATA.SET` run; measured with 0.40.1), so every rule sees the lower-case id. Tool
 * names and parameter keys it takes only as written (`Execute`, `Path`, `Key` are unknown or ignored).
 */
const commandId = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** One engine command, as `execute` or a `batch` step sends it. */
function decideCommand(id: unknown, params: Record<string, unknown>): ToolDecision {
  if (typeof id !== 'string') return refuse('Each engine command is named by its id as text, such as {"command": "solid.extrude", "params": {…}}.');
  const command = commandId(id);
  // audit W42 (a): SolidCraft refuses these too, but the policy decides what it can read, not what SolidCraft might run.
  if (command === 'execute') return refuse('execute is a tool, not an engine command: give the engine command itself, such as {"command": "solid.extrude", "params": {…}}.');
  if (command === 'batch') return refuse('batches do not nest: put these steps into this batch, or send them as a batch of their own.');
  if (!COMMAND_ID.test(command)) return refuse(`${JSON.stringify(id)} is not an engine command id; ids look like solid.extrude, as list_commands lists them.`);
  const refused = entryOf(REFUSED_COMMANDS, command);
  if (refused) return refuse(`${command} ${refused}`);
  const group = command.slice(0, command.indexOf('.'));
  if (!COMMAND_GROUPS.has(group) && !GROUP_EXCEPTIONS.has(command)) {
    return refuse(`${command} ${entryOf(GROUP_REASONS, group) ?? 'is not available in PartBuddy. Continue with the modelling and inspection commands.'}`);
  }
  if (METADATA_WRITES.has(command) && metadataKeys(params).some((key) => key.toLowerCase().startsWith(METADATA_PREFIX))) {
    return refuse(
      `${command} would change PartBuddy's own data in the design: the user's notes, or which parts print as one piece, which partbuddy_mechanism marks. Only the user writes notes; read them with partbuddy_view and continue without it.`,
    );
  }
  // A component's description is how PartBuddy tells a part SolidCraft's library put in (mirror.ts); written by
  // the assistant it would take a printed body out of print check, plate and export.
  if (command === 'component.metadata.set' && [...Object.keys(params), ...Object.keys(objectOr(params.values))].some((key) => key.trim().toLowerCase() === 'description')) {
    return refuse(
      `${command} with a description is not available in PartBuddy: PartBuddy tells bought standard parts from printed ` +
        'ones by the description SolidCraft gives the parts it inserts. Put a standard part in with parts.insert, change ' +
        'it with parts.resize, and continue without a description.',
    );
  }
  // Commands that run another command inside them: that one is decided as well.
  const nested = command === 'sketch.draw.dimensioned' || command === 'timeline.redefine' ? params : command === 'sketch.drag_end' ? params.constraint : undefined;
  if (nested !== undefined) {
    if (!isObject(nested) || (nested.params !== undefined && !isObject(nested.params))) return refuse(`${command} takes the command it runs as {"command": id, "params": {…}}.`);
    const inner = decideCommand(nested.command, objectOr(nested.params));
    if (!inner.allow) return refuse(`${command} runs ${commandId(nested.command) || 'no command'}: ${inner.reason}`);
  }
  const fileArguments = entryOf(FILE_ARGUMENTS, command) ?? [];
  for (const argument of fileArguments) {
    const value = params[argument];
    if (value === undefined) continue;
    // A photo the user sent (F6) may be laid out as a canvas or compared with the model; it is read, never written.
    if ((command === 'canvas.insert' || command === 'inspect.compare_picture') && isKeptPhoto(value)) continue;
    if (argument === 'font' && typeof value === 'string' && FONT_FAMILY.test(value)) continue;
    if (argument === 'reference') {
      return refuse(`${command} reads its reference from a file; PartBuddy allows only a photo the user sent in this session, at the path PartBuddy gave.`);
    }
    if (argument === 'font') return refuse(`${command} takes an installed font by its family name, such as "Arial"; PartBuddy does not let the assistant read a font file.`);
    return refuse(
      `${command} with ${argument} reads or writes a file; PartBuddy does not allow that for the assistant. Leave out ${argument} ` +
        'if the command can answer with its content, or continue without it.',
    );
  }
  // The net for a command FILE_ARGUMENTS does not list: a text in `file` or a `path` that is no curve id names a file.
  if (!fileArguments.includes('file') && typeof params.file === 'string') {
    return refuse(`${command} with a file reads a file; PartBuddy does not allow that for the assistant. Continue without it.`);
  }
  if (!fileArguments.includes('path') && typeof params.path === 'string' && !CURVE_ID.test(params.path)) {
    return refuse(
      `${command} with a path reads or writes a file; PartBuddy does not allow that for the assistant. Leave out path ` +
        'if the command can answer with its content, or continue without it.',
    );
  }
  return { allow: true };
}

const STEP_FORM = '{"command": "sketch.create", "params": {…}}';
const STEP_KEYS = new Set(['command', 'id', 'params']);

function decideBatch(args: Record<string, unknown>, depth: number): ToolDecision {
  // `path` runs the steps of a script file, which no rule here would see.
  if (args.path !== undefined && args.path !== null) {
    return refuse('batch with a path runs a script file; PartBuddy does not allow that for the assistant. Give the steps in commands.');
  }
  // audit H-30: what the policy cannot read is refused, not read as empty. SolidCraft parses a step's params given as
  // text (measured with 0.40.1: `params: "{}"` ran), so such a step would run what no rule here saw.
  if (!Array.isArray(args.commands)) return refuse(`batch takes its steps as a list in commands: ${STEP_FORM}.`);
  for (const [index, entry] of (args.commands as unknown[]).entries()) {
    if (!isObject(entry) || Object.keys(entry).some((key) => !STEP_KEYS.has(key))) return refuse(`batch step ${index}: a step is ${STEP_FORM}, with nothing else in it.`);
    if (entry.params !== undefined && !isObject(entry.params)) return refuse(`batch step ${index}: params must be a JSON object, not text or a list.`);
    const params = objectOr(entry.params);
    // SolidCraft also takes a step's command as `id`; whichever it reads, both are decided.
    const named = [entry.command, entry.id].filter((name) => name !== undefined);
    if (named.length === 0 || named.some((name) => typeof name !== 'string')) return refuse(`batch step ${index}: name its command by its id as text, ${STEP_FORM}.`);
    for (const command of named.map(commandId)) {
      const decision = BATCH_TOOL_STEPS.has(command) ? decideTool(command, params, depth + 1) : decideCommand(command, params);
      if (!decision.allow) return refuse(`batch step ${index} (${command}): ${decision.reason}`);
    }
  }
  return { allow: true };
}

function decideExecute(args: Record<string, unknown>): ToolDecision {
  if (args.params !== undefined && !isObject(args.params)) {
    return refuse('execute takes params as a JSON object, such as {"command": "solid.extrude", "params": {"distance": "5 mm"}}, not as text or a list.');
  }
  return decideCommand(args.command, objectOr(args.params));
}

function decideTool(name: string, args: Record<string, unknown>, depth: number): ToolDecision {
  const confirmation = entryOf(NEEDS_CONFIRMATION, name);
  if (confirmation) {
    return refuse(`${name} is not available in PartBuddy yet: ${confirmation}. Tell the user how to do it in PartBuddy instead.`);
  }
  if (!ALLOWED.has(name)) return refuse(`${name} is not allowed by PartBuddy. Continue with the other tools.`);
  // SolidCraft refuses nested batches itself; a deeper nesting is refused here rather than walked.
  if (depth > 2) return refuse(`${name} is nested too deeply`);
  const own = name === 'execute' ? decideExecute(args) : name === 'batch' ? decideBatch(args, depth) : null;
  if (own && !own.allow) return own;
  return decideArguments(name, args);
}

/**
 * The arguments each of SolidCraft's tools takes that the policy lets through, from tools/list of
 * SolidCraft 0.40.1 (which refuses any other with "unknown argument"). An argument that is not
 * listed is refused here too, so one a later SolidCraft adds, a file to write among them, does
 * not pass before someone has looked at it. Left out on purpose: `path` of `screenshot`, which
 * writes its PNG over any file in the folders SolidCraft may use (measured), and `path` of
 * `batch`, which runs a script file.
 */
export const TOOL_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  list_commands: ['compact', 'fields', 'filter', 'limit', 'offset', 'panel', 'prefix'],
  describe_command: ['id'],
  execute: ['command', 'expect', 'params', 'verbose'],
  batch: ['coalesce_parameters', 'commands', 'expect', 'profile', 'rollback', 'timings', 'verbose'],
  inspect_design: ['bodies', 'joints', 'measure', 'sketches', 'timeline'],
  measure: ['body', 'items', 'names_only', 'summary'],
  body_topology: ['body', 'faces'],
  set_parameter: ['comment', 'expression', 'name', 'unit', 'value'],
  check_parameters: ['bodies', 'report', 'set', 'summary'],
  screenshot: ['axes', 'camera', 'grid', 'height', 'source', 'view', 'width'],
  // `reference` is a file: only a photo PartBuddy kept (below).
  compare_picture: ['bodies', 'camera', 'crop_fraction', 'crop_px', 'fit', 'reference', 'rows', 'view'],
  running: [],
  pending: [],
  undo: [],
  redo: [],
  // `file` is a document of the skill, by its name (below).
  skill_reference: ['file', 'skill'],
};

function decideArguments(name: string, args: Record<string, unknown>): ToolDecision {
  // PartBuddy's own tools are answered by PartBuddy and check their arguments themselves.
  if (name.startsWith('partbuddy_')) return { allow: true };
  const known = entryOf(TOOL_ARGUMENTS, name);
  if (!known) return refuse(`${name} is not allowed by PartBuddy. Continue with the other tools.`);
  for (const [argument, value] of Object.entries(args)) {
    if (value === undefined) continue;
    if (!known.includes(argument)) {
      return refuse(
        name === 'screenshot' && argument === 'path'
          ? 'screenshot with a path writes a file; PartBuddy does not allow that for the assistant. Leave out path: the picture comes back in the answer.'
          : `${name} takes no argument ${argument} in PartBuddy; its arguments are: ${known.join(', ') || 'none'}.`,
      );
    }
  }
  // A photo the user sent (F6) may be compared with the model's outline; it is read, never written.
  if (name === 'compare_picture' && args.reference !== undefined && !isKeptPhoto(args.reference)) {
    return refuse('compare_picture reads its reference from a file; PartBuddy allows only a photo the user sent in this session, at the path PartBuddy gave. Continue without it.');
  }
  if (name === 'skill_reference' && args.file !== undefined && !(typeof args.file === 'string' && /^[\w-]+\.md$/.test(args.file))) {
    return refuse('skill_reference takes the name of a document of the skill (SKILL.md, reference.md), not a path.');
  }
  return { allow: true };
}

export function decide(name: string, args: Record<string, unknown>): ToolDecision {
  return decideTool(name, args, 0);
}

/**
 * The parameter names a call sets that must exist already (audit R17): `set_parameter` and
 * `parameters.change {name}` create a parameter of a name that does not exist, without an error
 * (measured with SolidCraft 0.40.1: `wnad` for `wand`, `recomputed: 0`), so a misspelt name
 * changes nothing. A name a `parameters.add` step or a dimension `name = value` makes earlier in
 * the same batch counts as existing. Names are compared trimmed and in their case, as SolidCraft
 * does. `parameters.change {changes}` is left out: SolidCraft refuses an unknown name there.
 */
// shortcut: a parameters.rename step earlier in the same batch is not followed, so its new name is refused; follow it when the assistant batches renames.
export function namesToChange(name: string, args: Record<string, unknown>): string[] {
  const added = new Set<string>();
  const names: string[] = [];
  const visit = (tool: string, params: Record<string, unknown>): void => {
    const command = tool === 'execute' ? commandId(params.command) : tool;
    const inner = tool === 'execute' ? objectOr(params.params) : params;
    const named = typeof inner.name === 'string' ? inner.name.trim() : null;
    if (command === 'batch') {
      for (const step of Array.isArray(params.commands) ? (params.commands as unknown[]) : []) {
        const { command: stepCommand, id, params: stepParams } = objectOr(step);
        // As decideBatch: a step that names its command twice is followed under both.
        for (const stepName of [stepCommand, id].filter((entry) => typeof entry === 'string')) visit(commandId(stepName), objectOr(stepParams));
      }
    } else if (command === 'execute') {
      visit('execute', inner);
    } else if (named !== null && command === 'parameters.add') {
      added.add(named);
    } else if (named !== null && (command === 'set_parameter' || command === 'parameters.change')) {
      if (!added.has(named)) names.push(named);
    } else {
      for (const made of dimensionNames(inner)) added.add(made);
    }
  };
  visit(name, args);
  return names;
}

/** Names a dimension makes with a value `name = expression` (sketch.dimension, sketch.draw.dimensioned), up to two levels deep. */
function dimensionNames(params: Record<string, unknown>, depth = 0): string[] {
  const names: string[] = [];
  for (const value of Object.values(params)) {
    const made = typeof value === 'string' ? /^\s*([A-Za-z_]\w*)\s*=/.exec(value)?.[1] : undefined;
    if (made) names.push(made);
    else if (isObject(value) && depth < 2) names.push(...dimensionNames(value, depth + 1));
  }
  return names;
}

/**
 * Refuses a call that would set a parameter of a name the design does not have ({@link namesToChange}),
 * with the names it has. It reads them with `parameters.list`, which changes nothing and, unlike
 * `inspect_design`, lists the features' own inputs (`d1`) too (measured with 0.40.1). When that read
 * fails, the call is refused with the reason rather than let through unchecked.
 */
export async function decideParameterNames(callTool: UpstreamTools['callTool'], name: string, args: Record<string, unknown>): Promise<ToolDecision> {
  const names = namesToChange(name, args);
  if (names.length === 0) return { allow: true };
  let known: string[];
  try {
    const result: ToolResult = await callTool('execute', { command: 'parameters.list', params: {} });
    const text = result.content.find((part) => part.type === 'text')?.text;
    if (result.isError || typeof text !== 'string') throw new Error(typeof text === 'string' ? text.slice(0, 300) : 'SolidCraft gave no answer');
    const list = objectOr(JSON.parse(text)).parameters;
    if (!Array.isArray(list)) throw new Error('the answer names no parameters');
    known = list.map((entry) => objectOr(entry).name).filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim());
  } catch (error) {
    return refuse(`PartBuddy could not read the design's parameters to check the name ${JSON.stringify(names[0])}: ${(error as Error).message}`);
  }
  const missing = names.find((entry) => !known.includes(entry));
  if (missing === undefined) return { allow: true };
  const list = known.slice(0, 60).join(', ') + (known.length > 60 ? ', …' : '');
  return refuse(
    `There is no parameter ${JSON.stringify(missing)}: setting it would make a new parameter and change nothing in the design. The parameters are: ` +
      `${list || 'none'}. Take the exact name, or add a new parameter with parameters.add.`,
  );
}
