import { withinTurn, type PrintFinding, type PrintStatus } from '@partbuddy/geometry';
import { IconCrosshair, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';

import { useStudio, type Unmeasured } from '../state/store';
import { popoverPanelClass } from '../ui/Overlay';
import { dotTone } from '../ui/Feedback';
import { checkNow, lateOn, PENDING_SHOWN_MS } from './report';

const DOT: Record<PrintStatus, string> = { ready: dotTone.success, warn: dotTone.warning, block: dotTone.danger };

const severityDot = (finding: PrintFinding) => DOT[finding.severity];

/** One finding in words, with the numbers that matter. */
export function useFindingText(): (finding: PrintFinding) => string {
  const { t, i18n } = useTranslation();
  const nozzle = useStudio((s) => s.print?.printer.nozzle ?? 0.4);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const amount = (value: number, unit: 'deg' | 'mm') => `${number.format(value)}${unit === 'deg' ? '°' : ' mm'}`;
  // Gaps to the thousandth, like the fits of the print profile: a push fit of 0.075 mm does not read 0.08.
  const gap = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 });
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
      case 'wallLines':
        return t('check.finding.wallLines', { thickness: number.format(finding.thickness), line: number.format(finding.line), low: number.format(finding.better[0]), high: number.format(finding.better[1]) });
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
      case 'faceLost':
        return t('check.finding.faceLost', { count: finding.bodies.length, bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'separate':
        return t('check.finding.separate', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'fused':
        return t('check.finding.fused', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'feature':
        return t('check.finding.feature', { feature: finding.feature, message: finding.message });
      case 'overlap':
        return t('check.finding.overlap', { a: finding.bodies[0], b: finding.bodies[1], volume: number.format(finding.volume) });
      case 'tight':
        return t(finding.inPlace ? 'check.finding.tightInPlace' : 'check.finding.tight', { a: finding.bodies[0], b: finding.bodies[1], gap: gap.format(finding.gap), minimum: gap.format(finding.minimum) });
      case 'blocked':
        return t(finding.free ? 'check.finding.blockedFree' : 'check.finding.blocked', { joint: finding.joint, a: finding.bodies[0], b: finding.bodies[1], at: amount(finding.free && finding.unit === 'deg' ? withinTurn(finding.at) : finding.at, finding.unit), limit: amount(finding.limit, finding.unit) });
      case 'leftOut':
        return t(finding.rolledBack ? 'check.finding.rolledBack' : 'check.finding.suppressed', { count: finding.features.length, features: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.features.slice(0, 3)), more: Math.max(0, finding.features.length - 3) });
      case 'posed':
        return t('check.finding.posed', { joint: finding.joint, value: amount(finding.value, finding.unit) });
    }
  };
}

/**
 * What the check could not do, as sentences: the measures SolidCraft left out in one, a view that could not read the
 * newest state and a check that broke off each in its own. `confirm`: worded for the question before an export.
 */
export function useLackingLines(): (unmeasured: readonly Unmeasured[], confirm?: boolean) => string[] {
  const { t, i18n } = useTranslation();
  return (unmeasured, confirm = false) => {
    const measures = unmeasured.filter((what) => what === 'clearance' || what === 'joints');
    const what = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(measures.map((measure) => t(`check.measure.${measure}`)));
    const own = unmeasured.filter((item) => item === 'mirror' || item === 'check').map((item) => t(`check.lacking.${item}`));
    return [...(measures.length > 0 ? [t(confirm ? 'check.confirm.unmeasured' : 'check.unmeasured', { what })] : []), ...own];
  };
}

/** Bodies by name, five at most and how many more. */
function useBodyList(): (bodies: readonly string[]) => string {
  const { t, i18n } = useTranslation();
  return (bodies) => {
    const names = bodies.slice(0, 5);
    const rest = bodies.length - names.length;
    return new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(rest > 0 ? [...names, t('check.more', { count: rest })] : names);
  };
}

/** `on` once it held for {@link PENDING_SHOWN_MS}; false at once when it ends. */
function useLate(on: boolean): boolean {
  const [late, setLate] = useState(false);
  const [follow] = useState(() => lateOn(PENDING_SHOWN_MS, setLate));
  useEffect(() => {
    follow(on);
  }, [follow, on]);
  useEffect(
    () => () => {
      follow(false);
    },
    [follow],
  );
  return on && late;
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
  const { t } = useTranslation();
  // A light of another revision or project counts as still measuring (audit X-1).
  const check = checkNow(
    useStudio((s) => s.printCheck),
    useStudio((s) => s.model),
    useStudio((s) => s.connection),
  );
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  const lacking = useLackingLines()(check?.unmeasured ?? []);
  const bodyList = useBodyList();
  // "Checking" shows only when it lasts; the export asks all the same (review of #367).
  const checking = useLate(check?.measuring === true);
  const status = check?.result.status ?? 'ready';
  const findings = check?.result.findings ?? [];
  // Green only once all is measured (audit X-1): until then, or when a measure failed, the light says so.
  const open = status !== 'ready' ? null : checking ? 'measuring' : lacking.length > 0 ? 'unmeasured' : null;
  const label = open ? t(`check.status.${open}`) : t(`check.status.${status}`, { count: findings.length });
  // Read out are the states it ends in, not "checking" after every step.
  const [said, setSaid] = useState('');
  if (check && !check.measuring && said !== label) setSaid(label);
  if (!check) return null;
  const dot = open === 'measuring' ? dotTone.neutral : open === 'unmeasured' ? dotTone.warning : DOT[status];

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
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
          <span className="inline-flex items-center gap-1">
            <span>{label}</span>
            {checking ? (
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
              <p className="px-2 text-sm text-text-muted">{t(check.measuring || lacking.length > 0 ? 'check.noneSoFar' : 'check.none')}</p>
            ) : (
              <ul className="flex max-h-menu-max flex-col gap-0 overflow-auto">
                {findings.map((finding, i) => (
                  <FindingRow key={`${finding.kind}-${String(i)}`} finding={finding} />
                ))}
              </ul>
            )}
            {check.measuring ? <p className="px-2 text-sm text-text-muted" data-testid="print-check-measuring">{t('check.measuring')}</p> : null}
            {lacking.length > 0 ? (
              <div className="flex flex-col gap-2" data-testid="print-check-unmeasured">
                {lacking.map((line) => (
                  <p key={line} className="px-2 text-sm text-text-muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {check.unchecked && check.unchecked.length > 0 ? (
              <p className="px-2 text-sm text-text-muted" data-testid="print-check-unchecked">
                {t('check.unchecked', { bodies: bodyList(check.unchecked) })}
              </p>
            ) : null}
            <p className="px-2 text-xs text-text-muted">{t('check.basis')}</p>
          </Dialog>
        </Popover>
      </DialogTrigger>
    </>
  );
}
