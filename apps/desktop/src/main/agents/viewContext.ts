import type { Selection, ViewState } from '../../shared/contract';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * What the assistant learns about PartBuddy's 3D view (decided 2026-11-04): the selected face,
 * edge or vertex goes with each message as one line of text, and the `partbuddy_view` tool answers what the user
 * is looking at in about a hundred tokens. Both replace screenshots, which cost far more and show
 * SolidCraft's window instead of PartBuddy's view.
 */

export const VIEW_TOOL = 'partbuddy_view';

const round = (value: number) => Math.round(value * 100) / 100;
const vector = (values: readonly number[]) => values.map(round).join(' ');

/** Short label for the conversation, for example `F1:+z · Body1` or `vertex 0 0 10 · Body1`. */
export function selectionLabel(selection: Selection): string {
  switch (selection.kind) {
    case 'face':
      return `${selection.face} · ${selection.body}`;
    case 'edge':
      return `${selection.edge} · ${selection.body}`;
    case 'vertex':
      return `vertex ${vector(selection.point)} · ${selection.body}`;
  }
}

/** The note in front of the user's message (one line per selection; `alone`: the only one). */
export function selectionNote(selection: Selection, alone = true): string {
  const note = describeNote(selection);
  return alone ? note.replace(/\]$/, ` ${deictic(selection)}]`) : note;
}

function deictic(selection: Selection): string {
  if (selection.kind === 'face') return '"This face" or "the selected face" means this one.';
  if (selection.kind === 'edge') return '"This edge" or "the selected edge" means this one.';
  return '"This corner" or "this point" means this one.';
}

function describeNote(selection: Selection): string {
  switch (selection.kind) {
    case 'face': {
      const shape = selection.surface === 'cylinder' && selection.radius ? `cylinder r ${round(selection.radius)} mm` : selection.surface;
      return (
        `[PartBuddy: the user selected face "${selection.face}" of body "${selection.body}" in PartBuddy's view ` +
        `(${shape}, normal ${vector(selection.normal)}, ${round(selection.area)} mm², picked at ${vector(selection.point)} mm).]`
      );
    }
    case 'edge': {
      const shape = selection.radius ? `arc on r ${round(selection.radius)} mm` : selection.ends.length === 2 ? 'open' : 'closed loop';
      const [from, to] = selection.ends;
      const ends = from && to ? `, from ${vector(from)} to ${vector(to)} mm` : '';
      const exact = selection.exact ? '' : ' The two faces meet along more than one edge; the picked point tells which.';
      return (
        `[PartBuddy: the user selected edge "${selection.edge}" of body "${selection.body}" in PartBuddy's view ` +
        `(${shape}, length ${round(selection.length)} mm${ends}, picked at ${vector(selection.point)} mm).${exact}]`
      );
    }
    case 'vertex':
      return (
        `[PartBuddy: the user selected the vertex at ${vector(selection.point)} mm of body "${selection.body}" in PartBuddy's view.]`
      );
  }
}

/** The selection in the `partbuddy_view` answer. */
function describeSelection(selection: Selection): Record<string, unknown> {
  switch (selection.kind) {
    case 'face':
      return { face: selection.face, body: selection.body, surface: selection.surface, normal: selection.normal.map(round), point: selection.point.map(round) };
    case 'edge':
      return { edge: selection.edge, body: selection.body, length: round(selection.length), point: selection.point.map(round) };
    case 'vertex':
      return { vertex: selection.point.map(round), body: selection.body };
  }
}

/**
 * The message as the model gets it, and the label the conversation shows. `note` (from the work
 * log) goes first: what changed outside the model's turns.
 */
export function composeMessage(text: string, selections: Selection[] = [], note: string | null = null): { prompt: string; label?: string } {
  const composed = composeSelection(text, selections);
  return note ? { ...composed, prompt: `${note}\n${composed.prompt}` } : composed;
}

