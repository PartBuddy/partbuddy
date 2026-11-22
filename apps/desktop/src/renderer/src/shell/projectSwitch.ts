import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { beforeProjectSwitch } from '../assistant/useAssistantBridge';
import { useStudio } from '../state/store';

/**
 * Runs a project action that switches the design (new, open, import, duplicate, trash): the
 * conversation is saved first, the start page closes once the next project is open, and a failure
 * shows as a notice. Shared by the project menu and the start page (B2, B3).
 */
export function useProjectSwitch(): (work: () => Promise<unknown>) => void {
  const { t, i18n } = useTranslation();
  return useCallback(
    (work: () => Promise<unknown>) => {
      void beforeProjectSwitch()
        .then(work)
        .then((result) => {
          // A cancelled dialog leaves everything as it was, the start page included.
          const cancelled = typeof result === 'object' && result !== null && 'opened' in result && result.opened === false;
          if (!cancelled) useStudio.getState().setHomeOpen(false);
          if (typeof result === 'object' && result !== null && 'imported' in result && result.imported === true) {
            // A mesh has no sizes to change: the notice says how to go on and stays until it is read (usability U-14).
            const mesh = 'mesh' in result && result.mesh === true;
            // Its size as it came in, so a file in the wrong unit shows at once (audit D44).
            const size = 'size' in result && Array.isArray(result.size) ? ` ${t('project.importedSize', { size: (result.size as number[]).map((value) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)).join(' × ') })}` : '';
            useStudio.getState().setNotice(mesh ? { tone: 'info', text: t('project.importedMesh') + size } : { tone: 'success', text: t('project.imported') });
          }
        })
        .catch((error: unknown) => {
          useStudio.getState().setNotice({ tone: 'danger', text: t('project.failed', { detail: (error as Error).message.slice(0, 200) }) });
        });
    },
    [t, i18n.language],
  );
}
