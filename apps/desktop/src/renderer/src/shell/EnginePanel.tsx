import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { EngineChoiceError, EngineInfo } from '../../../shared/contract';
import { platform } from '../platform';
import { Button } from '../ui/Button';
import { badgeClass, type Tone } from '../ui/Feedback';

const supportTone: Record<EngineInfo['support'], Tone> = {
  recommended: 'success',
  // Supported works: green as well, not the warning colour a newcomer reads as trouble (polish round 3).
  supported: 'success',
  tooOld: 'danger',
  unknown: 'neutral',
};

/**
 * Which SolidCraft PartBuddy runs (R0, ADR 0024): the program, its version and whether PartBuddy
 * supports it, with a way to choose another program (such as a portable copy beside an installed
 * one). A new choice takes effect after a restart, so the open design never changes kernel. In
 * the first start and in the settings (B6); no Close of its own, the settings close as a whole (audit A-23).
 */
export function EnginePanel() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [error, setError] = useState<EngineChoiceError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
  }, []);

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
    <>
    {info ? (
      <div className="flex flex-col gap-3 text-sm text-text">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t('engine.program')}</span>
          <span className="break-all" data-testid="engine-path">
            {info.path ? info.path.replace(/\//g, '\\') : t('engine.none')}
          </span>
          <span className="text-xs text-text-subtle" title={info.source === 'override' ? 'PARTBUDDY_SOLIDCRAFT_EXE' : undefined}>
            {t(`engine.source.${info.source}`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{t('engine.version')}</span>
          <span className="tabular-nums" data-testid="engine-version">
            {info.version ?? t('engine.unknownVersion')}
          </span>
          {info.path && info.support !== 'unknown' ? (
            <span className={badgeClass(supportTone[info.support])} data-testid="engine-support">
              {t(`engine.support.${info.support}`)}
            </span>
          ) : null}
        </div>
        {info.support === 'recommended' || info.support === 'supported' ? <p className="text-text-muted">{t('engine.works')}</p> : null}
        {/* The versions in detail, for those who want to know; folded so the first start stays short. */}
        <details className="text-text-muted" data-testid="engine-details">
          <summary className="cursor-pointer text-xs outline-none focus-visible:focus-ring">{t('engine.detailsTitle')}</summary>
          <p className="mt-1">{t('engine.hint', { recommended: info.recommended, minimum: info.minimum })}</p>
        </details>
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
      ) : null}
    </div>
    </>
  );
}
