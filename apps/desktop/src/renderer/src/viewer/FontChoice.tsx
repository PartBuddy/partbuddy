import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SelectField as Choice } from '../ui/Choice';

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

/** The text's font: the built-in one or any installed family, each shown in its own face (decided 2026-11-09). */
export function FontChoice({ value, onChange }: { value: string; onChange: (font: string) => void; isDisabled?: boolean }) {
  const { t } = useTranslation();
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
  const items = [{ id: '', label: t('blocks.fontBuiltIn') }, ...families.map((family) => ({ id: family, label: family, font: family }))];
  // A font from a project made on another PC stays listed, so it can be seen and changed.
  if (value && !families.includes(value)) items.push({ id: value, label: value, font: value });
  return <Choice className="col-span-2" label={t('blocks.font')} value={value} items={items} onChange={onChange} testId="block-font" />;
}
