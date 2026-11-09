import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, useFilter } from 'react-aria-components';

import { ListCheck, listItemClass } from '../ui/Choice';
import { fieldLabelClass, inputClass } from '../ui/Field';
import { popoverClass } from '../ui/Overlay';

/**
 * Installed font families and the full name of each one's bold face (null without one), read once
 * (Chromium's local font access, granted in main for this window only). SolidCraft finds a bold
 * face reliably only by that full name ("Segoe Print Bold"; `bold` with the family is refused for
 * it, checked 2026-11-09), so a bold text is set in it.
 */
export interface FontFaces {
  boldOf: Map<string, string | null>;
  /** The family of a bold face's full name, to read a text set in one back as family and bold. */
  familyOf: Map<string, string>;
}
const NO_FONTS: FontFaces = { boldOf: new Map(), familyOf: new Map() };
let installedFonts: Promise<FontFaces> | null = null;
function fontFaces(): Promise<FontFaces> {
  const query = (window as { queryLocalFonts?: () => Promise<{ family: string; fullName: string; style: string }[]> }).queryLocalFonts;
  installedFonts ??= query
    ? query()
        .then((fonts) => {
          const faces: FontFaces = { boldOf: new Map(), familyOf: new Map() };
          for (const font of [...fonts].sort((a, b) => a.family.localeCompare(b.family))) {
            if (!faces.boldOf.has(font.family)) faces.boldOf.set(font.family, null);
            if (font.style.toLowerCase() === 'bold') {
              faces.boldOf.set(font.family, font.fullName);
              faces.familyOf.set(font.fullName, font.family);
            }
          }
          return faces;
        })
        .catch(() => NO_FONTS)
    : Promise.resolve(NO_FONTS);
  return installedFonts;
}

export function useFontFaces(): FontFaces {
  const [faces, setFaces] = useState<FontFaces>(NO_FONTS);
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
export function boldable(faces: FontFaces, font: string): boolean {
  return !font || faces.boldOf.get(font) !== null;
}

/** The font SolidCraft gets: a bold text in its bold face's full name, else the family with `bold` as asked. */
export function setFont(faces: FontFaces, font: string, bold: boolean): { font: string; bold: boolean } {
  const face = bold && font ? faces.boldOf.get(font) : null;
  return face ? { font: face, bold: false } : { font, bold };
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
  const families = [...faces.boldOf.keys()];
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
        onChange(font, boldable(faces, font));
      }}
      isDisabled={isDisabled ?? false}
      data-testid="block-font"
    >
      <Label className={fieldLabelClass}>{t('blocks.font')}</Label>
      <div className="relative flex items-center">
        <Input className={`${inputClass('sm')} w-full pr-7`} style={faceOf(value) ?? {}} />
        {/* A plain chevron inside the field, like the other selects' (no button frame of its own). */}
        <AriaButton className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-text-subtle outline-none">
          <IconChevronDown className="size-icon-sm" aria-hidden />
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
