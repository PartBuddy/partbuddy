import { IconBox, IconEye, IconEyeOff, IconTool, IconTransform } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, ToggleButton, Tooltip, TooltipTrigger } from 'react-aria-components';

import { NotesSection } from '../notes/NotesSection';
import { LooseDimensions } from '../viewer/Dimensions';
import { bodyKindOf, type BodyKind } from './bodyKinds';
import { ParametersSection } from './ParametersSection';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { CadIcon } from '../ui/CadIcon';

function Row({ icon, name, note, action, visible, onToggle, testId }: { icon: ReactNode; name: string; note?: string; action?: ReactNode; visible: boolean; onToggle: (visible: boolean) => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <li className={`flex h-row items-center gap-2 rounded-md px-2 text-sm ${visible ? 'text-text' : 'text-text-subtle'}`} data-testid={testId} data-visible={visible}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {note ? <span className="shrink-0 text-xs text-accent">{note}</span> : null}
      {action}
      <ToggleButton
        aria-label={t(visible ? 'structure.hide' : 'structure.show', { name })}
        isSelected={visible}
        onChange={onToggle}
        className="inline-flex size-control-sm shrink-0 items-center justify-center rounded-md text-text-subtle outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
      >
        {visible ? <IconEye className="size-icon-sm" aria-hidden /> : <IconEyeOff className="size-icon-sm" aria-hidden />}
      </ToggleButton>
    </li>
  );
}

/**
 * Repair at an imported body (B4): a mesh body is converted to faces (`mesh.convert`, closed
 * meshes only), a part from STEP or IGES is repaired (`body.repair`). Modelled parts get nothing.
 */
function RepairButton({ body, kind }: { body: string; kind: Exclude<BodyKind, 'model'> }) {
  const { t } = useTranslation();
  const setNotice = useStudio((s) => s.setNotice);
  const [busy, setBusy] = useState(false);
  const how = kind === 'mesh' ? 'convert' : 'repair';
  const label = t(`structure.${how}`, { name: body });
  const run = () => {
    setBusy(true);
    void platform()
      .design.repair(body, how)
      .then((result) => {
        if (result.ok) setNotice({ tone: 'success', text: t(`structure.${how}Done`, { name: body }) });
        else if (result.reason === 'nothing') setNotice({ tone: 'success', text: t('structure.nothingToRepair', { name: body }) });
        else if (result.reason === 'openMesh') setNotice({ tone: 'danger', text: t('structure.openMesh', { name: body }) });
        else setNotice({ tone: 'danger', text: t('actions.failed', { detail: result.detail.slice(0, 200) }) });
      })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <TooltipTrigger delay={300}>
      <AriaButton
        aria-label={label}
        isDisabled={busy}
        onPress={run}
        className="inline-flex size-control-sm shrink-0 items-center justify-center rounded-md text-text-subtle outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40"
        data-testid={`structure-${how}`}
      >
        {kind === 'mesh' ? <IconTransform className="size-icon-sm" aria-hidden /> : <IconTool className="size-icon-sm" aria-hidden />}
      </AriaButton>
      <Tooltip placement="top" offset={6} className="max-w-text-max rounded-sm bg-surface-raised px-2 py-1 text-xs text-text shadow-2">
        {t(`structure.${how}Hint`)}
      </Tooltip>
    </TooltipTrigger>
  );
}

/**
 * The structure tree on the left (M1c): every body and sketch of the design, visible or hidden,
 * with a switch to show or hide it. SolidCraft hides a sketch once a feature uses it.
 */
export function StructurePanel() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  if (model.status !== 'ready') return null;
  const { bodies, sketches } = model.structure;
  const editing = new Set(model.sketches.filter((sketch) => sketch.active).map((sketch) => sketch.id));

  const toggle = (command: { bodies: string[]; sketches: number[]; visible: boolean }) => {
    void platform()
      .design.visibility(command)
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  return (
    <nav aria-label={t('structure.title')} className="flex w-menu shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-surface p-2" data-testid="structure">
      <ParametersSection />
      <LooseDimensions />
      <section aria-labelledby="structure-bodies">
        <h2 id="structure-bodies" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          {t('structure.bodies', { count: bodies.length })}
        </h2>
        {bodies.length === 0 ? <p className="px-2 text-xs text-text-subtle">{t('structure.noBodies')}</p> : null}
        <ul>
          {bodies.map((body) => {
            const kind = bodyKindOf(body, model.structure.features);
            return (
              <Row
                key={body.name}
                icon={<IconBox className="size-icon-sm shrink-0" aria-hidden />}
                name={body.name}
                {...(kind === 'mesh' ? { note: t('structure.mesh') } : {})}
                {...(kind === 'model' ? {} : { action: <RepairButton body={body.name} kind={kind} /> })}
                visible={body.visible}
                onToggle={(visible) => {
                  toggle({ bodies: [body.name], sketches: [], visible });
                }}
                testId="structure-body"
              />
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="structure-sketches">
        <h2 id="structure-sketches" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          {t('structure.sketches', { count: sketches.length })}
        </h2>
        {sketches.length === 0 ? <p className="px-2 text-xs text-text-subtle">{t('structure.noSketches')}</p> : null}
        <ul>
          {sketches.map((sketch) => (
            <Row
              key={sketch.id}
              icon={<CadIcon name="sketch" className="size-icon-sm shrink-0" />}
              name={sketch.name || `#${String(sketch.id)}`}
              {...(editing.has(sketch.id) ? { note: t('structure.editing') } : {})}
              visible={sketch.visible}
              onToggle={(visible) => {
                toggle({ bodies: [], sketches: [sketch.id], visible });
              }}
              testId="structure-sketch"
            />
          ))}
        </ul>
      </section>
      <NotesSection />
    </nav>
  );
}
