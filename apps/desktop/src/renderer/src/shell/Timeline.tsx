import { IconAlertCircle, IconAlertTriangle, IconBox, IconCylinder, IconPlayerTrackNext, IconPoint } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';

import type { TimelineCommand, TimelineFeature } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { CadIcon, type CadIconName } from '../ui/CadIcon';

/** "ExtrudeFeature" → "Extrude": the kind of step, as the timeline names it. */
export function featureKind(type: string): string {
  return type.replace(/Feature$/, '');
}

/** CAD operations by feature kind (ADR 0023); primitives keep Tabler's box and cylinder. */
const CAD_ICONS: Record<string, CadIconName> = {
  Sketch: 'sketch',
  Extrude: 'extrude',
  Revolve: 'revolve',
  Sweep: 'sweep',
  Loft: 'loft',
  Fillet: 'fillet',
  Chamfer: 'chamfer',
  Hole: 'hole',
  Shell: 'shell',
  Mirror: 'mirror',
  Split: 'split',
  Thread: 'helix',
  Helix: 'helix',
  Combine: 'union',
  Plane: 'plane',
  ConstructionPlane: 'plane',
};

function iconOf(feature: TimelineFeature): ReactNode {
  if (feature.error) return <IconAlertCircle className="size-icon-sm text-danger" aria-hidden />;
  if (feature.warning) return <IconAlertTriangle className="size-icon-sm text-warning" aria-hidden />;
  const kind = featureKind(feature.type);
  if (kind === 'Box') return <IconBox className="size-icon-sm" aria-hidden />;
  if (kind === 'Cylinder') return <IconCylinder className="size-icon-sm" aria-hidden />;
  if (kind.includes('Pattern')) {
    return <CadIcon name={kind.includes('Circular') ? 'patternCircular' : 'patternLinear'} className="size-icon-sm" />;
  }
  const name = CAD_ICONS[kind];
  return name ? <CadIcon name={name} className="size-icon-sm" /> : <IconPoint className="size-icon-sm" aria-hidden />;
}

/**
 * The timeline under the view (M1c): every step of the design in order, errors and warnings
 * marked, suppressed and rolled-back steps faded. A step's menu rolls the design back to it or
 * suppresses it; "To the end" brings back every step.
 */
export function Timeline() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  if (model.status !== 'ready' || model.structure.features.length === 0) return null;
  const { features, marker } = model.structure;

  const run = (command: TimelineCommand) => {
    void platform()
      .design.timeline(command)
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  return (
    <section aria-label={t('timeline.title')} className="flex h-control-lg shrink-0 items-center gap-2 border-t border-border bg-surface px-2" data-testid="timeline" data-marker={marker ?? 'end'}>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-subtle">{t('timeline.title')}</span>
      <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {features.map((feature, index) => {
          const faded = feature.suppressed || feature.rolledBack;
          const kind = featureKind(feature.type);
          return (
            <li key={feature.id} className="flex shrink-0 items-center gap-1">
              <MenuTrigger>
                <AriaButton
                  className={`inline-flex h-control-sm items-center gap-1 rounded-md border px-2 text-xs outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus ${
                    feature.error ? 'border-danger text-danger' : feature.warning ? 'border-warning text-text' : 'border-border text-text'
                  } ${faded ? 'opacity-50' : ''} ${feature.suppressed ? 'line-through' : ''}`}
                  aria-label={t('timeline.step', { name: feature.name, kind: t(`timeline.kind.${kind}`, { defaultValue: kind }) })}
                  data-testid="timeline-feature"
                  data-state={feature.error ? 'error' : feature.warning ? 'warning' : feature.suppressed ? 'suppressed' : feature.rolledBack ? 'rolledBack' : 'ok'}
                >
                  {iconOf(feature)}
                  {feature.name}
                </AriaButton>
                <Popover placement="top start" offset={6} className="min-w-menu max-w-text-max rounded-md border border-border bg-surface-raised p-1 shadow-2">
                  <Menu
                    aria-label={feature.name}
                    className="outline-none"
                    onAction={(key) => {
                      if (key === 'roll') run({ action: 'rollTo', position: index + 1 });
                      if (key === 'suppress') run({ action: 'suppress', feature: feature.id, suppressed: !feature.suppressed });
                    }}
                    disabledKeys={busy ? ['roll', 'suppress'] : []}
                  >
                    <MenuSection>
                      <Header className="px-2 py-1 text-xs text-text-subtle">
                        {t(`timeline.kind.${kind}`, { defaultValue: kind })} · {t('timeline.rebuild', { ms: Math.round(feature.ms) })}
                      </Header>
                      {feature.error || feature.warning ? (
                        <Header className={`px-2 pb-1 text-xs ${feature.error ? 'text-danger' : 'text-warning'}`} data-testid="timeline-problem">
                          {feature.error ?? feature.warning}
                        </Header>
                      ) : null}
                    </MenuSection>
                    <MenuSection>
                      <MenuItem id="roll" className="cursor-default rounded-sm px-2 py-1 text-sm text-text outline-none focus:bg-surface-hover disabled:opacity-50">
                        {t('timeline.rollTo')}
                      </MenuItem>
                      <MenuItem id="suppress" className="cursor-default rounded-sm px-2 py-1 text-sm text-text outline-none focus:bg-surface-hover disabled:opacity-50">
                        {feature.suppressed ? t('timeline.unsuppress') : t('timeline.suppress')}
                      </MenuItem>
                    </MenuSection>
                  </Menu>
                </Popover>
              </MenuTrigger>
              {marker === index + 1 ? <span aria-label={t('timeline.marker')} className="h-control-sm w-hairline shrink-0 bg-accent" data-testid="timeline-marker" /> : null}
            </li>
          );
        })}
      </ol>
      {marker !== null ? (
        <AriaButton
          isDisabled={busy}
          onPress={() => {
            run({ action: 'rollTo', position: 'end' });
          }}
          className="inline-flex h-control-sm shrink-0 items-center gap-1 rounded-md border border-accent px-2 text-xs text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          data-testid="timeline-end"
        >
          <IconPlayerTrackNext className="size-icon-sm" aria-hidden />
          {t('timeline.toEnd')}
        </AriaButton>
      ) : null}
    </section>
  );
}
