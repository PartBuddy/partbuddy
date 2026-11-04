import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { NoteDialog } from './panels/NotesPanel';
import { CommandPalette } from './shell/CommandPalette';
import { StatusBar } from './shell/StatusBar';
import { TitleBar } from './shell/TitleBar';
import { Workspace } from './shell/Workspace';
import { useStudio } from './state/store';
import { ModelContext } from './viewer/ModelContext';
import { useModel } from './viewer/useModel';

export function App() {
  const { i18n } = useTranslation();
  const theme = useStudio((s) => s.theme);
  const locale = useStudio((s) => s.locale);
  const model = useModel();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  return (
    <ModelContext.Provider value={model}>
      <div className="flex h-screen flex-col bg-canvas font-sans text-md text-text antialiased">
        <TitleBar />
        <main className="min-h-0 flex-1">
          <Workspace />
        </main>
        <StatusBar />
      </div>
      <NoteDialog table={model.status === 'ready' ? model.model.table : null} />
      <CommandPalette />
    </ModelContext.Provider>
  );
}
