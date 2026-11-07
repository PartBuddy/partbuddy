import { IconArrowBackUp, IconDownload, IconEye, IconPencil, IconSettings, IconTrash, IconX } from '@tabler/icons-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  CheckboxButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  Separator,
  CheckboxField,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  NumberField,
  RadioButton,
  RadioField,
  RadioGroup,
  Slider,
  Tab,
  TabList,
  Tabs,
  SwitchButton,
  SwitchField,
  TextArea,
  TextField,
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup,
} from 'react-aria-components';

import { Button, IconButton, IconToggle, ToggleButton, linkClass, type ButtonVariant } from './Button';
import { TipText, tooltipClass } from './Tooltip';
import { CheckMark, chipToggleClass, choiceInlineClass, choiceRowClass, RadioMark, segmentClass, segmentGroupClass, SelectField, SliderBar, SwitchMark } from './Choice';
import { menuClass, menuHeaderClass, menuItemClass, menuItemTwoLineClass, menuSeparatorClass, popoverClass } from './Overlay';
import { dialogTitleClass, modalClass } from './Dialog';
import { badgeClass, Busy, EmptyState, StatusDot, type Tone } from './Feedback';
import { listRowClass, tabClass, tabListClass } from './Navigation';
import { FieldMessage, fieldLabelClass, inputClass, textAreaClass, UnitInput } from './Field';

/**
 * Every control in every state, for the UI upgrade's screenshots (`?gallery`, e2e/ui-gallery.spec.ts).
 * Hover, pressed and focus cannot be held by a test at once, so `Force` sets React Aria's state
 * attributes on the control; the styles key on exactly these attributes.
 */
type Forced = 'hover' | 'pressed' | 'focus' | 'focused' | 'focus-within';

/** `target` picks the element inside that carries the state (the input of a field, the group of a unit field). */
function Force({ state, target = '[data-rac]', children }: { state: Forced; target?: string; children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const apply = () => {
      const control = box.current?.querySelector(target);
      if (!control) return;
      const attribute = { hover: 'data-hovered', pressed: 'data-pressed', focus: 'data-focus-visible', focused: 'data-focused', 'focus-within': 'data-focus-within' }[state];
      control.setAttribute(attribute, 'true');
      if (state === 'pressed') control.setAttribute('data-hovered', 'true');
    };
    apply();
    // Collections (menus, lists) render their items in a second pass.
    const later = setTimeout(apply, 200);
    return () => {
      clearTimeout(later);
    };
  });
  return (
    <span ref={box} className="contents">
      {children}
    </span>
  );
}

const STATES = ['Default', 'Hover', 'Focus', 'Pressed', 'Selected', 'Disabled', 'Busy', 'Read-only', 'Invalid'] as const;

