import { IconDownload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { GeneralSettingsInfo } from '../../../shared/contract';
import { AssistantChoice } from '../assistant/AgentChip';
import { PrintProfilesEditor } from '../print/PrintProfilesEditor';
import { platform } from '../platform';
import { Button, linkClass } from '../ui/Button';
import { EnginePanel } from './EnginePanel';
import { ProjectsFolderField } from './SettingsDialog';
import { modalClass, overlayClass } from '../ui/Dialog';

const STEPS = ['solidcraft', 'assistant', 'print', 'projects'] as const;
type Step = (typeof STEPS)[number];

/**
 * Where SolidCraft is downloaded; PartBuddy never installs it itself (ADR 0007). The release
 * PartBuddy recommends (RECOMMENDED_VERSION), not the list: while 0.40 is a pre-release, the list
 * marks 0.30.1 as "Latest".
 */
const SOLIDCRAFT_DOWNLOAD = 'https://github.com/tangency-labs/solidcraft/releases/tag/v0.40.0-rc.3';

/**
 * The first start (plan step B9): a short setup in four steps that can be skipped at any point,
 * built from the same parts as the settings: find SolidCraft (with the download link), sign in to
 * an assistant, choose printer and material, confirm the project folder. Shown once.
 */
export function FirstStart() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<GeneralSettingsInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let live = true;
    void platform()
      .settings.general()
      .then((general) => {
        if (!live) return;
        setInfo(general);
        setOpen(!general.setupDone);
      });
    return () => {
      live = false;
    };
  }, []);

  const finish = () => {
    setOpen(false);
    void platform().settings.finishSetup();
  };
  const step: Step = STEPS[index] ?? 'solidcraft';
  const last = index === STEPS.length - 1;
  const next = () => {
    if (last) finish();
    else setIndex(index + 1);
  };

  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(stillOpen) => {
        if (!stillOpen) finish();
      }}
      className={overlayClass.replace('z-10', 'z-20')}
    >
      <Modal className={modalClass('lg')}>
        <Dialog className="flex max-h-[min(var(--cs-size-dialog-max-height),calc(100dvh_-_4rem))] flex-col gap-4 p-5 outline-none" data-testid="first-start" data-step={step}>
          <div className="flex flex-col gap-1">
            <Heading slot="title" className="text-lg font-semibold text-text">
              {t('firstStart.title')}
            </Heading>
            <ol aria-label={t('firstStart.progress', { step: index + 1, count: STEPS.length, name: t(`firstStart.step.${step}`) })} className="flex flex-wrap items-center gap-1 text-xs" data-testid="first-start-steps">
              {STEPS.map((name, n) => (
                <li key={name} className="flex items-center gap-1">
                  {n > 0 ? <span aria-hidden className="h-hairline w-4 bg-border" /> : null}
                  <button
                    type="button"
                    disabled={n >= index}
                    aria-current={n === index ? 'step' : undefined}
                    onClick={() => setIndex(n)}
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 outline-none focus-visible:focus-ring ${n === index ? 'bg-accent-subtle font-semibold text-accent-text' : n < index ? 'text-text hover:bg-surface-hover' : 'text-text-subtle'}`}
                  >
                    <span className="tabular-nums">{n + 1}</span>
                    {t(`firstStart.step.${name}`)}
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
          {step === 'solidcraft' ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text">{t('firstStart.solidcraft')}</p>
              <a
                href={SOLIDCRAFT_DOWNLOAD}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 self-start text-sm ${linkClass}`}
                data-testid="first-start-download"
              >
                <IconDownload className="size-icon-sm" aria-hidden />
                {t('firstStart.download')}
              </a>
              <EnginePanel />
            </div>
          ) : step === 'assistant' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text">{t('firstStart.assistant')}</p>
              <AssistantChoice />
            </div>
          ) : step === 'print' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text">{t('firstStart.print')}</p>
              <PrintProfilesEditor />
            </div>
          ) : info ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text">{t('firstStart.projects')}</p>
              <ProjectsFolderField info={info} onChange={setInfo} />
            </div>
          ) : null}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button onPress={finish} data-testid="first-start-skip">
              {t('firstStart.skip')}
            </Button>
            <span className="flex-1" />
            {index > 0 ? (
              <Button onPress={() => setIndex(index - 1)} data-testid="first-start-back">
                {t('firstStart.back')}
              </Button>
            ) : null}
            <Button variant="primary" onPress={next} data-testid="first-start-next">
              {last ? t('firstStart.done') : t('firstStart.next')}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
