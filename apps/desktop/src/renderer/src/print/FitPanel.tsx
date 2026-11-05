import { counterpartOf, cylinderKind, fitDiameter, printedDiameter, type CylinderKind, type FitMaterial } from '@partbuddy/geometry';
import { IconRuler2 } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, RadioButton, RadioField, RadioGroup, TextField, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import { FIT_KINDS, type DimensionProbeResult, type FitKind } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { Button } from '../ui/Button';
import { dimensionOf } from '../viewer/DimensionHud';
import { parseLength } from '../viewer/lengthInput';
import { selectionName, selectionOf } from '../viewer/viewState';

const PROBE_DELAY_MS = 250;
/** Before the print profile is known: no clearance, no allowance. */
const NO_FIT: FitMaterial = { clearance: { clamp: 0, push: 0, slide: 0, turn: 0 }, holeShrink: 0 };

interface Cylinder {
  pick: Extract<Pick, { kind: 'face' }>;
  kind: CylinderKind;
  diameter: number;
}

/** The selected cylindrical faces with their kind and drawn diameter. */
function cylindersOf(bodies: BodyModel[], picks: Pick[]): Cylinder[] {
  return picks.flatMap((pick) => {
    if (pick.kind !== 'face') return [];
    const model = bodies[pick.body]?.model;
    const radius = model?.table.faces[pick.face]?.cylinder?.radius;
    const kind = model ? cylinderKind(model, pick.face) : null;
    return model && radius && kind ? [{ pick, kind, diameter: radius * 2 }] : [];
  });
}

/** What the panel works on: one hole or pin with a counterpart typed in, or a hole and a pin together. */
function setupOf(cylinders: Cylinder[], count: number): { single: Cylinder } | { hole: Cylinder; pin: Cylinder } | null {
  if (count === 1 && cylinders.length === 1 && cylinders[0]) return { single: cylinders[0] };
  if (count !== 2 || cylinders.length !== 2) return null;
  const hole = cylinders.find((cylinder) => cylinder.kind === 'hole');
  const pin = cylinders.find((cylinder) => cylinder.kind === 'pin');
  return hole && pin ? { hole, pin } : null;
}

/**
 * The fit assistant (M7): a hole or pin at the size of its counterpart plus the clearance of the
 * chosen fit and, for holes, the material's hole allowance. Changed directly through the driving
 * parameter where the dimension field finds one, otherwise asked of the assistant with the numbers.
 */
