import { Overhang, OVERHANG_LIMITS, overhangLimits } from '@partbuddy/geometry';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useStudio, type BodyModel } from '../state/store';
import { overhangArea } from './useOverhang';

/**
 * What the colours of the overhang view mean (UI upgrade step 12), with how much area needs
 * support: the print check as a picture instead of a paragraph in the chat.
 */
export function OverhangLegend({ bodies }: { bodies: BodyModel[] }) {
  const { t } = useTranslation();
  const on = useStudio((s) => s.overhang);
  const material = useStudio((s) => s.print?.material ?? null);
  const limits = useMemo(() => (material ? overhangLimits(material.overhang) : OVERHANG_LIMITS), [material]);
  const area = useMemo(() => (on ? overhangArea(bodies, limits) : null), [on, bodies, limits]);
  if (!area) return null;
  const rows = [
    { key: 'support', swatch: 'bg-overhang-risk', label: t('overhang.support', { degrees: limits.support }), area: area[Overhang.Support] },
    { key: 'borderline', swatch: 'bg-overhang', label: t('overhang.borderline', { from: limits.borderline, to: limits.support }), area: area[Overhang.Borderline] },
    { key: 'bed', swatch: 'bg-bed', label: t('overhang.bed'), area: area[Overhang.Bed] },
  ];
  return (
    <section
      aria-label={t('overhang.title')}
      className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-text shadow-2"
      data-testid="overhang-legend"
      data-view-overlay
    >
      <h2 className="font-semibold">{t('overhang.title')}</h2>
      <p className="text-text-subtle">{t('overhang.direction')}</p>
      {material ? (
        <p className="text-text-subtle" data-testid="overhang-material">
          {t('overhang.material', { material: material.name })}
        </p>
      ) : null}
      <dl className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2" data-testid={`overhang-${row.key}`} data-area={Math.round(row.area)}>
            <span aria-hidden className={`size-dot rounded-full ${row.swatch}`} />
            <dt className="flex-1">{row.label}</dt>
            <dd className="tabular-nums text-text-muted">{t('units.mm2', { value: Math.round(row.area) })}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
