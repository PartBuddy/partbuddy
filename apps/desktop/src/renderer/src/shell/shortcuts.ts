/**
 * The keyboard and mouse shortcuts of PartBuddy, for the overview in the settings. Read-only: the
 * handlers live where they act (DesignActions, ProjectMenu, SettingsDialog, Viewer, SketchPad), so
 * a new shortcut there gets a line here. `keys` are alternatives; each is a list of key tokens,
 * named tokens are translated under `settings.keys.token`.
 */
export interface Shortcut {
  id: string;
  group: 'app' | 'design' | 'view' | 'sketch';
  label: string;
  keys: string[][];
}

const SKETCH_TOOLS = [
  ['select', 'V'],
  ['pen', 'P'],
  ['line', 'L'],
  ['rect', 'R'],
  ['circle', 'C'],
  ['arc', 'A'],
  ['dimension', 'M'],
  ['text', 'T'],
  ['eraser', 'E'],
] as const;

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'settings', group: 'app', label: 'settings.title', keys: [['ctrl', ',']] },
  { id: 'newProject', group: 'app', label: 'project.new', keys: [['ctrl', 'N']] },
  { id: 'openProject', group: 'app', label: 'settings.keys.openProject', keys: [['ctrl', 'O']] },
  { id: 'close', group: 'app', label: 'settings.keys.close', keys: [['esc']] },
  { id: 'undo', group: 'design', label: 'actions.undo', keys: [['ctrl', 'Z']] },
  { id: 'redo', group: 'design', label: 'actions.redo', keys: [['ctrl', 'Y'], ['ctrl', 'shift', 'Z']] },
  { id: 'rotate', group: 'view', label: 'settings.keys.rotate', keys: [['drag']] },
  { id: 'pan', group: 'view', label: 'settings.keys.pan', keys: [['rightDrag']] },
  { id: 'zoom', group: 'view', label: 'settings.keys.zoom', keys: [['wheel']] },
  { id: 'deselect', group: 'view', label: 'settings.keys.deselect', keys: [['esc']] },
  ...SKETCH_TOOLS.map(([tool, key]) => ({ id: `sketch.${tool}`, group: 'sketch' as const, label: `assistant.sketch.tool.${tool}`, keys: [[key]] })),
  { id: 'sketch.delete', group: 'sketch', label: 'settings.keys.deleteItem', keys: [['del']] },
];
