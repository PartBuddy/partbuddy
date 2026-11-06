import { IconArrowBackUp, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import { Button } from '../ui/Button';

/** The paper in CSS pixels; the picture for the assistant has this size, at least twice as fine. */
export const SKETCH_SIZE = { width: 640, height: 420 } as const;
/** Squared paper: one square per 20 px, so proportions are easy to keep. */
const GRID = 20;
const PEN = 2.5;

/** Ink on paper in both themes (brand tokens): the assistant reads the picture as it was drawn. */
function sketchColors(): { paper: string; grid: string; ink: string } {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return { paper: token('--cs-brand-paper'), grid: token('--cs-sketch-grid'), ink: token('--cs-brand-ink') };
}

type Point = [number, number];
export type Stroke = Point[];

/** Draws the paper and the strokes; also used for the picture that goes to the assistant. */
export function paint(context: CanvasRenderingContext2D, strokes: readonly Stroke[], scale: number): void {
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
  context.strokeStyle = colors.ink;
  context.fillStyle = colors.ink;
  context.lineWidth = PEN;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    context.beginPath();
    if (rest.length === 0) {
      // A tap is a dot.
      context.arc(first[0], first[1], PEN / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.moveTo(first[0], first[1]);
    for (const [x, y] of rest) context.lineTo(x, y);
    context.stroke();
  }
}

/** The sketch as a PNG for the assistant, and a small picture for the composer. */
export interface SketchPicture {
  png: Uint8Array;
  thumbnail: string;
}

async function pictureOf(strokes: readonly Stroke[]): Promise<SketchPicture> {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = SKETCH_SIZE.width * scale;
  canvas.height = SKETCH_SIZE.height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D canvas');
  paint(context, strokes, scale);
  const blob = await new Promise<Blob | null>((done) => {
    canvas.toBlob(done, 'image/png');
  });
  if (!blob) throw new Error('the sketch could not be saved');
  const png = new Uint8Array(await blob.arrayBuffer());
  const small = document.createElement('canvas');
  small.width = SKETCH_SIZE.width / 4;
  small.height = SKETCH_SIZE.height / 4;
  small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
  return { png, thumbnail: small.toDataURL('image/png') };
}

/**
 * A rough sketch for the assistant (plan step F4): squared paper to draw on with the mouse or a
 * pen, undo and clear. The picture goes with the next message; the assistant builds a part from
 * it and asks for the dimensions that matter. Mounted while it is open, starting from the strokes
 * of the sketch already attached.
 */
export function SketchPad({ initial, onClose, onAttach }: { initial: readonly Stroke[]; onClose: () => void; onAttach: (strokes: Stroke[], picture: SketchPicture) => void }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => [...initial]);
  const drawing = useRef<Stroke | null>(null);
  const [saving, setSaving] = useState(false);

  const redraw = useCallback(
    (list: readonly Stroke[]) => {
      const element = canvas.current;
      const context = element?.getContext('2d');
      if (!element || !context) return;
      paint(context, list, element.width / SKETCH_SIZE.width);
    },
    [canvas],
  );

  useEffect(() => {
    redraw(strokes);
  }, [strokes, redraw]);

  const at = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * SKETCH_SIZE.width;
    const y = ((event.clientY - box.top) / box.height) * SKETCH_SIZE.height;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  const undo = () => {
    setStrokes((list) => list.slice(0, -1));
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
        <Dialog className="flex flex-col gap-3 p-5 outline-none" data-testid="sketch-pad">
          <Heading slot="title" className="text-lg font-semibold text-text">
            {t('assistant.sketch.title')}
          </Heading>
          <p className="text-sm text-text-muted">{t('assistant.sketch.body')}</p>
          <canvas
            ref={canvas}
            width={SKETCH_SIZE.width * 2}
            height={SKETCH_SIZE.height * 2}
            role="img"
            aria-label={t('assistant.sketch.canvas', { count: strokes.length })}
            className="aspect-[640/420] w-full cursor-crosshair touch-none rounded-md border border-border-strong"
            data-testid="sketch-canvas"
            data-strokes={strokes.length}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const stroke: Stroke = [at(event)];
              drawing.current = stroke;
              setStrokes((list) => [...list, stroke]);
            }}
            onPointerMove={(event) => {
              const stroke = drawing.current;
              if (!stroke) return;
              stroke.push(at(event));
              redraw(strokes);
            }}
            onPointerUp={() => {
              drawing.current = null;
              setStrokes((list) => [...list]);
            }}
            onPointerCancel={() => {
              drawing.current = null;
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                undo();
              }
            }}
            tabIndex={0}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onPress={undo} isDisabled={strokes.length === 0} data-testid="sketch-undo">
              <IconArrowBackUp className="size-icon" aria-hidden />
              {t('assistant.sketch.undo')}
            </Button>
            <Button
              onPress={() => {
                setStrokes([]);
              }}
              isDisabled={strokes.length === 0}
              data-testid="sketch-clear"
            >
              <IconTrash className="size-icon" aria-hidden />
              {t('assistant.sketch.clear')}
            </Button>
            <span className="mr-auto" />
            <Button onPress={onClose}>{t('assistant.sketch.cancel')}</Button>
            <Button
              variant="primary"
              isDisabled={strokes.length === 0 || saving}
              onPress={() => {
                setSaving(true);
                void pictureOf(strokes)
                  .then((picture) => {
                    onAttach(strokes, picture);
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
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
