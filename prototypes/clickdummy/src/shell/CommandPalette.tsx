import { IconSearch } from '@tabler/icons-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete,
  Dialog,
  Input,
  Keyboard,
  Menu,
  MenuItem,
  Modal,
  ModalOverlay,
  SearchField,
  useFilter,
} from 'react-aria-components';

import { providers } from '../mock/providers';
import { useStudio } from '../state/store';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const paletteOpen = useStudio((s) => s.paletteOpen);
  const setPaletteOpen = useStudio((s) => s.setPaletteOpen);
  const hasSelection = useStudio((s) => s.selection !== null);
  const { contains } = useFilter({ sensitivity: 'base' });

  useHotkeys(
    'mod+k',
    (event) => {
      event.preventDefault();
      setPaletteOpen(true);
    },
    { enableOnFormTags: true },
  );

  const commands: Command[] = [
    {
      id: 'note',
      label: t('palette.addNote'),
      run: () => {
        const { selection, startNote } = useStudio.getState();
        if (selection) startNote(selection);
      },
    },
    {
      id: 'theme',
      label: t('palette.toggleTheme'),
      run: () => {
        const { theme, setTheme } = useStudio.getState();
        setTheme(theme === 'light' ? 'dark' : 'light');
      },
    },
    {
      id: 'language',
      label: t('palette.toggleLanguage'),
      run: () => {
        const { locale, setLocale } = useStudio.getState();
        setLocale(locale === 'en' ? 'de' : 'en');
      },
    },
    ...providers.map((p) => ({
      id: `provider-${p.id}`,
      label: t('palette.useModel', { model: p.model, vendor: p.vendor }),
      run: () => {
        useStudio.getState().setProvider(p.id);
      },
    })),
  ];

  return (
    <ModalOverlay
      isOpen={paletteOpen}
      onOpenChange={setPaletteOpen}
      isDismissable
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay pt-dialog-offset"
    >
      <Modal className="w-dialog-lg max-w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-3 outline-none">
        <Dialog aria-label={t('palette.label')} className="outline-none">
          <Autocomplete filter={contains}>
            <SearchField
              aria-label={t('palette.label')}
              autoFocus
              className="flex items-center gap-2 border-b border-border px-3 py-2"
            >
              <IconSearch className="size-icon text-text-subtle" aria-hidden />
              <Input
                placeholder={t('palette.placeholder')}
                className="flex-1 bg-transparent text-lg text-text outline-none placeholder:text-text-subtle"
              />
              <Keyboard className="font-mono text-xs text-text-subtle">Esc</Keyboard>
            </SearchField>
            <Menu
              items={commands}
              disabledKeys={hasSelection ? [] : ['note']}
              onAction={(key) => {
                commands.find((c) => c.id === key)?.run();
                setPaletteOpen(false);
              }}
              className="max-h-menu-max overflow-auto p-1 outline-none"
              renderEmptyState={() => <p className="p-3 text-sm text-text-muted">{t('palette.empty')}</p>}
            >
              {(command) => (
                <MenuItem
                  id={command.id}
                  textValue={command.label}
                  className="flex h-control-lg cursor-default items-center rounded-md px-3 text-md text-text outline-none focus:bg-surface-selected disabled:text-text-subtle"
                >
                  {command.label}
                </MenuItem>
              )}
            </Menu>
          </Autocomplete>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
