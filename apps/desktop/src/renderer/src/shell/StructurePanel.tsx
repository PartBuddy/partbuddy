import { IconBox, IconEye, IconEyeOff } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleButton } from 'react-aria-components';

import { NotesSection } from '../notes/NotesSection';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { CadIcon } from '../ui/CadIcon';

function Row({ icon, name, note, visible, onToggle, testId }: { icon: ReactNode; name: string; note?: string; visible: boolean; onToggle: (visible: boolean) => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <li className={`flex h-row items-center gap-2 rounded-md px-2 text-sm ${visible ? 'text-text' : 'text-text-subtle'}`} data-testid={testId} data-visible={visible}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {note ? <span className="shrink-0 text-xs text-accent">{note}</span> : null}
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
      <section aria-labelledby="structure-bodies">
        <h2 id="structure-bodies" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          {t('structure.bodies', { count: bodies.length })}
        </h2>
        {bodies.length === 0 ? <p className="px-2 text-xs text-text-subtle">{t('structure.noBodies')}</p> : null}
        <ul>
          {bodies.map((body) => (
            <Row
              key={body.name}
              icon={<IconBox className="size-icon-sm shrink-0" aria-hidden />}
              name={body.name}
              visible={body.visible}
              onToggle={(visible) => {
                toggle({ bodies: [body.name], sketches: [], visible });
              }}
              testId="structure-body"
            />
          ))}
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
