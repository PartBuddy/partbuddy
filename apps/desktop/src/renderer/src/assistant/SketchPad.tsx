import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCircle,
  IconEraser,
  IconLine,
  IconPencil,
  IconPointer,
  IconRulerMeasure,
  IconSquare,
  IconTrash,
  IconTypography,
  IconVectorBezierArc,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import { Button } from '../ui/Button';
import { arcCircle, constrain, describeSketch, GRID, hasSize, moved, pick, SKETCH_SIZE, snap, square, type Point, type SketchItem, type Tool } from './sketchModel';

export { SKETCH_SIZE, type SketchItem } from './sketchModel';

const PEN = 2.5;
const FONT_SIZE = 14;

/** Ink on paper in both themes (brand tokens): the assistant reads the picture as it was drawn. */
function sketchColors(): { paper: string; grid: string; ink: string; selected: string; font: string } {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return { paper: token('--cs-brand-paper'), grid: token('--cs-sketch-grid'), ink: token('--cs-brand-ink'), selected: token('--cs-color-accent'), font: token('--cs-font-sans') || 'sans-serif' };
}

function trace(context: CanvasRenderingContext2D, item: SketchItem, colors: ReturnType<typeof sketchColors>): void {
  context.beginPath();
  switch (item.kind) {
    case 'pen': {
      const [first, ...rest] = item.points;
      if (!first) return;
      if (rest.length === 0) {
        // A tap is a dot.
        context.arc(first[0], first[1], PEN / 2, 0, Math.PI * 2);
        context.fill();
        return;
      }
      context.moveTo(first[0], first[1]);
      for (const [x, y] of rest) context.lineTo(x, y);
      break;
    }
    case 'line':
      context.moveTo(...item.from);
      context.lineTo(...item.to);
      break;
    case 'rect':
      context.rect(item.from[0], item.from[1], item.to[0] - item.from[0], item.to[1] - item.from[1]);
      break;
    case 'circle':
      context.arc(item.center[0], item.center[1], item.radius, 0, Math.PI * 2);
      break;
    case 'arc': {
      const circle = arcCircle(item.from, item.through, item.to);
      if (circle) context.arc(circle.center[0], circle.center[1], circle.radius, circle.start, circle.end, circle.anticlockwise);
      else {
        context.moveTo(...item.from);
        context.lineTo(...item.to);
      }
      break;
    }
    case 'dimension': {
      // A dimension line with slanted ticks at its ends and the value above its middle, as on a drawing.
      const [dx, dy] = [item.to[0] - item.from[0], item.to[1] - item.from[1]];
      const length = Math.hypot(dx, dy) || 1;
      const [ux, uy] = [dx / length, dy / length];
      context.lineWidth = 1.5;
      context.moveTo(...item.from);
      context.lineTo(...item.to);
      for (const end of [item.from, item.to]) {
        const [tx, ty] = [(ux - uy) * 4, (uy + ux) * 4];
        context.moveTo(end[0] - tx, end[1] - ty);
        context.lineTo(end[0] + tx, end[1] + ty);
      }
      context.stroke();
      let [nx, ny] = [-uy, ux];
      if (ny > 0 || (ny === 0 && nx > 0)) [nx, ny] = [-nx, -ny];
      label(context, item.value, [(item.from[0] + item.to[0]) / 2 + nx * 11, (item.from[1] + item.to[1]) / 2 + ny * 11], colors, 'center');
      context.lineWidth = PEN;
      return;
    }
    case 'text':
      label(context, item.text, item.at, colors, 'left');
      return;
  }
  context.stroke();
}

