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

import { PRINTER_CATALOG, type CatalogPrinter } from '../../../shared/printerCatalog';
import { Button, iconButtonClass } from '../ui/Button';
import { listItemClass } from '../ui/Choice';
import { inputClass } from '../ui/Field';
import { popoverPanelClass } from '../ui/Overlay';

const brands = [...new Set(PRINTER_CATALOG.map((entry) => entry.brand))].map((brand) => ({
  brand,
  models: PRINTER_CATALOG.filter((entry) => entry.brand === brand).map((entry) => ({ ...entry, id: `${entry.brand} ${entry.model}` })),
}));

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

/** »Add printer«: a searchable list of known printers by brand; the pick becomes an ordinary profile. */
export function PrinterCatalogPicker({ onPick, isDisabled }: { onPick: (printer: CatalogPrinter) => void; isDisabled: boolean }) {
  const { t } = useTranslation();
  const { contains } = useFilter({ sensitivity: 'base' });
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="primary" isDisabled={isDisabled} data-testid="printers-add">
        <IconPlus className="size-icon-sm" aria-hidden />
        {t('print.add')}
      </Button>
      <Popover placement="bottom start" offset={4} className={popoverPanelClass}>
        {({ isEntering }) => (
        <Dialog aria-label={t('print.catalog')} className="flex flex-col gap-2 p-2 outline-none" data-testid="printer-catalog">
          <Autocomplete filter={contains}>
            <SearchField aria-label={t('print.catalogSearch')} className="group relative flex items-center">
              <IconSearch className="pointer-events-none absolute left-2 size-icon-sm text-text-subtle" aria-hidden />
              <Input
                ref={search}
                placeholder={t('print.catalogSearch')}
                className={`${inputClass('md')} w-full pr-6 pl-6 [&::-webkit-search-cancel-button]:hidden`}
                data-testid="printer-catalog-search"
              />
              <AriaButton aria-label={t('settings.search.clear')} className={`absolute right-1 group-empty:hidden ${iconButtonClass('sm')}`}>
                <IconX className="size-icon-sm" aria-hidden />
              </AriaButton>
            </SearchField>
            <ListBox
              aria-label={t('print.catalog')}
              items={brands}
              selectionMode="none"
              onAction={(key) => {
                const entry = PRINTER_CATALOG.find((item) => `${item.brand} ${item.model}` === key);
                if (!entry) return;
                onPick(entry);
                setOpen(false);
              }}
              renderEmptyState={() => <p className="px-2 py-1 text-sm text-text-muted">{t('print.catalogEmpty')}</p>}
              className="max-h-menu-max overflow-auto outline-none"
            >
              {(group) => (
                <ListBoxSection id={group.brand}>
                  <Header className="px-2 pt-2 pb-1 text-xs font-medium text-text-muted">{group.brand}</Header>
                  {group.models.map((entry) => (
                    <ListBoxItem key={entry.id} id={entry.id} textValue={entry.id} className={listItemClass} data-testid="printer-catalog-option">
                      <span className="min-w-0 flex-1 truncate">{entry.model}</span>
                      <span className="shrink-0 text-xs text-text-muted tabular-nums">{entry.bed.join(' × ')} mm</span>
                    </ListBoxItem>
                  ))}
                </ListBoxSection>
              )}
            </ListBox>
          </Autocomplete>
          <p className="px-2 text-xs text-text-subtle">{t('print.catalogHint')}</p>
          <FocusOnEntry entering={isEntering} target={search} />
        </Dialog>
        )}
      </Popover>
    </DialogTrigger>
  );
}
