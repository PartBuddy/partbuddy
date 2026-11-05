import { cylinderKind } from '@partbuddy/geometry';
import { IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, TextField, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import { suggestionsFor } from '../../../shared/calibration';
import { FIT_KINDS, type FitKind, type MaterialProfile, type Measurement, type StoredMeasurement } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { parseLength } from '../viewer/lengthInput';

type Kind = Measurement['kind'];
type Verdict = Extract<Measurement, { kind: 'fit' }>['verdict'];

const inputClass =
  'h-control-sm w-field-number rounded-md border border-border-strong bg-surface px-2 text-right text-sm tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus';
const toggleClass =
  'inline-flex h-control-sm items-center gap-1 rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover selected:border-accent selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus';

/** The drawn diameter of a selected hole or pin, to start the form from. */
function useSelectedCylinder(): { kind: 'hole' | 'outer'; diameter: number } | null {
  const model = useStudio((s) => s.model);
  const selection = useStudio((s) => s.selection);
  if (model.status !== 'ready' || selection?.kind !== 'face') return null;
  const body = model.bodies[selection.body];
  const radius = body?.model.table.faces[selection.face]?.cylinder?.radius;
  const kind = body ? cylinderKind(body.model, selection.face) : null;
  if (!radius || !kind) return null;
  return { kind: kind === 'hole' ? 'hole' : 'outer', diameter: Math.round(radius * 2 * 1000) / 1000 };
}

/**
 * Measure after printing (M7): measurements per material, and what they suggest for its hole
 * allowance, outer growth and clearances. A suggestion changes the draft; "Save" keeps it.
 */
export function MeasureTab({ material, onChange }: { material: MaterialProfile; onChange: (material: MaterialProfile) => void }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 });
  const selected = useSelectedCylinder();
  const [entries, setEntries] = useState<StoredMeasurement[]>([]);
  const [kind, setKind] = useState<Kind>(selected?.kind ?? 'hole');
  const [drawn, setDrawn] = useState(selected ? number.format(selected.diameter) : '');
  const [measured, setMeasured] = useState('');
  const [fit, setFit] = useState<FitKind>('slide');
  const [verdict, setVerdict] = useState<Verdict>('ok');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void platform()
      .print.measurements()
      .then((all) => {
        if (live) setEntries(all);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const own = entries.filter((entry) => entry.material === material.id);
  const suggestions = suggestionsFor(material, entries);

  const add = () => {
    let measurement: Measurement;
    if (kind === 'fit') {
      measurement = { kind, fit, verdict, clearance: material.clearance[fit] };
    } else {
      const d = parseLength(drawn);
      const m = parseLength(measured);
      if (!(d > 0) || !(m > 0)) {
        setError(t('measure.invalid'));
        return;
      }
      measurement = { kind, drawn: d, measured: m };
    }
    setError(null);
    platform()
      .print.addMeasurement(material.id, measurement)
      .then((all) => {
        setEntries(all);
        setMeasured('');
      })
      .catch(() => {
        setError(t('measure.failed'));
      });
  };

  const describe = (entry: StoredMeasurement) =>
    entry.kind === 'fit'
      ? t('measure.entryFit', { fit: t(`print.fit.${entry.fit}`), verdict: t(`measure.verdict.${entry.verdict}`), clearance: number.format(entry.clearance) })
      : t(entry.kind === 'hole' ? 'measure.entryHole' : 'measure.entryOuter', { drawn: number.format(entry.drawn), measured: number.format(entry.measured) });

  const rows = [
    suggestions.holeShrink && { key: 'holeShrink', label: t('measure.suggestHole', { from: number.format(material.holeShrink), to: number.format(suggestions.holeShrink.value), count: suggestions.holeShrink.count }), apply: () => ({ ...material, holeShrink: suggestions.holeShrink?.value ?? material.holeShrink }) },
    suggestions.outerGrowth && { key: 'outerGrowth', label: t('measure.suggestOuter', { from: number.format(material.outerGrowth), to: number.format(suggestions.outerGrowth.value), count: suggestions.outerGrowth.count }), apply: () => ({ ...material, outerGrowth: suggestions.outerGrowth?.value ?? material.outerGrowth }) },
    ...FIT_KINDS.flatMap((key) => {
      const suggestion = suggestions.clearance[key];
      return suggestion
        ? [{ key: `fit-${key}`, label: t('measure.suggestFit', { fit: t(`print.fit.${key}`), from: number.format(material.clearance[key]), to: number.format(suggestion.value) }), apply: () => ({ ...material, clearance: { ...material.clearance, [key]: suggestion.value } }) }]
        : [];
    }),
  ].filter((row): row is { key: string; label: string; apply: () => MaterialProfile } => Boolean(row));

  return (
    <div className="flex flex-col gap-3" data-testid="measure">
      <p className="text-xs text-text-muted">{t('measure.intro', { material: material.name })}</p>
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
        <ToggleButtonGroup
          aria-label={t('measure.kind')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[kind]}
          onSelectionChange={(keys) => {
            const [next] = [...keys];
            if (next === 'hole' || next === 'outer' || next === 'fit') setKind(next);
          }}
          className="flex flex-wrap gap-1"
        >
          {(['hole', 'outer', 'fit'] as const).map((id) => (
            <ToggleButton key={id} id={id} className={toggleClass} data-testid={`measure-kind-${id}`}>
              {t(`measure.kinds.${id}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {kind === 'fit' ? (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleButtonGroup
              aria-label={t('fit.kind')}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[fit]}
              onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (FIT_KINDS.includes(next as FitKind)) setFit(next as FitKind);
              }}
              className="flex flex-wrap gap-1"
            >
              {FIT_KINDS.map((id) => (
                <ToggleButton key={id} id={id} className={toggleClass} data-testid={`measure-fit-${id}`}>
                  {t(`print.fit.${id}`)}
                  <span className="tabular-nums text-text-muted">{number.format(material.clearance[id])}</span>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <ToggleButtonGroup
              aria-label={t('measure.verdictLabel')}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[verdict]}
              onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (next === 'tight' || next === 'ok' || next === 'loose') setVerdict(next);
              }}
              className="flex gap-1"
            >
              {(['tight', 'ok', 'loose'] as const).map((id) => (
                <ToggleButton key={id} id={id} className={toggleClass} data-testid={`measure-verdict-${id}`}>
                  {t(`measure.verdict.${id}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <TextField value={drawn} onChange={setDrawn} inputMode="decimal" className="flex flex-col gap-1" data-testid="measure-drawn">
              <Label className="text-xs text-text-muted">{t('measure.drawn')}</Label>
              <Input className={inputClass} />
            </TextField>
            <TextField value={measured} onChange={setMeasured} inputMode="decimal" className="flex flex-col gap-1" data-testid="measure-measured">
              <Label className="text-xs text-text-muted">{t('measure.measured')}</Label>
              <Input className={inputClass} />
            </TextField>
            <span className="pb-1 text-xs text-text-muted">{t('units.mmShort')}</span>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button onPress={add} data-testid="measure-add">
            {t('measure.add')}
          </Button>
        </div>
      </div>

      {rows.length > 0 ? (
        <section className="flex flex-col gap-1" aria-label={t('measure.suggestions')} data-testid="measure-suggestions">
          <h3 className="text-xs font-semibold text-text">{t('measure.suggestions')}</h3>
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2 rounded-sm bg-accent-subtle px-2 py-1" data-testid="measure-suggestion" data-key={row.key}>
              <span className="flex-1 text-sm text-text">{row.label}</span>
              <Button
                onPress={() => {
                  onChange(row.apply());
                }}
                data-testid="measure-apply"
              >
                {t('measure.apply')}
              </Button>
            </div>
          ))}
        </section>
      ) : own.length > 0 ? (
        <p className="text-xs text-text-muted">{t('measure.noSuggestion')}</p>
      ) : null}

      {own.length > 0 ? (
        <ul className="flex max-h-menu-max flex-col gap-0 overflow-auto" aria-label={t('measure.entries')} data-testid="measure-entries">
          {[...own].reverse().map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 px-1 text-sm text-text" data-testid="measure-entry">
              <span className="flex-1 tabular-nums">{describe(entry)}</span>
              <span className="text-xs tabular-nums text-text-muted">{new Date(entry.at).toLocaleDateString(i18n.language)}</span>
              <AriaButton
                aria-label={t('measure.remove')}
                className="inline-flex size-control-sm items-center justify-center rounded-md text-text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
                onPress={() => {
                  void platform()
                    .print.removeMeasurement(entry.id)
                    .then(setEntries)
                    .catch(() => undefined);
                }}
              >
                <IconTrash className="size-icon-sm" aria-hidden />
              </AriaButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
