import { IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete,
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  SearchField,
  useFilter,
} from 'react-aria-components';

import { Button, iconButtonClass } from '../ui/Button';
import { listItemClass } from '../ui/Choice';
import { inputClass } from '../ui/Field';
import { popoverPanelClass } from '../ui/Overlay';

/** One entry of a catalog: its id, the line shown and an optional value on the right. */
export interface CatalogItem {
  id: string;
  label: string;
  detail?: string;
}
/** A group of entries under an optional heading (the brand of a printer). */
export interface CatalogSection {
  id: string;
  header?: string;
  items: CatalogItem[];
}

/**
 * Focuses the search as the popover comes in. Any earlier (autoFocus) and React Aria left the popover
 * invisible: it restored the styles it had hidden it with while placing it.
 */
function FocusOnEntry({ entering, target }: { entering: boolean; target: RefObject<HTMLInputElement | null> }) {
  const done = useRef(false);
  useEffect(() => {
    if (!entering || done.current) return;
    done.current = true;
    target.current?.focus();
  }, [entering, target]);
  return null;
}

/**
 * »Add printer« and »Add material«: a searchable list of known entries; the pick becomes an ordinary
 * profile. The texts are the i18n keys `${texts}.add`, `.catalog`, `.catalogSearch`, `.catalogEmpty` and `.catalogHint`.
 */
export function CatalogPicker({
  sections,
  onPick,
  isDisabled,
  texts,
  addTestId,
  testId,
}: {
  sections: CatalogSection[];
  onPick: (id: string) => void;
  isDisabled: boolean;
  texts: string;
  addTestId: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const { contains } = useFilter({ sensitivity: 'base' });
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="primary" isDisabled={isDisabled} data-testid={addTestId}>
        <IconPlus className="size-icon-sm" aria-hidden />
        {t(`${texts}.add`)}
      </Button>
      <Popover placement="bottom start" offset={4} className={popoverPanelClass}>
        {({ isEntering }) => (
        <Dialog aria-label={t(`${texts}.catalog`)} className="flex flex-col gap-2 p-2 outline-none" data-testid={testId}>
          <Autocomplete filter={contains}>
            <SearchField aria-label={t(`${texts}.catalogSearch`)} className="group relative flex items-center">
              <IconSearch className="pointer-events-none absolute left-2 size-icon-sm text-text-subtle" aria-hidden />
              <Input
                ref={search}
                placeholder={t(`${texts}.catalogSearch`)}
                className={`${inputClass('md')} w-full pr-6 pl-6 [&::-webkit-search-cancel-button]:hidden`}
                data-testid={`${testId}-search`}
              />
              <AriaButton aria-label={t('settings.search.clear')} className={`absolute right-1 group-empty:hidden ${iconButtonClass('sm')}`}>
                <IconX className="size-icon-sm" aria-hidden />
              </AriaButton>
            </SearchField>
            <ListBox
              aria-label={t(`${texts}.catalog`)}
              items={sections}
              selectionMode="none"
              onAction={(key) => {
                onPick(String(key));
                setOpen(false);
              }}
              renderEmptyState={() => <p className="px-2 py-1 text-sm text-text-muted">{t(`${texts}.catalogEmpty`)}</p>}
              className="max-h-menu-max overflow-auto outline-none"
            >
              {(group) => (
                <ListBoxSection id={group.id}>
                  {group.header ? <Header className="px-2 pt-2 pb-1 text-xs font-medium text-text-muted">{group.header}</Header> : null}
                  {group.items.map((entry) => (
                    <ListBoxItem key={entry.id} id={entry.id} textValue={group.header ? `${group.header} ${entry.label}` : entry.label} className={listItemClass} data-testid={`${testId}-option`}>
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {entry.detail ? <span className="shrink-0 text-xs text-text-muted tabular-nums">{entry.detail}</span> : null}
                    </ListBoxItem>
                  ))}
                </ListBoxSection>
              )}
            </ListBox>
          </Autocomplete>
          <p className="px-2 text-xs text-text-subtle">{t(`${texts}.catalogHint`)}</p>
          <FocusOnEntry entering={isEntering} target={search} />
        </Dialog>
        )}
      </Popover>
    </DialogTrigger>
  );
}
