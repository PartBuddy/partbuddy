import { IconAdjustmentsHorizontal, IconCheck, IconPrinter } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator, Tooltip, TooltipTrigger } from 'react-aria-components';

import type { MaterialProfile } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { POPOVER_OFFSET, menuClass, menuHeaderClass, menuItemClass, menuSeparatorClass, popoverClass } from '../ui/Overlay';
import { tooltipClass } from '../ui/Tooltip';

const itemClass = menuItemClass;

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
      <TooltipTrigger delay={500} closeDelay={0}>
        <AriaButton
          className="inline-flex h-full items-center gap-1 rounded-sm px-1 text-xs text-text-muted outline-none hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed focus-visible:focus-ring"
          data-testid="material-chip"
          data-material={print.material.id}
        >
          <IconPrinter className="size-icon-sm" aria-hidden />
          <span>{print.material.name}</span>
          <span>· {print.printer.name}</span>
        </AriaButton>
        <Tooltip placement="top" offset={6} className={tooltipClass}>
          {t('print.chipHint')}
        </Tooltip>
      </TooltipTrigger>
      <Popover placement="top start" offset={POPOVER_OFFSET} className={popoverClass}>
        <Menu
          aria-label={t('print.menuLabel')}
          className={menuClass}
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
            <Header className={menuHeaderClass}>{t('print.partMaterial')}</Header>
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
          <Separator className={menuSeparatorClass} />
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
