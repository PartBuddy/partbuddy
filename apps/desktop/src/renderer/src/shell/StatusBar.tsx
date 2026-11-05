import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialMenu } from '../print/MaterialMenu';
import { PrintCheckChip } from '../print/PrintCheckChip';
import { useStudio } from '../state/store';
import { selectionName, selectionOf } from '../viewer/viewState';

export function StatusBar() {
  const { t, i18n } = useTranslation();
  const model = useStudio((s) => s.model);
  const selection = useStudio((s) => s.selection);
  const hover = useStudio((s) => s.hover);
  const latency = useStudio((s) => s.latency);
  const notice = useStudio((s) => s.notice);
  const setNotice = useStudio((s) => s.setNotice);
  // A success fades after a few seconds; an error stays until the next action.
  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 6000);
    return () => {
      clearTimeout(timer);
    };
  }, [notice, setNotice]);
  const number = new Intl.NumberFormat(i18n.language);
  const focus = hover ?? selection;
  const bodies = model.status === 'ready' ? model.bodies : [];
  const sketches = model.status === 'ready' ? model.sketches : [];
  const editing = sketches.find((sketch) => sketch.active);
  const focused = selectionOf(model, focus);
  const focusName = focused ? selectionName(focused) : undefined;
  const faces = bodies.reduce((sum, body) => sum + body.model.table.faces.length, 0);
  const triangles = bodies.reduce((sum, body) => sum + body.model.triangleFaces.length, 0);

  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-xs text-text-muted">
      <span>{t('status.units')}</span>
      <MaterialMenu />
      <PrintCheckChip />
      {bodies.length > 0 ? (
        <span
          data-testid="mesh-summary"
          data-revision={model.status === 'ready' ? model.revision : undefined}
          title={t('status.details', { triangles: number.format(triangles), ms: latency ? latency.mirrorMs + latency.parseMs : 0 })}
        >
          {t('status.mesh', { bodies: bodies.length, faces })}
        </span>
      ) : null}
      {sketches.length > 0 ? (
        <span data-testid="sketch-summary">
          {editing
            ? t('status.sketchesEditing', { count: sketches.length, name: editing.name })
            : t('status.sketches', { count: sketches.length })}
        </span>
      ) : null}
      {focusName ? (
        <span className="tabular-nums" data-testid="focus-name">
          {focusName}
        </span>
      ) : (
        // The hint how to select and move the view lives here, not on top of the part.
        <span className="truncate" data-testid="view-hint">{t('viewer.hint')}</span>
      )}
      <span role="status" className={`ml-auto truncate ${notice?.tone === 'danger' ? 'text-danger' : 'text-text'}`} data-testid="notice">
        {notice?.text}
      </span>
    </footer>
  );
}
