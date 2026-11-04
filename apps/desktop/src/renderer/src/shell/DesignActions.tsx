import { IconArrowBackUp, IconArrowForwardUp, IconChevronDown, IconDownload, IconExternalLink } from '@tabler/icons-react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover, Tooltip, TooltipTrigger } from 'react-aria-components';

import type { ExportFormat } from '../../../shared/contract';
import { useAssistant, selectedStatus } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';

const iconButton =
  'inline-flex h-control-sm items-center justify-center gap-1 rounded-md px-2 text-sm text-text outline-none transition-colors ' +
  'hover:bg-surface-hover pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ' +
  'disabled:cursor-not-allowed disabled:text-text-subtle disabled:hover:bg-transparent';

const FORMATS: ExportFormat[] = ['3mf', 'stl', 'step'];

/** True when the key event comes from a field where Ctrl+Z belongs to the text. */
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

function ToolButton({
  label,
  shortcut,
  isDisabled,
  onPress,
  children,
  testId,
}: {
  label: string;
  shortcut?: string;
  isDisabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <TooltipTrigger delay={500}>
      <AriaButton aria-label={label} aria-keyshortcuts={shortcut} isDisabled={isDisabled} onPress={onPress} className={iconButton} data-testid={testId}>
        {children}
      </AriaButton>
      <Tooltip offset={6} className="rounded-sm bg-surface-raised px-2 py-1 text-xs text-text shadow-2">
        {shortcut ? `${label} (${shortcut})` : label}
      </Tooltip>
    </TooltipTrigger>
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

  const exportAs = (format: ExportFormat) => {
    void run(async () => {
      const result = await platform().design.export(format);
      return result ? t('actions.exported', { file: result.file }) : null;
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
      <span aria-hidden className="mx-1 h-icon w-hairline bg-border" />
      <MenuTrigger>
        <AriaButton isDisabled={!connected || !hasBodies} className={iconButton} data-testid="export">
          <IconDownload className="size-icon-sm" aria-hidden />
          {t('actions.export')}
          <IconChevronDown className="size-icon-sm text-text-subtle" aria-hidden />
        </AriaButton>
        <Popover placement="bottom start" offset={4} className="min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2">
          <Menu
            aria-label={t('actions.export')}
            className="outline-none"
            onAction={(key) => {
              exportAs(key as ExportFormat);
            }}
          >
            {FORMATS.map((format) => (
              <MenuItem
                key={format}
                id={format}
                textValue={t(`actions.format.${format}.name`)}
                className="flex cursor-default flex-col rounded-sm px-2 py-1 outline-none focus:bg-surface-hover"
                data-testid={`export-${format}`}
              >
                <span className="text-sm font-medium text-text">{t(`actions.format.${format}.name`)}</span>
                <span className="text-xs text-text-muted">{t(`actions.format.${format}.hint`)}</span>
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
      {connection.engine === 'headless' ? (
        <ToolButton label={t('actions.openInSolidCraft')} isDisabled={!idle} onPress={openInSolidCraft} testId="open-in-solidcraft">
          <IconExternalLink className="size-icon-sm" aria-hidden />
        </ToolButton>
      ) : null}
    </div>
  );
}
