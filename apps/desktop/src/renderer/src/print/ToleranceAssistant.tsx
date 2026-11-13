import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heading, Label, NumberField } from 'react-aria-components';

import { FIT_KINDS, layerFitsNozzle, type FitKind, type MaterialProfile, type PrinterProfile, type Slicer } from '../../../shared/contract';
import { applyReadings, FIT_STEPS, HOLE_SIZES, OVERHANG_STEPS, type ToleranceReadings } from '../../../shared/tolerances';
import { platform } from '../platform';
import { Button } from '../ui/Button';
import { SelectField } from '../ui/Choice';
import { fieldLabelClass, UnitInput } from '../ui/Field';

const STEPS = ['material', 'pieces', 'results', 'preview'] as const;
type Step = (typeof STEPS)[number];
const NONE = 'none';

/**
 * »Measure tolerances« (decided 2026-11-08): test pieces from SolidCraft for the printer in use, a
 * short print guide, the readings and a before/after preview. Applying writes the material into
 * the material like any change. Only the material's design values change, never slicer settings.
 * It takes the place of the profiles in the settings instead of a second dialog above them (audit
 * N-05); Escape and "Back to materials" return there.
 */
export function ToleranceAssistant({
  materials,
  material: initial,
  printer,
  onApply,
  onClose,
}: {
  materials: MaterialProfile[];
  material: string;
  printer: PrinterProfile;
  onApply: (material: MaterialProfile) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(0);
  const [materialId, setMaterialId] = useState(initial);
  const [readings, setReadings] = useState<ToleranceReadings>({ fits: {}, holes: HOLE_SIZES.map(() => null), overhang: null });
  const [picture, setPicture] = useState<string | null>(null);
  const [slicers, setSlicers] = useState<Slicer[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const number = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }), [i18n.language]);
  const step: Step = STEPS[index] ?? 'material';
  const material = materials.find((item) => item.id === materialId) ?? materials[0];

  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  // The picture and the slicers are read when the step with the test pieces comes up.
  // A printer saved before BC-14 may have a layer over its nozzle: no test pieces for it, and the step says why.
  const layerFits = layerFitsNozzle(printer);
  useEffect(() => {
    if (step !== 'pieces') return;
    let live = true;
    if (layerFits)
      void platform()
        .print.testPiecesPicture({ nozzle: printer.nozzle, layer: printer.layer })
        .then((result) => {
          if (live) setPicture(result.picture);
        })
        .catch((reason: unknown) => {
          console.warn('PartBuddy: the test pieces could not be pictured', reason);
        });
    void platform()
      .design.slicers()
      .then((found) => {
        if (live) setSlicers(found);
      })
      .catch(() => {
        if (live) setSlicers([]);
      });
    return () => {
      live = false;
    };
  }, [step, printer.nozzle, printer.layer, layerFits]);

  if (!material) return null;
  const result = applyReadings(material, readings, printer.nozzle);

  const exportPieces = (slicer: string | null) => {
    setStatus(t('print.tolerance.working'));
    platform()
      .print.exportTestPieces({ nozzle: printer.nozzle, layer: printer.layer, slicer })
      .then((done) => {
        setStatus(done ? (done.slicer ? t('print.tolerance.opened', { name: done.slicer }) : t('print.tolerance.saved', { file: done.file ?? '' })) : null);
      })
      .catch(() => {
        setStatus(t('print.tolerance.exportFailed'));
      });
  };

  const fitItems = [{ id: NONE, label: t('print.tolerance.notRead') }, ...FIT_STEPS.map((value) => ({ id: String(value), label: `${number.format(value)} mm` }))];
  const overhangItems = [{ id: NONE, label: t('print.tolerance.notRead') }, ...OVERHANG_STEPS.map((value) => ({ id: String(value), label: `${String(value)}°` }))];
  const setFit = (fit: FitKind, id: string) => {
    const fits: ToleranceReadings['fits'] = Object.fromEntries(Object.entries(readings.fits).filter(([key]) => key !== fit));
    if (id !== NONE) fits[fit] = Number(id);
    setReadings({ ...readings, fits });
  };
  const rows: { key: string; label: string; before: string; after: string }[] = [
    { key: 'overhang', label: t('print.overhang'), before: `${String(material.overhang)}°`, after: `${String(result.material.overhang)}°` },
    { key: 'hole', label: t('print.holeShrink'), before: `${number.format(material.holeShrink)} mm`, after: `${number.format(result.material.holeShrink)} mm` },
    ...FIT_KINDS.map((fit) => ({ key: fit, label: `${t('print.clearance')}: ${t(`print.fit.${fit}`)}`, before: `${number.format(material.clearance[fit])} mm`, after: `${number.format(result.material.clearance[fit])} mm` })),
  ];
  // Holes larger than drawn are said but do not hold the profile back: the allowance is 0, the rest applies (audit MG-31).
  const oversize = result.problems.flatMap((problem) => (problem.field === 'oversize' ? [problem.by] : []))[0];
  const problems = result.problems.flatMap((problem) =>
    problem.field === 'oversize'
      ? []
      : problem.field === 'fit'
        ? [t('print.tolerance.problem.fit', { fit: t(`print.fit.${problem.fit}`) })]
        : problem.field === 'hole'
          ? [t('print.tolerance.problem.hole', { size: problem.size })]
          : [t(`print.tolerance.problem.${problem.field}`)],
  );
  const last = index === STEPS.length - 1;

  return (
          <section
            aria-labelledby="tolerance-title"
            className="flex flex-col gap-4"
            data-testid="tolerance-assistant"
            data-step={step}
            onKeyDown={(event) => {
              // Escape goes back to the materials, not out of the settings.
              if (event.key !== 'Escape' || event.defaultPrevented) return;
              event.stopPropagation();
              onClose();
            }}
          >
            <Button onPress={onClose} className="self-start" data-testid="tolerance-cancel">
              <IconArrowLeft className="size-icon-sm" aria-hidden />
              {t('print.tolerance.backToMaterials')}
            </Button>
            <div className="flex flex-col gap-1">
              <Heading ref={heading} id="tolerance-title" level={3} tabIndex={-1} className="text-lg font-semibold text-text outline-none">
                {t('print.tolerance.title')}
              </Heading>
              <p className="text-sm text-text-muted tabular-nums">{t('print.tolerance.progress', { step: index + 1, count: STEPS.length, name: t(`print.tolerance.step.${step}`) })}</p>
            </div>
            {step === 'material' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-text">{t('print.tolerance.intro')}</p>
                <SelectField label={t('print.tolerance.material')} value={material.id} items={materials.map((item) => ({ id: item.id, label: item.name }))} onChange={setMaterialId} testId="tolerance-material" />
                <p className="text-xs text-text-subtle">{t('print.tolerance.printer', { name: printer.name, nozzle: number.format(printer.nozzle), layer: number.format(printer.layer) })}</p>
              </div>
            ) : step === 'pieces' ? (
              <div className="flex flex-col gap-3">
                {picture ? <img src={picture} alt={t('print.tolerance.pictureAlt')} className="h-tile w-full rounded-md border border-border bg-surface object-cover" data-testid="tolerance-picture" /> : null}
                <p className="text-sm text-text">{t('print.tolerance.pieces')}</p>
                <ul className="list-disc pl-5 text-sm text-text">
                  {(['print', 'noCompensation', 'cool'] as const).map((key) => (
                    <li key={key}>{t(`print.tolerance.guide.${key}`, { material: material.name })}</li>
                  ))}
                </ul>
                {layerFits ? null : (
                  <p role="alert" className="text-sm text-danger" data-testid="tolerance-layer">
                    {t('print.tolerance.layerOverNozzle', { nozzle: number.format(printer.nozzle), layer: number.format(printer.layer) })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button isDisabled={!layerFits} onPress={() => exportPieces(null)} data-testid="tolerance-save">
                    {t('print.tolerance.save3mf')}
                  </Button>
                  {slicers.map((slicer) => (
                    <Button key={slicer.id} isDisabled={!layerFits} onPress={() => exportPieces(slicer.id)} data-testid="tolerance-slicer">
                      {t('print.tolerance.openIn', { name: slicer.name })}
                    </Button>
                  ))}
                </div>
                {status ? (
                  <p role="status" className="text-sm text-text-muted" data-testid="tolerance-status">
                    {status}
                  </p>
                ) : null}
              </div>
            ) : step === 'results' ? (
              <div className="flex flex-col gap-4">
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-text">{t('print.tolerance.combTitle')}</legend>
                  <p className="text-xs text-text-subtle">{t('print.tolerance.comb')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FIT_KINDS.map((fit) => (
                      <SelectField
                        key={fit}
                        label={t(`print.tolerance.fitRule.${fit}`)}
                        value={readings.fits[fit] === undefined ? NONE : String(readings.fits[fit])}
                        items={fitItems}
                        onChange={(id) => setFit(fit, id)}
                        testId={`tolerance-fit-${fit}`}
                      />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-text">{t('print.tolerance.holesTitle')}</legend>
                  <p className="text-xs text-text-subtle">{t('print.tolerance.holes')}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {HOLE_SIZES.map((size, i) => (
                      <NumberField
                        key={size}
                        value={readings.holes[i] ?? Number.NaN}
                        minValue={0}
                        maxValue={20}
                        step={0.01}
                        formatOptions={{ maximumFractionDigits: 2 }}
                        onChange={(value) => {
                          setReadings({ ...readings, holes: readings.holes.map((old, j) => (j === i ? (Number.isFinite(value) ? value : null) : old)) });
                        }}
                        className="flex flex-col gap-1"
                        data-testid={`tolerance-hole-${String(size)}`}
                      >
                        <Label className={fieldLabelClass}>{t('print.tolerance.hole', { size })}</Label>
                        <UnitInput unit="mm" />
                      </NumberField>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-text">{t('print.tolerance.overhangTitle')}</legend>
                  <SelectField
                    label={t('print.tolerance.overhang')}
                    value={readings.overhang === null ? NONE : String(readings.overhang)}
                    items={overhangItems}
                    onChange={(id) => setReadings({ ...readings, overhang: id === NONE ? null : Number(id) })}
                    className="max-w-xs"
                    testId="tolerance-overhang"
                  />
                </fieldset>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-text">{t('print.tolerance.preview', { material: material.name })}</p>
                <table className="w-full text-sm tabular-nums" data-testid="tolerance-preview">
                  <thead>
                    <tr className="text-left text-xs text-text-muted">
                      <th className="py-1 font-medium">{t('print.tolerance.value')}</th>
                      <th className="py-1 font-medium">{t('print.tolerance.before')}</th>
                      <th className="py-1 font-medium">{t('print.tolerance.after')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-t border-border" data-testid={`tolerance-row-${row.key}`} data-changed={row.before !== row.after}>
                        <td className="py-1 text-text">{row.label}</td>
                        <td className="py-1 text-text-muted">{row.before}</td>
                        <td className={`py-1 ${row.before === row.after ? 'text-text-muted' : 'font-semibold text-text'}`}>{row.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {oversize !== undefined ? (
                  <p role="status" className="text-sm text-warning" data-testid="tolerance-oversize">
                    {t('print.tolerance.problem.oversize', { by: oversize })}
                  </p>
                ) : null}
                {problems.length > 0 ? (
                  <ul role="alert" className="list-disc pl-5 text-sm text-danger" data-testid="tolerance-problems">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-subtle">{t('print.tolerance.applyHint')}</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="flex-1" />
              {index > 0 ? (
                <Button onPress={() => setIndex(index - 1)} data-testid="tolerance-back">
                  {t('firstStart.back')}
                </Button>
              ) : null}
              <Button
                variant="primary"
                isDisabled={last && problems.length > 0}
                onPress={() => {
                  if (!last) {
                    setIndex(index + 1);
                    return;
                  }
                  onApply(result.material);
                  onClose();
                }}
                data-testid="tolerance-next"
              >
                {last ? t('print.tolerance.apply') : t('firstStart.next')}
              </Button>
            </div>
          </section>
  );
}
