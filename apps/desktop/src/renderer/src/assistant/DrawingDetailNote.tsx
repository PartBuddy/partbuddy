import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { drawingDetail, type DrawingDetail } from '../../../shared/drawingDetail';
import type { Drawing } from '../../../shared/svgDrawing';
import { useStudio } from '../state/store';
import { buttonClass } from '../ui/Button';
import { markedPicture } from './drawing';

/** Quiet time after a change of the width before the check runs (up to a few hundred ms on a large drawing). */
const CHECK_DELAY_MS = 300;

/**
 * A warning under an SVG drawing when parts of it are narrower than the printer's nozzle at the
 * chosen width: how many, the narrowest, the width from which all print, a button to take that
 * width and, where the caller can show a picture, one to see the places marked.
 */
export function DrawingDetailNote({ drawing, width, onWiden, onShow }: { drawing: Drawing | null; width: number; onWiden: (width: number) => void; onShow?: (png: Uint8Array) => void }) {
  const { t } = useTranslation();
  const nozzle = useStudio((s) => s.print?.printer.nozzle ?? 0.4);
  // The last check with its drawing: while the width is typed it stays up, another drawing hides it.
  const [checked, setChecked] = useState<{ drawing: Drawing; detail: DrawingDetail | null } | null>(null);
  const detail = checked && checked.drawing === drawing ? checked.detail : null;

  useEffect(() => {
    if (!drawing) return;
    const timer = setTimeout(() => {
      setChecked({ drawing, detail: drawingDetail(drawing, width, nozzle) });
    }, CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [drawing, width, nozzle]);

  if (!drawing || !detail) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-warning" role="status" data-testid="drawing-detail">
      <p className="flex items-start gap-1">
        <IconAlertTriangle className="mt-px size-icon-sm shrink-0" aria-hidden />
        <span>{t('drawingDetail.fine', { places: detail.places, nozzle, thinnest: detail.thinnest, fineFrom: detail.fineFrom })}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        <AriaButton onPress={() => onWiden(detail.fineFrom)} className={buttonClass('secondary', 'sm')} data-testid="drawing-detail-widen">
          {t('drawingDetail.widen', { width: detail.fineFrom })}
        </AriaButton>
        {onShow ? (
          <AriaButton
            onPress={() => {
              void markedPicture(drawing, width, detail.mask).then(onShow);
            }}
            className={buttonClass('quiet', 'sm')}
            data-testid="drawing-detail-show"
          >
            {t('drawingDetail.show')}
          </AriaButton>
        ) : null}
      </div>
    </div>
  );
}
