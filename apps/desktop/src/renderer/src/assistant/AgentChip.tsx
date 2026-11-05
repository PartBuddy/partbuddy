import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover, RadioButton, RadioField, RadioGroup } from 'react-aria-components';

import type { AgentKind, AgentStatus } from '../../../shared/contract';
import { platform } from '../platform';
import { StatusDot } from '../ui/Feedback';
import { selectedStatus, useAssistant } from './store';

type T = ReturnType<typeof useTranslation>['t'];
type Tone = 'success' | 'neutral' | 'warning';

const ROUTES: AgentKind[] = ['claude-code', 'chatgpt'];

function signedIn(status: AgentStatus): boolean {
  return status.state === 'ready' || status.state === 'busy';
}

function toneOf(status: AgentStatus): Tone {
  if (signedIn(status)) return 'success';
  return status.state === 'checking' ? 'neutral' : 'warning';
}

/** The full status, as the menu shows it: version and plan, or what is missing. */
export function statusLabel(t: T, status: AgentStatus): string {
  if (!signedIn(status)) return t(`assistant.state.${status.agent}.${status.state}`);
  if (status.agent === 'chatgpt') return t('assistant.chatgpt.signedIn', { account: status.account ?? '', model: status.model ?? '' });
  const plan = status.method === 'claude.ai' && status.plan ? t('assistant.plan', { plan: status.plan }) : t('assistant.apiKey');
  return t('assistant.signedIn', { plan, version: status.version ?? '' });
}

/** The short status on the chip: the route and, in a word or two, the plan or what is missing. */
function chipLabel(t: T, status: AgentStatus): string {
  const route = t(`assistant.routes.${status.agent}`);
  let detail: string;
  if (!signedIn(status)) detail = t(`assistant.chip.state.${status.state}`);
  else if (status.agent === 'chatgpt') detail = status.model ?? '';
  else if (status.method === 'claude.ai' && status.plan) detail = status.plan.charAt(0).toUpperCase() + status.plan.slice(1);
  else detail = t('assistant.chip.apiKey');
  return detail ? `${route} · ${detail}` : route;
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
  const api = platform().agent;
  const label = chipLabel(t, status);
  const linkButton =
    'text-xs text-text-muted underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus';

  return (
    <DialogTrigger>
      <AriaButton
        aria-label={t('assistant.chip.label', { status: label })}
        className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-surface-sunken py-0 pl-2 pr-1 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus pressed:bg-surface-hover"
        data-testid="agent-status"
      >
        <StatusDot tone={toneOf(status)} label={label} />
        <IconChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
      </AriaButton>
      <Popover placement="top start" offset={6} className="w-menu rounded-md border border-border bg-surface-raised shadow-2">
        <Dialog aria-label={t('assistant.title')} className="flex flex-col gap-3 p-3 outline-none" data-testid="agent-menu">
          <div className="flex items-center justify-between gap-2">
            <Heading slot="title" className="text-sm font-semibold text-text">
              {t('assistant.title')}
            </Heading>
            <span className="rounded-sm border border-border px-1 text-xs text-text-muted">{t('assistant.preview')}</span>
          </div>
          <RadioGroup
            aria-label={t('assistant.route')}
            value={state.selected}
            onChange={(key) => {
              if (key === 'claude-code' || key === 'chatgpt') void api.select(key);
            }}
            className="flex flex-col gap-1"
          >
            {ROUTES.map((kind) => (
              <RadioField key={kind} value={kind}>
                <RadioButton className="group flex cursor-default items-start gap-2 rounded-sm px-2 py-1 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus selected:bg-surface-selected">
                  <span
                    aria-hidden
                    className="mt-1 inline-flex size-icon-sm shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface group-selected:border-accent"
                  >
                    <span className="size-dot rounded-full bg-accent opacity-0 group-selected:opacity-100" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-text">{t(`assistant.routes.${kind}`)}</span>
                    <span className="text-xs text-text-muted">{t(`assistant.chip.describe.${kind}`)}</span>
                  </span>
                </RadioButton>
              </RadioField>
            ))}
          </RadioGroup>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span data-testid="agent-detail">
              <StatusDot tone={toneOf(status)} label={statusLabel(t, status)} />
            </span>
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
          <p className="text-xs text-text-subtle">{t('assistant.chip.switchNote')}</p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
