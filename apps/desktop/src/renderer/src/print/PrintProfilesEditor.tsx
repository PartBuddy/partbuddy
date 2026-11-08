import { IconCopy, IconTrash } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxButton,
  CheckboxField,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  NumberField,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
} from 'react-aria-components';

import { FIT_KINDS, MAX_MATERIALS, MAX_PRINTERS, type MaterialProfile, type PrinterProfile, type PrintSettings } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type ProfilesTab } from '../state/store';
import { Button } from '../ui/Button';
import { FieldMessage, fieldLabelClass, inputClass, UnitInput } from '../ui/Field';
import { CheckMark, choiceInlineClass } from '../ui/Choice';
import { MATERIAL_CATALOG } from '../../../shared/materialCatalog';
import { PRINTER_CATALOG } from '../../../shared/printerCatalog';
import { CatalogPicker, type CatalogSection } from './CatalogPicker';
import { ToleranceAssistant } from './ToleranceAssistant';
import { listRowClass, tabClass, tabListClass } from '../ui/Navigation';


const printerSections: CatalogSection[] = [...new Set(PRINTER_CATALOG.map((entry) => entry.brand))].map((brand) => ({
  id: brand,
  header: brand,
  items: PRINTER_CATALOG.filter((entry) => entry.brand === brand).map((entry) => ({ id: `${entry.brand} ${entry.model}`, label: entry.model, detail: `${entry.bed.join(' × ')} mm` })),
}));
const materialSections: CatalogSection[] = [{ id: 'materials', items: MATERIAL_CATALOG.map((entry) => ({ id: entry.name, label: entry.name, detail: `${entry.overhang}°` })) }];

let serial = 0;
/** A new profile id; the contract allows lower-case letters, digits and dashes. */
function newId(prefix: string): string {
  serial += 1;
  return `${prefix}-${Date.now().toString(36)}${serial.toString(36)}`;
}

/** Copies a profile under a new id and name, as the start for a new one. */
function copyOf<T extends { id: string; name: string }>(profile: T, prefix: string, suffix: string): T {
  return { ...structuredClone(profile), id: newId(prefix), name: `${profile.name} ${suffix}`.slice(0, 60) };
}

function Measure({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  testId: string;
}) {
  return (
    <NumberField
      value={value}
      minValue={min}
      maxValue={max}
      step={step}
      formatOptions={{ maximumFractionDigits: 2 }}
      onChange={(next) => {
        if (Number.isFinite(next)) onChange(next);
      }}
      className="flex flex-col gap-1"
      data-testid={testId}
    >
      <Label className={fieldLabelClass}>{label}</Label>
      <UnitInput unit={unit} />
    </NumberField>
  );
}

function Name({ value, onChange, label, testId }: { value: string; onChange: (value: string) => void; label: string; testId: string }) {
  const { t } = useTranslation();
  return (
    <TextField value={value} onChange={onChange} maxLength={60} isRequired isInvalid={value.trim() === ''} className="flex flex-col gap-1" data-testid={testId}>
      <Label className={fieldLabelClass}>{label}</Label>
      <Input className={inputClass('sm')} />
      <FieldMessage error={value.trim() === '' ? t('print.nameRequired') : null} />
    </TextField>
  );
}

/** A list of profiles on the left with copy and delete below it, the form of the picked one on the right. */
function ProfileColumns<T extends { id: string; name: string }>({
  label,
  items,
  selected,
  onSelect,
  badge,
  onCopy,
  onDelete,
  children,
  testId,
  add,
  full = null,
}: {
  label: string;
  items: T[];
  selected: string;
  onSelect: (id: string) => void;
  badge: (item: T) => string | null;
  onCopy: () => void;
  onDelete: () => void;
  children: ReactNode;
  testId: string;
  /** A way to add a new profile, before Copy. */
  add?: ReactNode;
  /** Why no more profiles fit, or null. */
  full?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <ListBox
          aria-label={label}
          items={items}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[selected]}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const [key] = [...keys];
            if (typeof key === 'string') onSelect(key);
          }}
          className="flex max-h-menu-max flex-col gap-0 overflow-auto rounded-md border border-border bg-surface p-1 outline-none"
          data-testid={`${testId}-list`}
        >
          {(item) => (
            <ListBoxItem
              id={item.id}
              textValue={item.name}
              className={listRowClass}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {badge(item) ? <span className="shrink-0 text-xs text-text-muted">{badge(item)}</span> : null}
            </ListBoxItem>
          )}
        </ListBox>
        <div className="flex flex-wrap gap-2">
          {add}
          <Button onPress={onCopy} isDisabled={full !== null} data-testid={`${testId}-copy`}>
            <IconCopy className="size-icon-sm" aria-hidden />
            {t('print.copy')}
          </Button>
          <Button onPress={onDelete} isDisabled={items.length <= 1} data-testid={`${testId}-delete`}>
            <IconTrash className="size-icon-sm" aria-hidden />
            {t('print.delete')}
          </Button>
        </div>
        {full ? (
          <p className="text-xs text-text-muted" data-testid={`${testId}-full`}>
            {full}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </div>
  );
}

