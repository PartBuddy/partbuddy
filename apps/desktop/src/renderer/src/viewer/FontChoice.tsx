import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, useFilter } from 'react-aria-components';

import { iconButtonClass } from '../ui/Button';
import { ListCheck, listItemClass } from '../ui/Choice';
import { fieldLabelClass, inputClass } from '../ui/Field';
import { popoverClass } from '../ui/Overlay';

/**
 * Installed font families and whether each has a bold face, read once (Chromium's local font
 * access, granted in main for this window only). SolidCraft refuses bold for a family without one.
 */
let installedFonts: Promise<Map<string, boolean>> | null = null;
function fontFaces(): Promise<Map<string, boolean>> {
  const query = (window as { queryLocalFonts?: () => Promise<{ family: string; style: string }[]> }).queryLocalFonts;
  installedFonts ??= query
    ? query()
        .then((fonts) => {
          const faces = new Map<string, boolean>();
          for (const font of [...fonts].sort((a, b) => a.family.localeCompare(b.family))) faces.set(font.family, (faces.get(font.family) ?? false) || /\bbold\b/i.test(font.style));
          return faces;
        })
        .catch(() => new Map<string, boolean>())
    : Promise.resolve(new Map<string, boolean>());
  return installedFonts;
}

function useFontFaces(): Map<string, boolean> {
  const [faces, setFaces] = useState<Map<string, boolean>>(() => new Map());
  useEffect(() => {
    let live = true;
    void fontFaces().then((found) => {
      if (live) setFaces(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return faces;
}

/** Whether a font can be set bold: the built-in one (then Arial) and any family with a bold face; an unknown one is left to SolidCraft. */
export function useBoldable(font: string): boolean {
  const faces = useFontFaces();
  return !font || faces.get(font) !== false;
}

/** The key of SolidCraft's built-in font in the list; the value outside is "". */
const BUILT_IN = 'builtin';
const faceOf = (font: string) => (font ? { fontFamily: `"${font}"` } : undefined);

/**
 * The text's font: the built-in one or any installed family, each shown in its own face (decided
 * 2026-11-09). A field to type into, since a PC has hundreds: typing narrows the list.
 */
export function FontChoice({ value, onChange, isDisabled }: { value: string; onChange: (font: string, boldable: boolean) => void; isDisabled?: boolean }) {
  const { t } = useTranslation();
  const { contains } = useFilter({ sensitivity: 'base' });
  const faces = useFontFaces();
  const families = [...faces.keys()];
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
        if (key === null) return;
        const font = key === BUILT_IN ? '' : String(key);
        onChange(font, !font || faces.get(font) !== false);
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
      {/* As wide as the field and a few lines tall, so it covers little of the dock and the part. */}
      <Popover placement="bottom start" offset={4} className={`${popoverClass} w-(--trigger-width)`}>
        <ListBox className="max-h-[16rem] overflow-auto outline-none">
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