/** Text on a patch of paper, so grid lines and strokes do not run through it. */
function label(context: CanvasRenderingContext2D, text: string, at: Point, colors: ReturnType<typeof sketchColors>, align: 'left' | 'center'): void {
  const ink = context.fillStyle;
  context.font = `${String(FONT_SIZE)}px ${colors.font}`;
  context.textAlign = align;
  context.textBaseline = align === 'center' ? 'middle' : 'alphabetic';
  const width = context.measureText(text).width;
  const left = align === 'center' ? at[0] - width / 2 : at[0];
  const top = align === 'center' ? at[1] - FONT_SIZE / 2 : at[1] - FONT_SIZE + 2;
  context.fillStyle = colors.paper;
  context.fillRect(left - 2, top - 1, width + 4, FONT_SIZE + 2);
  context.fillStyle = ink;
  context.fillText(text, at[0], at[1]);
}

/** Draws the paper and the elements; also used for the picture that goes to the assistant. */
export function paint(context: CanvasRenderingContext2D, items: readonly SketchItem[], scale: number, extra: { draft?: SketchItem | null; selected?: number | null } = {}): void {
  const { width, height } = SKETCH_SIZE;
  const colors = sketchColors();
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = GRID; x < width; x += GRID) {
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
  }
  for (let y = GRID; y < height; y += GRID) {
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
  }
  context.stroke();
  context.lineWidth = PEN;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const all = extra.draft ? [...items, extra.draft] : items;
  all.forEach((item, index) => {
    const color = index === extra.selected || item === extra.draft ? colors.selected : colors.ink;
    context.strokeStyle = color;
    context.fillStyle = color;
    trace(context, item, colors);
  });
}

/** The sketch as a PNG and as a list of its elements for the assistant, and a small picture for the composer. */
export interface SketchPicture {
  png: Uint8Array;
  thumbnail: string;
  /** The elements as text (F9); a photo has none. */
  elements?: string;
}

async function pictureOf(items: readonly SketchItem[]): Promise<SketchPicture> {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = SKETCH_SIZE.width * scale;
  canvas.height = SKETCH_SIZE.height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D canvas');
  paint(context, items, scale);
  const blob = await new Promise<Blob | null>((done) => {
    canvas.toBlob(done, 'image/png');
  });
  if (!blob) throw new Error('the sketch could not be saved');
  const png = new Uint8Array(await blob.arrayBuffer());
  const small = document.createElement('canvas');
  small.width = SKETCH_SIZE.width / 4;
  small.height = SKETCH_SIZE.height / 4;
  small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
  return { png, thumbnail: small.toDataURL('image/png'), elements: describeSketch(items) };
}

const TOOLS: { tool: Tool; key: string; icon: ReactNode }[] = [
  { tool: 'select', key: 'v', icon: <IconPointer className="size-icon" aria-hidden /> },
  { tool: 'pen', key: 'p', icon: <IconPencil className="size-icon" aria-hidden /> },
  { tool: 'line', key: 'l', icon: <IconLine className="size-icon" aria-hidden /> },
  { tool: 'rect', key: 'r', icon: <IconSquare className="size-icon" aria-hidden /> },
  { tool: 'circle', key: 'c', icon: <IconCircle className="size-icon" aria-hidden /> },
  { tool: 'arc', key: 'a', icon: <IconVectorBezierArc className="size-icon" aria-hidden /> },
  { tool: 'dimension', key: 'm', icon: <IconRulerMeasure className="size-icon" aria-hidden /> },
  { tool: 'text', key: 't', icon: <IconTypography className="size-icon" aria-hidden /> },
  { tool: 'eraser', key: 'e', icon: <IconEraser className="size-icon" aria-hidden /> },
];

/** A value being typed for a new or picked dimension or label, at its place on the paper. */
interface Editor {
  item: Extract<SketchItem, { kind: 'dimension' | 'text' }>;
  index: number | null;
  at: Point;
  value: string;
}

/**
 * A hand sketch for the assistant (F4, tools in F9): squared paper with a pen, lines, rectangles,
 * circles, arcs, dimensions with their values and labels. Points snap to half squares and to the
 * corners drawn (Alt keeps them free, Shift straightens). Elements can be picked, moved, deleted
 * and erased; undo and redo cover every change. The picture and a list of the elements go with
 * the next message.
 */
