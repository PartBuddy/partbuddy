import { isAsDesigned, proposeOrientations, type OrientationOption } from '@partbuddy/geometry';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PrintOrientation } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';

/** How a direction reads: an axis when it is one (`-y`), otherwise rounded numbers. */
export function directionLabel(down: readonly number[]): string {
  const k = down.findIndex((v) => Math.abs(Math.abs(v) - 1) < 1e-6);
  if (k >= 0) return `${(down[k] ?? 0) < 0 ? '−' : '+'}${'xyz'[k] ?? ''}`;
  return down.map((v) => (Math.round(v * 100) / 100).toString()).join(' / ');
}

export function useOrientationText(): (orientation: { down: readonly number[]; face: { name: string } | null }) => string {
  const { t } = useTranslation();
  return ({ down, face }) => {
    // Lying on the bottom face is the part as designed; one name for one thing.
    if (isAsDesigned(down as [number, number, number])) return t('orientation.asDesigned');
    if (face) return t('orientation.onFace', { face: face.name });
    return t('orientation.down', { direction: directionLabel(down) });
  };
}

const same = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 1e-4);

/**
 * The print orientation in the check panel (M7): how the part lies now, a proposal of the best
 * ways to lay it with the numbers that decided, and the marked loads.
 */
export function OrientationSection() {
  const { t, i18n } = useTranslation();
  const print = useStudio((s) => s.print);
  const model = useStudio((s) => s.model);
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  const setNotice = useStudio((s) => s.setNotice);
  const text = useOrientationText();
  const [options, setOptions] = useState<OrientationOption[] | null>(null);
  if (!print || model.status !== 'ready') return null;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const { orientation, loads } = print;
  const loadFaces = loads.reduce((sum, place) => sum + place.faces.length, 0);

  const apply = (next: PrintOrientation) => {
    platform()
      .print.setOrientation(next)
      .then(() => {
        setOptions(null);
        setStepHighlight(null);
      })
      .catch(() => {
        setNotice({ tone: 'danger', text: t('orientation.failed') });
      });
  };
  const propose = () => {
    const all = proposeOrientations(model.bodies, { bed: print.printer.bed, overhang: print.material.overhang }, loads);
    setOptions(all.slice(0, 3));
  };

  return (
    <section className="flex flex-col gap-2 border-t border-border px-2 pt-2" aria-labelledby="orientation-title" data-testid="orientation">
      <div className="flex items-center gap-2">
        <h3 id="orientation-title" className="flex-1 text-sm font-semibold text-text">
          {t('orientation.title')}
        </h3>
        <Button onPress={propose} data-testid="orientation-propose">
          {t('orientation.propose')}
        </Button>
      </div>
      <p className="text-sm text-text" data-testid="orientation-current">
        {text(orientation)}
      </p>
      {loadFaces > 0 ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs text-text-muted" data-testid="orientation-loads">
            {t('orientation.loads', { count: loadFaces })}
          </p>
          <Button
            onPress={() => {
              void platform()
                .print.setLoads([])
                .catch(() => undefined);
            }}
            data-testid="orientation-loads-clear"
          >
            {t('orientation.clearLoads')}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">{t('orientation.loadHint')}</p>
      )}
      {options ? (
        <ol className="flex flex-col gap-1" data-testid="orientation-options">
          {options.map((option, i) => {
            const current = same(option.down, orientation.down);
            return (
              <li
                key={option.down.join(',')}
                className="flex items-start gap-2 rounded-sm border border-border px-2 py-1"
                data-testid="orientation-option"
                data-down={option.down.join(',')}
                onPointerEnter={() => {
                  if (option.face) setStepHighlight([{ body: option.face.body, faces: [option.face.name] }]);
                }}
                onPointerLeave={() => {
                  setStepHighlight(null);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0">
                  <span className="text-sm text-text">
                    {i === 0 ? `${t('orientation.best')} · ` : ''}
                    {text(option)}
                  </span>
                  <span className="text-xs tabular-nums text-text-muted">
                    {option.fits
                      ? t('orientation.numbers', { support: number.format(option.support), contact: number.format(option.contact), height: number.format(option.height) })
                      : t('orientation.tooLarge')}
                  </span>
                  {option.load !== null ? (
                    <span className="text-xs text-text-muted">{option.load < 0.25 ? t('orientation.loadAlong') : option.load > 0.75 ? t('orientation.loadAcross') : t('orientation.loadSlanted')}</span>
                  ) : null}
                </span>
                <Button
                  isDisabled={current || !option.fits}
                  onPress={() => {
                    apply({ down: option.down, face: option.face });
                  }}
                  data-testid="orientation-apply"
                >
                  {current ? t('orientation.inUse') : t('orientation.apply')}
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {!isAsDesigned(orientation.down) ? (
        <div>
          <Button
            onPress={() => {
              apply({ down: [0, 0, -1], face: null });
            }}
            data-testid="orientation-reset"
          >
            {t('orientation.reset')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
