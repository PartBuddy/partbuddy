import { IconChevronRight, IconCube, IconRestore, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Heading } from 'react-aria-components';

import type { TrashEntry } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { relativeTime } from './projectTiles';

/**
 * PartBuddy's recycle bin on the start page (P2): deleted projects with restore, folded away until
 * asked for. Emptying hands them on to the Windows recycle bin, so it can still be undone there.
 */
export function TrashSection({ entries, now, onChange }: { entries: TrashEntry[]; now: number; onChange: () => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (entries.length === 0) return null;
  const work = (task: () => Promise<void>, done?: string) => {
    setBusy(true);
    void task()
      .then(() => {
        if (done) useStudio.getState().setNotice({ tone: 'success', text: done });
      })
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('project.failed', { detail: (error as Error).message.slice(0, 200) }) });
      })
      .finally(() => {
        setBusy(false);
        setConfirming(false);
        onChange();
      });
  };
  return (
    <section aria-labelledby="home-trash-title" className="flex flex-col gap-2 border-t border-border pt-4" data-testid="home-trash">
      <Heading id="home-trash-title" level={2} className="text-sm font-semibold text-text-muted">
        <AriaButton
          aria-expanded={open}
          onPress={() => setOpen(!open)}
          className="-ml-1 inline-flex h-control-sm items-center gap-1 rounded-md px-1 outline-none transition-colors hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed focus-visible:focus-ring"
          data-testid="home-trash-toggle"
        >
          <IconChevronRight className={`size-icon-sm transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          <IconTrash className="size-icon-sm" aria-hidden />
          <span className="tabular-nums">{t('home.trash.title', { count: entries.length })}</span>
        </AriaButton>
      </Heading>
      {open ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-xs text-text-subtle">{t('home.trash.hint')}</p>
            {confirming ? (
              <div role="group" aria-label={t('home.trash.emptyQuestion', { count: entries.length })} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-text">{t('home.trash.emptyQuestion', { count: entries.length })}</span>
                <Button onPress={() => setConfirming(false)}>{t('project.cancel')}</Button>
                <Button variant="danger" isDisabled={busy} onPress={() => work(() => platform().project.emptyTrash())} data-testid="home-trash-empty-confirm">
                  {t('home.trash.emptyConfirm')}
                </Button>
              </div>
            ) : (
              <Button isDisabled={busy} onPress={() => setConfirming(true)} data-testid="home-trash-empty">
                {t('home.trash.empty')}
              </Button>
            )}
          </div>
          <ul aria-label={t('home.trash.title', { count: entries.length })} className="flex flex-col" data-testid="home-trash-list">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 border-b border-border py-2 last:border-b-0" data-testid="home-trash-entry" data-name={entry.name}>
                <div className="flex size-step-preview shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-sunken">
                  {entry.preview ? <img src={entry.preview} alt="" className="size-full object-contain" draggable={false} /> : <IconCube className="size-control-sm text-text-subtle" stroke={1.25} aria-hidden />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-md font-medium text-text" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="text-xs text-text-subtle tabular-nums">{t('home.trash.deleted', { when: relativeTime(entry.trashed, now, i18n.language) ?? t('home.justNow') })}</span>
                </div>
                <Button
                  isDisabled={busy}
                  onPress={() => work(() => platform().project.restoreTrashed(entry.id), t('home.trash.restored', { name: entry.name }))}
                  data-testid="home-trash-restore"
                >
                  <IconRestore className="size-icon-sm" aria-hidden />
                  {t('home.trash.restore')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
