import { IconArrowBackUp, IconArrowForwardUp, IconChevronDown, IconDownload, IconExternalLink, IconFile3d, IconFileExport, IconHistory, IconPrinter, IconShare } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator } from 'react-aria-components';

import type { ExportFormat, Slicer } from '../../../shared/contract';
import { useAssistant, selectedStatus } from '../assistant/store';
import { ExportConfirm } from '../print/ExportConfirm';
import { asksBeforeExport } from '../print/report';
import { platform } from '../platform';
import { useStudio, type ExportTarget } from '../state/store';
import { buttonClass, IconButton } from '../ui/Button';
import { goneFaces } from './printFaceChanges';
import { VersionsDialog } from './VersionsDialog';
import { POPOVER_OFFSET, menuClass, menuHeaderClass, menuItemTwoLineClass, menuSeparatorClass, popoverClass } from '../ui/Overlay';

const FORMATS: ExportFormat[] = ['3mf', 'stl', 'step'];
const iconItemClass = `${menuItemTwoLineClass} flex-row! gap-2!`;
const itemIcon = 'mt-hairline size-icon-sm shrink-0 text-text-muted';

/** True when the key event comes from a field where Ctrl+Z belongs to the text. */
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

function ToolButton({ label, shortcut, isDisabled, onPress, children, testId }: { label: string; shortcut?: string; isDisabled: boolean; onPress: () => void; children: React.ReactNode; testId: string }) {
  return (
    <IconButton label={label} {...(shortcut ? { shortcut } : {})} isDisabled={isDisabled} onPress={onPress} data-testid={testId}>
      {children}
    </IconButton>
  );
}

/**
 * The user's own actions on the design (ADR 0016): undo, redo, export and "Open in SolidCraft".
 * They work without the assistant and wait while it changes the design.
 */
