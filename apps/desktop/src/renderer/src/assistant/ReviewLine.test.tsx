import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { initI18n } from '../i18n';
import { ReviewLine, type ReviewItem } from './ReviewLine';

const src = 'data:image/png;base64,iVBORw0';
const render = (item: Omit<ReviewItem, 'kind' | 'key'>) => renderToStaticMarkup(<ReviewLine item={{ kind: 'review', key: 1, ...item }} />);

describe('the review in the chat', () => {
  beforeAll(() => {
    // initI18n sets the page language; the node test environment has no page.
    Object.assign(globalThis, { document: { documentElement: {} } });
    initI18n('de');
  });

  it('names the three views and shows their pictures with alt texts behind a fold', () => {
    const html = render({ outcome: 'reviewed', pictures: [{ view: 'front', src }, { view: 'top', src }, { view: 'iso', src }] });
    expect(html).toContain('Geprüft: vorn, oben, schräg');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/data-testid="review-picture"/g)).toHaveLength(3);
    for (const label of ['Ansicht von vorn', 'Ansicht von oben', 'Schräge Ansicht']) expect(html).toContain(`alt="${label}"`);
  });

  it('is a line alone without pictures, and a quiet note when sent back or ended without it', () => {
    const words = render({ outcome: 'reviewed', pictures: [] });
    expect(words).toContain('Geprüft: Ansicht, Druckprüfung und Checkliste');
    expect(words).not.toContain('aria-expanded');
    expect(render({ outcome: 'sentBack', pictures: [] })).toContain('Einmal zur Abschlussprüfung zurückgeschickt');
    const skipped = render({ outcome: 'skipped', pictures: [] });
    expect(skipped).toContain('Ohne Abschlussprüfung beendet');
    expect(skipped).not.toContain('role="alert"');
  });
});
