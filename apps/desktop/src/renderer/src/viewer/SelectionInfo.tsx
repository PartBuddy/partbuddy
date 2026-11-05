import { featureOf, surfaceKind } from '@partbuddy/geometry';
import { useTranslation } from 'react-i18next';

import type { BodyModel, Pick } from '../state/store';
import { edgeLabel } from './viewState';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="tabular-nums text-text">{value}</dd>
    </div>
  );
}

/** What is selected (M1a): its kind, body, stable name and measures; the head of the selection dock. */
export function SelectionInfo({ bodies, selection }: { bodies: BodyModel[]; selection: Pick }) {
  const { t } = useTranslation();
  const body = bodies[selection.body];
  if (!body) return null;
  const model = body.model;
  const mm = (value: number) => t('units.mm', { value });
  const point = (values: ArrayLike<number>) => Array.from(values, (value) => Math.round(value * 100) / 100).join('  ');

  let kind: string;
  let name: string;
  let facts: { label: string; value: string }[];
  if (selection.kind === 'face') {
    const face = model.table.faces[selection.face];
    if (!face) return null;
    kind = `${t(`viewer.surface.${surfaceKind(face)}`)} · ${featureOf(face)}`;
    name = face.name;
    facts = [
      ...(face.cylinder ? [{ label: t('viewer.radius'), value: mm(face.cylinder.radius) }] : []),
      { label: t('viewer.area'), value: t('units.mm2', { value: face.area }) },
      { label: t('viewer.anchor'), value: face.exact ? t('viewer.anchorExact') : t('viewer.anchorGeometric') },
    ];
  } else if (selection.kind === 'edge') {
    const label = edgeLabel(model, selection.edge);
    kind = t('viewer.kind.edge');
    name = label.name;
    facts = [{ label: t('viewer.length'), value: mm(model.edgeLengths[selection.edge] ?? 0) }];
  } else {
    kind = t('viewer.kind.vertex');
    name = point(model.vertices.subarray(selection.vertex * 3, selection.vertex * 3 + 3));
    facts = [];
  }
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1"
      data-testid="selection-bar"
      data-kind={selection.kind}
    >
      <div className="flex flex-col">
        <span className="text-xs text-text-subtle">
          {kind} · {t('viewer.body')} {body.name}
        </span>
        <span className="tabular-nums text-sm text-text" data-testid="selected-face">
          {name}
        </span>
      </div>
      {facts.length > 0 ? (
        <dl className="flex gap-3 text-sm">
          {facts.map((fact) => (
            <Fact key={fact.label} {...fact} />
          ))}
        </dl>
      ) : null}
    </div>
  );
}

