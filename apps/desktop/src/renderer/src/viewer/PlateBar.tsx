import { IconAlertTriangle, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { useStudio } from '../state/store';
import { Busy } from '../ui/Feedback';
import type { PlateLayout } from './motion';
import { IconButton } from '../ui/Button';


/**
 * The plate view's bar (viewport CAD round): which plate of how many, the printer's build volume,
 * the parts that do not fit, and the way between the plates. Docked at the bottom like the
 * selection dock, which the plate view replaces (nothing is picked on the plate).
 */
export function PlateBar({ layout, bed }: { layout: PlateLayout; bed: [number, number, number] | null }) {
  const { t } = useTranslation();
  const plate = useStudio((s) => s.plate);
  const setPlate = useStudio((s) => s.setPlate);
  const printer = useStudio((s) => s.print?.printer.name ?? null);
  const plates = layout.result?.plates ?? 0;
  const misfits = layout.result?.misfits ?? [];
  return (
    <div
      role="group"
      aria-label={t('plate.title')}
      className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex animate-fade-in max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-view-overlay
      data-testid="plate-bar"
      data-plates={plates}
    >
      <div className="flex items-center gap-2">
        {/* Paging only when there is more than one plate (audit B-24). */}
        {plates > 1 ? (
          <IconButton size="md" label={t('plate.previous')} isDisabled={plate <= 0} onPress={() => { setPlate(plate - 1); }} data-testid="plate-prev">
            <IconChevronLeft className="size-icon-sm" aria-hidden />
          </IconButton>
        ) : null}
        <span className="min-w-field-number whitespace-nowrap text-center text-sm font-medium tabular-nums text-text" aria-live="polite" data-testid="plate-label">
          {layout.status === 'computing' ? <Busy label={t('plate.computing')} /> : layout.status === 'error' ? t('plate.failed') : t('plate.of', { plate: plate + 1, plates })}
        </span>
        {plates > 1 ? (
          <IconButton size="md" label={t('plate.next')} isDisabled={plate >= plates - 1} onPress={() => { setPlate(plate + 1); }} data-testid="plate-next">
            <IconChevronRight className="size-icon-sm" aria-hidden />
          </IconButton>
        ) : null}
        {bed ? (
          <span className="whitespace-nowrap border-l border-border pl-3 text-xs tabular-nums text-text-muted" data-testid="plate-bed">
            {printer ? `${printer} · ` : ''}
            {t('plate.volume', { x: bed[0], y: bed[1], z: bed[2] })}
          </span>
        ) : (
          <span className="text-xs text-text-muted">{t('plate.noPrinter')}</span>
        )}
      </div>
      {misfits.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="plate-misfits">
          {misfits.map((misfit) => (
            <li key={`${misfit.id}-${misfit.reason}`} className="flex items-center gap-2 text-xs text-text">
              <IconAlertTriangle className="size-icon-sm shrink-0 text-warning" aria-hidden />
              {t(misfit.reason === 'size' ? 'plate.tooLarge' : 'plate.tooTall', { part: misfit.id })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