function Row({ name, cells }: { name: string; cells: Partial<Record<(typeof STATES)[number], ReactNode>> }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-2 pr-4 text-left text-sm font-medium text-text-muted">
        {name}
      </th>
      {STATES.map((state) => (
        <td key={state} className="px-2 py-2">
          {cells[state] ?? null}
        </td>
      ))}
    </tr>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <table className="border-collapse">
        <thead>
          <tr>
            <th />
            {STATES.map((state) => (
              <th key={state} scope="col" className="px-2 pb-1 text-left text-xs font-medium text-text-subtle">
                {state}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

const noop = () => undefined;

function buttonRow(variant: ButtonVariant, label: string) {
  const make = (extra: object = {}) => (
    <Button variant={variant} onPress={noop} {...extra}>
      {label}
    </Button>
  );
  return (
    <Row
      key={variant}
      name={variant}
      cells={{
        Default: make(),
        Hover: <Force state="hover">{make()}</Force>,
        Focus: <Force state="focus">{make()}</Force>,
        Pressed: <Force state="pressed">{make()}</Force>,
        Disabled: make({ isDisabled: true }),
        Busy: make({ isPending: true }),
      }}
    />
  );
}

function Actions() {
  const icon = (extra: object = {}) => (
    <IconButton label="Rückgängig" shortcut="Strg+Z" onPress={noop} {...extra}>
      <IconArrowBackUp className="size-icon-sm" aria-hidden />
    </IconButton>
  );
  const toggle = (extra: object = {}) => (
    <IconToggle label="Bemaßung" shortcut="M" {...extra}>
      <IconPencil className="size-icon-sm" aria-hidden />
    </IconToggle>
  );
  const textToggle = (extra: object = {}) => (
    <ToggleButton size="sm" {...extra}>
      Nur offene
    </ToggleButton>
  );
  return (
    <Section title="Actions">
      {buttonRow('primary', 'Als Projekt öffnen')}
      {buttonRow('secondary', 'Vergleichen')}
      {buttonRow('quiet', 'Alle anzeigen')}
      {buttonRow('danger', 'Papierkorb leeren')}
      <Row
        name="small"
        cells={{
          Default: (
            <Button size="sm" onPress={noop}>
              <IconDownload className="size-icon-sm" aria-hidden />
              Exportieren
            </Button>
          ),
          Disabled: (
            <Button size="sm" isDisabled>
              <IconTrash className="size-icon-sm" aria-hidden />
              Löschen
            </Button>
          ),
        }}
      />
      <Row
        name="icon"
        cells={{
          Default: icon(),
          Hover: <Force state="hover">{icon()}</Force>,
          Focus: <Force state="focus">{icon()}</Force>,
          Pressed: <Force state="pressed">{icon()}</Force>,
          Disabled: icon({ isDisabled: true }),
        }}
      />
      <Row
        name="icon secondary md"
        cells={{
          Default: (
            <IconButton label="Einstellungen" size="md" tone="secondary" onPress={noop}>
              <IconSettings className="size-icon" aria-hidden />
            </IconButton>
          ),
          Hover: (
            <Force state="hover">
              <IconButton label="Schließen" size="md" tone="secondary" onPress={noop}>
                <IconX className="size-icon" aria-hidden />
              </IconButton>
            </Force>
          ),
        }}
      />
      <Row
        name="icon toggle"
        cells={{
          Default: toggle(),
          Hover: <Force state="hover">{toggle()}</Force>,
          Focus: <Force state="focus">{toggle({ defaultSelected: true })}</Force>,
          Pressed: <Force state="pressed">{toggle()}</Force>,
          Selected: toggle({ defaultSelected: true }),
          Disabled: toggle({ isDisabled: true }),
        }}
      />
      <Row
        name="text toggle"
        cells={{
          Default: textToggle(),
          Hover: <Force state="hover">{textToggle()}</Force>,
          Focus: <Force state="focus">{textToggle()}</Force>,
          Selected: textToggle({ defaultSelected: true }),
          Disabled: textToggle({ isDisabled: true }),
        }}
      />
      <Row
        name="link"
        cells={{
          Default: (
            <a href="#gallery" className={`text-sm ${linkClass}`}>
              Mehr anzeigen
            </a>
          ),
        }}
      />
      <Row
        name="tooltip"
        cells={{
          Default: (
            <span className="inline-flex items-center gap-2 text-xs">
              <IconEye className="size-icon-sm text-text-muted" aria-hidden />
              <span className={tooltipClass}>
                <TipText label="Rückgängig" shortcut="Strg+Z" />
              </span>
            </span>
          ),
        }}
      />
    </Section>
  );
}

function Inputs() {
  const text = (extra: object = {}, error?: string) => (
    <TextField defaultValue="Wandhalter" className="flex w-field-dock flex-col gap-1" {...extra}>
      <Label className={fieldLabelClass}>Projektname</Label>
      <Input className={inputClass('md')} />
      <FieldMessage error={error} hint="Name des Projektordners" />
    </TextField>
  );
  const unit = (extra: object = {}) => (
    <NumberField defaultValue={0.2} step={0.05} formatOptions={{ maximumFractionDigits: 2 }} className="flex w-field-number flex-col gap-1" {...extra}>
      <Label className={fieldLabelClass}>Schichthöhe</Label>
      <UnitInput unit="mm" />
    </NumberField>
  );
  return (
    <Section title="Inputs">
      <Row
        name="text field"
        cells={{
          Default: text(),
          Hover: <Force state="hover" target="input">{text()}</Force>,
          Focus: <Force state="focused" target="input">{text()}</Force>,
          Disabled: text({ isDisabled: true }),
          'Read-only': text({ isReadOnly: true }),
          Invalid: text({ isInvalid: true }, 'Ein Projekt dieses Namens gibt es schon.'),
        }}
      />
      <Row
        name="number with unit"
        cells={{
          Default: unit(),
          Hover: <Force state="hover" target="[role=group]">{unit()}</Force>,
          Focus: <Force state="focus-within" target="[role=group]">{unit()}</Force>,
          Disabled: unit({ isDisabled: true }),
          Invalid: unit({ isInvalid: true }),
        }}
      />
      <Row
        name="text area"
        cells={{
          Default: (
            <TextField defaultValue="Nur die Bohrung prüfen" className="flex w-field-dock flex-col gap-1">
              <Label className={fieldLabelClass}>Notiz</Label>
              <TextArea rows={2} className={textAreaClass} />
            </TextField>
          ),
          Focus: (
            <Force state="focused" target="textarea">
              <TextField aria-label="Notiz" className="flex w-field-dock flex-col">
                <TextArea rows={2} placeholder="Was ist hier zu beachten?" className={textAreaClass} />
              </TextField>
            </Force>
          ),
        }}
      />
    </Section>
  );
}

function Selection() {
  const check = (extra: object = {}) => (
    <CheckboxField {...extra}>
      <CheckboxButton className={choiceInlineClass}>
        <CheckMark />
        Websuche erlauben
      </CheckboxButton>
    </CheckboxField>
  );
  const radio = (extra: object = {}) => (
    <RadioGroup aria-label="Design" defaultValue="system" className="w-field-dock" {...extra}>
      <RadioField value="system">
        <RadioButton className={choiceRowClass}>
          <RadioMark />
          <span className="text-sm text-text">Wie das System</span>
        </RadioButton>
      </RadioField>
    </RadioGroup>
  );
  const sw = (extra: object = {}) => (
    <SwitchField {...extra}>
      <SwitchButton className={choiceInlineClass}>
        <SwitchMark />
        Mitführen
      </SwitchButton>
    </SwitchField>
  );
  const chip = (extra: object = {}) => (
    <AriaToggleButton className={chipToggleClass} {...extra}>
      Gewinde
    </AriaToggleButton>
  );
  const force = (state: 'hover' | 'pressed' | 'focus', node: ReactNode, target = '[data-rac] [data-rac], [data-rac]') => (
    <Force state={state} target={target}>
      {node}
    </Force>
  );
  return (
    <Section title="Selection">
      <Row
        name="checkbox"
        cells={{
          Default: check(),
          Hover: force('hover', check(), 'label'),
          Focus: force('focus', check(), 'label'),
          Pressed: force('pressed', check(), 'label'),
          Selected: check({ defaultSelected: true }),
          Disabled: check({ isDisabled: true, defaultSelected: true }),
          'Read-only': check({ isIndeterminate: true }),
          Invalid: check({ isInvalid: true }),
        }}
      />
      <Row
        name="radio"
        cells={{
          Default: radio({ defaultValue: null }),
          Hover: force('hover', radio({ defaultValue: null }), 'label'),
          Focus: force('focus', radio(), 'label'),
          Pressed: force('pressed', radio({ defaultValue: null }), 'label'),
          Selected: radio(),
          Disabled: radio({ isDisabled: true }),
        }}
      />
      <Row
        name="switch"
        cells={{
          Default: sw(),
          Hover: force('hover', sw(), 'label'),
          Focus: force('focus', sw({ defaultSelected: true }), 'label'),
          Selected: sw({ defaultSelected: true }),
          Disabled: sw({ isDisabled: true }),
        }}
      />
      <Row
        name="chip toggle"
        cells={{
          Default: chip(),
          Hover: force('hover', chip(), 'button'),
          Focus: force('focus', chip(), 'button'),
          Pressed: force('pressed', chip(), 'button'),
          Selected: chip({ defaultSelected: true }),
          Disabled: chip({ isDisabled: true }),
        }}
      />
      <Row
        name="segmented"
        cells={{
          Default: (
            <ToggleButtonGroup aria-label="Ansicht" selectionMode="single" disallowEmptySelection defaultSelectedKeys={['assembled']} className={segmentGroupClass}>
              <AriaToggleButton id="assembled" className={segmentClass()}>
                Zusammengebaut
              </AriaToggleButton>
              <AriaToggleButton id="plate" className={segmentClass()}>
                Druckplatte
              </AriaToggleButton>
            </ToggleButtonGroup>
          ),
        }}
      />
      <Row
        name="select"
        cells={{
          Default: <SelectField label="Kopf" value="countersunk" items={[{ id: 'countersunk', label: 'Senkkopf' }, { id: 'cap', label: 'Zylinderkopf' }]} onChange={noop} />,
          Hover: (
            <Force state="hover" target="button">
              <SelectField label="Passung" value="normal" items={[{ id: 'normal', label: 'Normal' }]} onChange={noop} />
            </Force>
          ),
          Focus: (
            <Force state="focus" target="button">
              <SelectField label="Passung" value="normal" items={[{ id: 'normal', label: 'Normal' }]} onChange={noop} />
            </Force>
          ),
        }}
      />
      <Row
        name="slider"
        cells={{
          Default: (
            <Slider aria-label="Explosion" defaultValue={40} className="w-field-dock">
              <SliderBar />
            </Slider>
          ),
          Focus: (
            <Force state="focus" target="[role=slider], .react-aria-SliderThumb, [data-rac] [data-rac] [data-rac]">
              <Slider aria-label="Explosion" defaultValue={60} className="w-field-dock">
                <SliderBar />
              </Slider>
            </Force>
          ),
          Disabled: (
            <Slider aria-label="Explosion" defaultValue={40} isDisabled className="w-field-dock">
              <SliderBar />
            </Slider>
          ),
        }}
      />
    </Section>
  );
}

function Menus() {
  const menu = (focused?: string) => (
    <Force state="focused" target={focused === 'rename' ? '[role=menuitem]' : focused ? '[role=menuitem] ~ [role=menuitem]' : 'none'}>
      <div className={`${popoverClass} w-menu`}>
        <Menu aria-label="Projekt" className={menuClass} disabledKeys={['delete']} onAction={noop}>
          <MenuSection>
            <Header className={menuHeaderClass}>Projekt</Header>
            <MenuItem id="rename" className={menuItemClass}>
              <IconPencil className="size-icon-sm text-text-muted" aria-hidden />
              <span className="flex-1">Umbenennen …</span>
              <kbd className="font-sans text-xs text-text-subtle tabular-nums">F2</kbd>
            </MenuItem>
            <MenuItem id="export" className={menuItemTwoLineClass}>
              <span className="text-sm font-medium text-text">3MF für den Slicer</span>
              <span className="text-xs text-text-muted">Mit Farben, Material und Platte</span>
            </MenuItem>
          </MenuSection>
          <Separator className={menuSeparatorClass} />
          <MenuItem id="delete" className={menuItemClass}>
            <IconTrash className="size-icon-sm text-text-muted" aria-hidden />
            In den Papierkorb
          </MenuItem>
        </Menu>
      </div>
    </Force>
  );
  return (
    <Section title="Menus and popovers">
      <Row name="menu" cells={{ Default: menu(), Hover: menu('rename'), Focus: menu('export') }} />
    </Section>
  );
}

function DialogsAndFeedback() {
  const tones: Tone[] = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];
  return (
    <Section title="Dialogs and feedback">
      <Row
        name="dialog"
        cells={{
          Default: (
            <div className={`${modalClass('sm')} flex flex-col gap-4 p-5`}>
              <div className="flex items-start gap-2">
                <h3 className={`flex-1 ${dialogTitleClass}`}>Projekt in den Papierkorb?</h3>
                <IconButton label="Schließen" shortcut="Esc" onPress={noop}>
                  <IconX className="size-icon-sm" aria-hidden />
                </IconButton>
              </div>
              <p className="text-sm text-text-muted">Der Projektordner kommt in den Papierkorb und lässt sich 30 Tage lang wiederherstellen.</p>
              <div className="flex justify-end gap-2">
                <Button onPress={noop}>Abbrechen</Button>
                <Button variant="primary" onPress={noop}>
                  In den Papierkorb
                </Button>
              </div>
            </div>
          ),
        }}
      />
      <Row
        name="badges"
        cells={{
          Default: (
            <span className="flex flex-wrap gap-1">
              {tones.map((tone) => (
                <span key={tone} className={badgeClass(tone)}>
                  {tone}
                </span>
              ))}
              <span className={badgeClass('accent', true)}>Empfohlen</span>
            </span>
          ),
        }}
      />
      <Row
        name="status"
        cells={{
          Default: (
            <span className="flex flex-col gap-1">
              <StatusDot tone="success" label="SolidCraft verbunden" />
              <StatusDot tone="warning" label="Kontext fast voll" />
              <StatusDot tone="danger" label="Nicht druckbar" />
            </span>
          ),
          Busy: <Busy label="Druckplatte wird berechnet" />,
        }}
      />
      <Row name="empty" cells={{ Default: <div className="w-dialog-sm"><EmptyState title="Noch keine Notizen" body="Wähle eine Fläche und hefte eine Notiz daran." /></div> }} />
    </Section>
  );
}

function Navigation() {
  const tabs = (orientation: 'horizontal' | 'vertical', forced?: 'hover' | 'focus') => (
    <Force state={forced ?? 'hover'} target={forced ? '[role=tab] ~ [role=tab]' : 'none'}>
      <Tabs orientation={orientation} defaultSelectedKey="printer" className={orientation === 'vertical' ? 'w-settings-nav' : ''}>
        <TabList aria-label="Profile" className={tabListClass(orientation)}>
          <Tab id="printer" className={tabClass(orientation)}>
            Drucker
          </Tab>
          <Tab id="material" className={tabClass(orientation)}>
            Material
          </Tab>
          <Tab id="off" isDisabled className={tabClass(orientation)}>
            Slicer
          </Tab>
        </TabList>
      </Tabs>
    </Force>
  );
  const rows = (forced?: 'hover' | 'focus') => (
    <Force state={forced ?? 'hover'} target={forced ? '[role=option] ~ [role=option]' : 'none'}>
      <ListBox aria-label="Drucker" selectionMode="single" defaultSelectedKeys={['a']} className="flex w-field-dock flex-col rounded-md border border-border bg-surface p-1">
        <ListBoxItem id="a" className={listRowClass}>
          Mein Drucker
        </ListBoxItem>
        <ListBoxItem id="b" className={listRowClass}>
          Werkstatt
        </ListBoxItem>
      </ListBox>
    </Force>
  );
  return (
    <Section title="Navigation">
      <Row name="tabs" cells={{ Default: tabs('horizontal'), Hover: tabs('horizontal', 'hover'), Focus: tabs('horizontal', 'focus') }} />
      <Row name="side tabs" cells={{ Default: tabs('vertical'), Hover: tabs('vertical', 'hover'), Focus: tabs('vertical', 'focus') }} />
      <Row name="list rows" cells={{ Default: rows(), Hover: rows('hover'), Focus: rows('focus') }} />
    </Section>
  );
}

/** The gallery page; later families add their sections here. */
export function Gallery() {
  return (
    <main className="flex min-h-full flex-col gap-6 bg-canvas p-6" data-testid="ui-gallery">
      <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5">
        <Actions />
        <Inputs />
        <Selection />
        <Menus />
        <DialogsAndFeedback />
        <Navigation />
      </div>
    </main>
  );
}
