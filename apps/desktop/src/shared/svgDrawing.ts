/* eslint-disable no-restricted-syntax -- SVG fills are the drawing's own data, not interface colours */
/**
 * SVG drawings as exact sketch contours (logos, name plates, cookie cutters). An SVG file is
 * untrusted: this module reads it without a DOM, refuses scripts, foreignObject, entities and every
 * reference outside the file, and turns each filled shape into closed loops of lines and cubic
 * curves with its transforms applied. Strokes (line icons) become filled outlines of their width,
 * with their caps and joins, one shape per stroke colour. Arcs, circles and ellipses become cubics (at most 2.7e-4 of
 * the radius off), lines stay lines. What leaves here is a clean SVG of `<path>`s in mm that
 * SolidCraft's `sketch.insert_svg` reads exactly; the original text never goes further.
 */

import { EndType, FillRule, inflatePathsD, JoinType, simplifyPathsD, unionD, type PathD } from 'clipper2-ts';

/** The largest SVG file PartBuddy reads; logos are small, a bigger file is usually an embedded picture. */
export const SVG_MAX_BYTES = 512 * 1024;
/** Limits against files that blow up while being read (deep nesting, `<use>` chains). */
const MAX_DEPTH = 64;
const MAX_SHAPES = 20_000;
const MAX_SEGMENTS = 200_000;
const MAX_USE_DEPTH = 8;

export type Pt = [number, number];
export type Segment = { to: Pt } | { c1: Pt; c2: Pt; to: Pt };
/** A closed loop: from `start` through its segments back to `start`. */
export interface Loop {
  start: Pt;
  segments: Segment[];
  /** Drawn open (no Z): a stroke has ends here; `closer` when the last segment was only added to fill it. */
  open?: boolean;
  closer?: boolean;
}
/** One filled shape of the file, in the file's own units, y down. */
export interface Shape {
  fill: string;
  loops: Loop[];
}
export interface Drawing {
  shapes: Shape[];
  /** The shapes' bounding box in the file's units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Millimetres per unit when the file states a physical size (mm, cm, in, pt, pc), else null. */
  unitMm: number | null;
  /** What has no area and was left out: shapes with neither fill nor stroke (`strokes`), text, embedded pictures. */
  skipped: { strokes: number; texts: number; images: number; backgrounds: number };
}
export type DrawingProblem = 'tooBig' | 'notSvg' | 'unsafe' | 'tooComplex' | 'empty';
export type DrawingResult = { ok: true; drawing: Drawing } | { ok: false; problem: DrawingProblem; detail: string };

class Refused extends Error {
  constructor(
    readonly problem: DrawingProblem,
    detail: string,
  ) {
    super(detail);
  }
}

// ---------------------------------------------------------------------------------------------
// XML: a small reader for the subset SVG files use. No entities beyond the five built-in ones.

interface Element {
  name: string;
  attrs: Map<string, string>;
  children: Element[];
  text: string;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Math.min(0x10ffff, parseInt(name.slice(2), 16)));
    if (name.startsWith('#')) return String.fromCodePoint(Math.min(0x10ffff, parseInt(name.slice(1), 10)));
    return ENTITY[name] ?? whole;
  });
}

const localName = (name: string) => name.slice(name.indexOf(':') + 1);

function parseXml(text: string): Element {
  const root: Element = { name: '#root', attrs: new Map(), children: [], text: '' };
  const stack: Element[] = [root];
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!([^>]*)>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  for (let match = token.exec(text); match; match = token.exec(text)) {
    const [, cdata, declaration, closing, opening, attrText, selfClosing, chars, stray] = match;
    const top = stack[stack.length - 1] as Element;
    if (stray) throw new Refused('notSvg', 'the file is not well-formed XML');
    if (declaration !== undefined) {
      // A DOCTYPE with an internal subset declares entities (billion laughs, external files).
      if (/ENTITY|\[/i.test(declaration)) throw new Refused('unsafe', 'the file declares entities');
      continue;
    }
    if (cdata !== undefined) top.text += cdata;
    else if (chars !== undefined) top.text += decode(chars);
    else if (closing !== undefined) {
      if (stack.length < 2 || top.name !== localName(closing)) throw new Refused('notSvg', 'the file is not well-formed XML');
      stack.pop();
    } else if (opening !== undefined) {
      const attrs = new Map<string, string>();
      for (const attr of (attrText ?? '').matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs.set(attr[1] as string, decode(attr[2] ?? attr[3] ?? ''));
      }
      const element: Element = { name: localName(opening), attrs, children: [], text: '' };
      top.children.push(element);
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new Refused('tooComplex', 'the file nests too deeply');
        stack.push(element);
      }
    }
  }
  if (stack.length !== 1) throw new Refused('notSvg', 'the file is not well-formed XML');
  return root;
}

