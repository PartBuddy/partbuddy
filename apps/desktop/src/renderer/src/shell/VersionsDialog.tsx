import { IconCube, IconHistory, IconX } from '@tabler/icons-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Input, Label, Modal, ModalOverlay, TextField, ToggleButton } from 'react-aria-components';

import type { VersionComparison, VersionEntry } from '../../../shared/contract';
import { beforeProjectSwitch } from '../assistant/useAssistantBridge';
import { relativeTime } from '../home/projectTiles';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button, IconButton } from '../ui/Button';

const volume = (mm3: number, language: string) => new Intl.NumberFormat(language, { maximumFractionDigits: mm3 < 10 ? 1 : 0 }).format(mm3);

/** One line per body: what changed since the version. */
function ChangeList({ comparison }: { comparison: VersionComparison }) {
  const { t, i18n } = useTranslation();
  if (comparison.bodies.length === 0) return <p className="text-sm text-text-muted">{t('versions.compareEmpty')}</p>;
  const unchanged = comparison.bodies.every((body) => body.status === 'same');
  return (
    <div className="flex flex-col gap-1" data-testid="version-changes">
      {unchanged ? <p className="text-sm text-text">{t('versions.compareSame')}</p> : null}
      <ul className="flex flex-col gap-1">
        {comparison.bodies.map((body) => (
          <li key={`${body.status}:${body.body}`} className="text-sm text-text" data-testid="version-change" data-status={body.status}>
            <span className="font-medium">{body.body}</span>
            {': '}
            {body.status === 'changed'
              ? t('versions.changed', { added: volume(body.addedMm3, i18n.language), removed: volume(body.removedMm3, i18n.language), regions: body.regions.length })
              : body.status === 'moved'
                ? t('versions.moved', { distance: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(body.movedMm) })
                : t(`versions.${body.status}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Names a version in place (P4): an automatic one becomes a milestone that is kept. */
function NameForm({ version, onDone, onCancel }: { version: VersionEntry; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(version.reason === 'manual' ? version.label : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        void platform()
          .project.nameVersion(version.id, value)
          .then(onDone)
          .catch((failure: unknown) => {
            setError(t('project.failed', { detail: (failure as Error).message.slice(0, 200) }));
          });
      }}
    >
      <TextField value={value} onChange={setValue} autoFocus className="flex min-w-0 flex-1 flex-col gap-1">
        <Label className="text-xs text-text-muted">{t('versions.name')}</Label>
        <Input className="h-control-md rounded-md border border-border-strong bg-surface px-2 text-md text-text outline-none focus-visible:focus-ring" data-testid="version-rename-input" />
      </TextField>
      <Button onPress={onCancel}>{t('project.cancel')}</Button>
      <Button type="submit" variant="primary" isDisabled={value.trim() === ''} data-testid="version-rename-save">
        {version.reason === 'manual' ? t('versions.rename') : t('versions.keep')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function VersionRow({ version, now, busy, onRestore, onAsProject, onChanged }: { version: VersionEntry; now: number; busy: boolean; onRestore: () => void; onAsProject: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [naming, setNaming] = useState(false);
  const [comparison, setComparison] = useState<VersionComparison | 'loading' | { error: string } | null>(null);
  const when = relativeTime(version.created, now, i18n.language) ?? t('home.justNow');
  const compare = () => {
    setComparison('loading');
    void platform()
      .project.compareVersion(version.id)
      .then(setComparison)
      .catch((error: unknown) => {
        setComparison({ error: (error as Error).message.slice(0, 200) });
      });
  };
  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-b-0" data-testid="version" data-reason={version.reason}>
      <div className="flex size-step-preview shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-sunken">
        {version.preview ? <img src={version.preview} alt="" className="size-full object-contain" draggable={false} /> : <IconCube className="size-control-sm text-text-subtle" stroke={1.25} aria-hidden />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col">
          <span className="truncate text-md font-medium text-text" title={version.label} data-testid="version-label">
            {version.label || t(`versions.reason.${version.reason}`)}
          </span>
          <span className="text-xs text-text-subtle tabular-nums">
            {t(`versions.reason.${version.reason}`)} · {when}
          </span>
        </div>
        {naming ? (
          <NameForm
            version={version}
            onCancel={() => setNaming(false)}
            onDone={() => {
              setNaming(false);
              onChanged();
            }}
          />
        ) : confirming ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('versions.restoreQuestion')}>
            <span className="text-sm text-text">{t('versions.restoreQuestion')}</span>
            <Button onPress={() => setConfirming(false)}>{t('project.cancel')}</Button>
            <Button
              variant="primary"
              isDisabled={busy}
              onPress={() => {
                setConfirming(false);
                onRestore();
              }}
              data-testid="version-restore-confirm"
            >
              {t('versions.restore')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button isDisabled={busy || comparison === 'loading'} onPress={compare} data-testid="version-compare">
              {t('versions.compare')}
            </Button>
            <Button isDisabled={busy} onPress={() => setConfirming(true)} data-testid="version-restore">
              {t('versions.restore')} …
            </Button>
            <Button isDisabled={busy} onPress={() => setNaming(true)} data-testid="version-rename">
              {version.reason === 'manual' ? t('versions.rename') : t('versions.keep')} …
            </Button>
            <Button isDisabled={busy} onPress={onAsProject} data-testid="version-as-project">
              {t('versions.asProject')}
            </Button>
          </div>
        )}
        {comparison === 'loading' ? (
          <p className="text-sm text-text-muted" role="status">
            {t('versions.comparing')}
          </p>
        ) : comparison && 'error' in comparison ? (
          <p className="text-sm text-danger" role="alert">
            {t('project.failed', { detail: comparison.error })}
          </p>
        ) : comparison ? (
          <ChangeList comparison={comparison} />
        ) : null}
      </div>
    </li>
  );
}

/**
 * The versions of the open project (plan step B5): save one with a name, look at each with its
 * picture, compare it with the design as it is now, and restore it. PartBuddy also saves one at
 * every export and before a request to the assistant.
 */
export function VersionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [milestones, setMilestones] = useState(false);
  const { i18n } = useTranslation();
  /** The shown versions under a heading per day, newest first (P4). */
  const days = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' });
    const groups: { day: string; versions: VersionEntry[] }[] = [];
    for (const version of (versions ?? []).filter((entry) => !milestones || entry.reason === 'manual')) {
      const day = format.format(version.created);
      const last = groups.at(-1);
      if (last?.day === day) last.versions.push(version);
      else groups.push({ day, versions: [version] });
    }
    return groups;
  }, [versions, milestones, i18n.language]);

  const load = useCallback(() => {
    void platform()
      .project.versions()
      .then((list) => {
        setNow(Date.now());
        setVersions(list);
      })
      .catch(() => {
        setVersions([]);
      });
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = () => {
    setBusy(true);
    setError(null);
    void platform()
      .project.saveVersion(label)
      .then(() => {
        setLabel('');
        load();
      })
      .catch((failure: unknown) => {
        setError(t('project.failed', { detail: (failure as Error).message.slice(0, 200) }));
      })
      .finally(() => {
        setBusy(false);
        // The save button is disabled while it works; keep the focus in the dialog (Escape closes it).
        nameField.current?.focus();
      });
  };
  const asProject = (id: string) => {
    setBusy(true);
    void beforeProjectSwitch()
      .then(() => platform().project.versionAsProject(id))
      .then(() => {
        onClose();
        useStudio.getState().setHomeOpen(false);
        useStudio.getState().setNotice({ tone: 'success', text: t('versions.openedAsProject') });
      })
      .catch((failure: unknown) => {
        setError(t('project.failed', { detail: (failure as Error).message.slice(0, 200) }));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const restore = (id: string) => {
    setBusy(true);
    void beforeProjectSwitch()
      .then(() => platform().project.restoreVersion(id))
      .then(() => {
        onClose();
        useStudio.getState().setNotice({ tone: 'success', text: t('versions.restored') });
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
      <Modal className="w-dialog-lg max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="flex max-h-[76vh] flex-col gap-4 p-5 outline-none" data-testid="versions-dialog">
          <div className="flex items-center gap-2">
            <IconHistory className="size-icon text-text-muted" aria-hidden />
            <Heading slot="title" className="flex-1 text-lg font-semibold text-text">
              {t('versions.title')}
            </Heading>
            <IconButton label={t('versions.close')} shortcut="Esc" onPress={onClose}>
              <IconX className="size-icon-sm" aria-hidden />
            </IconButton>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (label.trim()) save();
            }}
          >
            <TextField value={label} onChange={setLabel} className="flex flex-1 flex-col gap-1">
              <Label className="text-xs text-text-muted">{t('versions.name')}</Label>
              <Input
                ref={nameField}
                placeholder={t('versions.namePlaceholder')}
                className="h-control-md rounded-md border border-border-strong bg-surface px-2 text-md text-text outline-none placeholder:text-text-subtle focus-visible:focus-ring"
                data-testid="version-name"
              />
            </TextField>
            <Button type="submit" variant="primary" isDisabled={busy || label.trim() === ''} data-testid="version-save">
              {t('versions.save')}
            </Button>
          </form>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-subtle">{t('versions.hint')}</p>
            <ToggleButton
              isSelected={milestones}
              onChange={setMilestones}
              className="inline-flex h-control-sm items-center rounded-md border border-border-strong px-2 text-sm text-text outline-none hover:bg-surface-hover focus-visible:focus-ring selected:border-accent selected:bg-surface-selected"
              data-testid="versions-milestones"
            >
              {t('versions.milestonesOnly')}
            </ToggleButton>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {versions === null ? null : versions.length === 0 ? (
              <p className="py-5 text-center text-sm text-text-muted" data-testid="versions-empty">
                {t('versions.empty')}
              </p>
            ) : (
              <ul aria-label={t('versions.list', { count: versions.length })} data-testid="versions">
                {days.map((group) => (
                  <Fragment key={group.day}>
                    <li className="sticky top-0 bg-surface-raised pt-2 text-xs font-semibold text-text-muted" data-testid="versions-day">
                      {group.day}
                    </li>
                    {group.versions.map((version) => (
                      <VersionRow key={version.id} version={version} now={now} busy={busy} onRestore={() => restore(version.id)} onAsProject={() => asProject(version.id)} onChanged={load} />
                    ))}
                  </Fragment>
                ))}
              </ul>
            )}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
