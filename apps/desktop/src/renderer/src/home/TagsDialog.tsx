import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Input, Label, Modal, ModalOverlay, TextField } from 'react-aria-components';

import type { ProjectEntry } from '../../../shared/contract';
import { platform } from '../platform';
import { Button } from '../ui/Button';
import { parseTags } from './projectTiles';
import { FieldMessage, fieldLabelClass, inputClass } from '../ui/Field';
import { DialogClose, dialogTitleClass, modalClass, overlayClass } from '../ui/Dialog';

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
      className={overlayClass}
    >
      <Modal className={modalClass('sm')}>
        <Dialog className="flex flex-col gap-4 p-5 outline-none" data-testid="project-tags-dialog">
          <div className="flex items-start gap-2">
            <Heading slot="title" className={`flex-1 ${dialogTitleClass}`}>
              {t('home.tags.title', { name: project.name })}
            </Heading>
            <DialogClose onPress={onClose} />
          </div>
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
            <TextField value={value} onChange={setValue} autoFocus isInvalid={error !== null} className="flex flex-col gap-1">
              <Label className={fieldLabelClass}>{t('home.tags.label')}</Label>
              <Input placeholder={t('home.tags.placeholder')} className={inputClass('md')} data-testid="project-tags-input" />
              <FieldMessage error={error} hint={t('home.tags.hint')} />
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
