/**
 * Tool policy of the gate proxy (ADR 0010, ADR 0015). Every SolidCraft tool an external agent
 * calls passes here first; the model cannot skip it, because the agent sees SolidCraft only
 * through PartBuddy's proxy.
 */

import type { JsonSchemaValidator } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';

import { fitMarkOf } from '../../shared/designFit';
import { TAPPED_FROM } from '../../shared/mechanisms';
import { groupOf, PRINT_GROUP } from '../../shared/parameterGroup';
import { METADATA_PREFIX } from '../notes/noteRecord';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { COMMAND_GROUPS, GROUP_EXCEPTIONS, KNOWN_COMMANDS, KNOWN_COMMANDS_VERSION } from './knownCommands';
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
  // Builds a mechanism (hinge, guide, closure, screw joint, screw lid, snap hooks, plug with pegs or a dovetail, latch) from engine commands (mechanismTool.ts), answered by PartBuddy.
  'partbuddy_mechanism',
  // Builds a function block or a wall mounting from the standard tables (blockTool.ts), answered by PartBuddy.
  'partbuddy_block',
  // The rules and sizes for a kind of part (standardTool.ts), answered by PartBuddy; it builds nothing.
  'partbuddy_standard',
  // The review before "done": view, check, pictures and checklist (review.ts), answered by PartBuddy; it changes nothing.
  'partbuddy_review',
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
 * Tools SolidCraft also runs as `batch` steps (batch tool description; read on 0.30.1, still the same on
 * 0.40.0-rc.4 by the audit of 2026-11-12, S-29; not read again on 0.40.1). Such a
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
const PLASTIC_RULES_REASON =
  "sets SolidCraft's injection-moulding rules (draft, clearance), which plastic features then take as defaults; PartBuddy " +
  'sizes for printing from the print profile instead. Continue without it.';

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
  // 0.41.0: plugins are third-party code that runs inside SolidCraft, past every check of PartBuddy's.
  plugin:
    "installs or runs SolidCraft plugins, third-party code that runs outside PartBuddy's checks; PartBuddy does not allow that for the assistant. Continue with the modelling commands.",
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
  // audit S-12: SolidCraft's plastic rules are injection-moulding rules (draft, clearance) that plastic features take as defaults.
  'plastic.manage_rules': PLASTIC_RULES_REASON,
  'plastic.assign_rule': PLASTIC_RULES_REASON,
};

/**
 * Raw commands PartBuddy has a checked way for (audit R2, BC-13; decided by Manuel 2026-11-13): each is refused with
 * the call that builds it, which takes its sizes from PartBuddy's tables and measures where it goes before it builds.
 * The other modelling commands stay open, and the ready-to-print check of each change goes back with the answer
 * (workLog.ts, printCheckNote.ts). PartBuddy's own tools send these commands below the policy and stay free. From the
 * catalogue of SolidCraft 0.40.1; `document.units` is refused with its group (audit S-22).
 * shortcut: raw solid.fillet, solid.chamfer and solid.shell are only checked after the change, not held to the rules of the selection actions (bed edges chamfered, shell walls in whole lines) before it; the policy knows neither the bed nor the printer. Give `decide` the print profile and share those rules once BC-08 (#385) is merged.
 */
export const CHECKED_WAYS: Record<string, string> = {
  'solid.hole':
    'is built by PartBuddy, which takes clearance, head, nut and insert sizes from its tables and measures the wall before it drills (a thread on solid.hole is cosmetic unless modeled). Use partbuddy_block: {"block": "screwHole"} (head cap, countersunk or none), ' +
    `"tappedHole" (M${String(TAPPED_FROM)} and larger), "insertSeat" (a heat-set insert) or "nutTrap"; or partbuddy_mechanism {"kind": "screw"} for two parts screwed together. ` +
    'An opening that holds no screw (a cable, a vent) is cut from a sketch with solid.extrude {"operation": "cut"}.',
  'solid.thread':
    `is cosmetic unless modeled, and printed threads under M${String(TAPPED_FROM)} strip. Use partbuddy_block {"block": "tappedHole"} (M${String(TAPPED_FROM)} and larger) or {"block": "insertSeat"} for a screw, or partbuddy_mechanism {"kind": "lid"} for a container that screws shut.`,
  'plastic.boss':
    'is an injection-moulding boss (draft and wall from SolidCraft\'s plastic rules) with no seat for an insert. Use partbuddy_block {"block": "boss"}, which sizes the boss and its seat from the insert and stands it straight for printing.',
  'plastic.snap_fit':
    'is an injection-moulding snap hook, and nothing tells its strain. Use partbuddy_block {"block": "snapFit"}, which says the strain at the arm\'s root, or partbuddy_mechanism {"kind": "snap"} for a part that clips onto another.',
  'plastic.lip':
    'is an injection-moulding lip (SolidCraft\'s plastic rules). Use partbuddy_block {"block": "lip"} (type lip or groove), or partbuddy_mechanism {"kind": "closure"} for a lid that snaps shut on its box.',
  // audit S-18: measured with 0.40.1, a screw hole of the block went from 3.4 to 1.7 mm at factor 0.5 without a word.
  'solid.scale':
    'scales the screw holes, insert seats, threads and gaps of the body with it, which then fit no screw or insert. Change the sizes with set_parameter, or build the part again at its size; if the user wants it scaled, tell them so.',
};