export function FitPanel({ bodies, picks, busy }: { bodies: BodyModel[]; picks: Pick[]; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const print = useStudio((s) => s.print);
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  const setSelectionGhost = useStudio((s) => s.setSelectionGhost);
  const setup = setupOf(cylindersOf(bodies, picks), picks.length);
  // What the hole or pin was drawn for: an 8.65 mm hole with PLA's sliding clearance is for 8 mm.
  const [guess] = useState(() => (setup && 'single' in setup ? counterpartOf(setup.single.kind, setup.single.diameter, print?.material ?? NO_FIT) : null));
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState<FitKind>(guess?.fit ?? 'slide');
  const [change, setChange] = useState<CylinderKind>('hole');
  const [mating, setMating] = useState(() => (guess ? String(guess.mating) : ''));
  const [probe, setProbe] = useState<{ key: string; result: DimensionProbeResult } | null>(null);
  const latest = useRef(0);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  const material = print?.material ?? null;
  const changed = !setup ? null : 'single' in setup ? setup.single : change === 'hole' ? setup.hole : setup.pin;
  const counterpart = !setup || 'single' in setup ? parseLength(mating) : printedDiameter(change === 'hole' ? 'pin' : 'hole', change === 'hole' ? setup.pin.diameter : setup.hole.diameter, material ?? NO_FIT);
  const target = changed && material && Number.isFinite(counterpart) && counterpart > 0 ? fitDiameter(changed.kind, counterpart, fit, material) : null;
  const dimension = changed ? dimensionOf(bodies, changed.pick) : null;
  const value = target === null || !dimension ? null : dimension.shown === 'diameter' ? target : target / 2;
  const key = `${String(value)}:${changed?.pick.face ?? ''}`;
  const needed = open && value !== null && dimension !== null && value > 0 && Math.abs(value - dimension.value) > 1e-6;

  useEffect(() => {
    // `needed` already says there is a dimension and a value (narrowed through the alias).
    if (!needed || busy) return;
    const id = ++latest.current;
    const timer = setTimeout(() => {
      platform()
        .design.probeDimension({ target: dimension.target, current: dimension.value * dimension.scale, value: value * dimension.scale })
        .then((result) => {
          if (latest.current !== id) return;
          setProbe({ key, result });
          setSelectionGhost(result.mode === 'direct' ? result.preview : null);
        })
        .catch(() => {
          if (latest.current === id) setProbe({ key, result: { mode: 'assistant', reason: 'noDriver' } });
        });
    }, PROBE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [needed, dimension, value, busy, key, setSelectionGhost]);
  useEffect(() => {
    if (!open) setSelectionGhost(null);
  }, [open, setSelectionGhost]);

  if (!setup || !material || !changed) return null;
  const result = probe?.key === key ? probe.result : null;
  const selection = selectionOf(model, changed.pick);
  const clearance = material.clearance[fit];

  const apply = () => {
    if (!dimension || value === null || !result || !selection || target === null) return;
    if (result.mode === 'direct') {
      platform()
        .design.applyDimension({ parameter: result.parameter, value: value * dimension.scale, factor: result.factor, label: result.label })
        .then(() => {
          setOpen(false);
        })
        .catch((error: unknown) => {
          setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
        });
      return;
    }
    const request = t(changed.kind === 'hole' ? 'fit.requestHole' : 'fit.requestPin', {
      name: selectionName(selection),
      fit: t(`print.fit.${fit}`),
      mating: number.format(counterpart),
      target: number.format(target),
      clearance: number.format(clearance),
      shrink: number.format(material.holeShrink),
      material: material.name,
    });
    void platform()
      .agent.send(request, [selection])
      .then(() => {
        setOpen(false);
      });
  };

  return (
    <div className="flex w-full flex-col gap-2" data-testid="fit">
      <AriaButton
        className="inline-flex h-control-sm items-center gap-1 self-start rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
        aria-expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
        data-testid="fit-open"
      >
        <IconRuler2 className="size-icon-sm" aria-hidden />
        {t('fit.open')}
      </AriaButton>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2" data-testid="fit-panel">
          <ToggleButtonGroup
            aria-label={t('fit.kind')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[fit]}
            onSelectionChange={(keys) => {
              const [next] = [...keys];
              if (FIT_KINDS.includes(next as FitKind)) setFit(next as FitKind);
            }}
            className="flex flex-wrap gap-1"
          >
            {FIT_KINDS.map((kind) => (
              <ToggleButton
                key={kind}
                id={kind}
                className="inline-flex h-control-sm items-center gap-1 rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover selected:border-accent selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
                data-testid={`fit-${kind}`}
              >
                {t(`print.fit.${kind}`)}
                <span className="tabular-nums text-text-muted">{number.format(material.clearance[kind])}</span>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {'single' in setup ? (
            <TextField value={mating} onChange={setMating} inputMode="decimal" className="flex items-center gap-2" data-testid="fit-mating">
              <Label className="text-xs text-text-muted">{t(setup.single.kind === 'hole' ? 'fit.matingPin' : 'fit.matingHole')}</Label>
              <Input className="h-control-sm w-field-value rounded-md border border-border-strong bg-surface px-2 text-right text-sm tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus" />
              <span className="text-xs text-text-muted">{t('units.mmShort')}</span>
            </TextField>
          ) : (
            <RadioGroup value={change} onChange={(next) => setChange(next as CylinderKind)} aria-label={t('fit.which')} className="flex gap-3 text-xs text-text" data-testid="fit-change">
              {(['hole', 'pin'] as const).map((kind) => (
                <RadioField key={kind} value={kind}>
                  <RadioButton className="group inline-flex items-center gap-1 outline-none">
                    <span aria-hidden className="size-dot rounded-full border border-border-strong group-selected:border-accent group-selected:bg-accent group-focus-visible:outline-2 group-focus-visible:outline-focus" />
                    {t(kind === 'hole' ? 'fit.changeHole' : 'fit.changePin')}
                  </RadioButton>
                </RadioField>
              ))}
            </RadioGroup>
          )}
          {target !== null ? (
            <p className="text-sm tabular-nums text-text" data-testid="fit-target" data-target={target}>
              {t(changed.kind === 'hole' ? 'fit.targetHole' : material.outerGrowth !== 0 ? 'fit.targetPinGrowth' : 'fit.targetPin', {
                growth: number.format(material.outerGrowth),
                target: number.format(target),
                mating: number.format(counterpart),
                clearance: number.format(clearance),
                shrink: number.format(material.holeShrink),
                material: material.name,
              })}
            </p>
          ) : (
            <p className="text-xs text-danger">{t('hud.invalid')}</p>
          )}
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-text-muted" role="status" data-testid="fit-status" data-mode={!needed ? 'same' : (result?.mode ?? 'probing')}>
              {!needed ? t('fit.already') : !result ? t('hud.probing') : result.mode === 'direct' ? t('fit.direct', { label: result.label }) : t('fit.viaAssistant')}
            </p>
            <Button variant="primary" isDisabled={!needed || !result || busy} onPress={apply} data-testid="fit-apply">
              {result?.mode === 'assistant' ? t('fit.ask') : t('fit.apply')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
