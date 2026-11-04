import {
  IconArrowUp,
  IconCheck,
  IconChevronRight,
  IconCube,
  IconNotes,
  IconSparkles,
  IconTool,
  IconUser,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Disclosure,
  DisclosurePanel,
  Button as AriaButton,
  FieldError,
  Heading,
  Input,
  Label,
  ProgressBar,
  RadioButton,
  RadioField,
  RadioGroup,
  Text,
  TextArea,
  TextField,
} from 'react-aria-components';

import { parameters } from '../mock/design';
import { findProvider, minimumAgentContext } from '../mock/providers';
import {
  answerValue,
  openingOptions,
  proposalFor,
  targetCableDiameter,
  useStudio,
  type OpeningOption,
} from '../state/store';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';

function Message({ role, children }: { role: 'user' | 'assistant' | 'system'; children: ReactNode }) {
  const { t } = useTranslation();
  if (role === 'system') {
    return <p className="mx-auto max-w-chat-max px-3 text-center text-xs text-text-subtle">{children}</p>;
  }
  const Icon = role === 'user' ? IconUser : IconSparkles;
  return (
    <article className="mx-auto flex w-full max-w-chat-max gap-2 px-3" aria-label={t(`chat.role.${role}`)}>
      <span
        aria-hidden
        className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full ${
          role === 'user' ? 'bg-surface-sunken text-text-muted' : 'bg-accent-subtle text-accent-text'
        }`}
      >
        <Icon className="size-icon-sm" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-md text-text">{children}</div>
    </article>
  );
}

function ToolCalls() {
  const { t } = useTranslation();
  const calls = [
    { name: 'inspect_design', summary: t('chat.tool.inspect') },
    { name: 'check_parameters', summary: t('chat.tool.check') },
  ];
  return (
    <Disclosure className="rounded-md border border-border bg-surface-sunken">
      <Heading>
        <AriaButton
          slot="trigger"
          className="group flex w-full items-center gap-2 px-2 py-1 text-sm text-text-muted outline-none focus-visible:outline-2 focus-visible:outline-focus"
        >
          <IconChevronRight className="size-icon-sm transition-transform group-aria-expanded:rotate-90" aria-hidden />
          <IconTool className="size-icon-sm" aria-hidden />
          {t('chat.toolCalls', { count: calls.length })}
        </AriaButton>
      </Heading>
      <DisclosurePanel>
        <ul className="flex flex-col gap-1 px-2 pb-2">
          {calls.map((call) => (
            <li key={call.name} className="flex items-start gap-2 text-sm">
              <IconCheck className="mt-hairline size-icon-sm text-success" aria-label={t('chat.toolOk')} />
              <span className="font-mono text-text">{call.name}</span>
              <span className="text-text-muted">{call.summary}</span>
            </li>
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  );
}

type Choice = OpeningOption | 'other';
const choices: Choice[] = ['opening75', 'opening80', 'opening70', 'other'];
const slotRange = parameters.find((p) => p.name === 'slot_width');

/** Parses "8", "8.5", "8,5" or "8,5 mm"; returns null for anything else. */
function parseMillimetres(text: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(mm)?\s*$/i.exec(text);
  return match?.[1] ? Number(match[1].replace(',', '.')) : null;
}

function useMillimetres() {
  const { i18n } = useTranslation();
  return new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'millimeter', maximumFractionDigits: 2 });
}

function ClarificationCard() {
  const { t } = useTranslation();
  const mm = useMillimetres();
  const answer = useStudio((s) => s.answer);
  const answerClarification = useStudio((s) => s.answerClarification);
  const [choice, setChoice] = useState<Choice>('opening75');
  const [other, setOther] = useState('');

  const otherValue = parseMillimetres(other);
  const min = slotRange?.min ?? 0;
  const max = Math.min(slotRange?.max ?? targetCableDiameter, targetCableDiameter);
  const otherInvalid = choice === 'other' && other.trim() !== '' && (otherValue === null || otherValue < min || otherValue >= max);
  const canSubmit = choice !== 'other' || (otherValue !== null && !otherInvalid);

  if (answer) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
        <IconCheck className="size-icon-sm text-success" aria-hidden />
        <span className="text-text-muted">{t('chat.card.answered')}</span>
        <span className="font-medium text-text">{mm.format(answerValue(answer))}</span>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="clarification-title"
      className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface p-3 shadow-1"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 id="clarification-title" className="text-md font-semibold text-text">
          {t('chat.card.question')}
        </h4>
        <Badge tone="info">{t('chat.card.needsAnswer')}</Badge>
      </div>
      <RadioGroup
        value={choice}
        onChange={(value) => {
          setChoice(value as Choice);
        }}
        aria-labelledby="clarification-title"
        className="flex flex-col gap-1"
      >
        {choices.map((id) => (
          <RadioField
            key={id}
            value={id}
            className="flex flex-col gap-1 rounded-md border border-border px-2 py-2 selected:border-accent selected:bg-accent-subtle"
          >
            <RadioButton className="group flex cursor-default items-center gap-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-focus">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full border-2 border-border-strong group-hover:border-accent group-selected:border-accent group-selected:bg-accent"
              />
              <span className="flex items-center gap-2 text-md font-medium text-text">
                {id === 'other' ? t('chat.card.other') : mm.format(openingOptions[id])}
                {id === 'opening75' ? <Badge tone="neutral">{t('chat.card.recommended')}</Badge> : null}
              </span>
            </RadioButton>
            {id === 'other' ? null : (
              <Text slot="description" className="pl-5 text-sm text-text-muted">
                {t(`chat.card.option.${id}`)}
              </Text>
            )}
          </RadioField>
        ))}
      </RadioGroup>
      {choice === 'other' ? (
        <TextField value={other} onChange={setOther} isInvalid={otherInvalid} className="flex flex-col gap-1">
          <Label className="text-sm text-text-muted">{t('chat.card.otherLabel', { min: mm.format(min), max: mm.format(max) })}</Label>
          <Input
            inputMode="decimal"
            className="h-control-md rounded-md border border-border-strong bg-surface px-2 text-md text-text outline-none invalid:border-danger focus-visible:outline-2 focus-visible:outline-focus"
          />
          <FieldError className="text-sm text-danger">{t('chat.card.otherInvalid', { min: mm.format(min), max: mm.format(max) })}</FieldError>
        </TextField>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-subtle">{t('chat.card.whyAsked')}</span>
        <Button
          variant="primary"
          size="sm"
          isDisabled={!canSubmit}
          onPress={() => {
            if (choice !== 'other') answerClarification({ kind: 'option', id: choice });
            else if (otherValue !== null && !otherInvalid) answerClarification({ kind: 'other', value: otherValue });
          }}
        >
          {t('chat.card.submit')}
        </Button>
      </div>
    </section>
  );
}

function ProposedChange() {
  const { t } = useTranslation();
  const mm = useMillimetres();
  const change = useStudio((s) => s.change);
  const answer = useStudio((s) => s.answer);
  const before = useStudio((s) => s.proposalBase);
  const applyChange = useStudio((s) => s.applyChange);
  const discardChange = useStudio((s) => s.discardChange);
  if (!answer) return null;
  const proposal = proposalFor(answer);

  return (
    <section aria-label={t('chat.change.title')} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <h4 className="text-md font-semibold text-text">{t('chat.change.title')}</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-subtle">
            <th className="py-1 font-medium">{t('chat.change.parameter')}</th>
            <th className="py-1 text-right font-medium">{t('chat.change.before')}</th>
            <th className="py-1 text-right font-medium">{t('chat.change.after')}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(proposal).map(([name, value]) => (
            <tr key={name} className="border-t border-border">
              <td className="py-1 font-mono text-text">{name}</td>
              <td className="py-1 text-right font-mono tabular-nums text-text-muted">{mm.format(before[name] ?? 0)}</td>
              <td className="py-1 text-right font-mono tabular-nums text-text">{mm.format(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-text-subtle">{t('chat.change.note')}</p>
      {change === 'proposed' ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="quiet" onPress={discardChange}>
            {t('chat.change.discard')}
          </Button>
          <Button size="sm" variant="primary" onPress={applyChange}>
            {t('chat.change.apply')}
          </Button>
        </div>
      ) : (
        <p className="text-sm font-medium text-text">
          {change === 'applied'
            ? t('chat.change.applied', { cable: mm.format(proposal.cable_d_nominal ?? 0), opening: mm.format(proposal.slot_width ?? 0) })
            : t('chat.change.discarded')}
        </p>
      )}
    </section>
  );
}

function ProviderNotice() {
  const { t, i18n } = useTranslation();
  const providerId = useStudio((s) => s.providerId);
  const localServer = useStudio((s) => s.localServer);
  const solidcraft = useStudio((s) => s.solidcraft);
  const cloud = useStudio((s) => s.cloud);
  const provider = findProvider(providerId);
  const tokens = new Intl.NumberFormat(i18n.language);

  if (provider.kind === 'local' && localServer === 'unreachable') {
    return (
      <Banner tone="danger" title={t('chat.notice.unreachableTitle', { vendor: provider.vendor, endpoint: provider.endpoint })}>
        {t('chat.notice.unreachableBody')}
      </Banner>
    );
  }
  if (provider.kind === 'cloud' && cloud === 'missingKey') {
    return (
      <Banner tone="danger" title={t('chat.notice.missingKeyTitle', { vendor: provider.vendor })}>
        {t('chat.notice.missingKeyBody')}
      </Banner>
    );
  }
  if (provider.kind === 'cloud' && cloud === 'rateLimited') {
    return (
      <Banner tone="warning" title={t('chat.notice.rateLimitTitle', { vendor: provider.vendor })}>
        {t('chat.notice.rateLimitBody')}
      </Banner>
    );
  }
  if (provider.contextTokens < minimumAgentContext) {
    return (
      <Banner
        tone="warning"
        title={t('chat.notice.contextTitle', {
          context: tokens.format(provider.contextTokens),
          minimum: tokens.format(minimumAgentContext),
        })}
      >
        {t('chat.notice.contextBody', { vendor: provider.vendor })}
      </Banner>
    );
  }
  if (!provider.tools) {
    return (
      <Banner tone="warning" title={t('chat.notice.noToolsTitle', { model: provider.model })}>
        {t('chat.notice.noToolsBody')}
      </Banner>
    );
  }
  if (solidcraft === 'disconnected') {
    return (
      <Banner tone="warning" title={t('viewer.disconnectedTitle')}>
        {t('chat.notice.solidcraftBody')}
      </Banner>
    );
  }
  return null;
}

function LocalProgress() {
  const { t } = useTranslation();
  const providerId = useStudio((s) => s.providerId);
  const localServer = useStudio((s) => s.localServer);
  const provider = findProvider(providerId);
  if (provider.kind !== 'local' || localServer !== 'processing') return null;
  return (
    <Message role="assistant">
      <ProgressBar value={38} aria-label={t('chat.progress.label', { vendor: provider.vendor })} className="flex flex-col gap-1">
        {({ percentage }) => (
          <>
            <span className="text-sm text-text-muted">
              {t('chat.progress.text', { vendor: provider.vendor, percent: Math.round(percentage ?? 0) })}
            </span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${percentage ?? 0}%` }} />
            </span>
          </>
        )}
      </ProgressBar>
      <div>
        <Button size="sm" variant="secondary">
          {t('chat.progress.stop')}
        </Button>
      </div>
    </Message>
  );
}

