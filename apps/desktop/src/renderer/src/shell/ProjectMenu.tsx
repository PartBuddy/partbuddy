import { IconChevronDown, IconCopy, IconFileImport, IconFilePlus, IconFolderOpen, IconFolderSearch, IconPackageImport, IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Input,
  Keyboard,
  Label,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover,
  Separator,
  TextField,
} from 'react-aria-components';

import type { ProjectInfo } from '../../../shared/contract';
import { beforeProjectSwitch } from '../assistant/useAssistantBridge';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { useFileImport } from './fileImport';
import { useProjectSwitch } from './projectSwitch';

const itemClass =
  'flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm text-text outline-none focus:bg-surface-hover disabled:text-text-subtle';

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

function Item({ id, icon, label, shortcut, testId, isDisabled }: { id: string; icon: ReactNode; label: string; shortcut?: string; testId: string; isDisabled?: boolean }) {
  return (
    <MenuItem id={id} textValue={label} className={itemClass} data-testid={testId} isDisabled={isDisabled ?? false}>
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut ? <Keyboard className="text-xs text-text-subtle">{shortcut}</Keyboard> : null}
    </MenuItem>
  );
}

/**
 * The project of the open design in the title bar (B2, decided 2026-11-05): its name, and a menu to
 * start a new project, open one, rename, duplicate, show it in Explorer or move it to the recycle
 * bin. Every switch saves first; the conversation goes with the project. Works while PartBuddy runs
 * SolidCraft without a window.
 */
export function ProjectMenu({ designName }: { designName: string }) {
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const revision = useStudio((s) => (s.model.status === 'ready' ? `${s.model.documentId}:${String(s.model.revision)}` : null));
  const run = useProjectSwitch();
  const files = useFileImport();
  const [project, setProject] = useState<ProjectInfo>(null);
  const [dialog, setDialog] = useState<'rename' | 'trash' | null>(null);
  const ready = connection.state === 'connected' && connection.engine === 'headless';
  const api = platform().project;

  useEffect(() => {
    let live = true;
    void api
      .info()
      .then((info) => {
        if (live) setProject(info);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, revision, connection.save]);

  const create = () => {
    run(() => api.create());
  };
  const open = () => {
    run(() => api.open());
  };

  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || inTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== 'n' && key !== 'o') return;
      event.preventDefault();
      if (key === 'n') create();
      else open();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  return (
    <>
      <MenuTrigger>
        <AriaButton
          className="inline-flex min-w-0 items-center gap-1 rounded-sm px-1 font-medium text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus pressed:bg-surface-selected"
          aria-label={t('project.menu', { name: designName })}
          data-testid="project-menu"
        >
          <span className="truncate" data-testid="design-name">
            {designName}
          </span>
          <IconChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
        </AriaButton>
        <Popover placement="bottom start" offset={4} className="min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2">
          <Menu
            aria-label={t('project.title')}
            className="outline-none"
            disabledKeys={[...(ready ? [] : ['new', 'open', 'import']), ...(connection.state === 'connected' ? [] : ['insert']), ...(ready && project ? [] : ['rename', 'duplicate', 'trash'])]}
            onAction={(key) => {
              if (key === 'new') create();
              else if (key === 'open') open();
              else if (key === 'import') files.asProject();
              else if (key === 'insert') files.intoDesign();
              else if (key === 'rename') setDialog('rename');
              else if (key === 'trash') setDialog('trash');
              else if (key === 'duplicate') run(() => api.duplicate());
              else if (key === 'reveal') void api.reveal();
            }}
          >
            <Item id="new" icon={<IconFilePlus className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.new')} shortcut="Ctrl+N" testId="project-new" />
            <Item id="open" icon={<IconFolderOpen className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.open')} shortcut="Ctrl+O" testId="project-open" />
            <Item id="import" icon={<IconFileImport className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.import')} testId="project-import" />
            <Item id="insert" icon={<IconPackageImport className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.insert')} testId="project-insert" />
            <Separator className="my-1 border-t border-border" />
            <Item id="rename" icon={<IconPencil className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.rename')} testId="project-rename" />
            <Item id="duplicate" icon={<IconCopy className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.duplicate')} testId="project-duplicate" />
            <Item id="reveal" icon={<IconFolderSearch className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.reveal')} testId="project-reveal" />
            <Separator className="my-1 border-t border-border" />
            <Item id="trash" icon={<IconTrash className="size-icon-sm text-text-muted" aria-hidden />} label={t('project.trash')} testId="project-trash" />
          </Menu>
        </Popover>
      </MenuTrigger>
      {project ? <RenameDialog open={dialog === 'rename'} name={project.name} onClose={() => setDialog(null)} /> : null}
      {project ? <TrashDialog open={dialog === 'trash'} name={project.name} opensNew onClose={() => setDialog(null)} onConfirm={() => run(() => api.trash())} /> : null}
    </>
  );
}

/** Renames the open project, or with `folder` a project of the start page; `onDone` instead of closing the start page. */
export function RenameDialog({ open, name, folder, onClose, onDone }: { open: boolean; name: string; folder?: string; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setBusy(true);
    void beforeProjectSwitch()
      .then(() => platform().project.rename(value, folder))
      .then((result) => {
        if (result.ok) {
          onClose();
          if (onDone) onDone();
          else useStudio.getState().setHomeOpen(false);
        }
        else setError(t(`project.renameError.${result.reason}`));
      })
      .catch((failure: unknown) => {
        setError(t('project.failed', { detail: (failure as Error).message.slice(0, 200) }));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-sm max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="flex flex-col gap-4 p-5 outline-none" data-testid="project-rename-dialog">
          <Heading slot="title" className="text-lg font-semibold text-text">
            {t('project.renameTitle')}
          </Heading>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <TextField
              value={value}
              onChange={(next) => {
                setValue(next);
                setError(null);
              }}
              autoFocus
              isInvalid={error !== null}
              className="flex flex-col gap-1"
            >
              <Label className="text-xs text-text-muted">{t('project.name')}</Label>
              <Input className="h-control-md rounded-md border border-border-strong bg-surface px-2 text-md text-text outline-none focus-visible:outline-2 focus-visible:outline-focus invalid:border-danger" data-testid="project-name-input" />
              {error ? (
                <span role="alert" className="text-xs text-danger" data-testid="project-rename-error">
                  {error}
                </span>
              ) : (
                <span className="text-xs text-text-subtle">{t('project.renameHint')}</span>
              )}
            </TextField>
            <div className="flex justify-end gap-2">
              <Button onPress={onClose}>{t('project.cancel')}</Button>
              <Button type="submit" variant="primary" isDisabled={busy || value.trim() === ''} data-testid="project-rename-save">
                {t('project.renameSave')}
              </Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** Asks before a project goes to the recycle bin; `opensNew` when it is the open one and a new design follows. */
export function TrashDialog({ open, name, opensNew, onClose, onConfirm }: { open: boolean; name: string; opensNew?: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-sm max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog role="alertdialog" className="flex flex-col gap-4 p-5 outline-none" data-testid="project-trash-dialog">
          <Heading slot="title" className="text-lg font-semibold text-text">
            {t('project.trashTitle', { name })}
          </Heading>
          <p className="text-sm text-text-muted">{t(opensNew ? 'project.trashBody' : 'project.trashBodyKeep')}</p>
          <div className="flex justify-end gap-2">
            <Button onPress={onClose} autoFocus>
              {t('project.cancel')}
            </Button>
            <Button
              variant="primary"
              onPress={() => {
                onClose();
                onConfirm();
              }}
              data-testid="project-trash-confirm"
            >
              {t('project.trashConfirm')}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
