import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Input, Label, Modal, ModalOverlay, TextField } from 'react-aria-components';

import type { ProjectEntry } from '../../../shared/contract';
import { platform } from '../platform';
import { Button } from '../ui/Button';
import { parseTags } from './projectTiles';

/** The tags of a start page project (P5), typed in one field and separated by commas. */
export function TagsDialog({ project, onClose, onDone }: { project: ProjectEntry; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(project.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalOverlay
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-sm max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="flex flex-col gap-4 p-5 outline-none" data-testid="project-tags-dialog">
          <Heading slot="title" className="text-lg font-semibold text-text">
            {t('home.tags.title', { name: project.name })}
          </Heading>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void platform()
                .project.setMeta(project.folder, { tags: parseTags(value) })
                .then(() => {
                  onClose();
                  onDone();
                })
                .catch((failure: unknown) => {
                  setError(t('project.failed', { detail: (failure as Error).message.slice(0, 200) }));
                });
            }}
          >
            <TextField value={value} onChange={setValue} autoFocus className="flex flex-col gap-1">
              <Label className="text-xs text-text-muted">{t('home.tags.label')}</Label>
              <Input placeholder={t('home.tags.placeholder')} className="h-control-md rounded-md border border-border-strong bg-surface px-2 text-md text-text outline-none placeholder:text-text-subtle focus-visible:focus-ring" data-testid="project-tags-input" />
              {error ? (
                <span role="alert" className="text-xs text-danger">
                  {error}
                </span>
              ) : (
                <span className="text-xs text-text-subtle">{t('home.tags.hint')}</span>
              )}
            </TextField>
            <div className="flex justify-end gap-2">
              <Button onPress={onClose}>{t('project.cancel')}</Button>
              <Button type="submit" variant="primary" data-testid="project-tags-save">
                {t('home.tags.save')}
              </Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
