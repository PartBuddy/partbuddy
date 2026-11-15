import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compactDescription } from '../src/main/agents/toolNotes';

// SolidCraft 0.42.0's real answer to describe_command {id: "solid.box"}.
const box = readFileSync(join(__dirname, 'fixtures', 'describe-solid-box.json'), 'utf8');

describe('describe_command without its schemas (issue 446)', () => {
  it('keeps the signature, the description and one line per parameter with its values', () => {
    const result = compactDescription('describe_command', { content: [{ type: 'text', text: box }] });
    const part = result.content[0];
    const text = typeof part?.text === 'string' ? part.text : '';
    expect(text.length).toBeLessThan(box.length / 3);
    expect(text).toContain('solid.box (Box): Add a box primitive.');
    expect(text).toContain('params: length, width, height: expr;');
    expect(text).toContain('- length: Size along X.');
    expect(text).toContain('- operation?: How the box combines with existing bodies. Default: new. One of: new, join, cut, intersect,');
    expect(text).not.toContain('$defs');
  });

  it('passes other answers through unchanged', () => {
    const other = { content: [{ type: 'text', text: 'not json' }] };
    expect(compactDescription('describe_command', other)).toBe(other);
    const result = { content: [{ type: 'text', text: box }] };
    expect(compactDescription('list_commands', result)).toBe(result);
  });
});
