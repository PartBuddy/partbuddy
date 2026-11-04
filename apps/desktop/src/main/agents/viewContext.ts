import type { FaceSelection, ViewState } from '../../shared/contract';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * What the assistant learns about PartBuddy's 3D view (decided 2026-11-04): the selected face
 * goes with each message as one line of text, and the `partbuddy_view` tool answers what the user
 * is looking at in about a hundred tokens. Both replace screenshots, which cost far more and show
 * SolidCraft's window instead of PartBuddy's view.
 */

export const VIEW_TOOL = 'partbuddy_view';

const round = (value: number) => Math.round(value * 100) / 100;
const vector = (values: readonly number[]) => values.map(round).join(' ');

/** Short label for the conversation, for example `F1:+z · Body1`. */
export function selectionLabel(selection: FaceSelection): string {
  return `${selection.face} · ${selection.body}`;
}

/** The note in front of the user's message. */
export function selectionNote(selection: FaceSelection): string {
  const shape = selection.surface === 'cylinder' && selection.radius ? `cylinder r ${round(selection.radius)} mm` : selection.surface;
  return (
    `[PartBuddy: the user selected face "${selection.face}" of body "${selection.body}" in PartBuddy's view ` +
    `(${shape}, normal ${vector(selection.normal)}, ${round(selection.area)} mm², picked at ${vector(selection.point)} mm). ` +
    `"This face" or "the selected face" means this one.]`
  );
}

/** The message as the model gets it, and the label the conversation shows. */
export function composeMessage(text: string, selection?: FaceSelection): { prompt: string; label?: string } {
  if (!selection) return { prompt: text };
  return { prompt: `${selectionNote(selection)}\n\n${text}`, label: selectionLabel(selection) };
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

/** The tool's answer: compact JSON text, no images. */
export function describeView(state: ViewState | null): string {
  if (!state) return JSON.stringify({ view: 'PartBuddy shows no design yet' });
  return JSON.stringify({
    selected: state.selection
      ? { face: state.selection.face, body: state.selection.body, surface: state.selection.surface, normal: state.selection.normal.map(round), point: state.selection.point.map(round) }
      : null,
    camera: state.camera
      ? { from: viewDirection(state.camera.position, state.camera.target), target: state.camera.target.map(round), distance: round(Math.hypot(...state.camera.position.map((v, i) => v - (state.camera?.target[i] ?? 0)))) }
      : null,
    bodies: state.bodies,
    sketches: state.sketches,
    lastStepChanged: state.changes,
  });
}

const viewTool: UpstreamTool = {
  name: VIEW_TOOL,
  description:
    "What the user sees in PartBuddy's 3D view right now: the selected face, the direction the camera looks from, " +
    'the bodies and sketches shown and what the last step changed. Text only, about 100 tokens. Use it instead of ' +
    "a screenshot to know what the user selected or looks at; SolidCraft's own window selection is not PartBuddy's.",
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
};

/** SolidCraft's tools plus `partbuddy_view`, answered by PartBuddy itself. */
export function withViewTool(upstream: UpstreamTools, state: () => ViewState | null): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), viewTool],
    callTool: async (name, args): Promise<ToolResult> => {
      if (name === VIEW_TOOL) return { content: [{ type: 'text', text: describeView(state()) }] };
      return upstream.callTool(name, args);
    },
  };
}

/** Added to the role prompt of every route. */
export const VIEW_GUIDANCE =
  'A message may start with a [PartBuddy: …] note naming the face the user selected in PartBuddy’s view; ' +
  `that is the face meant by "this face" or "the marked face". Call ${VIEW_TOOL} to see what the user looks at. ` +
  'Take a screenshot only when the look of the part matters: it costs many tokens.';