/** Scripts, foreign content, event handlers and references outside the file make the whole file refused. */
function checkSafe(element: Element): void {
  if (element.name === 'script' || element.name === 'foreignObject' || element.name === 'iframe') throw new Refused('unsafe', `the file holds <${element.name}>`);
  for (const [name, value] of element.attrs) {
    if (/^on/i.test(name)) throw new Refused('unsafe', `the file holds an event handler (${name})`);
    // Only references inside the file, and embedded pictures (which are left out anyway).
    if (localName(name) === 'href' && !value.trim().startsWith('#') && !(element.name === 'image' && /^\s*data:image\//i.test(value))) {
      throw new Refused('unsafe', 'the file refers to something outside it');
    }
    if (/url\(\s*['"]?(?!#)/i.test(value)) throw new Refused('unsafe', 'the file refers to something outside it');
  }
  if (element.name === 'style' && /@import|url\(\s*['"]?(?!#)/i.test(element.text)) throw new Refused('unsafe', 'the style sheet refers to something outside the file');
  for (const child of element.children) checkSafe(child);
}

// ---------------------------------------------------------------------------------------------
// Styles: presentation attributes, simple style sheets (.class, #id, tag) and style attributes.

type Rule = { selector: string; specificity: number; order: number; decls: Map<string, string> };

function declarations(text: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) decls.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).replace(/!important/i, '').trim());
  }
  return decls;
}

function styleRules(root: Element): Rule[] {
  const rules: Rule[] = [];
  const visit = (element: Element) => {
    if (element.name === 'style') {
      const css = element.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const decls = declarations(match[2] as string);
        for (const raw of (match[1] as string).split(',')) {
          const selector = raw.trim();
          // shortcut: only single .class, #id and tag selectors; descendant and attribute selectors are ignored.
          if (!/^[.#]?[\w-]+$/.test(selector)) continue;
          rules.push({ selector, specificity: selector.startsWith('#') ? 100 : selector.startsWith('.') ? 10 : 1, order: rules.length, decls });
        }
      }
    }
    element.children.forEach(visit);
  };
  visit(root);
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

const STYLE_PROPS = ['fill', 'fill-rule', 'fill-opacity', 'opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'display', 'visibility', 'color'] as const;
type Style = Partial<Record<(typeof STYLE_PROPS)[number], string>>;

function ownStyle(element: Element, rules: Rule[]): Style {
  const style: Style = {};
  const set = (decls: Map<string, string>) => {
    for (const prop of STYLE_PROPS) {
      const value = decls.get(prop);
      if (value !== undefined) style[prop] = value;
    }
  };
  set(element.attrs);
  const classes = (element.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
  const id = element.attrs.get('id');
  for (const rule of rules) {
    const s = rule.selector;
    if (s.startsWith('.') ? classes.includes(s.slice(1)) : s.startsWith('#') ? s.slice(1) === id : s === element.name) set(rule.decls);
  }
  const inline = element.attrs.get('style');
  if (inline) set(declarations(inline));
  return style;
}

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
  maroon: '#800000', olive: '#808000', navy: '#000080', purple: '#800080', teal: '#008080', orange: '#ffa500',
};

/** A fill as #rrggbb, or null for none. Gradients and unknown colours count as black. */
function colour(value: string | undefined, current: string): string | null {
  const v = (value ?? '#000000').trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return colour(current, '#000000');
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(v);
  if (rgb) {
    const byte = (text: string) => Math.max(0, Math.min(255, Math.round(text.endsWith('%') ? parseFloat(text) * 2.55 : parseFloat(text))));
    return `#${[rgb[1], rgb[2], rgb[3]].map((part) => byte(part as string).toString(16).padStart(2, '0')).join('')}`;
  }
  // A gradient's fallback colour after the url, else black.
  const fallback = /^url\([^)]*\)\s*(.+)$/.exec(v);
  if (fallback) return colour(fallback[1], current);
  return NAMED[v] ?? '#000000';
}

// ---------------------------------------------------------------------------------------------
// Geometry: transforms, path data, basic shapes.

/** An affine map [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const numbers = (text: string) => (text.match(NUMBER) ?? []).map(Number);

export function parseTransform(text: string | undefined): Matrix {
  let m = IDENTITY;
  if (!text) return m;
  for (const match of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = numbers(match[2] as string);
    const rad = ((v[0] ?? 0) * Math.PI) / 180;
    let n: Matrix;
    switch (match[1]) {
      case 'matrix':
        n = v.length >= 6 ? (v.slice(0, 6) as Matrix) : IDENTITY;
        break;
      case 'translate':
        n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
        n = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(rad), 1, 0, 0];
        break;
      default:
        n = [1, Math.tan(rad), 0, 1, 0, 0];
    }
    m = multiply(m, n);
  }
  return m;
}

/** An elliptical arc from `p0` as cubics (SVG implementation notes F.6), each at most 90°. */
function arcToCubics(p0: Pt, rxIn: number, ryIn: number, angle: number, large: boolean, sweep: boolean, p: Pt): Segment[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ to: p }];
  const phi = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p[0]) / 2;
  const dy = (p0[1] - p[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p[1]) / 2;
  const vecAngle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = vecAngle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = vecAngle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const tangent = (t: number): Pt => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segments: Segment[] = [];
  for (let i = 0; i < parts; i += 1) {
    const [t0, t1] = [theta + i * step, theta + (i + 1) * step];
    const [a, b] = [at(t0), i === parts - 1 ? p : at(t1)];
    const [d0, d1] = [tangent(t0), tangent(t1)];
    segments.push({ c1: [a[0] + k * d0[0], a[1] + k * d0[1]], c2: [b[0] - k * d1[0], b[1] - k * d1[1]], to: b });
  }
  return segments;
}

/** Path data as loops; every subpath is closed, as filling does. */
export function parsePathData(d: string): Loop[] {
  const loops: Loop[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i] as string)) i += 1;
  };
  const number = (): number => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (match?.index !== i) throw new Refused('notSvg', 'a path has broken data');
    i += match[0].length;
    return Number(match[0]);
  };
  const flag = (): boolean => {
    skip();
    const c = d[i];
    if (c !== '0' && c !== '1') throw new Refused('notSvg', 'a path has broken data');
    i += 1;
    return c === '1';
  };
  const more = () => {
    skip();
    return i < d.length && /[-+.\d]/.test(d[i] as string);
  };
  let current: Loop | null = null;
  let pen: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastControl: Pt | null = null;
  let lastQuad: Pt | null = null;
  const close = (explicit = false) => {
    if (current && current.segments.length > 0) {
      const last = current.segments[current.segments.length - 1] as Segment;
      const added = last.to[0] !== start[0] || last.to[1] !== start[1];
      if (added) current.segments.push({ to: start });
      if (!explicit) {
        current.open = true;
        if (added) current.closer = true;
      }
      loops.push(current);
    }
    current = null;
    pen = start;
  };
  const add = (segment: Segment) => {
    current ??= { start: pen, segments: [] };
    if (current.segments.length === 0) current.start = pen;
    current.segments.push(segment);
    pen = segment.to;
  };
  let command = '';
  skip();
  while (i < d.length) {
    const c = d[i] as string;
    if (/[a-zA-Z]/.test(c)) {
      command = c;
      i += 1;
    } else if (!command || command === 'z' || command === 'Z') {
      throw new Refused('notSvg', 'a path has broken data');
    }
    if (command === 'z' || command === 'Z') {
      close(true);
      lastControl = lastQuad = null;
      skip();
      continue;
    }
    do {
      const rel = command === command.toLowerCase();
      const base = (p: Pt): Pt => (rel ? [pen[0] + p[0], pen[1] + p[1]] : p);
      const upper = command.toUpperCase();
      let control: Pt | null = null;
      let quad: Pt | null = null;
      switch (upper) {
        case 'M': {
          if (current) close();
          const p = base([number(), number()]);
          pen = start = p;
          current = { start: p, segments: [] };
          // Further pairs after a moveto are lines.
          command = rel ? 'l' : 'L';
          break;
        }
        case 'L':
          add({ to: base([number(), number()]) });
          break;
        case 'H': {
          const x = number();
          add({ to: [rel ? pen[0] + x : x, pen[1]] });
          break;
        }
        case 'V': {
          const y = number();
          add({ to: [pen[0], rel ? pen[1] + y : y] });
          break;
        }
        case 'C': {
          const c1 = base([number(), number()]);
          const c2 = base([number(), number()]);
          add({ c1, c2, to: base([number(), number()]) });
          control = c2;
          break;
        }
        case 'S': {
          const c1: Pt = lastControl ? [2 * pen[0] - lastControl[0], 2 * pen[1] - lastControl[1]] : pen;
          const c2 = base([number(), number()]);
          add({ c1, c2, to: base([number(), number()]) });
          control = c2;
          break;
        }
        case 'Q':
        case 'T': {
          const q: Pt = upper === 'Q' ? base([number(), number()]) : lastQuad ? ([2 * pen[0] - lastQuad[0], 2 * pen[1] - lastQuad[1]] as Pt) : pen;
          const to = base([number(), number()]);
          add({ c1: [pen[0] + (2 / 3) * (q[0] - pen[0]), pen[1] + (2 / 3) * (q[1] - pen[1])], c2: [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])], to });
          quad = q;
          break;
        }
        case 'A': {
          const [rx, ry, angle] = [number(), number(), number()];
          const [large, sweep] = [flag(), flag()];
          const to = base([number(), number()]);
          for (const segment of arcToCubics(pen, rx, ry, angle, large, sweep, to)) add(segment);
          break;
        }
        default:
          throw new Refused('notSvg', 'a path has broken data');
      }
      lastControl = control;
      lastQuad = quad;
    } while (more());
  }
  close();
  return loops;
}

