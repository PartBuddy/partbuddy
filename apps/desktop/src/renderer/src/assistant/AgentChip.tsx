import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover, RadioButton, RadioField, RadioGroup } from 'react-aria-components';

import type { AgentKind, AgentStatus, ModelChoice } from '../../../shared/contract';
import { platform } from '../platform';
import { StatusDot } from '../ui/Feedback';
import { selectedStatus, useAssistant } from './store';

type T = ReturnType<typeof useTranslation>['t'];
type Tone = 'success' | 'neutral' | 'warning';

const ROUTES: AgentKind[] = ['claude-code', 'chatgpt', 'local'];
const CHATGPT_USAGE = 'https://chatgpt.com/settings/usage';

function signedIn(status: AgentStatus): boolean {
  return status.state === 'ready' || status.state === 'busy';
}

const DOT: Record<Tone, string> = { success: 'bg-success', neutral: 'bg-text-subtle', warning: 'bg-warning' };

/** From this share of the context window on, a new chat is recommended. */
const CONTEXT_FULL = 0.8;
const contextShare = (status: AgentStatus) => (status.context ? Math.min(1, status.context.used / status.context.size) : 0);

function toneOf(status: AgentStatus): Tone {
  if (signedIn(status)) return contextShare(status) >= CONTEXT_FULL ? 'warning' : 'success';
  return status.state === 'checking' ? 'neutral' : 'warning';
}

/** The full status, as the menu shows it: version and plan, or what is missing. */
export function statusLabel(t: T, status: AgentStatus): string {
  if (!signedIn(status)) return t(`assistant.state.${status.agent}.${status.state}`);
  if (status.agent === 'chatgpt') return t('assistant.chatgpt.signedIn', { account: status.account ?? '', model: status.model ?? '' });
  if (status.agent === 'local') return t('assistant.local.ready', { server: `${status.account ?? ''} ${status.version ?? ''}`.trim(), model: status.models?.find((model) => model.id === status.model)?.name ?? status.model ?? '' });
  // Not the plan's name: Claude Code reports an Ultra plan as "max" (seen 2026-11-06).
  const plan = status.method === 'claude.ai' ? t('assistant.plan') : t('assistant.apiKey');
  return t('assistant.signedIn', { plan, version: status.version ?? '' });
}

/** An effort level in words; levels PartBuddy does not know yet show as they come. */
export function effortLabel(t: T, effort: string): string {
  return t(`assistant.effort.level.${effort}`, { defaultValue: effort });
}

/** The model in use by its display name, and the effort when one is set (B1). */
function modelLabel(t: T, status: AgentStatus): string | null {
  if (!status.model) return null;
  const name = status.models?.find((model) => model.id === status.model)?.name ?? status.model;
  return status.effort ? `${name} · ${effortLabel(t, status.effort)}` : name;
}

/** The short status on the chip: the route and the model with its effort, or the plan or what is missing. */
function chipLabel(t: T, status: AgentStatus): string {
  const route = t(`assistant.routes.${status.agent}`);
  let detail: string;
  if (!signedIn(status)) detail = t(`assistant.chip.state.${status.state}`);
  // On the chip without the plan's remarks in brackets ("Default (recommended)"); the menu shows them.
  else {
    const model = modelLabel(t, status)?.replace(/\s*\([^)]*\)/g, '');
    // Billed apart from the subscription: the chip always says so, beside the model.
    const apiKey = status.agent === 'claude-code' && status.method !== 'claude.ai' ? t('assistant.chip.apiKey') : null;
    detail = [apiKey, model].filter(Boolean).join(' · ');
  }
  return detail ? `${route} · ${detail}` : route;
}

export const radioClass =
  'group flex cursor-default items-start gap-2 rounded-sm px-2 py-1 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus selected:bg-surface-selected';

export function RadioMark() {
  return (
    <span aria-hidden className="mt-1 inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface group-selected:border-accent">
      <span className="size-dot rounded-full bg-accent opacity-0 group-selected:opacity-100" />
    </span>
  );
}

/**
 * Model and effort of the selected route (B1, decided 2026-11-05): only what the plan offers, in
 * effect from the next answer, also in a running conversation; "Keep for new chats" stores it.
 */
