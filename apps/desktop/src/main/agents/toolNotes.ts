/**
 * PartBuddy's own notes on SolidCraft's tools, added after SolidCraft's server instructions for
 * every route (gate proxy for Claude Code, own loop for ChatGPT). They name the traps of
 * SolidCraft 0.30.1 that cost a model a wasted call or a silent wrong result, and the rules
 * PartBuddy's tool policy enforces, so the model knows them before a refusal tells it.
 */
export const TOOL_NOTES = [
  'PartBuddy notes on these tools (they take precedence over the notes above):',
  '- History: PartBuddy shows every change as a step the user can go back to, built on undo and redo. Go back with `undo` ' +
    'and `redo`. `edit.checkpoint` and `edit.restore_checkpoint` are refused: restoring drops every later step.',
  '- Files: PartBuddy saves the design after every change, and the user exports with PartBuddy’s Export button. `save`, ' +
    '`open`, `new_design`, `export`, file, document and settings commands and every command given a file `path` are refused, ' +
    'also as `batch` steps. Commands that can answer with their content instead (`sketch.export_dxf`, `parameters.export`, ' +
    '`timeline.export_script`) work without `path`.',
  '- Parameters: `set_parameter` and `parameters.change` create a new parameter when no parameter has that name, without ' +
    'an error, so a misspelt name changes nothing in the design. Take the exact name from `inspect_design` or ' +
    '`parameters.list`, and check `recomputed` in the reply: 0 means no feature follows the change.',
  '- Arcs: sketches keep every arc counter-clockwise. An arc drawn with `clockwise: true` or a negative `sweep` is stored ' +
    'with start and end swapped, point ids included (`a1.start` then lies where you drew the end). Take arc points from ' +
    '`sketch.inspect` before you dimension or constrain them.',
  '- `describe_command` takes `{"id": "solid.extrude"}`, not `command`.',
].join('\n');

/** SolidCraft's server instructions, followed by PartBuddy's notes. */
export function withToolNotes(instructions: string | undefined): string {
  return instructions ? `${instructions}\n\n${TOOL_NOTES}` : TOOL_NOTES;
}
