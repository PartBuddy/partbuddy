import { faceDown } from '@partbuddy/geometry';
import { IconArrowBarToDown, IconWeight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import type { LoadPlaces } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';

const buttonClass =
  'inline-flex h-control-sm items-center gap-1 rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50';

/** Adds or removes faces from the marked loads, keeping one entry per body. */
function toggled(loads: LoadPlaces, faces: { body: string; name: string }[], add: boolean): LoadPlaces {
  const byBody = new Map(loads.map((place) => [place.body, new Set(place.faces)]));
  for (const { body, name } of faces) {
    const set = byBody.get(body) ?? new Set<string>();
    if (add) set.add(name);
    else set.delete(name);
    byBody.set(body, set);
  }
  return [...byBody].flatMap(([body, set]) => (set.size > 0 ? [{ body, faces: [...set] }] : []));
}

/**
 * Print orientation at the selection (M7): lay the part on the selected face, and mark where a
 * load acts so the proposal turns the layers along it.
 */
export function FacePrintActions({ bodies, picks }: { bodies: BodyModel[]; picks: Pick[] }) {
  const { t } = useTranslation();
  const print = useStudio((s) => s.print);
  const setNotice = useStudio((s) => s.setNotice);
  if (!print || picks.length === 0 || picks.some((pick) => pick.kind !== 'face')) return null;
  const faces = picks.flatMap((pick) => {
    const body = bodies[pick.body];
    const name = pick.kind === 'face' ? body?.model.table.faces[pick.face]?.name : undefined;
    return body && name ? [{ body: body.name, name, pick }] : [];
  });
  if (faces.length === 0) return null;
  const marked = faces.every(({ body, name }) => print.loads.some((place) => place.body === body && place.faces.includes(name)));
  const failed = () => {
    setNotice({ tone: 'danger', text: t('orientation.failed') });
  };
  const [single] = faces;
  const singleModel = single ? bodies[single.pick.body]?.model : undefined;
  const down = faces.length === 1 && single && singleModel && single.pick.kind === 'face' ? faceDown({ name: single.body, model: singleModel }, single.pick.face) : null;

  return (
    <>
      {down && single ? (
        <AriaButton
          className={buttonClass}
          data-testid="print-on-face"
          onPress={() => {
            platform()
              .print.setOrientation({ down, face: { body: single.body, name: single.name } })
              .then(() => {
                setNotice({ tone: 'success', text: t('orientation.laid', { face: single.name }) });
              })
              .catch(failed);
          }}
        >
          <IconArrowBarToDown className="size-icon-sm" aria-hidden />
          {t('orientation.printOnFace')}
        </AriaButton>
      ) : null}
      <AriaButton
        className={buttonClass}
        data-testid="mark-load"
        data-marked={marked}
        onPress={() => {
          platform()
            .print.setLoads(toggled(print.loads, faces, !marked))
            .catch(failed);
        }}
      >
        <IconWeight className="size-icon-sm" aria-hidden />
        {marked ? t('orientation.unmarkLoad') : t('orientation.markLoad')}
      </AriaButton>
    </>
  );
}
