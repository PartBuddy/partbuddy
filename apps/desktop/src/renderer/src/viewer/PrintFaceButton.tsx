import { IconArrowBarToDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Tooltip, TooltipTrigger } from 'react-aria-components';

import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';

/**
 * "Print on this face" at one picked flat face (plan step B8): SolidCraft's own print face
 * (`body.print_face`), which its slicer export lays down at Z = 0. PartBuddy adds no orientation
 * logic of its own.
 */
export function PrintFaceButton({ bodies, picks, busy }: { bodies: BodyModel[]; picks: Pick[]; busy: boolean }) {
  const { t } = useTranslation();
  const [pick] = picks;
  if (picks.length !== 1 || pick?.kind !== 'face') return null;
  const body = bodies[pick.body];
  if (!body?.model.table.faces[pick.face]?.planeNormal) return null;
  const standard = useStudio.getState().model;
  if (standard.status === 'ready' && standard.structure.standardParts?.includes(body.name)) return null;
  const set = () => {
    void platform()
      .design.setPrintFace(body.name, pick.point)
      .then(() => {
        useStudio.getState().setNotice({ tone: 'success', text: t('printFace.done', { name: body.name }) });
      })
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  return (
    <TooltipTrigger delay={300}>
      <AriaButton
        isDisabled={busy}
        onPress={set}
        className="inline-flex h-control-sm items-center gap-1 self-start rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
        data-testid="action-print-face"
      >
        <IconArrowBarToDown className="size-icon-sm" aria-hidden />
        {t('printFace.action')}
      </AriaButton>
      <Tooltip placement="top" offset={6} className="max-w-text-max rounded-sm bg-surface-raised px-2 py-1 text-xs text-text shadow-2">
        {t('printFace.hint')}
      </Tooltip>
    </TooltipTrigger>
  );
}