/**
 * Keys of `timeline.edit {set}` that only holes and threads carry: with them an edit makes on an existing hole what
 * {@link CHECKED_WAYS} refuses raw (a cosmetic thread, SolidCraft's clearance).
 * shortcut: other edits of a block's feature (its diameter, its depth) and `parameters.change` on its inputs are let through and checked after; track the features a block built if the assistant takes that way.
 */
const HOLE_KEYS = new Set(['thread', 'modeled', 'designation', 'clearance']);

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
  const made = decideNewParameters(command, params);
  if (!made.allow) return made;
  const checked = entryOf(CHECKED_WAYS, command);
  if (checked) return refuse(`${command} ${checked} Call that instead; if it cannot build what you need, tell the user what is missing.`);
  if (command === 'timeline.edit' && Object.keys(objectOr(params.set)).some((key) => HOLE_KEYS.has(key.split('.')[0]?.trim().toLowerCase() ?? ''))) {
    return refuse(`${command} with ${[...HOLE_KEYS].join(', ')} makes a thread or a screw's clearance on a hole, which partbuddy_block builds for printing (as solid.hole). Build the hole again with partbuddy_block, or leave those keys out.`);
  }
  const group = command.slice(0, command.indexOf('.'));
  if (!COMMAND_GROUPS.has(group) && !GROUP_EXCEPTIONS.has(command)) {
    return refuse(`${command} ${entryOf(GROUP_REASONS, group) ?? 'is not available in PartBuddy. Continue with the modelling and inspection commands.'}`);
  }
  // shortcut: construct.plane, construct.axis and construct.point run the first construct.* command of their family that takes the refs, which this check never sees, so a construct.* command a later SolidCraft adds is reachable through them until it is on the list; look at those three when the contract test names a new construct id.
  if (!KNOWN_COMMANDS.has(command)) return refuse(uncheckedCommand(command, group));
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

/** How many known commands a refusal of an unknown one names (the sketch group alone has 131). */
const CLOSEST_COMMANDS = 20;

/**
 * Why a command of an allowed group that PartBuddy does not know is refused (audit S-03, BC-26): it was misspelt, or a
 * later SolidCraft added it, and nobody has looked at what it builds. Names the group's commands the assistant may use.
 */
function uncheckedCommand(command: string, group: string): string {
  const known = [...KNOWN_COMMANDS].filter((id) => id.startsWith(`${group}.`) && !Object.hasOwn(REFUSED_COMMANDS, id) && !Object.hasOwn(CHECKED_WAYS, id));
  // The closest by name first: the longest shared start, then the fewest edits. Compared on the first 64 signs (the
  // longest id of SolidCraft 0.41.0 has 41), so an id of any length costs no more than a short one on the main thread.
  const name = command.slice(0, 64);
  const shared = (id: string): number => {
    let length = 0;
    while (length < id.length && id[length] === name[length]) length++;
    return length;
  };
  const closest = known.map((id) => ({ id, start: shared(id), edits: editDistance(id, name) })).sort((a, b) => b.start - a.start || a.edits - b.edits);
  const named = closest.slice(0, CLOSEST_COMMANDS).map(({ id }) => id);
  const rest = known.length > named.length ? `; list_commands {"prefix": "${group}."} lists the rest` : '';
  return (
    `${command} is not checked by PartBuddy yet: PartBuddy knows the commands up to SolidCraft ${KNOWN_COMMANDS_VERSION}, and this one is misspelt or newer. ` +
    `Use ${/^[aeiou]/.test(group) ? 'an' : 'a'} ${group} command it knows, such as ${named.join(', ')}${rest}. If none of them does what you need, tell the user what is missing.`
  );
}

/** Levenshtein distance of two short ids. */
function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] ?? 0;
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

