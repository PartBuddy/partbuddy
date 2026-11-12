/**
 * Tool policy of the gate proxy (ADR 0010, ADR 0015). Every SolidCraft tool an external agent
 * calls passes here first; the model cannot skip it, because the agent sees SolidCraft only
 * through PartBuddy's proxy.
 */

import { METADATA_PREFIX } from '../notes/noteRecord';
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

/**
 * Engine commands that open, save, export, upload or hand files to other programs, change app
 * settings or read crash reports.
 */
const FILE_COMMANDS = /^(file|doc|settings|diagnostics)\./;

/**
 * The only text a geometry `path` holds: a sketch curve id such as "l1". SolidCraft also uses
 * `path` for curve lists, occurrence paths and edge refs (arrays and objects); any other text in
 * `path` is taken as a file name, so an unknown form is refused rather than written.
 */
const CURVE_ID = /^[a-z]{1,3}\d{1,6}$/;

/** Metadata commands and the keys they write: PartBuddy's own keys hold the user's notes (ADR 0020). */
const METADATA_WRITES = new Set(['document.metadata.set', 'document.metadata.remove', 'component.metadata.set']);

function metadataKeys(params: Record<string, unknown>): string[] {
  const keys: string[] = [];
  if (typeof params.key === 'string') keys.push(params.key);
  if (Array.isArray(params.keys)) keys.push(...params.keys.filter((key): key is string => typeof key === 'string'));
  if (typeof params.values === 'object' && params.values !== null) keys.push(...Object.keys(params.values));
  return keys;
}

/** Checkpoints restore around PartBuddy's undo-based work log (ADR 0018) and drop its later steps. */
const HISTORY_COMMANDS = new Set(['edit.checkpoint', 'edit.restore_checkpoint']);

const refuse = (reason: string): ToolDecision => ({ allow: false, reason });

function objectOr(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * A command id as the rules below compare it. SolidCraft reads ids in any case (`File.Export`,
 * `COMPONENT.METADATA.SET` run; measured with 0.40.1), so every rule sees the lower-case id. Tool
 * names and parameter keys it takes only as written (`Execute`, `Path`, `Key` are unknown or ignored).
 */
const commandId = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** One engine command, as `execute` or a `batch` step sends it. */
function decideCommand(id: unknown, params: Record<string, unknown>): ToolDecision {
  const command = commandId(id);
  if (FILE_COMMANDS.test(command)) {
    return refuse(
      `${command} reads or writes files or settings; PartBuddy does not allow it for the assistant. PartBuddy saves the ` +
        'design by itself, and the user exports with the Export button. Continue without it.',
    );
  }
  if (METADATA_WRITES.has(command) && metadataKeys(params).some((key) => key.toLowerCase().startsWith(METADATA_PREFIX))) {
    return refuse(
      `${command} would change PartBuddy's notes; only the user writes notes. Read them with partbuddy_view and continue without it.`,
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
  if (HISTORY_COMMANDS.has(command)) {
    return refuse(
      `${command} is not available in PartBuddy: PartBuddy keeps the history as steps the user can go back to. Use undo ` +
        'and redo instead.',
    );
  }
  // A photo the user sent (F6) may be laid out as a canvas; it is read, never written.
  if (command === 'canvas.insert' && isKeptPhoto(params.path)) {
    return { allow: true };
  }
  // The engine's own command behind the compare_picture tool reads its reference the same way.
  if (command === 'inspect.compare_picture' && params.reference !== undefined && !isKeptPhoto(params.reference)) {
    return refuse(`${command} reads its reference from a file; PartBuddy allows only a photo the user sent in this session, at the path PartBuddy gave.`);
  }
  // The other parameter that names a file (sketch.replace: a design file to read from).
  if (typeof params.file === 'string') {
    return refuse(`${command} with a file reads a file; PartBuddy does not allow that for the assistant. Continue without it.`);
  }
  if (typeof params.path === 'string' && !CURVE_ID.test(params.path)) {
    return refuse(
      `${command} with a path reads or writes a file; PartBuddy does not allow that for the assistant. Leave out path ` +
        'if the command can answer with its content, or continue without it.',
    );
  }
  return { allow: true };
}

function decideBatch(args: Record<string, unknown>, depth: number): ToolDecision {
  // `path` runs the steps of a script file, which no rule here would see.
  if (args.path !== undefined && args.path !== null) {
    return refuse('batch with a path runs a script file; PartBuddy does not allow that for the assistant. Give the steps in commands.');
  }
  const steps = Array.isArray(args.commands) ? (args.commands as unknown[]) : [];
  for (const [index, entry] of steps.entries()) {
    const step = objectOr(entry);
    const params = objectOr(step.params);
    // SolidCraft also takes a step's command as `id`; whichever it reads, both are decided.
    const named = [step.command, step.id].filter((name) => typeof name === 'string').map(commandId);
    for (const command of named.length > 0 ? named : ['']) {
      const decision = BATCH_TOOL_STEPS.has(command) ? decideTool(command, params, depth + 1) : decideCommand(command, params);
      if (!decision.allow) return refuse(`batch step ${index} (${command || 'no command'}): ${decision.reason}`);
    }
  }
  return { allow: true };
}

function decideTool(name: string, args: Record<string, unknown>, depth: number): ToolDecision {
  const confirmation = NEEDS_CONFIRMATION[name];
  if (confirmation) {
    return refuse(`${name} is not available in PartBuddy yet: ${confirmation}. Tell the user how to do it in PartBuddy instead.`);
  }
  if (!ALLOWED.has(name)) return refuse(`${name} is not allowed by PartBuddy. Continue with the other tools.`);
  // SolidCraft refuses nested batches itself; a deeper nesting is refused here rather than walked.
  if (depth > 2) return refuse(`${name} is nested too deeply`);
  const own = name === 'execute' ? decideCommand(args.command, objectOr(args.params)) : name === 'batch' ? decideBatch(args, depth) : null;
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
  const known = TOOL_ARGUMENTS[name];
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