function ModelChoiceSection({ status }: { status: AgentStatus }) {
  const { t } = useTranslation();
  const api = platform().agent;
  const models = status.models ?? [];
  if (!signedIn(status) || models.length === 0) return null;
  const current = models.find((model) => model.id === status.model) ?? models[0];
  if (!current) return null;
  const effort = status.effort ?? null;
  const choose = (choice: ModelChoice, asDefault = false) => {
    void api.chooseModel(choice, asDefault);
  };
  const kept = status.defaultChoice;
  const isDefault = kept?.model === current.id && (kept.effort ?? null) === effort;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2" data-testid="agent-model">
      <RadioGroup
        aria-label={t('assistant.model.title')}
        value={current.id}
        onChange={(id) => {
          const next = models.find((model) => model.id === id);
          if (next) choose({ model: next.id, effort: effort !== null && next.efforts.includes(effort) ? effort : null });
        }}
        className="flex max-h-menu-max flex-col gap-1 overflow-auto"
      >
        <span className="px-2 text-xs font-semibold text-text-muted">{t('assistant.model.title')}</span>
        {models.map((model) => (
          <RadioField key={model.id} value={model.id}>
            <RadioButton className={radioClass} data-testid="model-option">
              <RadioMark />
              <span className="flex flex-col">
                <span className="text-sm text-text">{model.name}</span>
                {model.description ? <span className="text-xs text-text-muted">{model.description}</span> : null}
              </span>
            </RadioButton>
          </RadioField>
        ))}
      </RadioGroup>
      {current.efforts.length > 0 ? (
        <RadioGroup
          aria-label={t('assistant.effort.title')}
          value={effort}
          onChange={(value) => {
            choose({ model: current.id, effort: value });
          }}
          orientation="horizontal"
          className="flex flex-col gap-1"
        >
          <span className="px-2 text-xs font-semibold text-text-muted">{t('assistant.effort.title')}</span>
          <div className="flex flex-wrap gap-1 px-1">
            {current.efforts.map((value) => (
              <RadioField key={value} value={value}>
                <RadioButton
                  className="inline-flex cursor-default items-center rounded-full border border-border px-2 py-0 text-xs text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus selected:border-accent selected:bg-accent-subtle"
                  data-testid="effort-option"
                >
                  {effortLabel(t, value)}
                </RadioButton>
              </RadioField>
            ))}
          </div>
        </RadioGroup>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2">
        <span className="text-xs text-text-subtle">{t('assistant.model.applies')}</span>
        {isDefault ? (
          <span className="text-xs text-text-muted" data-testid="model-is-default">
            {t('assistant.model.isDefault')}
          </span>
        ) : (
          <AriaButton
            className="text-xs text-text-muted underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
            onPress={() => {
              choose({ model: current.id, effort }, true);
            }}
            data-testid="model-keep"
          >
            {t('assistant.model.keep')}
          </AriaButton>
        )}
      </div>
    </div>
  );
}

/**
 * The assistant's route, model and effort, and its sign-in state (B1); in the chip's menu and in the
 * settings (B6).
 */
export function AssistantChoice() {
  const { t } = useTranslation();
  const state = useAssistant((s) => s.state);
  const status = selectedStatus(state);
  const api = platform().agent;
  const linkButton =
    'text-xs text-text-muted underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus';
  return (
    <>
      <RadioGroup
        aria-label={t('assistant.route')}
        value={state.selected}
        onChange={(key) => {
          if (key === 'claude-code' || key === 'chatgpt' || key === 'local') void api.select(key);
        }}
        className="flex flex-col gap-1"
      >
        {ROUTES.map((kind) => (
          <RadioField key={kind} value={kind}>
            <RadioButton className={radioClass}>
              <RadioMark />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-text">{t(`assistant.routes.${kind}`)}</span>
                <span className="text-xs text-text-muted">{t(`assistant.chip.describe.${kind}`)}</span>
              </span>
            </RadioButton>
          </RadioField>
        ))}
      </RadioGroup>
      <ModelChoiceSection status={status} />
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <span data-testid="agent-detail">
          <StatusDot tone={toneOf(status)} label={statusLabel(t, status)} />
        </span>
        {status.usage && status.usage.length > 0 ? <UsageLine usage={status.usage} /> : null}
        {status.context ? (
          <span className={`text-xs tabular-nums ${contextShare(status) >= CONTEXT_FULL ? 'text-warning' : 'text-text-muted'}`} data-testid="agent-context">
            {t(contextShare(status) >= CONTEXT_FULL ? 'assistant.contextFull' : 'assistant.context', { used: contextShare(status), size: status.context.size })}
          </span>
        ) : null}
        {status.agent === 'chatgpt' && signedIn(status) ? (
          // Sign in with ChatGPT reports no usage numbers; OpenAI's UI guidelines ask for this line and link instead.
          <span className="text-xs text-text-muted" data-testid="chatgpt-usage">
            {t('assistant.chatgpt.planInUse')} ·{' '}
            <a href={CHATGPT_USAGE} target="_blank" rel="noreferrer" className="underline hover:text-text">
              {t('assistant.chatgpt.manageUsage')}
            </a>
          </span>
        ) : null}
        {status.state === 'unavailable' && status.detail ? (
          // There is no log file to look in, so the reason shows here.
          <span className="break-words text-xs text-text-muted" data-testid="agent-reason">
            {status.detail}
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <AriaButton
            className={linkButton}
            onPress={() => {
              void api.refresh();
            }}
          >
            {t('assistant.refresh')}
          </AriaButton>
          {status.agent === 'claude-code' && status.apiBillingAllowed ? (
            <AriaButton
              className={linkButton}
              onPress={() => {
                void api.allowApiBilling(false);
              }}
            >
              {t('assistant.subscriptionOnly')}
            </AriaButton>
          ) : null}
          {status.agent === 'chatgpt' && signedIn(status) ? (
            <AriaButton
              className={linkButton}
              onPress={() => {
                void api.signOut();
              }}
            >
              {t('assistant.chatgpt.signOut')}
            </AriaButton>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * The assistant route as a small chip beside the composer (UI upgrade, 2026-11-04): the route is
 * chosen once, so it takes no room above the conversation. The menu holds the choice, the full
 * status and the account actions; what needs doing shows as a notice in the conversation.
 */
export function AgentChip() {
  const { t } = useTranslation();
  const state = useAssistant((s) => s.state);
  const status = selectedStatus(state);
  const label = chipLabel(t, status);

  return (
    <DialogTrigger>
      <AriaButton
        aria-label={t('assistant.chip.label', { status: label })}
        className="inline-flex h-control-md min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-surface-sunken pl-3 pr-2 text-sm text-text-muted outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus pressed:bg-surface-hover"
        data-testid="agent-status"
      >
        {/* One line, cut with an ellipsis when the chat is narrow; the full text is the tooltip and the label. */}
        <span aria-hidden className={`size-dot shrink-0 rounded-full ${DOT[toneOf(status)]}`} />
        <span className="min-w-0 truncate whitespace-nowrap" title={label}>
          {label}
        </span>
        <IconChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
      </AriaButton>
      <Popover placement="top start" offset={6} className="w-dialog-sm max-w-full rounded-md border border-border bg-surface-raised shadow-2">
        <Dialog aria-label={t('assistant.title')} className="flex flex-col gap-3 p-3 outline-none" data-testid="agent-menu">
          <div className="flex items-center justify-between gap-2">
            <Heading slot="title" className="text-sm font-semibold text-text">
              {t('assistant.title')}
            </Heading>
            <span className="rounded-sm border border-border px-1 text-xs text-text-muted">{t('assistant.preview')}</span>
          </div>
          <AssistantChoice />
          <p className="text-xs text-text-subtle">{t('assistant.chip.switchNote')}</p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/** The plan's limits as the assistant last reported them (Manuel, 2026-11-06): five hours and week, when it says so. */
function UsageLine({ usage }: { usage: NonNullable<AgentStatus['usage']> }) {
  const { t, i18n } = useTranslation();
  const windows = usage.map((entry) => {
    const window = t(`assistant.usage.windows.${entry.window}`, { defaultValue: entry.window });
    if (entry.resetsAt === null) return t('assistant.usage.window', { window, used: entry.used });
    const reset = new Date(entry.resetsAt * 1000).toLocaleString(i18n.language, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return t('assistant.usage.windowReset', { window, used: entry.used, reset });
  });
  const high = usage.some((entry) => entry.used >= 0.8);
  return (
    <span className={`text-xs tabular-nums ${high ? 'text-warning' : 'text-text-muted'}`} data-testid="agent-usage">
      {t('assistant.usage.title')}: {windows.join(' · ')}
    </span>
  );
}