/** Whether the assistant is offered a tool at all (audit S-04): one the policy refuses whatever its arguments is left out of its list. */
export function offeredTool(name: string): boolean {
  return ALLOWED.has(name);
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

/**
 * Name segments that mark a parameter as a clearance or an allowance (the rule "Which parameters" of toolNotes.ts): those
 * come from the print profile, into the feature or a formula. Only the name counts, split at _, - and camel case, and
 * only a whole segment: "lid_gap", "fitClearance", "Spiel" match, "kartenspiel", "abluft", "einpassung", "gapless" and
 * "fitting" do not. Group and label stay free ("[Brettspiel] Tiefe", "Gap width" of a vent slot).
 * shortcut: a run-together lower-case name ("lidgap") is not split and passes; list it with the compounds if the assistant writes such names.
 */
const CLEARANCE_SEGMENTS = new Set([
  'clearance', 'allowance', 'tolerance', 'play', 'spiel', 'passung', 'zugabe', 'toleranz', 'luft', 'gap', 'fit',
  // German compounds that are a clearance or an allowance as a whole.
  'lochzugabe', 'steckpassung', 'presspassung', 'schiebepassung', 'axialspiel', 'radialspiel', 'restluft',
]);
const GROUPED_EXAMPLE = '"[Monitor] Ultrawide-Höhe"';
const PRINT_EXAMPLE = `"[${PRINT_GROUP}] Bodenstärke [auto 5×layer]"`;

/** "hole_clearance", "fitClearance", "Lid-Gap" → its lower-case segments. */
const segmentsOf = (name: string): string[] =>
  name
    .replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zäöüß]+/)
    .filter((segment) => segment !== '');

/**
 * The parameters a command makes: `parameters.add` needs a comment that starts with its group, and no new parameter
 * (a dimension `name = value` included) may be named as a clearance or an allowance unless it carries a fit mark. Changing,
 * renaming and commenting a parameter that exists stays free; `set_parameter` and `parameters.change` cannot make
 * one (decideParameterNames refuses an unknown name).
 * shortcut: a dimension `name = value` carries no comment, so it is held to the clearance words only; refuse it
 * without a group too once a measurement shows SolidCraft lists such a name as a user parameter in the panel.
 */
function decideNewParameters(command: string, params: Record<string, unknown>): ToolDecision {
  const made: { name: string; comment: string | null }[] = dimensionNames(params).map((name) => ({ name, comment: null }));
  if (command === 'parameters.add') made.push({ name: typeof params.name === 'string' ? params.name.trim() : '', comment: typeof params.comment === 'string' ? params.comment : '' });
  for (const { name, comment } of made) {
    if (comment !== null && groupOf(comment) === null) {
      return refuse(
        `${command} needs a comment that starts with the parameter's group, as "[Group] Label", such as ${GROUPED_EXAMPLE}: ` +
          'the group is one or two words for a part of the design or what it holds (no digits), the label at most 24 characters in the ' +
          `user's language. A size the print profile marks for refitting goes into the group [${PRINT_GROUP}] with its mark: ${PRINT_EXAMPLE}. ` +
          (name === '' ? 'Add the parameter again with its name and such a comment.' : `Add ${JSON.stringify(name)} again with such a comment.`),
      );
    }
    // Only the forms designFit.ts refits ("[auto 3×line]") keep a clearance a parameter.
    if (fitMarkOf(comment ?? '') === null && segmentsOf(name).some((segment) => CLEARANCE_SEGMENTS.has(segment))) {
      return refuse(
        `${JSON.stringify(name)} would be a clearance or allowance parameter, and those are never parameters of their own: the hole ` +
          'allowance and the clearances come from the print profile, and partbuddy_block and partbuddy_mechanism apply them themselves. ' +
          "Where you model a fit yourself, write the number from the print profile's note into the feature or a formula over the nominal size. " +
          `Only a size the print profile marks for refitting stays a parameter, in the group [${PRINT_GROUP}] with its mark: ${PRINT_EXAMPLE}. ` +
          'If the word means something else here (a game, ventilation, a slot the user asked for), name the parameter by what it sets instead, e.g. vent_slot_width.',
      );
    }
  }
  return { allow: true };
}

const validators = new AjvJsonSchemaValidator();
/** Compiled input schemas by their text: the same few tools come back on every list. */
const compiled = new Map<string, JsonSchemaValidator<unknown> | null>();

/**
 * Why a call's arguments do not fit the tool's input schema, or null when they fit (audit W28): neither the MCP
 * client nor the AI SDK checks them, so a value over a schema's limit or an unknown key reached the tool. A schema
 * that does not compile is not held against the call.
 * shortcut: such a schema lets every call through unchecked (none of SolidCraft 0.40.1's 22 does); log it if one turns up.
 */
export function inputProblem(tool: UpstreamTool, args: Record<string, unknown>): string | null {
  const key = JSON.stringify(tool.inputSchema);
  let check = compiled.get(key);
  if (check === undefined) {
    try {
      check = validators.getValidator(tool.inputSchema);
    } catch (error) {
      // Its calls then go on unchecked, as before the check; said once per schema (cached below).
      console.warn(`Warning: the input schema of ${tool.name} does not compile, so its calls are not checked against it: ${(error as Error).message.slice(0, 200)}`);
      check = null;
    }
    if (compiled.size > 200) compiled.clear();
    compiled.set(key, check);
  }
  const result = check?.(args);
  if (!result || result.valid) return null;
  return `PartBuddy refused this call: its arguments do not fit the input schema of ${tool.name} (${result.errorMessage.slice(0, 300)}). Call it again with the arguments that schema describes.`;
}
