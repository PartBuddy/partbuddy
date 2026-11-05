import { IconAdjustmentsHorizontal, IconCheck, IconPrinter } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator, Tooltip, TooltipTrigger } from 'react-aria-components';

import type { MaterialProfile } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';

const itemClass = 'flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm text-text outline-none focus:bg-surface-hover';

/**
 * The part's material in the status bar (M7): what the part is printed with, always in sight, and
 * one click to change it. The printer and the profiles themselves are edited in the dialog.
 */
export function MaterialMenu() {
  const { t } = useTranslation();
  const print = useStudio((s) => s.print);
  const setSettingsSection = useStudio((s) => s.setSettingsSection);
  const setProfilesTab = useStudio((s) => s.setProfilesTab);
  const setNotice = useStudio((s) => s.setNotice);
  const [materials, setMaterials] = useState<MaterialProfile[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void platform()
      .print.settings()
      .then((settings) => {
        if (live) setMaterials(settings.materials);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, print]);
  if (!print) return null;

  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      {/* The visible text is the name (WCAG 2.5.3); what the button does is its tooltip. */}
      <TooltipTrigger delay={400}>
        <AriaButton
          className="inline-flex h-full items-center gap-1 rounded-sm px-1 text-xs text-text-muted outline-none hover:bg-surface-hover hover:text-text pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
          data-testid="material-chip"
          data-material={print.material.id}
        >
          <IconPrinter className="size-icon-sm" aria-hidden />
          <span>{print.material.name}</span>
          <span>· {print.printer.name}</span>
        </AriaButton>
        <Tooltip placement="top" offset={6} className="rounded-sm bg-surface-raised px-2 py-1 text-xs text-text shadow-2">
          {t('print.chipHint')}
        </Tooltip>
      </TooltipTrigger>
      <Popover placement="top start" offset={4} className="min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2">
        <Menu
          aria-label={t('print.menuLabel')}
          className="max-h-menu-max overflow-auto outline-none"
          onAction={(key) => {
            if (key !== 'edit') return;
            setProfilesTab('printer');
            setSettingsSection('print');
          }}
        >
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[print.material.id]}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const [key] = [...keys];
              if (typeof key !== 'string' || key === print.material.id) return;
              void platform()
                .print.setMaterial(key)
                .catch(() => {
                  setNotice({
                    tone: 'danger',
                    text: t('print.materialFailed'),
                  });
                });
            }}
          >
            <Header className="px-2 py-1 text-xs font-semibold text-text-muted">{t('print.partMaterial')}</Header>
            {materials.map((material) => (
              <MenuItem key={material.id} id={material.id} textValue={material.name} className={itemClass} data-testid="material-option">
                {({ isSelected }) => (
                  <>
                    <span className="flex-1">{material.name}</span>
                    <span className="tabular-nums text-xs text-text-muted">{t('print.overhangShort', { degrees: material.overhang })}</span>
                    <span className="flex size-icon-sm items-center">{isSelected ? <IconCheck className="size-icon-sm text-accent-text" aria-hidden /> : null}</span>
                  </>
                )}
              </MenuItem>
            ))}
          </MenuSection>
          <Separator className="my-1 border-t border-border" />
          <MenuSection>
            <MenuItem id="edit" textValue={t('print.edit')} className={itemClass} data-testid="print-profiles-open">
              <IconAdjustmentsHorizontal className="size-icon-sm text-text-muted" aria-hidden />
              <span className="flex-1">{t('print.edit')}</span>
            </MenuItem>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
