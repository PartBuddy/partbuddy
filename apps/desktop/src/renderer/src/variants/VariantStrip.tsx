import { buildRenderMesh, buildViewerModel, disposeViewerModel, parseTagged3mf } from '@partbuddy/geometry';
import { IconAlertTriangle, IconCheck, IconEye, IconLayoutColumns, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import type { Variant } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio, type BodyModel } from '../state/store';
import { Button } from '../ui/Button';
import { Busy } from '../ui/Feedback';

const letter = (index: number) => String.fromCharCode(64 + index);

/** Shows a kept variant in the view instead of the part; the part itself does not change. */
async function showVariant(index: number): Promise<void> {
  const bodies = await platform().variants.shape(index);
  const models: BodyModel[] = bodies.map((body) => ({ name: body.name, model: buildViewerModel(buildRenderMesh(parseTagged3mf(body.mesh), body.faces), body.faces) }));
  const previous = useStudio.getState().preview;
  useStudio.getState().setPreview({ index, bodies: models });
  for (const body of previous?.bodies ?? []) disposeViewerModel(body.model);
}

export function closePreview(): void {
  const previous = useStudio.getState().preview;
  useStudio.getState().setPreview(null);
  for (const body of previous?.bodies ?? []) disposeViewerModel(body.model);
}

function VariantCard({ variant, ready, busy }: { variant: Variant; ready: boolean; busy: boolean }) {
  const { t } = useTranslation();
  const preview = useStudio((s) => s.preview);
  const setNotice = useStudio((s) => s.setNotice);
  const shown = preview?.index === variant.index;
  const label = variant.name ?? t('variants.unnamed', { letter: letter(variant.index) });
  const fail = (error: unknown) => {
    setNotice({ tone: 'danger', text: t('variants.failed', { detail: (error as Error).message.slice(0, 200) }) });
  };
  return (
    <li
      className={`flex w-menu shrink-0 flex-col gap-2 rounded-lg border bg-surface-raised p-2 ${shown ? 'border-accent' : 'border-border'}`}
      data-testid="variant-card"
      data-status={variant.status}
      data-index={variant.index}
    >
      <div className="flex gap-2">
        <div className="relative aspect-[16/10] w-step-preview shrink-0 overflow-hidden rounded-sm border border-border bg-surface-sunken">
          {variant.thumbnail ? (
            <img src={variant.thumbnail} alt={t('variants.picture', { name: label })} className="size-full object-cover" data-testid="variant-thumbnail" />
          ) : variant.status === 'failed' ? (
            <span className="flex size-full items-center justify-center">
              <IconAlertTriangle className="size-icon-sm text-warning" aria-label={t('variants.status.failed')} />
            </span>
          ) : (
            <span className="flex size-full items-center justify-center">
              <Busy label={t(variant.status === 'capturing' ? 'variants.status.capturing' : 'variants.status.building')} />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-1 text-sm font-medium text-text">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs" aria-hidden>
              {letter(variant.index)}
            </span>
            <span className="truncate">{label}</span>
          </p>
          {variant.difference ? <p className="line-clamp-3 text-xs text-text-muted">{variant.difference}</p> : null}
          {variant.status === 'failed' ? <p className="text-xs text-text-muted">{t('variants.status.failed')}</p> : null}
        </div>
      </div>
      {variant.status === 'kept' ? (
        <div className="flex flex-wrap gap-1">
          <Button
            isDisabled={busy}
            onPress={() => {
              if (shown) closePreview();
              else void showVariant(variant.index).catch(fail);
            }}
            data-testid="variant-show"
          >
            <IconEye className="size-icon-sm" aria-hidden />
            {shown ? t('variants.hide') : t('variants.show')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!ready || busy}
            onPress={() => {
              closePreview();
              void platform().variants.take(variant.index).catch(fail);
            }}
            data-testid="variant-take"
          >
            <IconCheck className="size-icon-sm" aria-hidden />
            {t('variants.take')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The strip of variants under the view (M2c, ADR 0021): while the assistant builds them, then
 * each with its picture, name and difference, to look at (the kept shape replaces the part in the
 * view) and to take (PartBuddy replays its changes).
 */
export function VariantStrip() {
  const { t } = useTranslation();
  const state = useStudio((s) => s.variants);
  const setNotice = useStudio((s) => s.setNotice);
  const status = selectedStatus(useAssistant((s) => s.state));
  const busy = status.state === 'busy';
  const ready = state.state === 'ready';
  if (state.state === 'idle' && !state.mismatch) return null;
  const building = state.variants.find((variant) => variant.status === 'building' || variant.status === 'capturing');
  return (
    <section aria-label={t('variants.title')} className="flex flex-col gap-2 border-t border-border bg-surface px-3 py-2" data-testid="variant-strip" data-state={state.state}>
      <div className="flex items-center gap-2">
        <IconLayoutColumns className="size-icon-sm text-text-subtle" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm text-text">
          <span className="font-semibold">{t('variants.heading', { count: state.count })}</span>
          {state.request ? <span className="text-text-muted"> · {state.request}</span> : null}
        </h2>
        {building ? (
          <span className="text-xs text-text-muted" role="status">
            {t('variants.progress', { index: building.index, count: state.count })}
          </span>
        ) : null}
        {ready ? (
          <AriaButton
            className="inline-flex h-control-sm items-center gap-1 rounded-md px-2 text-xs text-text-muted outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
            onPress={() => {
              closePreview();
              void platform()
                .variants.discard()
                .catch((error: unknown) => {
                  setNotice({ tone: 'danger', text: t('variants.failed', { detail: (error as Error).message.slice(0, 200) }) });
                });
            }}
            data-testid="variants-discard"
          >
            <IconX className="size-icon-sm" aria-hidden />
            {t('variants.discard')}
          </AriaButton>
        ) : null}
      </div>
      {state.mismatch ? (
        <p className="flex items-center gap-1 text-xs text-warning" role="alert" data-testid="variant-mismatch">
          <IconAlertTriangle className="size-icon-sm" aria-hidden />
          {t('variants.mismatch', { detail: state.mismatch })}
        </p>
      ) : null}
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {state.variants.map((variant) => (
          <VariantCard key={variant.index} variant={variant} ready={ready} busy={busy} />
        ))}
      </ul>
    </section>
  );
}

/** The bar over the view while a variant is shown instead of the part. */
export function PreviewBar() {
  const { t } = useTranslation();
  const preview = useStudio((s) => s.preview);
  const variants = useStudio((s) => s.variants.variants);
  if (!preview) return null;
  const variant = variants.find((entry) => entry.index === preview.index);
  const name = variant?.name ?? t('variants.unnamed', { letter: letter(preview.index) });
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-2 rounded-lg border border-accent bg-surface-raised px-3 py-1 text-sm text-text shadow-2"
      data-testid="preview-bar"
    >
      {t('variants.previewing', { name })}
      <AriaButton
        className="inline-flex h-control-sm items-center rounded-md px-2 text-xs font-medium text-accent-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
        onPress={closePreview}
      >
        {t('variants.backToPart')}
      </AriaButton>
    </div>
  );
}
