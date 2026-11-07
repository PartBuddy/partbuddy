import { IconArrowBarToDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Tooltip, TooltipTrigger } from 'react-aria-components';

import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { buttonClass } from '../ui/Button';
import { tooltipClass } from '../ui/Tooltip';

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
      .design.setPrintFace(body.name, pick.point, body.model.table.faces[pick.face]?.name)
      .then(() => {
        useStudio.getState().setPrintFaces({ ...useStudio.getState().printFaces, [body.name]: body.model.table.faces[pick.face]?.name ?? '' });
        useStudio.getState().setNotice({ tone: 'success', text: t('printFace.done', { name: body.name }) });
      })
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      <AriaButton
        isDisabled={busy}
        onPress={set}
        className={`self-start ${buttonClass('secondary', 'sm')}`}
        data-testid="action-print-face"
      >
        <IconArrowBarToDown className="size-icon-sm" aria-hidden />
        {t('printFace.action')}
      </AriaButton>
      <Tooltip placement="top" offset={6} className={tooltipClass}>
        {t('printFace.hint')}
      </Tooltip>
    </TooltipTrigger>
  );
}
