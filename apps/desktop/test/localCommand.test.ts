import { describe, expect, it } from 'vitest';

import { localCommand } from '../src/renderer/src/assistant/localCommand';

describe('chat commands PartBuddy runs without a model (issue 446)', () => {
  it('knows short undo, redo, view and export messages in German and English', () => {
    expect(localCommand('Rückgängig')).toEqual({ kind: 'undo' });
    expect(localCommand('Mach das bitte rückgängig!')).toEqual({ kind: 'undo' });
    expect(localCommand('undo')).toEqual({ kind: 'undo' });
    expect(localCommand('Wiederherstellen')).toEqual({ kind: 'redo' });
    expect(localCommand('Ansicht von oben')).toEqual({ kind: 'view', view: 'top' });
    expect(localCommand('Zeig mir das Modell von vorne')).toEqual({ kind: 'view', view: 'front' });
    expect(localCommand('view from the left')).toEqual({ kind: 'view', view: 'left' });
    expect(localCommand('isometrisch')).toEqual({ kind: 'view', view: 'iso' });
    expect(localCommand('Als STL exportieren')).toEqual({ kind: 'export', format: 'stl' });
    expect(localCommand('export as 3mf')).toEqual({ kind: 'export', format: '3mf' });
  });

  it('leaves everything else to the assistant', () => {
    for (const text of ['Mach den Haken 5 mm breiter', 'undo the fillet and make it 3 mm', 'Was ist oben?', 'oben eine Fase', 'Exportiere es als PDF', 'Bau eine Box von oben offen', '']) {
      expect(localCommand(text), text).toBeNull();
    }
  });
});
