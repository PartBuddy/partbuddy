import { IconFileImport } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { importable, insertable, useFileImport } from './fileImport';

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/**
 * Dropping a file onto the window (B4): on the start page it becomes a new project; in the work
 * area a STEP, IGES, STL, 3MF or OBJ file is inserted into the open design and a SolidCraft design
 * opens as a project of its own. While a file is dragged over the window, a note says which.
 */
export function FileDrop() {
  const { t } = useTranslation();
  const homeOpen = useStudio((s) => s.homeOpen);
  const { asProject, intoDesign } = useFileImport();
  const [dragging, setDragging] = useState(false);
  // Over the chat a picture is taken by the chat itself, which shows its own note.
  const [overChat, setOverChat] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      setOverChat(event.defaultPrevented);
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      // The chat took a picture (it prevented the default); then there is nothing to import.
      const taken = event.defaultPrevented;
      // Never let the window navigate to the dropped file.
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      setOverChat(false);
      if (taken) return;
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      const path = platform().project.pathOfFile(file);
      if (!importable(file.name) || !path) {
        useStudio.getState().setNotice({ tone: 'danger', text: t(importable(file.name) ? 'project.dropNoPath' : 'project.dropUnknown') });
        return;
      }
      if (!useStudio.getState().homeOpen && insertable(file.name)) intoDesign(path);
      else asProject(path);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [t, asProject, intoDesign]);

  if (!dragging || overChat) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex animate-fade-in items-center justify-center bg-overlay p-4" data-testid="file-drop">
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-accent bg-surface-raised px-6 py-5 text-center shadow-3">
        <IconFileImport className="size-control-sm text-accent" aria-hidden />
        <p className="text-md font-semibold text-text">{t(homeOpen ? 'project.dropAsProject' : 'project.dropIntoDesign')}</p>
        <p className="text-sm text-text-muted">{t('project.dropKinds')}</p>
      </div>
    </div>
  );
}
