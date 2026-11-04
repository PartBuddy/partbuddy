import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import { useEffect, useRef, type FunctionComponent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DockviewApi } from 'dockview-react';

import { ChatPanel } from '../panels/ChatPanel';
import { ChecksPanel } from '../panels/ChecksPanel';
import { NotesPanel } from '../panels/NotesPanel';
import { ParametersPanel } from '../panels/ParametersPanel';
import { ProjectsPanel } from '../panels/ProjectsPanel';
import { TimelinePanel } from '../panels/TimelinePanel';
import { useReadyModel } from '../viewer/ModelContext';
import { Viewer } from '../viewer/Viewer';

function Checks() {
  return <ChecksPanel model={useReadyModel()} />;
}

const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  viewer: Viewer,
  projects: ProjectsPanel,
  timeline: TimelinePanel,
  parameters: ParametersPanel,
  notes: NotesPanel,
  checks: Checks,
  chat: ChatPanel,
};

const panelIds = Object.keys(components);

/** Panels stay docked; tabs without a nested close button keep the tab list accessible. */
function PanelTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />;
}

/** Dockable panel layout (dockview). Titles follow the UI language. */
export function Workspace() {
  const { t, i18n } = useTranslation();
  const api = useRef<DockviewApi | null>(null);

  useEffect(() => {
    for (const id of panelIds) {
      api.current?.getPanel(id)?.api.setTitle(t(`panels.${id}`));
    }
  }, [t, i18n.language]);

  const onReady = (event: DockviewReadyEvent) => {
    api.current = event.api;
    const add = (id: string, position?: Parameters<DockviewApi['addPanel']>[0]['position'], size?: number) =>
      event.api.addPanel({
        id,
        component: id,
        title: t(`panels.${id}`),
        ...(position ? { position } : {}),
        ...(size ? { initialWidth: size } : {}),
      });
    add('viewer');
    add('projects', { referencePanel: 'viewer', direction: 'left' }, 280);
    add('timeline', { referencePanel: 'projects', direction: 'below' });
    add('chat', { referencePanel: 'viewer', direction: 'right' }, 400);
    add('parameters', { referencePanel: 'viewer', direction: 'below' });
    add('notes', { referencePanel: 'parameters', direction: 'within' });
    add('checks', { referencePanel: 'parameters', direction: 'within' });
    event.api.getPanel('parameters')?.api.setActive();
    event.api.getPanel('viewer')?.group.api.setSize({ height: 560 });
    event.api.getPanel('projects')?.group.api.setSize({ height: 260 });
  };

  return (
    <DockviewReact
      className="cs-dock dockview-theme-light h-full w-full"
      components={components}
      onReady={onReady}
      defaultTabComponent={PanelTab}
      disableFloatingGroups
      hideBorders
    />
  );
}
