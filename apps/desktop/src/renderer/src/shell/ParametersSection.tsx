import { IconAlertCircle, IconSparkles, IconStarFilled, IconVariable } from '@tabler/icons-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { Input, Slider, TextField } from 'react-aria-components';

import type { DesignParameter } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { parseLength } from '../viewer/lengthInput';
import { LooseDimensions } from '../viewer/Dimensions';
import { fitMarkOf } from '../../../shared/designFit';
import { commentText, groupParameters, labelOf, rangeOf } from './parameterRange';
import { TreeEmpty, TreeExtra, TreeFolder, TreeItem, TreeSection } from './Tree';
import { fieldBox } from '../ui/Field';
import { SliderBar } from '../ui/Choice';

const PREVIEW_DELAY_MS = 250;

// Values in the interface's own decimal mark (audit B-09); parseLength takes comma and point alike.
const format = (value: number) => new Intl.NumberFormat(i18next.language, { maximumFractionDigits: 4, useGrouping: false }).format(value);

/** The design's length unit: named once in the head, so the rows leave it out and the label gets the room. */
const LENGTH_UNIT = 'mm';
/** What a row shows after its value: nothing for a length or a text, ° for an angle, the unit otherwise. */
const suffixOf = (parameter: DesignParameter) => (parameter.unit === LENGTH_UNIT || parameter.unit === 'text' ? '' : parameter.unit === 'deg' ? '°' : ` ${parameter.unit}`);
/** As wide as the widest value shown (tabular figures are 1ch each), so the labels get the rest (decided 2026-11-14). */
const valueWidth = (parameters: readonly DesignParameter[]) =>
  `${String(Math.max(2, ...parameters.map((parameter) => format(parameter.value).length + suffixOf(parameter).length + (parameter.editable ? 0 : 1.5))))}ch`;

/** One parameter: a field for a plain length, the formula as text otherwise. */
function ParameterRow({ parameter, body, busy, level, width }: { parameter: DesignParameter; body: string | null; busy: boolean; level: number; width: string }) {
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
  // The plain label ("Ultrawide-Höhe"); the name formulas use shows on hover (decided 2026-11-14).
  const label = labelOf(parameter.comment) || parameter.name;
  const invalid = editing && !valid ? t('parameters.invalid') : null;
  const hint = problem ?? invalid ?? (outside ? t('parameters.outside', { min: format(outside.min), max: format(outside.max) }) : null);
  const box = useRef<HTMLDivElement>(null);
  const start = () => {
    if (parameter.editable && !busy && !editing) setDraft(format(parameter.value));
  };
  const back = () => {
    box.current?.querySelector<HTMLElement>('[role="treeitem"]')?.focus();
  };
  // Comment, name, range and formula show on hover; the row stays one line (Label · Value · Unit).
  const title = [note, label === parameter.name ? null : t('parameters.formulaName', { name: parameter.name }), fitMarkOf(parameter.comment) ? t('parameters.fitted') : null, range ? t('parameters.range', { min: format(range.min), max: format(range.max), unit: parameter.unit }) : null, parameter.editable ? null : `= ${parameter.expression}`, parameter.editable ? null : t('parameters.formulaHint')]
    .filter(Boolean)
    .join('\n');

  return (
    <div ref={box}>
      <TreeItem
        id={`parameter:${parameter.name}`}
        selected={editing}
        onOpen={start}
        onEnter={start}
        onRename={start}
        testId="parameter"
        data={{ name: parameter.name }}
        level={level}
        className="tabular-nums"
      >
        <span className="min-w-0 flex-1 truncate" title={title || undefined}>
          {parameter.favorite ? <IconStarFilled className="absolute top-1 left-1 size-icon-sm text-warning" aria-label={t('parameters.favorite')} /> : null}
          {label}
        </span>
        {editing ? (
          <TextField
            aria-label={t('parameters.change', { name: label })}
            value={text}
            onChange={setDraft}
            inputMode="decimal"
            isDisabled={busy}
            isInvalid={!valid || problem !== null}
            className="w-field-value shrink-0"
            data-testid="parameter-field"
          >
            <Input
              // a double click or F2 opens the value to type into, as in a CAD parameter table
              autoFocus
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              className={`h-control-sm w-full min-w-0 px-1 text-right text-sm tabular-nums ${fieldBox}`}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  // A refused value keeps the field: moving focus into the row would leave the edit open (audit B-11).
                  if (!valid || problem !== null) return;
                  if (changed) apply();
                  else reset();
                  back();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  reset();
                  back();
                }
              }}
              onBlur={(event) => {
                // The slider of a favourite belongs to the edit; leaving the row ends it.
                if (box.current?.contains(event.relatedTarget)) return;
                // Leaving with a refused value says it was dropped and which value stays (audit B-11).
                if (!valid || problem !== null) setNotice({ tone: 'danger', text: t('parameters.discarded', { value: text, kept: format(parameter.value) }) });
                reset();
              }}
            />
          </TextField>
        ) : (
          <span className={`shrink-0 truncate text-right ${parameter.error ? 'text-danger' : ''}`} style={{ width }} title={title || undefined}>
            {parameter.editable ? null : <span className="mr-0.5 text-xs text-text-subtle" aria-hidden>ƒ</span>}
            {format(parameter.value)}
            {suffixOf(parameter)}
            {/* The head names the unit once; a screen reader hears it with each value. */}
            {parameter.unit === LENGTH_UNIT ? <span className="sr-only"> {LENGTH_UNIT}</span> : null}
          </span>
        )}
      </TreeItem>
      {editing && parameter.favorite && range ? (
        <TreeExtra>
        <Slider
          aria-label={t('parameters.slider', { name: label })}
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
          className="mr-2 ml-5 w-auto"
          data-testid="parameter-slider"
        >
          <SliderBar />
        </Slider>
        </TreeExtra>
      ) : null}
      {parameter.error || hint ? (
        <TreeExtra className={`mr-1 flex items-start gap-1 px-1 py-hairline pl-5 text-xs ${parameter.error || problem || invalid ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning'}`}>
          <IconAlertCircle className="mt-hairline size-icon-sm shrink-0" aria-hidden />
          <span role="status">{hint ?? parameter.error}</span>
        </TreeExtra>
      ) : null}
      {changed && !hint ? (
        <TreeExtra className="pl-5 text-xs text-text-subtle">
          {t('parameters.enter')}
        </TreeExtra>
      ) : null}
    </div>
  );
}

