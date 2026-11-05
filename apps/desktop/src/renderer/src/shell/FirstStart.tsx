import { IconDownload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { GeneralSettingsInfo } from '../../../shared/contract';
import { AssistantChoice } from '../assistant/AgentChip';
import { PrintProfilesEditor } from '../print/PrintProfilesEditor';
import { platform } from '../platform';
import { Button } from '../ui/Button';
import { EnginePanel } from './EnginePanel';
import { ProjectsFolderField } from './SettingsDialog';

const STEPS = ['solidcraft', 'assistant', 'print', 'projects'] as const;
type Step = (typeof STEPS)[number];

/** Where SolidCraft is downloaded; PartBuddy never installs it itself (ADR 0007). */
const SOLIDCRAFT_DOWNLOAD = 'https://github.com/tangency-labs/solidcraft/releases';

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
      className="fixed inset-0 z-20 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-lg max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="flex max-h-[76vh] flex-col gap-4 overflow-y-auto p-5 outline-none" data-testid="first-start" data-step={step}>
          <div className="flex flex-col gap-1">
            <Heading slot="title" className="text-lg font-semibold text-text">
              {t('firstStart.title')}
            </Heading>
            <p className="text-sm text-text-muted tabular-nums">{t('firstStart.progress', { step: index + 1, count: STEPS.length, name: t(`firstStart.step.${step}`) })}</p>
          </div>
          {step === 'solidcraft' ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text">{t('firstStart.solidcraft')}</p>
              <a
                href={SOLIDCRAFT_DOWNLOAD}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 self-start text-sm text-accent-text underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
                data-testid="first-start-download"
              >
                <IconDownload className="size-icon-sm" aria-hidden />
                {t('firstStart.download')}
              </a>
              <EnginePanel close={next} closable={false} />
            </div>
          ) : step === 'assistant' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text">{t('firstStart.assistant')}</p>
              <AssistantChoice />
            </div>
          ) : step === 'print' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text">{t('firstStart.print')}</p>
              <PrintProfilesEditor close={next} />
            </div>
          ) : info ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text">{t('firstStart.projects')}</p>
              <ProjectsFolderField info={info} onChange={setInfo} />
            </div>
          ) : null}
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
