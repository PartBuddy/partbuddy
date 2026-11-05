import type { PrintFinding, PrintStatus } from '@partbuddy/geometry';
import { IconCrosshair, IconTool } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';

import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { fixFor } from './fixes';
import { OrientationSection } from './OrientationSection';

const DOT: Record<PrintStatus | 'info', string> = {
  ready: 'bg-success',
  warn: 'bg-warning',
  block: 'bg-danger',
  info: 'bg-info',
};

/** The text of a support finding by its cause (M7f). */
const SUPPORT_TEXT = { fillet: 'supportFillet', hole: 'supportHole', counterbore: 'supportCounterbore', other: 'support' } as const;

const severityDot = (finding: PrintFinding) => DOT[finding.severity === 'block' ? 'block' : finding.severity === 'warn' ? 'warn' : 'info'];

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
      case 'support':
        return t(`check.finding.${finding.ribs ? 'supportRibs' : SUPPORT_TEXT[finding.cause]}`, {
          area: number.format(finding.area),
          limit: finding.limit,
        });
      case 'contact':
        return t('check.finding.contact', { area: number.format(finding.area) });
      case 'separate':
        return t('check.finding.separate', { bodies: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(finding.bodies) });
      case 'feature':
        return t('check.finding.feature', { feature: finding.feature, message: finding.message });
    }
  };
}

type FixState = { step: 'idle' } | { step: 'trying' } | { step: 'ready' } | { step: 'failed'; error: string };

/**
 * The fix of a support finding (M7f step 2, decided 2026-11-05): tried on press with the result as
 * a ghost on the part, applied on "Apply"; what SolidCraft refuses goes to the assistant on request.
 */
function FixControl({ finding }: { finding: Extract<PrintFinding, { kind: 'support' }> }) {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const print = useStudio((s) => s.print);
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  const setSelectionGhost = useStudio((s) => s.setSelectionGhost);
  const setNotice = useStudio((s) => s.setNotice);
  const [state, setState] = useState<FixState>({ step: 'idle' });
  // The ghost goes with the panel.
  useEffect(
    () => () => {
      setSelectionGhost(null);
    },
    [setSelectionGhost],
  );
  const fix =
    model.status === 'ready' && print
      ? fixFor(finding, model.bodies, print.orientation.down, { layer: print.printer.layer, overhang: print.material.overhang })
      : null;
  if (!fix) return null;
  const kind = fix.fix;
  const count = fix.fix === 'roof' ? fix.roofs.length : fix.fix === 'bridge' ? fix.bridges.length : fix.fix === 'ribs' ? fix.ribs.length : fix.fillets.length;

  const tryIt = () => {
    setState({ step: 'trying' });
    platform()
      .print.previewFix(fix)
      .then((result) => {
        if (result.ok) {
          setSelectionGhost(result.preview);
          setState({ step: 'ready' });
        } else {
          setState({ step: 'failed', error: result.error });
        }
      })
      .catch((error: unknown) => {
        setState({ step: 'failed', error: (error as Error).message.slice(0, 200) });
      });
  };
  const cancel = () => {
    setSelectionGhost(null);
    setState({ step: 'idle' });
  };
  const apply = () => {
    setSelectionGhost(null);
    setState({ step: 'idle' });
    platform()
      .print.applyFix(fix)
      .then(() => {
        setNotice({ tone: 'success', text: t(`fix.done.${kind}`, { count }) });
      })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('fix.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  const ask = () => {
    const faces = finding.places.flatMap((place) => place.faces).slice(0, 12).join(', ');
    setState({ step: 'idle' });
    void platform().agent.send(t(`fix.request.${kind}`, { faces, limit: finding.limit }));
  };

  return (
    <div className="flex flex-col gap-1 pb-1 pl-6 pr-2" data-testid="fix" data-fix={kind} data-step={state.step}>
      {state.step === 'ready' ? (
        <>
          <p className="text-xs text-text-muted" role="status">
            {t(`fix.preview.${kind}`)}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onPress={apply} isDisabled={busy} data-testid="fix-apply">
              {t('fix.apply')}
            </Button>
            <Button onPress={cancel} data-testid="fix-cancel">
              {t('fix.cancel')}
            </Button>
          </div>
        </>
      ) : state.step === 'failed' ? (
        <>
          <p className="text-xs text-danger" role="alert">
            {t('fix.refused', { detail: state.error })}
          </p>
          <div className="flex gap-2">
            <Button onPress={ask} isDisabled={busy} data-testid="fix-ask">
              {t('fix.ask')}
            </Button>
            <Button onPress={cancel} data-testid="fix-cancel">
              {t('fix.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <Button onPress={tryIt} isDisabled={busy || state.step === 'trying'} data-testid="fix-try">
          <IconTool className="size-icon-sm" aria-hidden />
          {t(state.step === 'trying' ? 'fix.trying' : `fix.try.${kind}`, { count })}
        </Button>
      )}
    </div>
  );
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
        {located ? <span className="text-xs text-text-muted">{t('check.faces', { count: faces })}</span> : null}
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
      {finding.kind === 'support' ? <FixControl finding={finding} /> : null}
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
  const counted = findings.filter((finding) => finding.severity !== 'info').length;
  const label = t(`check.status.${status}`, { count: counted });

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
          <OrientationSection />
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
