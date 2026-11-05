import { IconBrandGithub, IconCube, IconFolder, IconHeart, IconInfoCircle, IconPrinter, IconSettings, IconSparkles } from '@tabler/icons-react';
import i18next from 'i18next';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay, RadioButton, RadioField, RadioGroup, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';

import type { AppInfo, GeneralSettingsInfo, Language, Theme } from '../../../shared/contract';
import { AssistantChoice, RadioMark, radioClass } from '../assistant/AgentChip';
import { localeFrom } from '../i18n';
import { PrintProfilesEditor, SupportFreeSwitch } from '../print/PrintProfilesEditor';
import { platform } from '../platform';
import { useStudio, type SettingsSection } from '../state/store';
import { Button } from '../ui/Button';
import { EnginePanel } from './EnginePanel';

const SECTIONS: { id: SettingsSection; icon: typeof IconSettings; testId: string }[] = [
  { id: 'general', icon: IconSettings, testId: 'settings-general' },
  { id: 'solidcraft', icon: IconCube, testId: 'settings-solidcraft' },
  { id: 'assistant', icon: IconSparkles, testId: 'settings-assistant' },
  { id: 'print', icon: IconPrinter, testId: 'settings-print' },
  { id: 'about', icon: IconInfoCircle, testId: 'settings-about' },
];

const SPONSORS = 'https://github.com/sponsors/ManuelStaggl';
const SOURCE = 'https://github.com/ManuelStaggl/partbuddy';
const LICENCE = 'https://www.gnu.org/licenses/gpl-3.0.html';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text">{label}</h3>
      {children}
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void; testId: string }) {
  return (
    <RadioGroup aria-label={label} value={value} onChange={(next) => onChange(next as T)} className="flex min-w-menu flex-col gap-1 self-start" data-testid={testId}>
      {options.map((option) => (
        <RadioField key={option.id} value={option.id}>
          <RadioButton className={radioClass}>
            <RadioMark />
            <span className="text-sm text-text">{option.label}</span>
          </RadioButton>
        </RadioField>
      ))}
    </RadioGroup>
  );
}

/** Language, colour theme and project folder (B6). */
function GeneralSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<GeneralSettingsInfo | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([platform().settings.general(), platform().window.theme()]).then(([general, stored]) => {
      if (!live) return;
      setInfo(general);
      setTheme(stored);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!info || !theme) return null;
  const setLanguage = (language: Language) => {
    void platform()
      .settings.setLanguage(language)
      .then((next) => {
        setInfo(next);
        const locale = localeFrom(language === 'system' ? next.systemLocale : language);
        void i18next.changeLanguage(locale);
        document.documentElement.lang = locale;
      });
  };
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('settings.language.title')}>
        <Choice
          label={t('settings.language.title')}
          value={info.language}
          options={(['system', 'de', 'en'] as const).map((id) => ({ id, label: t(`settings.language.${id}`) }))}
          onChange={setLanguage}
          testId="settings-language"
        />
      </Field>
      <Field label={t('settings.theme.title')}>
        <Choice
          label={t('settings.theme.title')}
          value={theme}
          options={(['system', 'light', 'dark'] as const).map((id) => ({ id, label: t(`settings.theme.${id}`) }))}
          onChange={(next) => {
            setTheme(next);
            void platform().window.setTheme(next);
          }}
          testId="settings-theme"
        />
      </Field>
      <Field label={t('settings.projects.title')}>
        <div className="flex items-start gap-2 text-sm text-text">
          <IconFolder className="mt-1 size-icon-sm shrink-0 text-text-muted" aria-hidden />
          <span className="break-all" data-testid="settings-projects-folder">
            {info.projectsFolder}
          </span>
        </div>
        <p className="text-xs text-text-subtle">{t(`settings.projects.source.${info.projectsSource}`)}</p>
        <div className="flex flex-wrap gap-2">
          <Button isDisabled={info.projectsSource === 'override'} onPress={() => void platform().settings.chooseProjectsFolder().then(setInfo)} data-testid="settings-projects-choose">
            {t('settings.projects.choose')}
          </Button>
          {info.projectsSource === 'setting' ? (
            <Button onPress={() => void platform().settings.resetProjectsFolder().then(setInfo)} data-testid="settings-projects-reset">
              {t('settings.projects.reset')}
            </Button>
          ) : null}
        </div>
        {info.restartNeeded ? (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-text" data-testid="settings-restart-hint">
            <span className="flex-1">{t('settings.projects.restartHint')}</span>
            <Button variant="primary" onPress={() => void platform().relaunch()} data-testid="settings-restart">
              {t('engine.restart')}
            </Button>
          </div>
        ) : null}
      </Field>
    </div>
  );
}

