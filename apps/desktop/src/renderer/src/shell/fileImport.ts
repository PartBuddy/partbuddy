import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { useProjectSwitch } from './projectSwitch';

/** The kinds of file PartBuddy imports (B4); the main process checks them again. */
const PROJECT_FILES = /\.(sc|step|stp|iges|igs|stl|3mf|obj)$/i;
const INSERT_FILES = /\.(step|stp|iges|igs|stl|3mf|obj)$/i;

export function importable(name: string): boolean {
  return PROJECT_FILES.test(name);
}

export function insertable(name: string): boolean {
  return INSERT_FILES.test(name);
}

/**
 * Import (B4): a file becomes a new project, or is inserted into the open design. Without a path
 * the main process asks with the open dialog. Shared by the start page, the project menu and
 * dropping a file onto the window.
 */
export function useFileImport(): { asProject: (path?: string) => void; intoDesign: (path?: string) => void } {
  const { t } = useTranslation();
  const run = useProjectSwitch();
  const asProject = useCallback(
    (path?: string) => {
      run(() => platform().project.import(path));
    },
    [run],
  );
  const intoDesign = useCallback(
    (path?: string) => {
      const { setNotice } = useStudio.getState();
      void platform()
        .design.insert(path)
        .then((result) => {
          if (result.inserted) setNotice({ tone: 'success', text: t('project.inserted', { name: result.name ?? '', count: result.bodies.length }) });
        })
        .catch((error: unknown) => {
          setNotice({ tone: 'danger', text: t('project.failed', { detail: (error as Error).message.slice(0, 200) }) });
        });
    },
    [t],
  );
  return { asProject, intoDesign };
}
