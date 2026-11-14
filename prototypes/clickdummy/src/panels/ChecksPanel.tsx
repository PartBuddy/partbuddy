import { IconPrinter, IconSettings } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { deriveEdges, meshMetrics } from '@partbuddy/geometry';
import type { ModelState } from '../viewer/useModel';
import { overhangFindings } from './overhangFindings';
import { useStudio } from '../state/store';
import { Badge, VerificationBadges, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Banner, Busy, EmptyState } from '../ui/Feedback';

function CheckRow({
  title,
  tone,
  status,
  source,
  children,
}: {
  title: string;
  tone: Tone;
  status: string;
  source: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-md font-medium text-text">{title}</span>
        <Badge tone={tone}>{status}</Badge>
      </div>
      {children ? <div className="text-sm text-text-muted">{children}</div> : null}
      <span className="text-xs text-text-subtle">{source}</span>
    </li>
  );
}

export function ChecksPanel({ state }: { state: ModelState }) {
  const { t, i18n } = useTranslation();
  const partLevels = useStudio((s) => s.partLevels);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });

  if (state.status === 'error') {
    return <EmptyState title={t('viewer.errorTitle')} body={t('checks.noModel')} />;
  }
  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Busy label={t('viewer.loading')} />
      </div>
    );
  }
  const { model } = state;

  const metrics = meshMetrics(model.mesh);
  const { openEdges } = deriveEdges(model.mesh);
  const overhangs = overhangFindings(model.mesh, 60);
  const changed = !partLevels.includes('TG');

  return (
    <div className="flex h-full flex-col overflow-auto">
      <section className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold text-text">{t('checks.verification')}</h3>
          <VerificationBadges levels={partLevels} />
        </div>
        <p className="text-sm text-text-muted">{changed ? t('checks.levelsReset') : t('checks.levelsExplained')}</p>
      </section>
      <ul aria-label={t('checks.list')}>
        <CheckRow
          title={t('checks.mesh')}
          tone={openEdges === 0 ? 'success' : 'danger'}
          status={openEdges === 0 ? t('checks.closed') : t('checks.open', { count: openEdges })}
          source={t('checks.sourceComputed')}
        >
          {t('checks.meshDetail', {
            triangles: number.format(metrics.triangles),
            volume: number.format(metrics.volumeMm3),
            faces: model.mesh.faceCount,
          })}
        </CheckRow>
        <CheckRow
          title={t('checks.overhang')}
          tone={overhangs.length === 0 ? 'success' : 'warning'}
          status={overhangs.length === 0 ? t('checks.noFindings') : t('checks.findings', { count: overhangs.length })}
          source={t('checks.sourceComputed')}
        >
          {t('checks.overhangDetail', { limit: 60 })}
        </CheckRow>
        <CheckRow
          title={t('checks.timeline')}
          tone={changed ? 'neutral' : 'success'}
          status={changed ? t('checks.notRun') : t('checks.noFindings')}
          source={t('checks.sourceMock')}
        />
      </ul>
      <section className="flex flex-col gap-2 px-3 py-3">
        <h3 className="flex items-center gap-2 text-md font-semibold text-text">
          <IconPrinter className="size-icon text-text-muted" aria-hidden />
          {t('print.title')}
        </h3>
        <Banner tone="info" title={t('print.noProfileTitle')}>
          {t('print.noProfileBody')}
        </Banner>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <IconSettings className="size-icon-sm" aria-hidden />
            {t('print.setUpPrinter')}
          </Button>
          <Button size="sm" variant="primary" isDisabled>
            {t('print.createPackage')}
          </Button>
        </div>
        <p className="text-xs text-text-subtle">{t('print.gateExplained')}</p>
      </section>
    </div>
  );
}