function AboutSection() {
  const { t } = useTranslation();
  const [app, setApp] = useState<AppInfo | null>(null);
  useEffect(() => {
    let live = true;
    void platform()
      .appInfo()
      .then((info) => {
        if (live) setApp(info);
      });
    return () => {
      live = false;
    };
  }, []);
  const link = 'inline-flex items-center gap-2 text-sm text-accent-text underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus';
  return (
    <div className="flex flex-col gap-4 text-sm text-text" data-testid="settings-about-panel">
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{app?.name ?? 'PartBuddy'}</span>
        <span className="text-text-muted tabular-nums" data-testid="settings-version">
          {t('settings.about.version', { version: app?.version ?? '…' })}
        </span>
      </div>
      <p className="max-w-text-max text-text-muted">{t('settings.about.licence')}</p>
      <div className="flex flex-col gap-2">
        <a href={SPONSORS} target="_blank" rel="noreferrer" className={link} data-testid="settings-sponsor">
          <IconHeart className="size-icon-sm" aria-hidden />
          {t('settings.about.sponsor')}
        </a>
        <a href={SOURCE} target="_blank" rel="noreferrer" className={link}>
          <IconBrandGithub className="size-icon-sm" aria-hidden />
          {t('settings.about.source')}
        </a>
        <a href={LICENCE} target="_blank" rel="noreferrer" className={link}>
          {t('settings.about.licenceLink')}
        </a>
      </div>
    </div>
  );
}

/**
 * The settings (plan step B6), replacing the gear menu: General (language, theme, project folder),
 * SolidCraft (the program), Assistant (route, model and effort, designing without support),
 * Printer and material (the profiles), About (version, licence, GitHub Sponsors).
 */
export function SettingsDialog() {
  const { t } = useTranslation();
  const section = useStudio((s) => s.settingsSection);
  const setSection = useStudio((s) => s.setSettingsSection);
  const close = () => {
    setSection(null);
  };
  return (
    <ModalOverlay
      isOpen={section !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      isDismissable
      className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-xl max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog className="flex max-h-[76vh] flex-col outline-none" data-testid="settings-dialog">
          <Heading slot="title" className="border-b border-border px-5 py-3 text-lg font-semibold text-text">
            {t('settings.title')}
          </Heading>
          <Tabs
            orientation="vertical"
            selectedKey={section ?? 'general'}
            onSelectionChange={(key) => {
              // The profiles open at the printer, as from the material menu.
              if (key === 'print') useStudio.getState().setProfilesTab('printer');
              setSection(key as SettingsSection);
            }}
            className="flex min-h-0 flex-1"
          >
            <TabList aria-label={t('settings.title')} className="flex w-settings-nav shrink-0 flex-col gap-1 border-r border-border p-2">
              {SECTIONS.map(({ id, icon: Icon, testId }) => (
                <Tab
                  key={id}
                  id={id}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm text-text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus selected:bg-surface-selected selected:text-text"
                  data-testid={testId}
                >
                  <Icon className="size-icon-sm shrink-0" aria-hidden />
                  {t(`settings.section.${id}`)}
                </Tab>
              ))}
            </TabList>
            <TabPanel id="general" className="min-w-0 flex-1 overflow-y-auto p-5 outline-none">
              <GeneralSection />
            </TabPanel>
            <TabPanel id="solidcraft" className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5 outline-none" data-testid="solidcraft-engine">
              <EnginePanel close={close} />
            </TabPanel>
            <TabPanel id="assistant" className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5 outline-none" data-testid="settings-assistant-panel">
              <AssistantChoice />
              <div className="border-t border-border pt-3">
                <SupportFreeSwitch />
              </div>
            </TabPanel>
            <TabPanel id="print" className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5 outline-none" data-testid="print-profiles">
              <PrintProfilesEditor close={close} />
            </TabPanel>
            <TabPanel id="about" className="min-w-0 flex-1 overflow-y-auto p-5 outline-none">
              <AboutSection />
            </TabPanel>
          </Tabs>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
