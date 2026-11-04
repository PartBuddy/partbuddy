import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { brandContrastPairs, contrastPairs } from '../src/contrast-pairs.js';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function block(selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `selector ${selector} missing`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated block ${selector}`);
}

function variables(text) {
  const map = new Map();
  for (const match of text.matchAll(/(--cs-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    map.set(match[1], match[2]);
  }
  return map;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = variables(block(':root {'));
const dark = variables(block(':root[data-theme="dark"]'));
const systemDark = variables(block(':root:not([data-theme="light"])'));

for (const [name, theme] of [
  ['light', light],
  ['dark', dark],
]) {
  test(`${name} theme meets WCAG 2.2 AA contrast for every token pair`, () => {
    for (const { fg, bg, min } of contrastPairs) {
      const f = theme.get(fg);
      const b = theme.get(bg);
      assert.ok(f && b, `${name}: ${fg} or ${bg} not defined`);
      const value = ratio(f, b);
      assert.ok(value >= min, `${name}: ${fg} on ${bg} = ${value.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}

test('system dark preference and explicit dark theme define the same colours', () => {
  assert.deepEqual([...systemDark.entries()].sort(), [...dark.entries()].sort());
});

test('brand colours meet WCAG 2.2 AA contrast and stay the same in every theme', () => {
  for (const { fg, bg, min } of brandContrastPairs) {
    const f = light.get(fg);
    const b = light.get(bg);
    assert.ok(f && b, `brand: ${fg} or ${bg} not defined`);
    const value = ratio(f, b);
    assert.ok(value >= min, `brand: ${fg} on ${bg} = ${value.toFixed(2)}:1, needs ${min}:1`);
  }
  for (const name of [...light.keys()].filter((key) => key.startsWith('--cs-brand-'))) {
    assert.ok(!dark.has(name) && !systemDark.has(name), `${name} must not change with the theme`);
  }
});
