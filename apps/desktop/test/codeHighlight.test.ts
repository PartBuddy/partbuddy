import { describe, expect, it } from 'vitest';

import { codeHighlighter, languageOf } from '../src/renderer/src/assistant/codeHighlight';

describe('code highlighting with few languages (chat polish)', () => {
  it('knows the languages of printed parts by their common names, and nothing else', () => {
    expect(languageOf('py')).toBe('python');
    expect(languageOf(' Bash ')).toBe('shellscript');
    expect(languageOf('scad')).toBe('openscad');
    expect(languageOf('cobol')).toBeNull();
  });

  it('colours a finished block once and keeps it for the next render', async () => {
    const options: Parameters<typeof codeHighlighter.highlight>[0] = { code: 'height = 30  # mm', language: 'python', themes: ['github-light', 'github-dark'] };
    expect(codeHighlighter.highlight(options)).toBeNull();
    const result = await new Promise<NonNullable<ReturnType<typeof codeHighlighter.highlight>>>((done) => {
      codeHighlighter.highlight({ ...options, code: `${options.code} ` }, done);
    });
    expect(result.tokens.flat().map((token) => token.content).join('')).toBe('height = 30  # mm ');
    expect(codeHighlighter.highlight({ ...options, code: `${options.code} ` })).toBe(result);
  });
});
