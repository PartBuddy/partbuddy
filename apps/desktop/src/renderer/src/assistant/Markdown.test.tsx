import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

const render = (text: string, streaming = false) => renderToStaticMarkup(<Markdown text={text} streaming={streaming} />);

describe('assistant Markdown', () => {
  it('renders emphasis, lists, tables and code', () => {
    const html = render(
      ['The box is **4000 mm³**.', '', '- Sketch on XY', '- Extrude 10 mm', '', '| Face | Area |', '|---|---|', '| F1:+z | 400 |', '', '`solid.extrude`'].join('\n'),
    );
    expect(html).toMatch(/data-streamdown="strong"[^>]*>4000 mm³</);
    expect(html.match(/data-streamdown="list-item"/g)).toHaveLength(2);
    expect(html).toContain('data-streamdown="table"');
    expect(html).toContain('data-streamdown="inline-code"');
    expect(html).not.toContain('**');
  });

  it('keeps raw HTML as text', () => {
    const html = render('<script>alert(1)</script>\n\nText <img src="https://example.com/x.png"> after');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<img[^>]+src=/);
  });

  it('never loads an image, not even an inline one', () => {
    const html = render('Look: ![tracker](https://example.com/t.png) and ![inline](data:image/png;base64,AAAA)');
    expect(html).not.toMatch(/<img[^>]+src=/);
    expect(html).not.toContain('data:image');
  });

  it('keeps web links and drops other protocols', () => {
    const html = render('[docs](https://example.com/docs) [bad](javascript:alert(1)) [file](file:///tmp/x)');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="file:');
  });

  it('closes unfinished Markdown while streaming', () => {
    const html = render('Volume is **4000', true);
    expect(html).toContain('data-streamdown="strong"');
    expect(html).not.toContain('**');
  });
});