function composeSelection(text: string, selections: Selection[]): { prompt: string; label?: string } {
  const [first] = selections;
  if (!first) return { prompt: text };
  const label = selections.map(selectionLabel).join('; ').slice(0, 400);
  if (selections.length === 1) return { prompt: `${selectionNote(first)}\n\n${text}`, label };
  const notes = selections.map((selection, i) => `${i + 1}. ${selectionNote(selection, false)}`).join('\n');
  const together = `[PartBuddy: the user selected these ${selections.length} elements together; "these" or "the selected ones" means all of them.]`;
  return { prompt: `${together}\n${notes}\n\n${text}`, label };
}

/** Where the camera looks from, in words: `front-right-top`, `top`, … (Z up, front is -Y). */
export function viewDirection(position: readonly number[], target: readonly number[]): string {
  const d = position.map((value, i) => value - (target[i] ?? 0));
  const length = Math.hypot(...d);
  if (length === 0) return 'unknown';
  const [x, y, z] = d.map((value) => value / length) as [number, number, number];
  const words: string[] = [];
  // A component counts when the view leans at least 20° towards it.
  const lean = Math.sin((20 * Math.PI) / 180);
  if (y < -lean) words.push('front');
  if (y > lean) words.push('back');
  if (x > lean) words.push('right');
  if (x < -lean) words.push('left');
  if (z > lean) words.push('top');
  if (z < -lean) words.push('bottom');
  return words.join('-') || 'unknown';
}

/** The user's own notes on the model (ADR 0020), as `partbuddy_view` lists them. */
export interface ViewNotes {
  notes: { id: string; on: string; status: string; text: string }[];
  foreignWaiting: number;
}

/** The tool's answer: compact JSON text, no images. */
export function describeView(state: ViewState | null, notes?: ViewNotes | null): string {
  if (!state) return JSON.stringify({ view: 'PartBuddy shows no design yet' });
  const notesPart = notes
    ? {
        notes: notes.notes,
        ...(notes.foreignWaiting > 0
          ? { foreignNotes: `${notes.foreignWaiting} note(s) from the design file are not shown until the user accepts them` }
          : {}),
      }
    : {};
  return JSON.stringify({
    selected: state.selections.map(describeSelection),
    camera: state.camera
      ? { from: viewDirection(state.camera.position, state.camera.target), target: state.camera.target.map(round), distance: round(Math.hypot(...state.camera.position.map((v, i) => v - (state.camera?.target[i] ?? 0)))) }
      : null,
    bodies: state.bodies,
    sketches: state.sketches,
    lastStepChanged: state.changes,
    ...notesPart,
  });
}

const viewTool: UpstreamTool = {
  name: VIEW_TOOL,
  description:
    "What the user sees in PartBuddy's 3D view right now: the selected face, edge or vertex, the direction the camera looks from, " +
    'the bodies and sketches shown, what the last step changed and the user\'s notes on the model. Text only, about 100 tokens ' +
    'plus the notes. Use it instead of ' +
    "a screenshot to know what the user selected or looks at; SolidCraft's own window selection is not PartBuddy's.",
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
};

/** SolidCraft's tools plus `partbuddy_view`, answered by PartBuddy itself. */
export function withViewTool(upstream: UpstreamTools, state: () => ViewState | null, notes: () => ViewNotes | null = () => null): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), viewTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name === VIEW_TOOL) return { content: [{ type: 'text', text: describeView(state(), notes()) }] };
      return upstream.callTool(name, args, callId);
    },
  };
}

/** Added to the role prompt of every route. */
export const VIEW_GUIDANCE =
  'A message may start with a [PartBuddy: …] note naming the face, edge or vertex the user selected in PartBuddy’s view; ' +
  `that is what "this face", "this edge" or "the marked one" means. Call ${VIEW_TOOL} to see what the user looks at. ` +
  'Take a screenshot only when the look of the part matters: it costs many tokens.';
