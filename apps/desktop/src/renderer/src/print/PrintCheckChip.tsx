import type { PrintFinding, PrintStatus } from '@partbuddy/geometry';
import { IconCrosshair } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';

import { useStudio } from '../state/store';

const DOT: Record<PrintStatus, string> = {
  ready: 'bg-success',
  warn: 'bg-warning',
  block: 'bg-danger',
};

const severityDot = (finding: PrintFinding) => DOT[finding.severity];

/** One finding in words, with the numbers that matter. */
export function useFindingText(): (finding: PrintFinding) => string {
  const { t, i18n } = useTranslation();
  const nozzle = useStudio((s) => s.print?.printer.nozzle ?? 0.4);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  return (finding) => {
    switch (finding.kind) {
      case 'size':
        return t(finding.lying ? 'check.finding.sizeLying' : 'check.finding.size', {
          size: finding.size.map((value) => number.format(value)).join(' × '),
          bed: finding.bed.map((value) => number.format(value)).join(' × '),
        });
      case 'thinWall':
        return finding.severity === 'block'
          ? t('check.finding.wallTooThin', { thickness: number.format(finding.thickness), nozzle: number.format(nozzle) })
          : t('check.finding.wallThin', { thickness: number.format(finding.thickness), minimum: number.format(finding.minimum) });
      case 'overhang':
        return t('check.finding.overhang', { area: number.format(finding.area), limit: finding.limit });
      case 'contact':
        return t('check.finding.contact', { area: number.format(finding.area) });
      case 'separate':
        return t('check.finding.separate', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'feature':
        return t('check.finding.feature', { feature: finding.feature, message: finding.message });
      case 'overlap':
        return t('check.finding.overlap', { a: finding.bodies[0], b: finding.bodies[1], volume: number.format(finding.volume) });
      case 'tight':
        return t('check.finding.tight', { a: finding.bodies[0], b: finding.bodies[1], gap: number.format(finding.gap), minimum: number.format(finding.minimum) });
    }
  };
}

function FindingRow({ finding }: { finding: PrintFinding }) {
  const { t } = useTranslation();
  const text = useFindingText();
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  const requestFocus = useStudio((s) => s.requestFocus);
  const located = 'places' in finding ? finding : null;
  const faces = located ? located.places.reduce((sum, place) => sum + place.faces.length, 0) : 0;
  const body = (
    <>
      <span aria-hidden className={`mt-1 size-dot shrink-0 rounded-full ${severityDot(finding)}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0 text-left">
        <span className="text-sm text-text">{text(finding)}</span>
        {faces > 0 ? <span className="text-xs text-text-muted">{t('check.faces', { count: faces })}</span> : null}
      </span>
    </>
  );
  if (!located?.box) {
    return (
      <li className="flex items-start gap-2 rounded-sm px-2 py-1" data-testid="check-finding" data-kind={finding.kind} data-severity={finding.severity}>
        {body}
      </li>
    );
  }
  const box = located.box;
  const highlight = () => {
    setStepHighlight(located.places);
  };
  const clear = () => {
    setStepHighlight(null);
  };
  return (
    <li data-testid="check-finding" data-kind={finding.kind} data-severity={finding.severity}>
      <AriaButton
        aria-label={`${text(finding)}. ${t('check.show')}`}
        onHoverStart={highlight}
        onHoverEnd={clear}
        onFocus={highlight}
        onBlur={clear}
        onPress={() => {
          setStepHighlight(located.places);
          requestFocus(box);
        }}
        className="group flex w-full items-start gap-2 rounded-sm px-2 py-1 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus pressed:bg-surface-selected"
      >
        {body}
        <IconCrosshair className="mt-0 size-icon-sm shrink-0 text-text-muted group-hover:text-text" aria-hidden />
      </AriaButton>
    </li>
  );
}

/**
 * The ready-to-print light in the status bar (M7, ADR 0010): green, yellow or red after every
 * revision, and on a click the findings, each one pointing at its place on the model.
 */
export function PrintCheckChip() {
  const { t } = useTranslation();
  const check = useStudio((s) => s.printCheck);
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  if (!check) return null;
  const { status, findings } = check.result;
  const label = t(`check.status.${status}`, { count: findings.length });

  return (
    <DialogTrigger
      onOpenChange={(open) => {
        if (!open) setStepHighlight(null);
      }}
    >
      <AriaButton
        className="inline-flex h-full items-center gap-1 rounded-sm px-1 text-xs text-text-muted outline-none hover:bg-surface-hover hover:text-text pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
        data-testid="print-check"
        data-status={status}
        data-revision={check.revision}
      >
        <span aria-hidden className={`size-dot rounded-full ${DOT[status]}`} />
        <span>{label}</span>
      </AriaButton>
      <Popover placement="top start" offset={4} className="w-dialog-sm max-w-full rounded-md border border-border bg-surface-raised p-2 shadow-2">
        <Dialog className="flex flex-col gap-2 outline-none" data-testid="print-check-panel">
          <Heading slot="title" className="px-2 text-sm font-semibold text-text">
            {t('check.title')}
          </Heading>
          {findings.length === 0 ? (
            <p className="px-2 text-sm text-text-muted">{t('check.none')}</p>
          ) : (
            <ul className="flex max-h-menu-max flex-col gap-0 overflow-auto">
              {findings.map((finding, i) => (
                <FindingRow key={`${finding.kind}-${String(i)}`} finding={finding} />
              ))}
            </ul>
          )}
          <p className="px-2 text-xs text-text-muted">{t('check.basis')}</p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
