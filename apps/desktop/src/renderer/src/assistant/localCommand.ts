import type { ExportFormat } from '../../../shared/contract';
import type { StandardView } from '../state/store';

/**
 * Chat messages PartBuddy carries out itself, without a model (Manuel, 2026-11-15, issue #446): each would cost a whole
 * model turn for what a button or key does. Only a short message that is nothing but the command counts, so "undo the
 * fillet and make it 3 mm" still goes to the assistant.
 */
export type LocalCommand = { kind: 'undo' } | { kind: 'redo' } | { kind: 'view'; view: StandardView } | { kind: 'export'; format: ExportFormat };

/** The event the panel sends and the design actions and view tools carry out. */
export const LOCAL_COMMAND_EVENT = 'partbuddy:local-command';

const VIEWS: Record<string, StandardView> = {
  oben: 'top',
  top: 'top',
  above: 'top',
  unten: 'bottom',
  bottom: 'bottom',
  below: 'bottom',
  vorne: 'front',
  vorn: 'front',
  front: 'front',
  hinten: 'back',
  back: 'back',
  rechts: 'right',
  right: 'right',
  links: 'left',
  left: 'left',
  iso: 'iso',
  isometrisch: 'iso',
  isometric: 'iso',
};

const FORMATS: Record<string, ExportFormat> = { stl: 'stl', '3mf': '3mf', step: 'step', stp: 'step' };

// Polite and filler words around the command, in German and English.
const FILLER = /\b(bitte|please|mal|doch|jetzt|now|mir|me|the|das|die|den|dem|es|it|that|model|modell|teil|part)\b/g;

export function localCommand(text: string): LocalCommand | null {
  const words = text
    .toLowerCase()
    .replace(/[.!?,;:]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length === 0 || words.split(' ').length > 5) return null;
  if (/^(mach(e)? )?(letzten schritt )?rückgängig( machen)?$|^undo( last step)?$|^zurück$/.test(words)) return { kind: 'undo' };
  if (/^(wiederherstellen|wieder herstellen|redo|wiederholen)$/.test(words)) return { kind: 'redo' };
  const view = /^(zeig(e)? |show )?(ansicht |view |blick )?(von |from )?(\S+)( ansicht| view)?$/.exec(words)?.[5];
  if (view && VIEWS[view]) return { kind: 'view', view: VIEWS[view] };
  const format = /^(als |as )?(\S+) export(ieren)?$|^export(iere|ieren)? (als |as )?(\S+)$/.exec(words);
  const named = format?.[2] ?? format?.[6];
  if (named && FORMATS[named]) return { kind: 'export', format: FORMATS[named] };
  return null;
}
