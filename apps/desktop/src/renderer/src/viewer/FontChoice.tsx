import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, useFilter } from 'react-aria-components';

import { iconButtonClass } from '../ui/Button';
import { ListCheck, listItemClass } from '../ui/Choice';
import { fieldLabelClass, inputClass } from '../ui/Field';
import { popoverClass } from '../ui/Overlay';

/** Installed font families, read once (Chromium's local font access, granted in main for this window only). */
let installedFonts: Promise<string[]> | null = null;
function fontFamilies(): Promise<string[]> {
  const query = (window as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
  installedFonts ??= query
    ? query()
        .then((fonts) => [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b)))
        .catch(() => [])
    : Promise.resolve([]);
  return installedFonts;
}

/** The key of SolidCraft's built-in font in the list; the value outside is "". */
const BUILT_IN = 'builtin';
const faceOf = (font: string) => (font ? { fontFamily: `"${font}"` } : undefined);

/**
 * The text's font: the built-in one or any installed family, each shown in its own face (decided
 * 2026-11-09). A field to type into, since a PC has hundreds: typing narrows the list.
 */
export function FontChoice({ value, onChange, isDisabled }: { value: string; onChange: (font: string) => void; isDisabled?: boolean }) {
  const { t } = useTranslation();
  const { contains } = useFilter({ sensitivity: 'base' });
  const [families, setFamilies] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void fontFamilies().then((list) => {
      if (live) setFamilies(list);
    });
    return () => {
      live = false;
    };
  }, []);
  const items = [{ id: BUILT_IN, label: t('blocks.fontBuiltIn'), font: '' }, ...families.map((family) => ({ id: family, label: family, font: family }))];
  // A font from a project made on another PC stays listed, so it can be seen and changed.
  if (value && !families.includes(value)) items.push({ id: value, label: value, font: value });
  return (
    <ComboBox
      className="col-span-2 flex min-w-0 flex-col gap-1"
      defaultItems={items}
      defaultFilter={contains}
      value={value || BUILT_IN}
      onChange={(key) => {
        if (key !== null) onChange(key === BUILT_IN ? '' : String(key));
      }}
      isDisabled={isDisabled ?? false}
      data-testid="block-font"
    >
      <Label className={fieldLabelClass}>{t('blocks.font')}</Label>
      <div className="relative flex items-center">
        <Input className={`${inputClass('sm')} w-full pr-7`} style={faceOf(value) ?? {}} />
        <AriaButton className={`absolute right-1 ${iconButtonClass('sm')}`}>
          <IconChevronDown className="size-icon-sm text-text-subtle" aria-hidden />
        </AriaButton>
      </div>
      <Popover placement="bottom start" offset={4} className={popoverClass}>
        <ListBox className="max-h-menu-max overflow-auto outline-none">
          {(item: (typeof items)[number]) => (
            <ListBoxItem id={item.id} textValue={item.label} className={listItemClass}>
              <ListCheck />
              <span className="truncate" style={faceOf(item.font)}>
                {item.label}
              </span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
