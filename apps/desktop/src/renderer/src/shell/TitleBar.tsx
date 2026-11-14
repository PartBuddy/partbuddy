import { IconAlertTriangle, IconCheck, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import type { ConnectionStatus } from '../../../shared/contract';
import { platform } from '../platform';
import { Tip } from '../ui/Tooltip';
import { useStudio } from '../state/store';
import { StatusDot, type Tone } from '../ui/Feedback';
import { BrandMark } from './BrandMark';
import { hexColor } from './hexColor';
import { DesignActions } from './DesignActions';
import { ProjectMenu } from './ProjectMenu';
import { SettingsMenu } from './SettingsMenu';
import { pressable } from '../ui/Button';

function connectionTone(status: ConnectionStatus): Tone {
  if (status.state === 'connected') return status.mirror === 'failed' ? 'warning' : status.mirror === 'rebuilding' ? 'info' : 'success';
  if (status.state === 'failed' || status.state === 'notInstalled') return 'danger';
  if (status.state === 'lost' || status.state === 'notRunning') return 'warning';
  return 'neutral';
}

function connectionLabelKey(status: ConnectionStatus): string {
  if (status.state === 'connected' && status.mirror === 'rebuilding') return 'solidcraft.rebuilding';
  return `solidcraft.${status.state}`;
}

/**
 * The version of the SolidCraft PartBuddy started with, as the engine settings know it (no new
 * process: the main process reads it once at start). Null while unknown or once another program waits
 * for a restart. shortcut: a SolidCraft window the user opened from another install shows this
 * version too; read the version from the connection if that ever matters.
 */
function useSolidCraftVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void platform()
      .solidcraft.engine()
      .then((info) => {
        if (current) setVersion(info.restartNeeded ? null : info.version);
      });
    return () => {
      current = false;
    };
  }, []);
  return version;
}

/**
 * Colours the system's window buttons like the title bar, from the design tokens, now and on
 * every theme change (the main process cannot read CSS).
 */
function useWindowButtonColors(): void {
  useEffect(() => {
    const report = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      const height = Number.parseInt(read('--cs-titlebar-height'), 10);
      const color = hexColor(read('--cs-color-surface'));
      const symbolColor = hexColor(read('--cs-color-text'));
      if (!Number.isInteger(height) || !color || !symbolColor) return;
      // One pixel less, so the bar's bottom border stays visible under the buttons.
      void platform().window.setTitleBarColors({ color, symbolColor, height: height - 1 });
    };
    report();
    const query = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {
      requestAnimationFrame(report);
    };
    query.addEventListener('change', changed);
    return () => {
      query.removeEventListener('change', changed);
    };
  }, []);
}

export function TitleBar() {
  useWindowButtonColors();
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const version = useSolidCraftVersion();
  const model = useStudio((s) => s.model);
  const homeOpen = useStudio((s) => s.homeOpen);
  const setHomeOpen = useStudio((s) => s.setHomeOpen);
  // SolidCraft calls a design "Untitled" until it is saved under a name; PartBuddy names it after
  // its first body on the first autosave (UI upgrade, 2026-11-04).
  const untitled = model.status === 'ready' && (model.designName.trim() === '' || model.designName === 'Untitled');
  const designName = model.status !== 'ready' ? t('app.noDesign') : untitled ? t('app.untitled') : model.designName;

  return (
    <header className="title-bar flex h-titlebar shrink-0 items-center gap-3 border-b border-border bg-surface select-none" data-testid="title-bar">
      {/* The logo opens the start page with the projects (B3) and closes it again. */}
      <Tip label={homeOpen ? t('home.close') : t('home.open')} placement="bottom">
      <AriaButton
        onPress={() => {
          setHomeOpen(!homeOpen);
        }}
        // The visible name starts the accessible one (WCAG 2.5.3).
        aria-label={`${t('app.name')}, ${homeOpen ? t('home.close') : t('home.open')}`}
        aria-pressed={homeOpen}
        className={`flex items-center gap-2 rounded-md px-1 hover:bg-surface-hover pressed:bg-surface-pressed aria-pressed:bg-surface-pressed ${pressable}`}
        data-testid="home-button"
      >
        <BrandMark />
        <span className="font-display text-lg font-semibold text-text">{t('app.name')}</span>
      </AriaButton>
      </Tip>
      <nav aria-label={t('app.design')} className="flex min-w-0 items-center gap-2 text-md">
        <span className="text-text-subtle">/</span>
        <ProjectMenu designName={designName} />
        {model.status === 'ready' && connection.save && !homeOpen ? <SaveState state={connection.save} /> : null}
      </nav>
      {homeOpen ? null : <DesignActions />}
      {/* The bar names SolidCraft's version; the model's revision stays on hover (14 November 2026). */}
      <div
        className="ml-auto flex items-center gap-2"
        data-testid="connection-status"
        data-engine={connection.engine}
        data-revision={connection.revision}
        title={connection.revision === undefined ? undefined : t('solidcraft.revision', { revision: connection.revision })}
      >
        <StatusDot
          tone={connectionTone(connection)}
          label={t(connectionLabelKey(connection), { name: version ? `${t('solidcraft.label')} ${version}` : t('solidcraft.label') })}
        />
      </div>
      <SettingsMenu />
    </header>
  );
}

/** Whether the design PartBuddy runs without a window is saved; it saves after every change. */
function SaveState({ state }: { state: NonNullable<ConnectionStatus['save']> }) {
  const { t } = useTranslation();
  const icon =
    state === 'saving' ? (
      <IconLoader2 className="size-icon-sm animate-spin motion-reduce:animate-none" aria-hidden />
    ) : state === 'saved' ? (
      <IconCheck className="size-icon-sm" aria-hidden />
    ) : (
      <IconAlertTriangle className="size-icon-sm text-warning" aria-hidden />
    );
  return (
    <span
      role="status"
      title={t('app.save.hint')}
      className={`flex shrink-0 items-center gap-1 text-xs ${state === 'failed' ? 'text-warning' : 'text-text-subtle'}`}
      data-testid="save-state"
      data-state={state}
    >
      {icon}
      {t(`app.save.${state}`)}
    </span>
  );
}
