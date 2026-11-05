import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { EngineChoiceError, EngineInfo } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';

const badgeClass: Record<EngineInfo['support'], string> = {
  recommended: 'bg-success-subtle text-success',
  supported: 'bg-warning-subtle text-warning',
  tooOld: 'bg-danger-subtle text-danger',
  unknown: 'bg-surface-hover text-text-muted',
};

/**
 * Which SolidCraft PartBuddy runs (R0, ADR 0024): the program, its version and whether PartBuddy
 * supports it, with a way to choose another program (such as a portable 0.40 beside an installed
 * 0.30.1). A new choice takes effect after a restart, so the open design never changes kernel.
 */
export function SolidCraftDialog() {
  const { t } = useTranslation();
  const open = useStudio((s) => s.engineOpen);
  const setOpen = useStudio((s) => s.setEngineOpen);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [error, setError] = useState<EngineChoiceError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void platform()
      .solidcraft.engine()
      .then((next) => {
        if (!current) return;
        setInfo(next);
        setError(null);
      });
    return () => {
      current = false;
    };
  }, [open]);

  const choose = async (automatic: boolean) => {
    setBusy(true);
    try {
      const result = await platform().solidcraft.chooseEngine(automatic);
      setInfo(result.info);
      if (!result.cancelled) setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset">
      <Modal className="w-dialog-lg max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="flex flex-col gap-4 p-5 outline-none" data-testid="solidcraft-engine">
          {({ close }) => (
            <>
              <Heading slot="title" className="text-lg font-semibold text-text">
                {t('engine.title')}
              </Heading>
              {info ? (
                <div className="flex flex-col gap-3 text-sm text-text">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-text-muted">{t('engine.program')}</span>
                    <span className="break-all" data-testid="engine-path">
                      {info.path ?? t('engine.none')}
                    </span>
                    <span className="text-xs text-text-subtle">{t(`engine.source.${info.source}`)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{t('engine.version')}</span>
                    <span className="tabular-nums" data-testid="engine-version">
                      {info.version ?? t('engine.unknownVersion')}
                    </span>
                    {info.path ? (
                      <span className={`rounded-sm px-2 py-1 text-xs font-medium ${badgeClass[info.support]}`} data-testid="engine-support">
                        {t(`engine.support.${info.support}`)}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-text-muted">{t('engine.hint', { recommended: info.recommended, minimum: info.minimum })}</p>
                  {error ? (
                    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-danger" data-testid="engine-error">
                      {t(`engine.error.${error}`, { minimum: info.minimum })}
                    </p>
                  ) : null}
                  {info.restartNeeded ? (
                    <p role="status" className="rounded-md bg-warning-subtle px-3 py-2 text-text" data-testid="engine-restart-hint">
                      {t('engine.restartHint')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-text-muted">{t('engine.reading')}</p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {info?.source === 'setting' ? (
                  <Button isDisabled={busy} onPress={() => void choose(true)} data-testid="engine-automatic">
                    {t('engine.automatic')}
                  </Button>
                ) : null}
                <Button isDisabled={busy || info?.source === 'override'} onPress={() => void choose(false)} data-testid="engine-choose">
                  {t('engine.choose')}
                </Button>
                {info?.restartNeeded ? (
                  <Button variant="primary" onPress={() => void platform().relaunch()} data-testid="engine-restart">
                    {t('engine.restart')}
                  </Button>
                ) : (
                  <Button variant="primary" onPress={close}>
                    {t('engine.close')}
                  </Button>
                )}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
