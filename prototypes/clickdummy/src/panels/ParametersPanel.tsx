import { IconStar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  Group,
  Input,
  Label,
  NumberField,
  Slider,
  SliderThumb,
  SliderTrack,
} from 'react-aria-components';

import { parameters, type Parameter } from '../mock/design';
import { useStudio } from '../state/store';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

function ParameterRow({ parameter }: { parameter: Parameter }) {
  const { t, i18n } = useTranslation();
  const committed = useStudio((s) => s.values[parameter.name] ?? parameter.value);
  const pending = useStudio((s) => s.pendingValues[parameter.name]);
  const setPendingValue = useStudio((s) => s.setPendingValue);
  const value = pending ?? committed;
  const changed = pending !== undefined && pending !== committed;
  const format = { style: 'unit', unit: 'millimeter', maximumFractionDigits: 2 } as const;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-1">
        {parameter.favorite ? <IconStar className="size-icon-sm text-text-subtle" aria-label={t('parameters.favorite')} /> : null}
        <Label id={`param-${parameter.name}`} className="truncate font-mono text-sm text-text">
          {parameter.name}
        </Label>
        {changed ? <Badge tone="accent">{t('parameters.changed')}</Badge> : null}
      </div>
      <NumberField
        aria-labelledby={`param-${parameter.name}`}
        value={value}
        minValue={parameter.min}
        maxValue={parameter.max}
        step={parameter.step}
        formatOptions={format}
        onChange={(next) => {
          if (!Number.isNaN(next)) setPendingValue(parameter.name, next);
        }}
      >
        <Group className="flex h-control-sm w-field-number items-center rounded-md border border-border-strong bg-surface focus-within:outline-2 focus-within:outline-focus">
          <Input className="w-full bg-transparent px-2 text-right font-mono text-sm tabular-nums text-text outline-none" />
        </Group>
      </NumberField>
      {parameter.favorite ? (
        <Slider
          aria-labelledby={`param-${parameter.name}`}
          value={value}
          minValue={parameter.min}
          maxValue={parameter.max}
          step={parameter.step}
          onChange={(next) => {
            setPendingValue(parameter.name, next);
          }}
          className="col-span-2"
        >
          <SliderTrack className="relative h-4 w-full">
            {({ state }) => (
              <>
                <span aria-hidden className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-sunken" />
                <span
                  aria-hidden
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
                  style={{ width: `${state.getThumbPercent(0) * 100}%` }}
                />
                <SliderThumb aria-label={t('parameters.slider', { name: parameter.name })} className="top-1/2 size-3 rounded-full border-2 border-accent bg-surface shadow-1 outline-none dragging:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-focus" />
              </>
            )}
          </SliderTrack>
        </Slider>
      ) : null}
      <p className="col-span-2 text-xs text-text-subtle">
        {t('parameters.range', {
          min: new Intl.NumberFormat(i18n.language, format).format(parameter.min),
          max: new Intl.NumberFormat(i18n.language, format).format(parameter.max),
        })}
      </p>
    </div>
  );
}

export function ParametersPanel() {
  const { t } = useTranslation();
  const pendingValues = useStudio((s) => s.pendingValues);
  const resetPendingValues = useStudio((s) => s.resetPendingValues);
  const applyPendingValues = useStudio((s) => s.applyPendingValues);
  const pendingCount = Object.keys(pendingValues).length;
  const nominal = parameters.filter((p) => p.role === 'nominal');
  const compensation = parameters.filter((p) => p.role === 'compensation');

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <h3 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          {t('parameters.nominal')}
        </h3>
        {nominal.map((p) => (
          <ParameterRow key={p.name} parameter={p} />
        ))}
        <h3 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          {t('parameters.compensation')}
        </h3>
        {compensation.map((p) => (
          <ParameterRow key={p.name} parameter={p} />
        ))}
        <p className="flex items-start gap-2 px-3 py-2 text-xs text-text-muted">
          <Badge tone="warning">{t('parameters.assumption')}</Badge>
          {t('parameters.compensationNote')}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-sm text-text-muted">{t('parameters.pending', { count: pendingCount })}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="quiet" isDisabled={pendingCount === 0} onPress={resetPendingValues}>
            {t('actions.reset')}
          </Button>
          <Button size="sm" variant="primary" isDisabled={pendingCount === 0} onPress={applyPendingValues}>
            {t('parameters.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