export function SketchPad({ initial, onClose, onAttach }: { initial: readonly SketchItem[]; onClose: () => void; onAttach: (items: SketchItem[], picture: SketchPicture) => void }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<SketchItem[]>(() => [...initial]);
  const [past, setPast] = useState<SketchItem[][]>([]);
  const [future, setFuture] = useState<SketchItem[][]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [draft, setDraft] = useState<SketchItem | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  // An arc takes a drag from end to end, then a click for its bulge.
  const [arcEnds, setArcEnds] = useState<{ from: Point; to: Point } | null>(null);
  const gesture = useRef<{ start: Point; before: SketchItem[]; changed: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // Enter and the blur that follows must not take the same value twice.
  const finished = useRef<Editor | null>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    paint(context, items, element.width / SKETCH_SIZE.width, { draft, selected });
  }, [items, draft, selected]);

  const commit = (next: SketchItem[], before: SketchItem[] = items) => {
    setPast((list) => [...list, before]);
    setFuture([]);
    setItems(next);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((list) => [items, ...list]);
    setPast((list) => list.slice(0, -1));
    setItems(previous);
    setSelected(null);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((list) => [...list, items]);
    setFuture((list) => list.slice(1));
    setItems(next);
    setSelected(null);
  };
  const choose = (next: Tool) => {
    setTool(next);
    setDraft(null);
    setArcEnds(null);
    setEditor(null);
    if (next !== 'select') setSelected(null);
  };
  const removeSelected = () => {
    if (selected === null) return;
    commit(items.filter((_, index) => index !== selected));
    setSelected(null);
  };
  const finishEditor = () => {
    if (!editor || finished.current === editor) return;
    finished.current = editor;
    const value = editor.value.trim();
    const item: SketchItem = editor.item.kind === 'text' ? { ...editor.item, text: value } : { ...editor.item, value };
    setEditor(null);
    if (editor.index === null) {
      if (hasSize(item)) commit([...items, item]);
    } else if (!value) commit(items.filter((_, index) => index !== editor.index));
    else commit(items.map((existing, index) => (index === editor.index ? item : existing)));
  };
  const edit = (index: number) => {
    const item = items[index];
    if (item?.kind === 'text') setEditor({ item, index, at: item.at, value: item.text });
    if (item?.kind === 'dimension') setEditor({ item, index, at: [(item.from[0] + item.to[0]) / 2, (item.from[1] + item.to[1]) / 2], value: item.value });
  };

  const raw = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * SKETCH_SIZE.width;
    const y = ((event.clientY - box.top) / box.height) * SKETCH_SIZE.height;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };
  const shape = (start: Point, end: Point, shift: boolean): SketchItem | null => {
    switch (tool) {
      case 'line':
      case 'arc':
        return { kind: 'line', from: start, to: shift ? constrain(start, end) : end };
      case 'dimension':
        return { kind: 'dimension', from: start, to: shift ? constrain(start, end) : end, value: '' };
      case 'rect':
        return { kind: 'rect', from: start, to: shift ? square(start, end) : end };
      case 'circle':
        return { kind: 'circle', center: start, radius: Math.hypot(end[0] - start[0], end[1] - start[1]) };
      default:
        return null;
    }
  };

  const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    if (editor) finishEditor();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = raw(event);
    const at = snap(point, items, event.altKey);
    if (tool === 'arc' && arcEnds) {
      const arc: SketchItem = { kind: 'arc', ...arcEnds, through: at };
      setArcEnds(null);
      setDraft(null);
      if (hasSize(arc)) commit([...items, arc]);
      return;
    }
    if (tool === 'text') {
      setEditor({ item: { kind: 'text', at, text: '' }, index: null, at, value: '' });
      return;
    }
    if (tool === 'select') {
      const hit = pick(items, point);
      setSelected(hit);
      gesture.current = hit === null ? null : { start: point, before: items, changed: false };
      return;
    }
    if (tool === 'eraser') {
      gesture.current = { start: point, before: items, changed: false };
      const hit = pick(items, point);
      if (hit !== null) {
        gesture.current.changed = true;
        setItems(items.filter((_, index) => index !== hit));
      }
      return;
    }
    gesture.current = { start: tool === 'pen' ? point : at, before: items, changed: false };
    setDraft(tool === 'pen' ? { kind: 'pen', points: [point] } : shape(at, at, false));
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = raw(event);
    if (tool === 'arc' && arcEnds) {
      setDraft({ kind: 'arc', ...arcEnds, through: snap(point, items, event.altKey) });
      return;
    }
    const current = gesture.current;
    if (!current) return;
    if (tool === 'select' && selected !== null) {
      const [dx, dy] = [point[0] - current.start[0], point[1] - current.start[1]];
      const step = event.altKey ? 1 : GRID / 2;
      const [sx, sy] = [Math.round(dx / step) * step, Math.round(dy / step) * step];
      current.changed = sx !== 0 || sy !== 0;
      setItems(current.before.map((item, index) => (index === selected ? moved(item, sx, sy) : item)));
      return;
    }
    if (tool === 'eraser') {
      const hit = pick(items, point);
      if (hit !== null) {
        current.changed = true;
        setItems(items.filter((_, index) => index !== hit));
      }
      return;
    }
    if (tool === 'pen') {
      setDraft((stroke) => (stroke?.kind === 'pen' ? { kind: 'pen', points: [...stroke.points, point] } : stroke));
      return;
    }
    setDraft(shape(current.start, snap(point, items, event.altKey), event.shiftKey));
  };

  const onUp = () => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    if (tool === 'select' || tool === 'eraser') {
      // The move or the erasing is one step back for undo.
      if (current.changed) commit(items, current.before);
      return;
    }
    const done = draft;
    setDraft(null);
    if (!done) return;
    if (tool === 'arc' && done.kind === 'line' && hasSize(done)) {
      setArcEnds({ from: done.from, to: done.to });
      setDraft({ kind: 'arc', from: done.from, to: done.to, through: done.to });
      return;
    }
    if (done.kind === 'dimension') {
      if (hasSize({ ...done, value: '-' })) setEditor({ item: done, index: null, at: [(done.from[0] + done.to[0]) / 2, (done.from[1] + done.to[1]) / 2], value: '' });
      return;
    }
    if (hasSize(done)) commit([...items, done]);
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      redo();
    } else if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      undo();
    } else if ((key === 'delete' || key === 'backspace') && selected !== null) {
      event.preventDefault();
      removeSelected();
    } else if (key === 'escape' && (arcEnds || draft || selected !== null)) {
      // The first Escape drops what is half drawn or picked; the next one closes the sketch.
      event.preventDefault();
      event.stopPropagation();
      setArcEnds(null);
      setDraft(null);
      setSelected(null);
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const entry = TOOLS.find((candidate) => candidate.key === key);
      if (entry) choose(entry.tool);
    }
  };

  return (
    <ModalOverlay
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-xl max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="outline-none" data-testid="sketch-pad">
          {/* Tool keys, undo and redo work wherever the focus is in the sketch. */}
          <div className="flex flex-col gap-3 p-5" onKeyDown={onKey}>
          <Heading slot="title" className="text-lg font-semibold text-text">
            {t('assistant.sketch.title')}
          </Heading>
          <p className="text-sm text-text-muted">{t('assistant.sketch.body')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleButtonGroup
              aria-label={t('assistant.sketch.tools')}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[tool]}
              onSelectionChange={(keys) => {
                const next = [...keys][0] as Tool | undefined;
                if (next) choose(next);
              }}
              className="flex flex-wrap gap-1"
            >
              {TOOLS.map((entry) => (
                <ToggleButton
                  key={entry.tool}
                  id={entry.tool}
                  aria-label={t(`assistant.sketch.tool.${entry.tool}`)}
                  aria-keyshortcuts={entry.key.toUpperCase()}
                  className="inline-flex size-control-md items-center justify-center rounded-md border border-border text-text outline-none hover:bg-surface-hover selected:border-accent selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
                  data-testid={`sketch-tool-${entry.tool}`}
                >
                  <span title={`${t(`assistant.sketch.tool.${entry.tool}`)} (${entry.key.toUpperCase()})`}>{entry.icon}</span>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <span className="mr-auto" />
            <Button onPress={undo} isDisabled={past.length === 0} aria-label={t('assistant.sketch.undo')} data-testid="sketch-undo">
              <IconArrowBackUp className="size-icon" aria-hidden />
            </Button>
            <Button onPress={redo} isDisabled={future.length === 0} aria-label={t('assistant.sketch.redo')} data-testid="sketch-redo">
              <IconArrowForwardUp className="size-icon" aria-hidden />
            </Button>
            <Button
              onPress={() => {
                commit([]);
                setSelected(null);
              }}
              isDisabled={items.length === 0}
              data-testid="sketch-clear"
            >
              <IconTrash className="size-icon" aria-hidden />
              {t('assistant.sketch.clear')}
            </Button>
          </div>
          <p className="text-xs text-text-muted" data-testid="sketch-hint">
            {t(arcEnds ? 'assistant.sketch.hint.arcBulge' : `assistant.sketch.hint.${tool}`)}
          </p>
          <div className="relative">
            <canvas
              ref={canvas}
              width={SKETCH_SIZE.width * 2}
              height={SKETCH_SIZE.height * 2}
              role="img"
              aria-label={t('assistant.sketch.canvas', { count: items.length })}
              className={`block aspect-[640/420] w-full touch-none rounded-md border border-border-strong ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
              data-testid="sketch-canvas"
              data-items={items.length}
              data-selected={selected ?? ''}
              onPointerDown={onDown}
              // A click keeps the focus where it is, so a label's field opened by it stays in focus.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                gesture.current = null;
                setDraft(null);
              }}
              onDoubleClick={(event) => {
                if (tool !== 'select') return;
                const box = event.currentTarget.getBoundingClientRect();
                const hit = pick(items, [((event.clientX - box.left) / box.width) * SKETCH_SIZE.width, ((event.clientY - box.top) / box.height) * SKETCH_SIZE.height]);
                if (hit !== null) edit(hit);
              }}
              tabIndex={0}
            />
            {editor ? (
              <input
                autoFocus
                aria-label={t(editor.item.kind === 'text' ? 'assistant.sketch.labelText' : 'assistant.sketch.dimensionValue')}
                placeholder={t(editor.item.kind === 'text' ? 'assistant.sketch.labelPlaceholder' : 'assistant.sketch.dimensionPlaceholder')}
                value={editor.value}
                onChange={(event) => {
                  setEditor({ ...editor, value: event.target.value });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    finishEditor();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    finished.current = editor;
                    setEditor(null);
                  }
                }}
                onBlur={finishEditor}
                maxLength={80}
                className="absolute h-control-sm w-32 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-accent bg-surface px-1 text-sm text-text outline-none"
                style={{ left: `${String((editor.at[0] / SKETCH_SIZE.width) * 100)}%`, top: `${String((editor.at[1] / SKETCH_SIZE.height) * 100)}%` }}
                data-testid="sketch-value"
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onPress={onClose}>{t('assistant.sketch.cancel')}</Button>
            <Button
              variant="primary"
              isDisabled={items.length === 0 || saving}
              onPress={() => {
                setSaving(true);
                void pictureOf(items)
                  .then((picture) => {
                    onAttach(items, picture);
                  })
                  .finally(() => {
                    setSaving(false);
                  });
              }}
              data-testid="sketch-attach"
            >
              {t('assistant.sketch.attach')}
            </Button>
          </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