export function DesignActions() {
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const history = useStudio((s) => s.history);
  const model = useStudio((s) => s.model);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [slicers, setSlicers] = useState<Slicer[]>([]);
  const setNotice = useStudio((s) => s.setNotice);
  const assistantBusy = useAssistant((s) => selectedStatus(s.state).state === 'busy');
  const working = useRef(false);

  const connected = connection.state === 'connected';
  const idle = connected && !assistantBusy;
  const hasBodies = model.status === 'ready' && model.bodies.length > 0;

  const run = useCallback(
    async (action: () => Promise<string | null>) => {
      if (working.current) return;
      working.current = true;
      try {
        const done = await action();
        if (done) setNotice({ tone: 'success', text: done });
      } catch (error) {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      } finally {
        working.current = false;
      }
    },
    [setNotice, t],
  );

  const undo = useCallback(() => {
    void run(async () => {
      await platform().design.undo();
      return null;
    });
  }, [run]);
  const redo = useCallback(() => {
    void run(async () => {
      await platform().design.redo();
      return null;
    });
  }, [run]);

  // Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (Cmd on macOS), except while typing in a field.
  const canUndo = idle && history.undo > 0;
  const canRedo = idle && history.redo > 0;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || inTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && canUndo) {
        event.preventDefault();
        undo();
      } else if ((key === 'y' || (key === 'z' && event.shiftKey)) && canRedo) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [canUndo, canRedo, undo, redo]);

  // A print face SolidCraft no longer holds (undone, or on no flat face after a change) is said, not dropped silently (audit D20).
  const printFaces = useStudio((s) => s.printFaces);
  const seenFaces = useRef<{ documentId: string | null; faces: Record<string, string> }>({ documentId: null, faces: {} });
  useEffect(() => {
    const documentId = model.status === 'ready' ? model.documentId : null;
    const before = seenFaces.current;
    seenFaces.current = { documentId, faces: printFaces };
    if (documentId === null || before.documentId !== documentId || model.status !== 'ready') return;
    const gone = goneFaces(before.faces, printFaces, model.bodies.map((entry) => entry.name));
    if (gone.length > 0) setNotice({ tone: 'danger', text: t('actions.printFaceGone', { bodies: gone.slice(0, 5).join(', '), count: gone.length }) });
  }, [printFaces, model, setNotice, t]);

  // Bodies that look like bought standard parts but could not be checked went along as printed ones: the user hears it with the result.
  const unchecked = (bodies: string[] | undefined) => (bodies && bodies.length > 0 ? ` ${t('actions.uncheckedParts', { bodies: bodies.slice(0, 5).join(', '), count: bodies.length })}` : '');
  // Hidden bodies are not mirrored, so neither checked nor exported: the result names them (audit D24).
  const hidden = () => {
    const { model: now } = useStudio.getState();
    if (now.status !== 'ready') return '';
    const left = now.structure.bodies.filter((body) => !body.visible && !now.structure.standardParts?.includes(body.name)).map((body) => body.name);
    return left.length > 0 ? ` ${t('actions.hiddenLeftOut', { bodies: left.slice(0, 5).join(', ') + (left.length > 5 ? ' …' : '') })}` : '';
  };

  // A red ready-to-print check, or one still measuring or not fully measured, asks once before the export (M7, X-1); it does not stop it.
  const exportNow = (target: ExportTarget) => {
    void run(async () => {
      if (target.startsWith('slicer:')) {
        // To the slicer (B8): SolidCraft starts it with the printable bodies on their print faces.
        const { name, unverified } = await platform().design.sendToSlicer(target.slice('slicer:'.length));
        return `${t('actions.sentToSlicer', { name })}${unchecked(unverified)}${hidden()}`;
      }
      if (target === 'share') {
        // The sharing package (F5): the main process opens its folder in Explorer.
        const { folder, unverified } = await platform().design.share();
        return `${t('actions.share.done', { folder })}${unchecked(unverified)}${hidden()}`;
      }
      const result = await platform().design.export(target as ExportFormat);
      if (!result) return null;
      return `${t('actions.exported', { file: result.file })}${unchecked(result.unverified)}${hidden()}`;
    });
  };

  const exportAs = (target: ExportTarget) => {
    const { printCheck, model, connection: now } = useStudio.getState();
    if (asksBeforeExport(printCheck, model, now)) {
      useStudio.getState().setExportConfirm(target);
      return;
    }
    exportNow(target);
  };

  // The slicers SolidCraft finds, read each time the menu opens (one may have been installed since).
  const loadSlicers = (open: boolean) => {
    if (!open || !connected) return;
    void platform()
      .design.slicers()
      .then(setSlicers)
      .catch(() => {
        setSlicers([]);
      });
  };

  const openInSolidCraft = () => {
    void run(async () => {
      await platform().design.openInSolidCraft();
      return t('actions.openedInSolidCraft');
    });
  };

  return (
    <div role="toolbar" aria-label={t('actions.toolbar')} className="flex items-center gap-1" data-testid="design-actions">
      <ToolButton label={t('actions.undo')} shortcut="Ctrl+Z" isDisabled={!canUndo} onPress={undo} testId="undo">
        <IconArrowBackUp className="size-icon-sm" aria-hidden />
      </ToolButton>
      <ToolButton label={t('actions.redo')} shortcut="Ctrl+Y" isDisabled={!canRedo} onPress={redo} testId="redo">
        <IconArrowForwardUp className="size-icon-sm" aria-hidden />
      </ToolButton>
      <ToolButton label={t('versions.title')} isDisabled={connection.state !== 'connected' || connection.engine !== 'headless'} onPress={() => setVersionsOpen(true)} testId="versions-button">
        <IconHistory className="size-icon-sm" aria-hidden />
      </ToolButton>
      <span aria-hidden className="mx-1 h-icon w-hairline bg-border" />
      <MenuTrigger onOpenChange={loadSlicers}>
        <AriaButton isDisabled={!connected || !hasBodies} className={buttonClass('quiet', 'sm')} data-testid="export">
          <IconDownload className="size-icon-sm" aria-hidden />
          {t('actions.export')}
          <IconChevronDown className="size-icon-sm text-text-subtle" aria-hidden />
        </AriaButton>
        <Popover placement="bottom start" offset={POPOVER_OFFSET} className={popoverClass}>
          <Menu
            aria-label={t('actions.export')}
            className={menuClass}
            onAction={(key) => {
              exportAs(key as ExportTarget);
            }}
          >
            <MenuSection>
              {FORMATS.map((format) => (
                <MenuItem
                  key={format}
                  id={format}
                  textValue={t(`actions.format.${format}.name`)}
                  className={iconItemClass}
                  data-testid={`export-${format}`}
                >
                  {format === 'step' ? <IconFileExport className={itemIcon} aria-hidden /> : <IconFile3d className={itemIcon} aria-hidden />}
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-text">{t(`actions.format.${format}.name`)}</span>
                    <span className="text-xs text-text-muted">{t(`actions.format.${format}.hint`)}</span>
                  </span>
                </MenuItem>
              ))}
            </MenuSection>
            <Separator className={menuSeparatorClass} />
            <MenuSection>
              <MenuItem
                id="share"
                textValue={t('actions.share.name')}
                className={iconItemClass}
                data-testid="export-share"
              >
                <IconShare className={itemIcon} aria-hidden />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-text">{t('actions.share.name')}</span>
                  <span className="text-xs text-text-muted">{t('actions.share.hint')}</span>
                </span>
              </MenuItem>
            </MenuSection>
            {slicers.length > 0 ? (
              <>
                <Separator className={menuSeparatorClass} />
                <MenuSection>
                  <Header className={`${menuHeaderClass} uppercase tracking-wide`}>{t('actions.slicer.title')}</Header>
                  {slicers.map((slicer) => (
                    <MenuItem
                      key={slicer.id}
                      id={`slicer:${slicer.id}`}
                      textValue={t('actions.slicer.open', { name: slicer.name })}
                      className={iconItemClass}
                      data-testid="export-slicer"
                      data-slicer={slicer.id}
                    >
                      <IconPrinter className={itemIcon} aria-hidden />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-text">{t('actions.slicer.open', { name: slicer.name })}</span>
                        <span className="text-xs text-text-muted">{t('actions.slicer.hint')}</span>
                      </span>
                    </MenuItem>
                  ))}
                </MenuSection>
              </>
            ) : null}
          </Menu>
        </Popover>
      </MenuTrigger>
      {connection.engine === 'headless' ? (
        <ToolButton label={t('actions.openInSolidCraft')} isDisabled={!idle} onPress={openInSolidCraft} testId="open-in-solidcraft">
          <IconExternalLink className="size-icon-sm" aria-hidden />
        </ToolButton>
      ) : null}
      <ExportConfirm onConfirm={exportNow} />
      <VersionsDialog open={versionsOpen} onClose={() => setVersionsOpen(false)} />
    </div>
  );
}
