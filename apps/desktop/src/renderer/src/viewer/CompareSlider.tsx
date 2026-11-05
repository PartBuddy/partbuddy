import { IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';

import { useStudio } from '../state/store';

/**
 * The before/after slider (UI upgrade step 13). While a value or action is tried, it weighs the
 * part as it is against the ghost of the result; while the user compares with the state before
 * the latest change, it fades from that state to the new one. Arrow keys move it in tenths.
 */
export function CompareSlider() {
  const { t } = useTranslation();
  const compare = useStudio((s) => s.compare);
  const comparing = useStudio((s) => s.compare !== null && s.before !== null);
  const preview = useStudio((s) => Boolean(s.selectionGhost ?? s.parameterGhost ?? s.markGhost));
  const blend = useStudio((s) => s.previewBlend);
  const setCompare = useStudio((s) => s.setCompare);
  const setBlend = useStudio((s) => s.setPreviewBlend);
  if (!comparing && !preview) return null;
  const value = comparing ? (compare ?? 1) : blend;
  const [from, to] = comparing ? [t('compare.before'), t('compare.after')] : [t('compare.now'), t('compare.tried')];
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-text shadow-2" data-testid="compare" data-mode={comparing ? 'compare' : 'preview'} data-view-overlay>
      <Slider
        aria-label={comparing ? t('compare.title') : t('compare.previewTitle')}
        value={Math.round(value * 100)}
        onChange={(next) => {
          if (comparing) setCompare(next / 100);
          else setBlend(next / 100);
        }}
        step={10}
        className="flex items-center gap-2"
        data-testid="compare-slider"
      >
        <Label className="text-text-subtle">{from}</Label>
        <SliderTrack className="relative h-4 w-menu">
          {({ state }) => (
            <>
              <span aria-hidden className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-sunken" />
              <span aria-hidden className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${String(state.getThumbPercent(0) * 100)}%` }} />
              <SliderThumb className="top-1/2 size-3 rounded-full border-2 border-accent bg-surface shadow-1 outline-none dragging:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-focus" />
            </>
          )}
        </SliderTrack>
        <span className="text-text-subtle">{to}</span>
        <SliderOutput className="sr-only" />
      </Slider>
      {comparing ? (
        <AriaButton
          aria-label={t('compare.close')}
          onPress={() => {
            setCompare(null);
          }}
          className="rounded-sm text-text-subtle outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
          data-testid="compare-close"
        >
          <IconX className="size-icon-sm" aria-hidden />
        </AriaButton>
      ) : null}
    </div>
  );
}
