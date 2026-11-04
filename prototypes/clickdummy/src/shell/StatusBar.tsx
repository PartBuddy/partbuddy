import { useTranslation } from 'react-i18next';

import { useStudio } from '../state/store';
import { useReadyModel } from '../viewer/ModelContext';

export function StatusBar() {
  const { t, i18n } = useTranslation();
  const model = useReadyModel();
  const selection = useStudio((s) => s.selection);
  const hoverFace = useStudio((s) => s.hoverFace);
  const number = new Intl.NumberFormat(i18n.language);
  const focusFace = hoverFace ?? selection?.face ?? null;
  const faceName = focusFace !== null && model ? model.table.faces[focusFace]?.name : undefined;

  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-xs text-text-muted">
      <span>{t('status.units')}</span>
      {model ? (
        <span>
          {t('status.mesh', { faces: model.mesh.faceCount, triangles: number.format(model.mesh.indices.length / 3) })}
        </span>
      ) : null}
      {faceName ? <span className="font-mono">{faceName}</span> : <span>{t('status.noFace')}</span>}
      <span className="ml-auto">{t('status.mock')}</span>
    </footer>
  );
}
