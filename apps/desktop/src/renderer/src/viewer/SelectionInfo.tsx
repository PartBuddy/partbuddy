import { featureOf, surfaceKind } from '@partbuddy/geometry';
import { useTranslation } from 'react-i18next';

import type { BodyModel, Pick } from '../state/store';
import { facePlace } from './facePosition';
import { circleOf, edgePoints } from './measure';
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

  let label: string;
  let name: string;
  let facts: { label: string; value: string }[];
  if (selection.kind === 'face') {
    const face = model.table.faces[selection.face];
    if (!face) return null;
    name = `${face.name} (${featureOf(face)})`;
    // A flat face says how big it is, across and up in the frame blocks are placed in (polish round 3).
    // shortcut: the box around the face in that frame, too big for a face turned against it; upgrade if a face's outline is read exactly.
    const size = face.planeNormal ? facePlace(body, selection.face, face.point, face.planeNormal).size : null;
    if (size && size[0] > 0 && size[1] > 0) {
      const round = (value: number) => Math.round(value * 10) / 10;
      label = t('viewer.flatFace', { across: round(size[0]), up: round(size[1]) });
      facts = [];
    } else {
      label = face.cylinder ? `${t(`viewer.surface.${surfaceKind(face)}`)} Ø ${mm(face.cylinder.radius * 2)}` : t(`viewer.surface.${surfaceKind(face)}`);
      facts = [
        ...(face.cylinder ? [{ label: t('viewer.radius'), value: mm(face.cylinder.radius) }] : []),
        { label: t('viewer.area'), value: t('units.mm2', { value: face.area }) },
      ];
    }
  } else if (selection.kind === 'edge') {
    const edge = edgeLabel(model, selection.edge);
    label = `${t('viewer.kind.edge')} ${mm(model.edgeLengths[selection.edge] ?? 0)}`;
    name = edge.name;
    // A round edge (arc or circle) tells its radius and diameter too (viewport CAD round).
    const circle = circleOf(edgePoints(model.edgeSegments, model.edgeRanges, selection.edge));
    facts = [
      { label: t('viewer.length'), value: mm(model.edgeLengths[selection.edge] ?? 0) },
      ...(circle ? [{ label: t('viewer.radius'), value: mm(Math.round(circle.radius * 100) / 100) }, { label: 'Ø', value: mm(Math.round(circle.radius * 200) / 100) }] : []),
    ];
  } else {
    label = t('viewer.kind.vertex');
    name = point(model.vertices.subarray(selection.vertex * 3, selection.vertex * 3 + 3));
    facts = [];
  }
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1"
      data-testid="selection-bar"
      data-kind={selection.kind}
    >
      {/* A readable name (polish round 2); SolidCraft's name, which can run to hundreds of characters, on hover. */}
      <div className="flex min-w-0 max-w-full flex-col">
        <span className="truncate text-xs text-text-subtle">
          {t('viewer.body')} {body.name}
        </span>
        <span className="truncate tabular-nums text-sm text-text" title={name} data-testid="selected-face" data-name={selection.kind === 'face' ? model.table.faces[selection.face]?.name : name}>
          {label}
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

