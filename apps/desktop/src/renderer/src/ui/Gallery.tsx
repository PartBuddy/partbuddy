import { IconArrowBackUp, IconDownload, IconEye, IconPencil, IconSettings, IconTrash, IconX } from '@tabler/icons-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Input, Label, NumberField, TextArea, TextField } from 'react-aria-components';

import { Button, IconButton, IconToggle, ToggleButton, linkClass, type ButtonVariant } from './Button';
import { TipText, tooltipClass } from './Tooltip';
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
    const control = box.current?.querySelector(target);
    if (!control) return;
    const attribute = { hover: 'data-hovered', pressed: 'data-pressed', focus: 'data-focus-visible', focused: 'data-focused', 'focus-within': 'data-focus-within' }[state];
    control.setAttribute(attribute, 'true');
    if (state === 'pressed') control.setAttribute('data-hovered', 'true');
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

/** The gallery page; later families add their sections here. */
export function Gallery() {
  return (
    <main className="flex min-h-full flex-col gap-6 bg-canvas p-6" data-testid="ui-gallery">
      <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5">
        <Actions />
        <Inputs />
      </div>
    </main>
  );
}