/**
 * The parameters of the design (UI upgrade step 6): the named values the assistant or the user
 * created, favourites first, then in the groups their comments name ("[Monitor] …", decided 2026-11-14), each
 * with its computed values folded away; a design without groups lists them in one, its formulas folded too. A plain length changes in place with a
 * ghost preview like a dimension in the view; a formula stays the designer's intent (ADR 0017).
 */
export function ParametersSection() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const setGhost = useStudio((s) => s.setParameterGhost);
  const requestAssistant = useStudio((s) => s.requestAssistant);
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  // The list together with the revision it was read at; another revision shows the last list until the new one arrives.
  const [loaded, setLoaded] = useState<{ documentId: string; list: DesignParameter[] } | null>(null);
  const documentId = model.status === 'ready' ? model.documentId : null;
  const revision = model.status === 'ready' ? `${model.documentId}#${String(model.revision)}` : null;
  const parameters = documentId !== null && loaded?.documentId === documentId ? loaded.list : [];
  const { favorites, groups } = groupParameters(parameters);
  const width = valueWidth(parameters);
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
    <TreeSection
      id="section:parameters"
      icon={<IconVariable className="size-icon-sm" aria-hidden />}
      title={t('parameters.titleShort')}
      label={t('parameters.title', { count: parameters.length })}
      count={parameters.length}
      testId="parameters"
    >
      {parameters.length === 0 ? (
        <TreeEmpty
          icon={<IconVariable className="size-icon" aria-hidden />}
          text={t('parameters.noneShort')}
          action={{ label: t('parameters.ask'), icon: <IconSparkles className="size-icon-sm" aria-hidden />, onPress: () => requestAssistant('parameters'), testId: 'parameters-ask' }}
        />
      ) : (
        <div className="mr-1 flex h-control-sm items-center gap-2 pr-1 pl-5 text-xs font-medium text-text-subtle" aria-hidden="true">
          <span className="flex-1">{t('parameters.name')}</span>
          <span className="shrink-0 text-right whitespace-nowrap">{t('parameters.valueIn', { unit: LENGTH_UNIT })}</span>
        </div>
      )}
      {favorites.map((parameter) => (
        <ParameterRow key={parameter.name} parameter={parameter} body={body} busy={busy} width={width} level={2} />
      ))}
      {groups.map((group) => {
        // Without any group the rows stand in the section itself, as before (designs from before 2026-11-14).
        const flat = group.name === null && groups.length === 1;
        const level = flat ? 2 : 3;
        const key = `parameters:${group.name ?? ''}`;
        const rows = (
          <>
            {group.values.map((parameter) => (
              <ParameterRow key={parameter.name} parameter={parameter} body={body} busy={busy} width={width} level={level} />
            ))}
            {group.computed.length > 0 ? (
              <TreeFolder id={`${key}:computed`} title={t('parameters.computed')} count={group.computed.length} level={level} initiallyOpen={false} testId="parameters-computed">
                {group.computed.map((parameter) => (
                  <ParameterRow key={parameter.name} parameter={parameter} body={body} busy={busy} width={width} level={level + 1} />
                ))}
              </TreeFolder>
            ) : null}
          </>
        );
        return flat ? (
          <Fragment key={key}>{rows}</Fragment>
        ) : (
          <TreeFolder key={key} id={key} title={group.name ?? t('parameters.more')} count={group.values.length + group.computed.length} testId="parameters-group">
            {rows}
          </TreeFolder>
        );
      })}
      <LooseDimensions />
    </TreeSection>
  );
}
