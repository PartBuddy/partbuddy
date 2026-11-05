import { IconStar } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Slider, SliderThumb, SliderTrack, TextField } from 'react-aria-components';

import type { DesignParameter } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { parseLength } from '../viewer/lengthInput';
import { commentText, rangeOf } from './parameterRange';

const PREVIEW_DELAY_MS = 250;

const format = (value: number) => String(Number(value.toFixed(4)));

/** One parameter: a field for a plain length, the formula as text otherwise. */
function ParameterRow({ parameter, body, busy }: { parameter: DesignParameter; body: string | null; busy: boolean }) {
  const { t } = useTranslation();
  const setGhost = useStudio((s) => s.setParameterGhost);
  const setNotice = useStudio((s) => s.setNotice);
  // The typed text while the user edits; null shows SolidCraft's current value, so a change by the
  // assistant or by undo appears at once.
  const [draft, setDraft] = useState<string | null>(null);
  // The latest trial: the text it was made for and SolidCraft's refusal, if any.
  const [trial, setTrial] = useState<{ text: string; error: string | null } | null>(null);
  const latest = useRef(0);

  const editing = draft !== null;
  const text = draft ?? format(parameter.value);
  const value = parseLength(text);
  const valid = Number.isFinite(value) && value > 0;
  const changed = editing && valid && Math.abs(value - parameter.value) > 1e-9;
  const problem = changed && trial?.text === text ? trial.error : null;
  const range = rangeOf(parameter.comment);
  const outside = valid && range !== null && (value < range.min || value > range.max) ? range : null;

  // Typing tries the value in SolidCraft: the ghost shows the part, a refusal shows why.
  useEffect(() => {
    if (!changed || busy) return;
    const id = ++latest.current;
    const tried = text;
    const timer = setTimeout(() => {
      void platform()
        .design.probeParameter(parameter.name, value, body)
        .then((result) => {
          if (latest.current !== id) return;
          setGhost(result.ok ? result.preview : null);
          setTrial({ text: tried, error: result.ok ? null : result.error });
        })
        .catch((error: unknown) => {
          if (latest.current === id) setTrial({ text: tried, error: (error as Error).message.slice(0, 200) });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [changed, busy, text, value, parameter.name, body, setGhost]);

  const reset = () => {
    latest.current++;
    setDraft(null);
    setTrial(null);
    setGhost(null);
  };

  const applyValue = (next: number) => {
    reset();
    void platform()
      .design.applyDimension({ parameter: parameter.name, value: next, factor: 1, label: parameter.name })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  const apply = () => {
    if (changed && problem === null && !busy) applyValue(value);
  };

  const note = commentText(parameter.comment);
  const hint = problem ?? (outside ? t('parameters.outside', { min: format(outside.min), max: format(outside.max) }) : null);

  return (
    <li className="flex flex-col gap-1 rounded-md px-2 py-1" data-testid="parameter" data-name={parameter.name}>
      <div className="flex items-center gap-2">
        {parameter.favorite ? <IconStar className="size-icon-sm shrink-0 text-text-subtle" aria-label={t('parameters.favorite')} /> : null}
        <span className="min-w-0 flex-1 truncate tabular-nums text-sm text-text" title={parameter.name}>
          {parameter.name}
        </span>
        {parameter.editable ? (
          <TextField
            aria-label={t('parameters.change', { name: parameter.name })}
            value={text}
            onChange={setDraft}
            inputMode="decimal"
            isDisabled={busy}
            isInvalid={editing && (!valid || problem !== null)}
            className="w-field-value shrink-0"
            data-testid="parameter-field"
          >
            <Input
              className="h-control-sm w-full rounded-md border border-border-strong bg-surface px-1 text-right text-sm tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus invalid:border-danger disabled:opacity-50"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  apply();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  reset();
                }
              }}
              onBlur={() => {
                if (editing) reset();
              }}
            />
          </TextField>
        ) : (
          <span className="shrink-0 text-sm tabular-nums text-text">{format(parameter.value)}</span>
        )}
        <span className="w-5 shrink-0 text-xs text-text-subtle">{parameter.unit}</span>
      </div>
      {parameter.editable ? null : (
        <p className="truncate tabular-nums text-xs text-text-subtle" title={t('parameters.formulaHint')}>
          = {parameter.expression}
        </p>
      )}
      {parameter.editable && parameter.favorite && range ? (
        <Slider
          aria-label={t('parameters.slider', { name: parameter.name })}
          value={Math.min(range.max, Math.max(range.min, valid ? value : parameter.value))}
          minValue={range.min}
          maxValue={range.max}
          step={range.max - range.min >= 20 ? 1 : 0.1}
          isDisabled={busy}
          onChange={(next) => {
            setDraft(format(next));
          }}
          onChangeEnd={(next) => {
            if (Math.abs(next - parameter.value) > 1e-9) applyValue(next);
            else reset();
          }}
          className="w-full"
          data-testid="parameter-slider"
        >
          <SliderTrack className="relative h-4 w-full">
            {({ state }) => (
              <>
                <span aria-hidden className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-sunken" />
                <span aria-hidden className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${String(state.getThumbPercent(0) * 100)}%` }} />
                <SliderThumb className="top-1/2 size-3 rounded-full border-2 border-accent bg-surface shadow-1 outline-none dragging:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-focus" />
              </>
            )}
          </SliderTrack>
        </Slider>
      ) : null}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
      {range ? <p className="text-xs text-text-subtle">{t('parameters.range', { min: format(range.min), max: format(range.max), unit: parameter.unit })}</p> : null}
      {parameter.error ? <p className="text-xs text-danger">{parameter.error}</p> : null}
      {hint ? (
        <p className={`text-xs ${problem ? 'text-danger' : 'text-warning'}`} role="status">
          {hint}
        </p>
      ) : null}
      {changed && !hint ? <p className="text-xs text-text-subtle">{t('parameters.enter')}</p> : null}
    </li>
  );
}

/**
 * The parameters of the design (UI upgrade step 6): the named values the assistant or the user
 * created, favourites first, with SolidCraft's comment. A plain length changes in place with a
 * ghost preview like a dimension in the view; a formula stays the designer's intent (ADR 0017).
 */
export function ParametersSection() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const setGhost = useStudio((s) => s.setParameterGhost);
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  // The list together with the revision it was read at; another revision shows the last list until the new one arrives.
  const [loaded, setLoaded] = useState<{ documentId: string; list: DesignParameter[] } | null>(null);
  const documentId = model.status === 'ready' ? model.documentId : null;
  const revision = model.status === 'ready' ? `${model.documentId}#${String(model.revision)}` : null;
  const parameters = documentId !== null && loaded?.documentId === documentId ? loaded.list : [];
  const body = model.status === 'ready' ? (model.structure.bodies.find((entry) => entry.visible)?.name ?? null) : null;

  useEffect(() => {
    if (revision === null || documentId === null) return;
    let current = true;
    void platform()
      .design.parameters()
      .then((list) => {
        if (current) setLoaded({ documentId, list });
      })
      .catch(() => {
        if (current) setLoaded({ documentId, list: [] });
      });
    return () => {
      current = false;
    };
  }, [revision, documentId]);

  // No ghost outlives the panel or a new revision.
  useEffect(
    () => () => {
      setGhost(null);
    },
    [revision, setGhost],
  );

  if (revision === null) return null;
  return (
    <section aria-labelledby="structure-parameters" data-testid="parameters">
      <h2 id="structure-parameters" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('parameters.title', { count: parameters.length })}
      </h2>
      {parameters.length === 0 ? <p className="px-2 text-xs text-text-subtle">{t('parameters.none')}</p> : null}
      <ul className="flex flex-col">
        {parameters.map((parameter) => (
          <ParameterRow key={parameter.name} parameter={parameter} body={body} busy={busy} />
        ))}
      </ul>
    </section>
  );
}