function PrinterForm({ printer, onChange }: { printer: PrinterProfile; onChange: (printer: PrinterProfile) => void }) {
  const { t } = useTranslation();
  const axes = ['x', 'y', 'z'] as const;
  return (
    <>
      <Name label={t('print.name')} value={printer.name} onChange={(name) => onChange({ ...printer, name })} testId="printer-name" />
      <fieldset className="flex flex-col gap-1">
        <legend className={fieldLabelClass}>{t('print.bed')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {axes.map((axis, i) => (
            <Measure
              key={axis}
              label={axis.toUpperCase()}
              value={printer.bed[i] ?? 0}
              min={20}
              max={2000}
              step={1}
              unit="mm"
              testId={`printer-bed-${axis}`}
              onChange={(value) => {
                const bed: PrinterProfile['bed'] = [...printer.bed];
                bed[i] = value;
                onChange({ ...printer, bed });
              }}
            />
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <Measure label={t('print.nozzle')} value={printer.nozzle} min={0.1} max={2} step={0.05} unit="mm" testId="printer-nozzle" onChange={(nozzle) => onChange({ ...printer, nozzle })} />
        <Measure label={t('print.layer')} value={printer.layer} min={0.04} max={1.2} step={0.02} unit="mm" testId="printer-layer" onChange={(layer) => onChange({ ...printer, layer })} />
      </div>
      <p className="text-xs text-text-subtle">{t('print.printerHint')}</p>
    </>
  );
}

function MaterialForm({
  material,
  isDefault,
  onDefault,
  onChange,
}: {
  material: MaterialProfile;
  isDefault: boolean;
  onDefault: () => void;
  onChange: (material: MaterialProfile) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Name label={t('print.name')} value={material.name} onChange={(name) => onChange({ ...material, name })} testId="material-name" />
      <div className="grid grid-cols-2 gap-2">
        <Measure label={t('print.overhang')} value={material.overhang} min={20} max={70} step={1} unit="°" testId="material-overhang" onChange={(overhang) => onChange({ ...material, overhang })} />
        <Measure label={t('print.holeShrink')} value={material.holeShrink} min={0} max={1} step={0.05} unit="mm" testId="material-hole" onChange={(holeShrink) => onChange({ ...material, holeShrink })} />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className={fieldLabelClass}>{t('print.clearance')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {FIT_KINDS.map((fit) => (
            <Measure
              key={fit}
              label={t(`print.fit.${fit}`)}
              value={material.clearance[fit]}
              min={-0.5}
              max={2}
              step={0.05}
              unit="mm"
              testId={`material-fit-${fit}`}
              onChange={(value) => onChange({ ...material, clearance: { ...material.clearance, [fit]: value } })}
            />
          ))}
        </div>
      </fieldset>
      <CheckboxField isSelected={isDefault} isDisabled={isDefault} onChange={onDefault} data-testid="material-default">
        <CheckboxButton className={`${choiceInlineClass} disabled:opacity-100`}>
          <CheckMark />
          {t('print.defaultMaterial')}
        </CheckboxButton>
      </CheckboxField>
      <p className="text-xs text-text-subtle">{t('print.materialHint')}</p>
    </>
  );
}

/** The printer and material profiles as a form with Save and Cancel; in its dialog and in the settings (B6). */
export function PrintProfilesEditor({ close }: { close: () => void }) {
  const { t } = useTranslation();
  const part = useStudio((s) => s.print);
  const tab = useStudio((s) => s.profilesTab);
  const setTab = useStudio((s) => s.setProfilesTab);
  const [draft, setDraft] = useState<PrintSettings | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void platform()
      .print.settings()
      .then((settings) => {
        if (!live) return;
        setDraft(settings);
        setMaterialId(part?.material.id ?? settings.material);
      });
    return () => {
      live = false;
    };
    // Loaded once when the dialog opens; the draft is the user's from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!draft) return <p className="text-sm text-text-muted">{t('print.loading')}</p>;

  const printer = draft.printers.find((item) => item.id === draft.printer) ?? draft.printers[0];
  const material = draft.materials.find((item) => item.id === materialId) ?? draft.materials[0];
  if (!printer || !material) return null;
  const setPrinter = (next: PrinterProfile) => {
    setDraft({ ...draft, printers: draft.printers.map((item) => (item.id === next.id ? next : item)) });
  };
  const setMaterial = (next: MaterialProfile) => {
    setDraft({ ...draft, materials: draft.materials.map((item) => (item.id === next.id ? next : item)) });
  };
  const invalid = [...draft.printers, ...draft.materials].some((item) => item.name.trim() === '');

  const save = () => {
    if (invalid) {
      setError(t('print.nameMissing'));
      return;
    }
    const trimmed: PrintSettings = {
      ...draft,
      printers: draft.printers.map((item) => ({ ...item, name: item.name.trim() })),
      materials: draft.materials.map((item) => ({ ...item, name: item.name.trim() })),
    };
    platform()
      .print.saveSettings(trimmed)
      .then(close)
      .catch(() => {
        setError(t('print.saveFailed'));
      });
  };

  return (
    <>
      <Tabs className="flex flex-col gap-3" selectedKey={tab} onSelectionChange={(key) => setTab(key as ProfilesTab)}>
        <TabList aria-label={t('print.title')} className={tabListClass()}>
          {(['printer', 'material'] as const).map((id) => (
            <Tab
              key={id}
              id={id}
              className={tabClass()}
              data-testid={`print-tab-${id}`}
            >
              {t(`print.tab.${id}`)}
            </Tab>
          ))}
        </TabList>
        <TabPanel id="printer" className="outline-none">
          <ProfileColumns
            label={t('print.printers')}
            items={draft.printers}
            selected={printer.id}
            onSelect={(id) => {
              setDraft({ ...draft, printer: id });
            }}
            badge={(item) => (item.id === draft.printer ? t('print.inUse') : null)}
            onCopy={() => {
              const copy = copyOf(printer, 'printer', t('print.copySuffix'));
              setDraft({ ...draft, printers: [...draft.printers, copy], printer: copy.id });
            }}
            onDelete={() => {
              const printers = draft.printers.filter((item) => item.id !== printer.id);
              setDraft({ ...draft, printers, printer: printers[0]?.id ?? draft.printer });
            }}
            testId="printers"
            full={draft.printers.length >= MAX_PRINTERS ? t('print.printersFull', { count: MAX_PRINTERS }) : null}
            add={
              <CatalogPicker
                sections={printerSections}
                texts="print"
                addTestId="printers-add"
                testId="printer-catalog"
                isDisabled={draft.printers.length >= MAX_PRINTERS}
                onPick={(id) => {
                  const entry = PRINTER_CATALOG.find((item) => `${item.brand} ${item.model}` === id);
                  if (!entry) return;
                  const added: PrinterProfile = { id: newId('printer'), name: `${entry.brand} ${entry.model}`.slice(0, 60), bed: [...entry.bed], nozzle: entry.nozzle, layer: entry.layer };
                  setDraft({ ...draft, printers: [...draft.printers, added], printer: added.id });
                }}
              />
            }
          >
            <PrinterForm key={printer.id} printer={printer} onChange={setPrinter} />
          </ProfileColumns>
        </TabPanel>
        <TabPanel id="material" className="outline-none">
          <ProfileColumns
            label={t('print.materials')}
            items={draft.materials}
            selected={material.id}
            onSelect={setMaterialId}
            badge={(item) => (item.id === part?.material.id ? t('print.thisPart') : item.id === draft.material ? t('print.default') : null)}
            onCopy={() => {
              const copy = copyOf(material, 'material', t('print.copySuffix'));
              setDraft({ ...draft, materials: [...draft.materials, copy] });
              setMaterialId(copy.id);
            }}
            onDelete={() => {
              const materials = draft.materials.filter((item) => item.id !== material.id);
              const fallback = materials[0]?.id ?? draft.material;
              setDraft({ ...draft, materials, material: draft.material === material.id ? fallback : draft.material });
              setMaterialId(fallback);
            }}
            testId="materials"
            full={draft.materials.length >= MAX_MATERIALS ? t('print.materialsFull', { count: MAX_MATERIALS }) : null}
            add={
              <CatalogPicker
                sections={materialSections}
                texts="print.materialCatalog"
                addTestId="materials-add"
                testId="material-catalog"
                isDisabled={draft.materials.length >= MAX_MATERIALS}
                onPick={(id) => {
                  const entry = MATERIAL_CATALOG.find((item) => item.name === id);
                  if (!entry) return;
                  const added: MaterialProfile = { id: newId('material'), name: entry.name, overhang: entry.overhang, holeShrink: entry.holeShrink, clearance: { ...entry.clearance } };
                  setDraft({ ...draft, materials: [...draft.materials, added] });
                  setMaterialId(added.id);
                }}
              />
            }
          >
            <MaterialForm
              key={material.id}
              material={material}
              isDefault={draft.material === material.id}
              onDefault={() => {
                setDraft({ ...draft, material: material.id });
              }}
              onChange={setMaterial}
            />
            <ToleranceAssistant
              materials={draft.materials}
              material={material.id}
              printer={printer}
              onApply={(next) => {
                setMaterial(next);
                setMaterialId(next.id);
              }}
            />
          </ProfileColumns>
        </TabPanel>
      </Tabs>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onPress={close} data-testid="print-cancel">
          {t('print.cancel')}
        </Button>
        <Button variant="primary" onPress={save} data-testid="print-save">
          {t('print.save')}
        </Button>
      </div>
    </>
  );
}
