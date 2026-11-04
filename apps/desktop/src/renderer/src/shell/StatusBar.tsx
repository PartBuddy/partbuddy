import { useTranslation } from 'react-i18next';

import { useStudio } from '../state/store';

export function StatusBar() {
  const { t, i18n } = useTranslation();
  const model = useStudio((s) => s.model);
  const selection = useStudio((s) => s.selection);
  const hover = useStudio((s) => s.hover);
  const latency = useStudio((s) => s.latency);
  const number = new Intl.NumberFormat(i18n.language);
  const focus = hover ?? selection;
  const bodies = model.status === 'ready' ? model.bodies : [];
  const faceName = focus ? bodies[focus.body]?.model.table.faces[focus.face]?.name : undefined;
  const faces = bodies.reduce((sum, body) => sum + body.model.table.faces.length, 0);
  const triangles = bodies.reduce((sum, body) => sum + body.model.triangleFaces.length, 0);

  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-xs text-text-muted">
      <span>{t('status.units')}</span>
      {bodies.length > 0 ? (
        <span data-testid="mesh-summary" data-revision={model.status === 'ready' ? model.revision : undefined}>
          {t('status.mesh', { bodies: bodies.length, faces, triangles: number.format(triangles) })}
        </span>
      ) : null}
      {latency ? (
        <span data-testid="mirror-latency">{t('status.latency', { ms: latency.mirrorMs + latency.parseMs })}</span>
      ) : null}
      {faceName ? <span className="font-mono">{faceName}</span> : <span>{t('status.noFace')}</span>}
    </footer>
  );
}