/** A circle or ellipse as four cubics, clockwise on screen from the right. */
function ellipse(cx: number, cy: number, rx: number, ry: number): Loop[] {
  if (!(rx > 0 && ry > 0)) return [];
  const start: Pt = [cx + rx, cy];
  return [{ start, segments: arcToCubics(start, rx, ry, 0, false, true, [cx - rx, cy]).concat(arcToCubics([cx - rx, cy], rx, ry, 0, false, true, start)) }];
}

function rectangle(x: number, y: number, w: number, h: number, rxIn: number | null, ryIn: number | null): Loop[] {
  if (!(w > 0 && h > 0)) return [];
  const rx = Math.min(w / 2, Math.max(0, rxIn ?? ryIn ?? 0));
  const ry = Math.min(h / 2, Math.max(0, ryIn ?? rxIn ?? 0));
  if (rx === 0 || ry === 0) return [{ start: [x, y], segments: [{ to: [x + w, y] }, { to: [x + w, y + h] }, { to: [x, y + h] }, { to: [x, y] }] }];
  const corner = (from: Pt, to: Pt) => arcToCubics(from, rx, ry, 0, false, true, to);
  const start: Pt = [x + rx, y];
  return [
    {
      start,
      segments: [
        { to: [x + w - rx, y] },
        ...corner([x + w - rx, y], [x + w, y + ry]),
        { to: [x + w, y + h - ry] },
        ...corner([x + w, y + h - ry], [x + w - rx, y + h]),
        { to: [x + rx, y + h] },
        ...corner([x + rx, y + h], [x, y + h - ry]),
        { to: [x, y + ry] },
        ...corner([x, y + ry], start),
      ],
    },
  ];
}

/** A polygon's or polyline's points; a polyline is open, its closing line only there for a fill. */
function points(text: string | undefined, open = false): Loop[] {
  const v = numbers(text ?? '');
  if (v.length < 4) return [];
  const pts: Pt[] = [];
  for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k] as number, v[k + 1] as number]);
  const first = pts[0] as Pt;
  return [{ start: first, segments: [...pts.slice(1).map((to) => ({ to })), { to: first }], ...(open ? { open: true, closer: true } : {}) }];
}