export function ChatPanel() {
  const { t } = useTranslation();
  const answer = useStudio((s) => s.answer);
  const change = useStudio((s) => s.change);
  const notes = useStudio((s) => s.notes);
  const selection = useStudio((s) => s.selection);
  const providerId = useStudio((s) => s.providerId);
  const localServer = useStudio((s) => s.localServer);
  const cloud = useStudio((s) => s.cloud);
  const userMessages = useStudio((s) => s.userMessages);
  const sendMessage = useStudio((s) => s.sendMessage);
  const [draft, setDraft] = useState('');
  const provider = findProvider(providerId);
  const blocked =
    (provider.kind === 'local' && localServer === 'unreachable') ||
    (provider.kind === 'cloud' && cloud === 'missingKey');
  const mm = useMillimetres();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto py-3">
        <div className="flex flex-col gap-4">
          <Message role="user">
            <p>{t('chat.mock.request')}</p>
            <span className="flex flex-wrap gap-1">
              <Badge>
                <IconCube className="size-icon-sm" aria-hidden />
                cable-clip v0.1.0
              </Badge>
            </span>
          </Message>
          <Message role="assistant">
            <ToolCalls />
            <p>{t('chat.mock.analysis')}</p>
            <ClarificationCard />
          </Message>
          {answer ? (
            <Message role="user">
              <p>{mm.format(answerValue(answer))}</p>
            </Message>
          ) : null}
          {change !== 'none' ? (
            <Message role="assistant">
              <p>{t('chat.mock.proposal')}</p>
              <ProposedChange />
            </Message>
          ) : null}
          {change === 'applied' ? <Message role="system">{t('chat.mock.appliedSystem')}</Message> : null}
          {userMessages.map((text, i) => (
            <div key={`${i}-${text}`} className="flex flex-col gap-4">
              <Message role="user">
                <p>{text}</p>
              </Message>
              <Message role="system">{t('chat.mock.prototypeReply')}</Message>
            </div>
          ))}
          <LocalProgress />
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <ProviderNotice />
        <form
          className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2 focus-within:outline-2 focus-within:outline-focus"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() === '' || blocked) return;
            sendMessage(draft.trim());
            setDraft('');
          }}
        >
          <TextField value={draft} onChange={setDraft} aria-label={t('chat.composer.label')} isDisabled={blocked}>
            <TextArea
              rows={2}
              placeholder={t('chat.composer.placeholder')}
              className="w-full resize-none bg-transparent text-md text-text outline-none placeholder:text-text-subtle"
            />
          </TextField>
          <div className="flex items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-1">
              {notes.length > 0 ? (
                <Badge tone="info">
                  <IconNotes className="size-icon-sm" aria-hidden />
                  {t('chat.composer.notes', { count: notes.length })}
                </Badge>
              ) : null}
              {selection ? <Badge>{t('chat.composer.selection')}</Badge> : null}
            </span>
            <Button type="submit" size="sm" variant="primary" isDisabled={draft.trim() === '' || blocked} aria-label={t('chat.composer.send')}>
              <IconArrowUp className="size-icon-sm" aria-hidden />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
