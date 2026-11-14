import type { PrintSettings } from '../../../shared/contract';

/**
 * The design-rule and hint switches sit beside the profile editor, and each holds its own copy of the print settings
 * (BC-24 review). Each saves onto the settings as stored just before: a switch changes only its own value, the editor
 * only printers and materials.
 * shortcut: read and save are two calls, so a switch and an editor save within the same moment can still lose one;
 * merge in the main process with one patch call if that turns up.
 */
export function withSwitch(stored: PrintSettings, group: 'design' | 'hints', key: string, on: boolean): PrintSettings {
  return { ...stored, [group]: { ...stored[group], [key]: on } };
}

/** The editor's profiles onto the switches as stored. */
export function withProfiles(edited: PrintSettings, stored: PrintSettings): PrintSettings {
  return { ...edited, design: stored.design, hints: stored.hints };
}