/** A length attribute in the file's units; percentages and missing values give the fallback. */
function length(value: string | undefined, fallback = 0): number {
  if (value === undefined || value.trim().endsWith('%')) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

const MM_PER: Record<string, number> = { mm: 1, cm: 10, q: 0.25, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
/** A root width or height in mm, only when it has a physical unit. */
function physical(value: string | undefined): number | null {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(mm|cm|q|in|pt|pc)\s*$/i.exec(value ?? '');
  if (!match) return null;
  const n = Number(match[1]) * (MM_PER[(match[2] as string).toLowerCase()] ?? 0);
  return n > 0 ? n : null;
}

/** The loop moved by `m`, without lines of no length (a polygon that repeats its first point). */
function transformLoop(m: Matrix, loop: Loop): Loop {
  const start = apply(m, loop.start);
  const segments: Segment[] = [];
  let from = start;
  for (const s of loop.segments) {
    const to = apply(m, s.to);
    if ('c1' in s) segments.push({ c1: apply(m, s.c1), c2: apply(m, s.c2), to });
    else if (to[0] !== from[0] || to[1] !== from[1]) segments.push({ to });
    else continue;
    from = to;
  }
  return { start, segments, ...(loop.open ? { open: true } : {}), ...(loop.closer ? { closer: true } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Flattening, winding and the fill rule.

/** A loop as a polygon within `tolerance` (Wang's formula for the cubics). */
export function flatten(loop: Loop, tolerance: number): Pt[] {
  const out: Pt[] = [loop.start];
  let from = loop.start;
  for (const s of loop.segments) {
    if ('c1' in s) {
      const dd = Math.max(Math.hypot(from[0] - 2 * s.c1[0] + s.c2[0], from[1] - 2 * s.c1[1] + s.c2[1]), Math.hypot(s.c1[0] - 2 * s.c2[0] + s.to[0], s.c1[1] - 2 * s.c2[1] + s.to[1]));
      const n = Math.min(1000, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tolerance))));
      for (let k = 1; k <= n; k += 1) {
        const t = k / n;
        const u = 1 - t;
        out.push([u * u * u * from[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.to[0], u * u * u * from[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.to[1]]);
      }
    } else {
      out.push(s.to);
    }
    from = s.to;
  }
  return out;
}

/** Signed area of a closed polygon; positive is clockwise on screen (y down). */
export function area(polygon: readonly Pt[]): number {
  let sum = 0;
  for (let k = 0; k < polygon.length; k += 1) {
    const a = polygon[k] as Pt;
    const b = polygon[(k + 1) % polygon.length] as Pt;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function winding(polygon: readonly Pt[], p: Pt): number {
  let w = 0;
  for (let k = 0; k < polygon.length; k += 1) {
    const a = polygon[k] as Pt;
    const b = polygon[(k + 1) % polygon.length] as Pt;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
    if (a[1] <= p[1]) {
      if (b[1] > p[1] && cross > 0) w += 1;
    } else if (b[1] <= p[1] && cross < 0) w -= 1;
  }
  return w;
}

/** A point just beside a polygon's longest edge, on each side. */
function sides(polygon: readonly Pt[], gap: number): [Pt, Pt] | null {
  let best = -1;
  let at = 0;
  for (let k = 0; k < polygon.length; k += 1) {
    const a = polygon[k] as Pt;
    const b = polygon[(k + 1) % polygon.length] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) [best, at] = [len, k];
  }
  if (best <= 0) return null;
  const a = polygon[at] as Pt;
  const b = polygon[(at + 1) % polygon.length] as Pt;
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [nx, ny] = [-(b[1] - a[1]) / best, (b[0] - a[0]) / best];
  return [
    [mid[0] + nx * gap, mid[1] + ny * gap],
    [mid[0] - nx * gap, mid[1] - ny * gap],
  ];
}

/**
 * The loops of a shape that are an edge of its filled area under its fill rule. SolidCraft takes
 * a loop inside a loop as a hole and one inside that as material again, which is the even-odd
 * rule; a nonzero shape whose inner loop runs the same way as the outer (filled, not a hole) would
 * become a hole there, so such a loop is left out.
 */
function boundaryLoops(loops: Loop[], rule: string, size: number): Loop[] {
  const polygons = loops.map((loop) => flatten(loop, size * 1e-4));
  const filled = (p: Pt) => {
    const w = polygons.reduce((sum, polygon) => sum + winding(polygon, p), 0);
    return rule === 'evenodd' ? w % 2 !== 0 : w !== 0;
  };
  return loops.filter((_, k) => {
    const polygon = polygons[k] as Pt[];
    if (Math.abs(area(polygon)) < size * size * 1e-12) return false;
    const beside = sides(polygon, size * 1e-6);
    if (beside === null) return false;
    if (filled(beside[0]) !== filled(beside[1])) return true;
    // Another loop may touch just that spot (a bar meeting the middle of a block's side): a loop is
    // an edge if it is one anywhere, so a few more places along its longest edges decide.
    return besides(polygon, size * 1e-6).some(([p, q]) => filled(p) !== filled(q));
  });
}

/** Points just beside a polygon, one on each side, at a third and two thirds of its three longest edges. */
function besides(polygon: readonly Pt[], gap: number): [Pt, Pt][] {
  const edges = polygon
    .map((a, k) => {
      const b = polygon[(k + 1) % polygon.length] as Pt;
      return { a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    })
    .filter((edge) => edge.length > 0)
    .sort((p, q) => q.length - p.length)
    .slice(0, 3);
  return edges.flatMap(({ a, b, length }) =>
    [1 / 3, 2 / 3].map((t): [Pt, Pt] => {
      const at: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const [nx, ny] = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      return [
        [at[0] + nx * gap, at[1] + ny * gap],
        [at[0] - nx * gap, at[1] - ny * gap],
      ];
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Reading the drawing.

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (points: readonly Pt[]): Box => ({
  minX: Math.min(...points.map((p) => p[0])),
  minY: Math.min(...points.map((p) => p[1])),
  maxX: Math.max(...points.map((p) => p[0])),
  maxY: Math.max(...points.map((p) => p[1])),
});
/** Nearly the whole box: a rectangle, also one with small rounded corners. */
const rectangular = (polygon: readonly Pt[], box: Box) => Math.abs(area(polygon)) >= 0.95 * (box.maxX - box.minX) * (box.maxY - box.minY);

/**
 * The shapes without what only frames the drawing (decided 2026-11-09): a light sheet (white,
 * near white: paper) as a rectangle behind everything, and a thin rectangular frame along its
 * edge, of any colour. A coloured plate stays, a sign may want it; a drawing that is nothing else
 * stays whole.
 */
function withoutBackdrop(shapes: Shape[], rough: number): Shape[] {
  if (shapes.length < 2) return shapes;
  const polygons = shapes.map((shape) => shape.loops.map((loop) => flatten(loop, rough * 1e-3)));
  const all = boxOf(polygons.flat(2));
  const [w, h] = [all.maxX - all.minX, all.maxY - all.minY];
  const spans = (box: Box) => box.minX - all.minX <= 0.02 * w && all.maxX - box.maxX <= 0.02 * w && box.minY - all.minY <= 0.02 * h && all.maxY - box.maxY <= 0.02 * h;
  const drop = shapes.map((shape, i) => {
    const loops = polygons[i] ?? [];
    const outer = loops.reduce((best, polygon) => (Math.abs(area(polygon)) > Math.abs(area(best)) ? polygon : best), loops[0] ?? []);
    const box = boxOf(outer);
    if (outer.length < 3 || !spans(box) || !rectangular(outer, box)) return false;
    const inner = loops.filter((polygon) => polygon !== outer);
    // A frame: one rectangular hole leaving a thin band.
    const hole = inner[0];
    if (inner.length === 1 && hole && rectangular(hole, boxOf(hole)) && Math.abs(area(hole)) >= 0.8 * Math.abs(area(outer))) return true;
    return lab(shape.fill)[0] >= 90;
  });
  return drop.every(Boolean) ? shapes : shapes.filter((_, i) => !drop[i]);
}

/** A stroked element: its loops (open ones have ends) in the drawing's frame and how it is stroked. */
interface Stroke {
  colour: string;
  width: number;
  join: string;
  cap: string;
  miter: number;
  loops: Loop[];
}

const JOINS: Record<string, JoinType> = { round: JoinType.Round, bevel: JoinType.Bevel };
const CAPS: Record<string, EndType> = { round: EndType.Round, square: EndType.Square };

/**
 * Strokes as filled outlines (Clipper2's offsetting): each path widened by half its stroke width
 * on both sides with its caps and joins, and all strokes of one colour joined into one shape, so
 * crossing lines become one outline rather than loops that cancel each other when filled.
 * shortcut: the outlines are polygons, not arcs (a round cap is about ten faces); fit arcs back if exports of line icons get too heavy.
 */
function strokeShapes(strokes: readonly Stroke[]): (Shape & { rule: string })[] {
  if (strokes.length === 0) return [];
  const corners = strokes.flatMap((stroke) => stroke.loops.flatMap((loop) => [loop.start, ...loop.segments.flatMap((s) => ('c1' in s ? [s.c1, s.c2, s.to] : [s.to]))]));
  const reach = Math.max(...strokes.map((stroke) => stroke.width));
  const size = Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0])) + Math.max(...corners.map((p) => p[1])) - Math.min(...corners.map((p) => p[1])) + reach || 1;
  // Clipper works in whole numbers: decimals enough for a millionth of the drawing.
  const precision = Math.max(0, Math.min(8, Math.ceil(6 - Math.log10(size))));
  // Fine enough for a smooth print (0.02 mm on a 40 mm logo), coarse enough that a round cap is not dozens of faces.
  const tolerance = size * 5e-4;
  const byColour = new Map<string, PathD[]>();
  for (const stroke of strokes) {
    const open: PathD[] = [];
    const closed: PathD[] = [];
    for (const loop of stroke.loops) {
      const polygon = flatten(loop, tolerance);
      // The line back to the start was only there to fill it.
      if (loop.closer) polygon.pop();
      (loop.open ? open : closed).push(polygon.map(([x, y]) => ({ x, y })));
    }
    const join = JOINS[stroke.join] ?? JoinType.Miter;
    const miter = Number.isFinite(stroke.miter) && stroke.miter >= 1 ? stroke.miter : 4;
    const outlines = [
      ...(open.length > 0 ? inflatePathsD(open, stroke.width / 2, join, CAPS[stroke.cap] ?? EndType.Butt, miter, precision, tolerance * 2) : []),
      ...(closed.length > 0 ? inflatePathsD(closed, stroke.width / 2, join, EndType.Joined, miter, precision, tolerance * 2) : []),
    ];
    byColour.set(stroke.colour, [...(byColour.get(stroke.colour) ?? []), ...outlines]);
  }
  return [...byColour].flatMap(([fill, outlines]) => {
    // Points the union leaves within the tolerance of a straight line between their neighbours go.
    const loops = simplifyPathsD(unionD(outlines, [], FillRule.NonZero, precision), tolerance, true).flatMap((path): Loop[] => {
      const first = path[0];
      if (!first || path.length < 3) return [];
      return [{ start: [first.x, first.y], segments: [...path.slice(1).map((p) => ({ to: [p.x, p.y] as Pt })), { to: [first.x, first.y] as Pt }] }];
    });
    return loops.length > 0 ? [{ fill, rule: 'nonzero', loops }] : [];
  });
}

const NO_RENDER = new Set(['defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter', 'style', 'title', 'desc', 'metadata']);

/** Reads an SVG file into filled shapes, or says why it cannot be used. */
export function parseDrawing(text: string): DrawingResult {
  try {
    return { ok: true, drawing: read(text) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, problem: error.problem, detail: error.message };
    return { ok: false, problem: 'notSvg', detail: (error as Error).message };
  }
}

function read(text: string): Drawing {
  if (new TextEncoder().encode(text).length > SVG_MAX_BYTES) throw new Refused('tooBig', 'the file is larger than 512 KB');
  const doc = parseXml(text);
  const svg = doc.children.find((child) => child.name === 'svg');
  if (!svg || doc.children.some((child) => child !== svg)) throw new Refused('notSvg', 'the file is not an SVG drawing');
  checkSafe(svg);
  const rules = styleRules(svg);
  const ids = new Map<string, Element>();
  const index = (element: Element) => {
    const id = element.attrs.get('id');
    if (id && !ids.has(id)) ids.set(id, element);
    element.children.forEach(index);
  };
  index(svg);

  const shapes: (Shape & { rule: string })[] = [];
  const skipped = { strokes: 0, texts: 0, images: 0, backgrounds: 0 };
  let segments = 0;
  type Inherited = { fill: string | undefined; rule: string; color: string; hidden: boolean; fillOpacity: number; stroke: string | undefined; strokeWidth: string; strokeOpacity: number; join: string; cap: string; miter: number };
  const strokes: Stroke[] = [];
  const walk = (element: Element, matrix: Matrix, parent: Inherited, uses: number) => {
    if (NO_RENDER.has(element.name)) return;
    const style = ownStyle(element, rules);
    if (style.display?.trim() === 'none') return;
    const opacity = parseFloat(style.opacity ?? '1');
    if (opacity === 0) return;
    const inherited: Inherited = {
      fill: style.fill ?? parent.fill,
      rule: (style['fill-rule'] ?? parent.rule).trim(),
      color: style.color ?? parent.color,
      hidden: style.visibility ? /hidden|collapse/.test(style.visibility) : parent.hidden,
      fillOpacity: style['fill-opacity'] !== undefined ? parseFloat(style['fill-opacity']) : parent.fillOpacity,
      stroke: style.stroke ?? parent.stroke,
      strokeWidth: style['stroke-width'] ?? parent.strokeWidth,
      strokeOpacity: style['stroke-opacity'] !== undefined ? parseFloat(style['stroke-opacity']) : parent.strokeOpacity,
      join: (style['stroke-linejoin'] ?? parent.join).trim(),
      cap: (style['stroke-linecap'] ?? parent.cap).trim(),
      miter: style['stroke-miterlimit'] !== undefined ? parseFloat(style['stroke-miterlimit']) : parent.miter,
    };
    let m = multiply(matrix, parseTransform(element.attrs.get('transform')));
    const a = (name: string, fallback = 0) => length(element.attrs.get(name), fallback);
    let loops: Loop[] | null = null;
    switch (element.name) {
      case 'svg':
        // shortcut: a nested <svg> only moves by x, y; its own viewBox and clipping are ignored.
        if (element !== svg) m = multiply(m, [1, 0, 0, 1, a('x'), a('y')]);
        break;
      case 'g':
      case 'a':
      case 'switch':
        break;
      case 'use': {
        const href = (element.attrs.get('href') ?? element.attrs.get('xlink:href') ?? '').trim();
        const target = ids.get(href.slice(1));
        if (!target || uses >= MAX_USE_DEPTH) return;
        const placed = multiply(m, [1, 0, 0, 1, a('x'), a('y')]);
        // A <symbol> draws its children; any other element draws itself.
        if (target.name === 'symbol') for (const child of target.children) walk(child, placed, inherited, uses + 1);
        else walk(target, placed, inherited, uses + 1);
        return;
      }
      case 'path':
        loops = parsePathData(element.attrs.get('d') ?? '');
        break;
      case 'rect':
        loops = rectangle(a('x'), a('y'), a('width'), a('height'), element.attrs.has('rx') ? a('rx') : null, element.attrs.has('ry') ? a('ry') : null);
        break;
      case 'circle':
        loops = ellipse(a('cx'), a('cy'), a('r'), a('r'));
        break;
      case 'ellipse':
        loops = ellipse(a('cx'), a('cy'), a('rx'), a('ry'));
        break;
      case 'polygon':
      case 'polyline':
        loops = points(element.attrs.get('points'), element.name === 'polyline');
        break;
      case 'line': {
        const [from, to]: [Pt, Pt] = [[a('x1'), a('y1')], [a('x2'), a('y2')]];
        loops = from[0] === to[0] && from[1] === to[1] ? [] : [{ start: from, segments: [{ to }], open: true }];
        break;
      }
      case 'text':
        skipped.texts += 1;
        return;
      case 'image':
        skipped.images += 1;
        return;
      default:
        return;
    }
    if (loops === null) {
      for (const child of element.children) walk(child, m, inherited, uses);
      return;
    }
    // A line has no inside to fill.
    const fill = element.name === 'line' || inherited.fillOpacity === 0 ? null : colour(inherited.fill, inherited.color);
    const strokeColour = inherited.stroke === undefined || inherited.strokeOpacity === 0 ? null : colour(inherited.stroke, inherited.color);
    // A stroke's width scales with the element's transform (an even scale; a skewed one is taken on average).
    const strokeWidth = length(inherited.strokeWidth, 1) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const stroked = strokeColour !== null && strokeWidth > 0;
    if (inherited.hidden) return;
    if (!fill && !stroked) {
      // Neither filled nor stroked: nothing with an area.
      skipped.strokes += 1;
      return;
    }
    if (loops.length === 0) return;
    segments += loops.reduce((sum, loop) => sum + loop.segments.length, 0) * (fill && stroked ? 2 : 1);
    if (shapes.length + strokes.length >= MAX_SHAPES || segments > MAX_SEGMENTS) throw new Refused('tooComplex', 'the drawing has too many shapes for a sketch');
    const placed = loops.map((loop) => transformLoop(m, loop));
    if (fill) shapes.push({ fill, rule: inherited.rule, loops: placed });
    if (stroked) strokes.push({ colour: strokeColour, width: strokeWidth, join: inherited.join, cap: inherited.cap, miter: inherited.miter, loops: placed });
  };
  walk(svg, IDENTITY, { fill: undefined, rule: 'nonzero', color: '#000000', hidden: false, fillOpacity: 1, stroke: undefined, strokeWidth: '1', strokeOpacity: 1, join: 'miter', cap: 'butt', miter: 4 }, 0);
  // Strokes paint over fills: their outlines come last.
  shapes.push(...strokeShapes(strokes));

  const all = shapes.flatMap((shape) => shape.loops.flatMap((loop) => flatten(loop, 1e9)));
  if (all.length === 0) throw new Refused('empty', 'the drawing has no filled shapes');
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  // The control points bound the curves; the exact box comes from a fine polygon.
  const rough = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const drawn = shapes
    .map((shape) => ({ fill: shape.fill, loops: boundaryLoops(shape.loops, shape.rule, rough) }))
    .filter((shape) => shape.loops.length > 0);
  if (drawn.length === 0) throw new Refused('empty', 'the drawing has no filled shapes');
  const clean = withoutBackdrop(drawn, rough);
  skipped.backgrounds = drawn.length - clean.length;
  const fine = clean.flatMap((shape) => shape.loops.flatMap((loop) => flatten(loop, rough * 1e-5)));
  const bounds = {
    minX: Math.min(...fine.map((p) => p[0])),
    minY: Math.min(...fine.map((p) => p[1])),
    maxX: Math.max(...fine.map((p) => p[0])),
    maxY: Math.max(...fine.map((p) => p[1])),
  };
  // Millimetres per unit: the root's physical width (or height) over its viewBox, aspect kept.
  const view = numbers(svg.attrs.get('viewBox') ?? '');
  const [wMm, hMm] = [physical(svg.attrs.get('width')), physical(svg.attrs.get('height'))];
  const [vw, vh] = view.length === 4 ? [view[2] as number, view[3] as number] : [length(svg.attrs.get('width')), length(svg.attrs.get('height'))];
  const scales = [wMm && vw > 0 ? wMm / vw : null, hMm && vh > 0 ? hMm / vh : null].filter((s): s is number => s !== null);
  const unitMm = scales.length > 0 ? Math.min(...scales) : null;
  return mergedColours({ shapes: clean, bounds, unitMm, skipped });
}

// ---------------------------------------------------------------------------------------------
// Output.

/** The drawing's size in its units. */
/** The drawing with only these fills (a white background square left out, say), its box shrunk to them. */
export function withFills(drawing: Drawing, fills: readonly string[]): Drawing {
  const shapes = drawing.shapes.filter((shape) => fills.includes(shape.fill));
  const rough = Math.max(drawing.bounds.maxX - drawing.bounds.minX, drawing.bounds.maxY - drawing.bounds.minY) || 1;
  const points = shapes.flatMap((shape) => shape.loops.flatMap((loop) => flatten(loop, rough * 1e-5)));
  if (points.length === 0) return { ...drawing, shapes };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { ...drawing, shapes, bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } };
}

export const drawingSize = (drawing: Drawing) => ({ width: drawing.bounds.maxX - drawing.bounds.minX, height: drawing.bounds.maxY - drawing.bounds.minY });

/** The width the drawing has from its file: its physical size, else null. */
export function naturalWidth(drawing: Drawing): number | null {
  return drawing.unitMm === null ? null : Math.round(drawingSize(drawing).width * drawing.unitMm * 100) / 100;
}

/** The fills in the drawing, in painting order of their first shape. */
export const drawingColours = (drawing: Drawing): string[] => [...new Set(drawing.shapes.map((shape) => shape.fill))];

/** CIE L*a*b* of a #rrggbb colour (sRGB, D65). */
function lab(hex: string): [number, number, number] {
  const linear = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const [r, g, b] = linear;
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)) as [number, number, number];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Fills closer than this (ΔE*ab) look the same: shades from smoothing or rounding in an export. */
const SAME_COLOUR = 6;

/**
 * The drawing with fills merged: those that look the same always, then, down to `most` colours
 * (the printer's filaments), the two nearest each time. The fill with less area takes the other's
 * colour, so the drawing keeps the colours that shape it.
 */
export function mergedColours(drawing: Drawing, most = Infinity): Drawing {
  const areas = new Map(drawingFacts(drawing, 1000).colours.map((entry) => [entry.fill, entry.area]));
  const into = new Map<string, string>();
  const left = [...areas.keys()];
  for (;;) {
    let best: [number, number, number] | null = null;
    for (let i = 0; i < left.length; i += 1) {
      for (let j = i + 1; j < left.length; j += 1) {
        const [a, b] = [lab(left[i] as string), lab(left[j] as string)];
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (!best || distance < best[2]) best = [i, j, distance];
      }
    }
    if (!best || (best[2] >= SAME_COLOUR && left.length <= most)) break;
    const [p, q] = [left[best[0]] as string, left[best[1]] as string];
    const [keep, gone] = (areas.get(p) ?? 0) >= (areas.get(q) ?? 0) ? [p, q] : [q, p];
    areas.set(keep, (areas.get(keep) ?? 0) + (areas.get(gone) ?? 0));
    for (const [from, to] of into) if (to === gone) into.set(from, keep);
    into.set(gone, keep);
    left.splice(left.indexOf(gone), 1);
  }
  if (into.size === 0) return drawing;
  return { ...drawing, shapes: drawing.shapes.map((shape) => ({ ...shape, fill: into.get(shape.fill) ?? shape.fill })) };
}

const fmt = (value: number) => String(Math.round(value * 1e4) / 1e4);

/** Path data for the loops, moved and scaled so the drawing's top left is the origin and `scale` mm per unit. */
export function loopsPathData(drawing: Drawing, loops: readonly Loop[], scale: number): string {
  const p = (pt: Pt) => `${fmt((pt[0] - drawing.bounds.minX) * scale)} ${fmt((pt[1] - drawing.bounds.minY) * scale)}`;
  // A last line back to the start is what Z draws anyway.
  const drawn = (loop: Loop) => loop.segments.filter((s, k) => 'c1' in s || k < loop.segments.length - 1 || s.to[0] !== loop.start[0] || s.to[1] !== loop.start[1]);
  return loops.map((loop) => `M${p(loop.start)}${drawn(loop).map((s) => ('c1' in s ? `C${p(s.c1)} ${p(s.c2)} ${p(s.to)}` : `L${p(s.to)}`)).join('')}Z`).join('');
}

/**
 * The clean SVG SolidCraft gets: the drawing `width` mm wide, top left at the origin, one
 * `<path>` per shape, only the shapes of the given fills when `fills` is set.
 */
export function drawingSvg(drawing: Drawing, width: number, fills?: readonly string[]): string {
  return shapesSvg(drawing, width, drawing.shapes.filter((shape) => !fills || fills.includes(shape.fill)));
}

/** Some shapes of the drawing as a clean SVG in the drawing's frame, `width` mm wide. */
export function shapesSvg(drawing: Drawing, width: number, shapes: readonly Shape[]): string {
  const size = drawingSize(drawing);
  const scale = width / (size.width || 1);
  const height = size.height * scale;
  const paths = shapes.map((shape) => `<path fill="${shape.fill}" fill-rule="evenodd" d="${loopsPathData(drawing, shape.loops, scale)}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}">${paths.join('')}</svg>`;
}

/**
 * The drawing in pieces that hang together: each outer loop of a shape with the holes right
 * inside it (an island in a hole is a piece of its own). SolidCraft makes one body per piece, so
 * PartBuddy names and colours each piece itself.
 */
export function drawingPieces(drawing: Drawing): Shape[] {
  const size = drawingSize(drawing);
  const tolerance = Math.max(size.width, size.height) * 1e-4;
  return drawing.shapes.flatMap((shape) => {
    const polygons = shape.loops.map((loop) => flatten(loop, tolerance));
    // Which loops each loop lies inside: tested with a point beside its longest edge.
    const parents = polygons.map((polygon, k) => {
      const beside = sides(polygon, size.width * 1e-6);
      return beside ? polygons.map((other, j) => j !== k && winding(other, beside[0]) !== 0 && winding(other, beside[1]) !== 0).flatMap((inside, j) => (inside ? [j] : [])) : [];
    });
    return shape.loops.flatMap((loop, k) => {
      if ((parents[k] ?? []).length % 2 === 1) return [];
      const depth = (parents[k] ?? []).length;
      const holes = shape.loops.filter((_, j) => (parents[j] ?? []).length === depth + 1 && (parents[j] ?? []).includes(k));
      return [{ fill: shape.fill, loops: [loop, ...holes] }];
    });
  });
}

/**
 * Whether two sets of shapes overlap (a later piece painted over an earlier one). SolidCraft's
 * cut fails with "no result" for bodies that do not meet, so only overlapping pieces are cut.
 */
export function shapesOverlap(drawing: Drawing, a: readonly Shape[], b: readonly Shape[]): boolean {
  const size = drawingSize(drawing);
  const tolerance = Math.max(size.width, size.height) * 1e-4;
  const polygons = (shapes: readonly Shape[]) => shapes.map((shape) => shape.loops.map((loop) => flatten(loop, tolerance)));
  const [first, second] = [polygons(a), polygons(b)];
  // Inside a shape: inside an odd number of its loops (its loops are the edges of its fill).
  const inside = (shapes: Pt[][][], p: Pt) => shapes.some((loops) => loops.filter((polygon) => winding(polygon, p) !== 0).length % 2 === 1);
  const crosses = (p: Pt, q: Pt, r: Pt, s: Pt) => {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (d === 0) return false;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
    const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  const edges = (shapes: Pt[][][]) => shapes.flat().flatMap((polygon) => polygon.map((p, k): [Pt, Pt] => [p, polygon[(k + 1) % polygon.length] as Pt]));
  const box = (list: [Pt, Pt][]) => list.reduce<[number, number, number, number]>((acc, [p, q]) => [Math.min(acc[0], p[0], q[0]), Math.min(acc[1], p[1], q[1]), Math.max(acc[2], p[0], q[0]), Math.max(acc[3], p[1], q[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const [ea, eb] = [edges(first), edges(second)];
  const [ba, bb] = [box(ea), box(eb)];
  if (ba[0] >= bb[2] || bb[0] >= ba[2] || ba[1] >= bb[3] || bb[1] >= ba[3]) return false;
  for (const [p, q] of ea) {
    if (Math.max(p[0], q[0]) < bb[0] || Math.min(p[0], q[0]) > bb[2] || Math.max(p[1], q[1]) < bb[1] || Math.min(p[1], q[1]) > bb[3]) continue;
    for (const [r, s] of eb) if (crosses(p, q, r, s)) return true;
  }
  // No edges cross: one lies wholly inside the other, or they are apart.
  const some = (shapes: Pt[][][]) => shapes.flat()[0]?.[0];
  const pa = some(first);
  const pb = some(second);
  return (pa !== undefined && inside(second, pa)) || (pb !== undefined && inside(first, pb));
}

/** What the drawing holds at `width` mm: size, loops, holes and the area of each fill in mm². */
export function drawingFacts(drawing: Drawing, width: number) {
  const size = drawingSize(drawing);
  const scale = width / (size.width || 1);
  const tolerance = 0.005 / scale;
  let loops = 0;
  let holes = 0;
  const areas = new Map<string, number>();
  for (const shape of drawing.shapes) {
    const polygons = shape.loops.map((loop) => flatten(loop, tolerance));
    loops += polygons.length;
    polygons.forEach((polygon, k) => {
      const beside = sides(polygon, size.width * 1e-6);
      const depth = beside ? polygons.filter((other, j) => j !== k && winding(other, beside[0]) !== 0 && winding(other, beside[1]) !== 0).length : 0;
      if (depth % 2 === 1) holes += 1;
      areas.set(shape.fill, (areas.get(shape.fill) ?? 0) + (depth % 2 === 1 ? -1 : 1) * Math.abs(area(polygon)) * scale * scale);
    });
  }
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round(size.height * scale * 100) / 100,
    loops,
    holes,
    colours: [...areas].map(([fill, mm2]) => ({ fill, area: Math.round(mm2 * 10) / 10 })),
  };
}
