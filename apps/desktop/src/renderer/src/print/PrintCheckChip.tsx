import type { PrintFinding, PrintStatus } from '@partbuddy/geometry';
import { IconCrosshair, IconLoader2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';

import { useStudio } from '../state/store';
import { popoverPanelClass } from '../ui/Overlay';
import { dotTone } from '../ui/Feedback';
import { checkNow } from './report';

const DOT: Record<PrintStatus, string> = { ready: dotTone.success, warn: dotTone.warning, block: dotTone.danger };

const severityDot = (finding: PrintFinding) => DOT[finding.severity];

/** One finding in words, with the numbers that matter. */
export function useFindingText(): (finding: PrintFinding) => string {
  const { t, i18n } = useTranslation();
  const nozzle = useStudio((s) => s.print?.printer.nozzle ?? 0.4);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const amount = (value: number, unit: 'deg' | 'mm') => `${number.format(value)}${unit === 'deg' ? '°' : ' mm'}`;
  return (finding) => {
    switch (finding.kind) {
      case 'size':
        return t(finding.lying ? 'check.finding.sizeLying' : 'check.finding.size', {
          body: finding.body,
          size: finding.size.map((value) => number.format(value)).join(' × '),
          bed: finding.bed.map((value) => number.format(value)).join(' × '),
        });
      case 'thinWall':
        if (finding.floor) return t(finding.severity === 'block' ? 'check.finding.floorTooThin' : 'check.finding.floorThin', { thickness: number.format(finding.thickness), minimum: number.format(finding.minimum), layers: finding.layers === undefined ? 'none' : number.format(finding.layers) });
        return finding.severity === 'block'
          ? t('check.finding.wallTooThin', { thickness: number.format(finding.thickness), nozzle: number.format(nozzle) })
          : t('check.finding.wallThin', { thickness: number.format(finding.thickness), minimum: number.format(finding.minimum) });
      case 'overhang':
        return t('check.finding.overhang', { area: number.format(finding.area), limit: finding.limit });
      case 'contact':
      {
        // Three names, and how many more: fifty pins do not fit a line.
        const names = finding.places.slice(0, 3).map((place) => place.body);
        const rest = finding.bodies - names.length;
        const bodies = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(rest > 0 ? [...names, t('check.more', { count: rest })] : names);
        return t('check.finding.contact', { count: finding.bodies, area: number.format(finding.area), bodies });
      }
      case 'open':
        return t('check.finding.open', { count: finding.bodies.length, bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'separate':
        return t('check.finding.separate', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'fused':
        return t('check.finding.fused', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'feature':
        return t('check.finding.feature', { feature: finding.feature, message: finding.message });
      case 'overlap':
        return t('check.finding.overlap', { a: finding.bodies[0], b: finding.bodies[1], volume: number.format(finding.volume) });
      case 'tight':
        return t('check.finding.tight', { a: finding.bodies[0], b: finding.bodies[1], gap: number.format(finding.gap), minimum: number.format(finding.minimum) });
      case 'blocked':
        return t('check.finding.blocked', { joint: finding.joint, a: finding.bodies[0], b: finding.bodies[1], at: amount(finding.at, finding.unit), limit: amount(finding.limit, finding.unit) });
      case 'posed':
        return t('check.finding.posed', { joint: finding.joint, value: amount(finding.value, finding.unit) });
    }
  };
}

/** What SolidCraft did not measure, in words; empty when it measured all. */
export function useUnmeasuredText(): (unmeasured: readonly ('clearance' | 'joints')[]) => string {
  const { t, i18n } = useTranslation();
  return (unmeasured) => new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(unmeasured.map((what) => t(`check.measure.${what}`)));
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
        className="group flex w-full items-start gap-2 rounded-sm px-2 py-1 outline-none hover:bg-surface-hover focus-visible:focus-ring pressed:bg-surface-pressed"
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
  const { t, i18n } = useTranslation();
  // A light of another revision or project counts as still measuring (audit X-1).
  const check = checkNow(
    useStudio((s) => s.printCheck),
    useStudio((s) => s.model),
  );
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  const unmeasured = useUnmeasuredText()(check?.unmeasured ?? []);
  if (!check) return null;
  const { status, findings } = check.result;
  // Green only once all is measured (audit X-1): until then, or when a measure failed, the light says so.
  const open = status !== 'ready' ? null : check.measuring ? 'measuring' : unmeasured ? 'unmeasured' : null;
  const label = open ? t(`check.status.${open}`) : t(`check.status.${status}`, { count: findings.length });
  const dot = open === 'measuring' ? dotTone.neutral : open === 'unmeasured' ? dotTone.warning : DOT[status];

  return (
    <DialogTrigger
      onOpenChange={(open) => {
        if (!open) setStepHighlight(null);
      }}
    >
      <AriaButton
        className="inline-flex h-full items-center gap-1 rounded-sm px-1 text-xs text-text-muted outline-none hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed focus-visible:focus-ring"
        data-testid="print-check"
        data-status={status}
        data-revision={check.revision}
        data-measuring={check.measuring ? 'true' : undefined}
        data-unmeasured={check.unmeasured?.join(' ')}
      >
        <span aria-hidden className={`size-dot rounded-full ${dot}`} />
        <span aria-live="polite" className="inline-flex items-center gap-1">
          <span>{label}</span>
          {check.measuring ? (
            open === 'measuring' ? (
              <IconLoader2 className="size-icon-sm animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <IconLoader2 className="size-icon-sm animate-spin motion-reduce:animate-none" role="img" aria-label={t('check.status.measuring')} />
            )
          ) : null}
        </span>
      </AriaButton>
      <Popover placement="top start" offset={4} className={`${popoverPanelClass} p-2`}>
        <Dialog className="flex flex-col gap-2 outline-none" data-testid="print-check-panel">
          <Heading slot="title" className="px-2 text-sm font-semibold text-text">
            {t('check.title')}
          </Heading>
          {findings.length === 0 ? (
            <p className="px-2 text-sm text-text-muted">{t(check.measuring || unmeasured ? 'check.noneSoFar' : 'check.none')}</p>
          ) : (
            <ul className="flex max-h-menu-max flex-col gap-0 overflow-auto">
              {findings.map((finding, i) => (
                <FindingRow key={`${finding.kind}-${String(i)}`} finding={finding} />
              ))}
            </ul>
          )}
          {check.measuring ? <p className="px-2 text-sm text-text-muted" data-testid="print-check-measuring">{t('check.measuring')}</p> : null}
          {unmeasured ? <p className="px-2 text-sm text-text-muted" data-testid="print-check-unmeasured">{t('check.unmeasured', { what: unmeasured })}</p> : null}
          {check.unchecked && check.unchecked.length > 0 ? (
            <p className="px-2 text-sm text-text-muted" data-testid="print-check-unchecked">
              {t('check.unchecked', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(check.unchecked) })}
            </p>
          ) : null}
          <p className="px-2 text-xs text-text-muted">{t('check.basis')}</p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
