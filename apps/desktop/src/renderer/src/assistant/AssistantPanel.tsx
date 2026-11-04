import { IconArrowUp, IconCheck, IconPlayerStop, IconShieldX, IconTool, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Form, TextArea, TextField, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import type { AgentStatus } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { Busy, StatusDot } from '../ui/Feedback';
import { selectedStatus, useAssistant, type ConversationItem } from './store';

function statusLabel(t: ReturnType<typeof useTranslation>['t'], status: AgentStatus): string {
  const signedIn = status.state === 'ready' || status.state === 'busy';
  if (!signedIn) return t(`assistant.state.${status.agent}.${status.state}`);
  if (status.agent === 'chatgpt') return t('assistant.chatgpt.signedIn', { account: status.account ?? '', model: status.model ?? '' });
  const plan = status.method === 'claude.ai' && status.plan ? t('assistant.plan', { plan: status.plan }) : t('assistant.apiKey');
  return t('assistant.signedIn', { plan, version: status.version ?? '' });
}

function Header() {
  const { t } = useTranslation();
  const state = useAssistant((s) => s.state);
  const status = selectedStatus(state);
  const signedIn = status.state === 'ready' || status.state === 'busy';
  return (
    <header className="flex flex-col gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-md font-semibold text-text">{t('assistant.title')}</h2>
        <span className="rounded-sm border border-border px-1 text-xs text-text-muted">{t('assistant.preview')}</span>
      </div>
      <ToggleButtonGroup
        aria-label={t('assistant.route')}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[state.selected]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key === 'claude-code' || key === 'chatgpt') void platform().agent.select(key);
        }}
        className="flex rounded-md border border-border-strong p-hairline"
      >
        {(['claude-code', 'chatgpt'] as const).map((kind) => (
          <ToggleButton
            key={kind}
            id={kind}
            className="flex-1 rounded-sm px-2 py-1 text-sm text-text-muted outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus selected:bg-surface-selected selected:font-medium selected:text-text"
          >
            {t(`assistant.routes.${kind}`)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <div className="flex items-center justify-between gap-2" data-testid="agent-status">
        <StatusDot tone={signedIn ? 'success' : status.state === 'checking' ? 'neutral' : 'warning'} label={statusLabel(t, status)} />
        {status.agent === 'claude-code' && status.apiBillingAllowed ? (
          <AriaButton
            onPress={() => {
              void platform().agent.allowApiBilling(false);
            }}
            className="text-xs text-text-muted underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
          >
            {t('assistant.subscriptionOnly')}
          </AriaButton>
        ) : null}
        {status.agent === 'chatgpt' && signedIn ? (
          <AriaButton
            onPress={() => {
              void platform().agent.signOut();
            }}
            className="text-xs text-text-muted underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
          >
            {t('assistant.chatgpt.signOut')}
          </AriaButton>
        ) : null}
      </div>
    </header>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-2 text-sm text-text-muted">
      <p className="font-semibold text-text">{title}</p>
      <p>{body}</p>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

function Setup() {
  const { t } = useTranslation();
  const status = selectedStatus(useAssistant((s) => s.state));
  const api = platform().agent;
  const refresh = (
    <Button
      onPress={() => {
        void api.refresh();
      }}
    >
      {t('assistant.refresh')}
    </Button>
  );
  if (status.agent === 'chatgpt') {
    if (status.state === 'checking') return <Busy label={t('assistant.chatgpt.waiting')} />;
    if (status.state === 'signedOut' || status.state === 'unavailable') {
      return (
        <Notice
          title={t(status.state === 'signedOut' ? 'assistant.chatgpt.signedOutTitle' : 'assistant.chatgpt.planDisabledTitle')}
          body={status.detail ?? t('assistant.chatgpt.signedOutBody')}
        >
          <Button
            variant="primary"
            onPress={() => {
              void api.signIn();
            }}
          >
            {t('assistant.chatgpt.continue')}
          </Button>
        </Notice>
      );
    }
    return null;
  }
  if (status.state === 'checking') return <Busy label={t('assistant.state.claude-code.checking')} />;
  if (status.state === 'notInstalled') {
    return (
      <Notice title={t('assistant.notInstalledTitle')} body={t('assistant.notInstalledBody')}>
        {refresh}
      </Notice>
    );
  }
  if (status.state === 'signedOut') {
    return (
      <Notice title={t('assistant.signedOutTitle')} body={t('assistant.signedOutBody')}>
        <Button
          variant="primary"
          onPress={() => {
            void api.signIn();
          }}
        >
          {t('assistant.signIn')}
        </Button>
        {refresh}
      </Notice>
    );
  }
  if (status.state === 'needsSubscription') {
    return (
      <Notice title={t('assistant.needsSubscriptionTitle')} body={t('assistant.needsSubscriptionBody')}>
        <Button
          variant="primary"
          onPress={() => {
            void api.signIn();
          }}
        >
          {t('assistant.signIn')}
        </Button>
        {refresh}
        <Button
          onPress={() => {
            void api.allowApiBilling(true);
          }}
        >
          {t('assistant.allowApiBilling')}
        </Button>
      </Notice>
    );
  }
  if (status.state === 'unavailable') {
    return (
      <Notice title={t('assistant.unavailableTitle')} body={t('assistant.unavailableBody', { detail: status.detail ?? '–' })}>
        {refresh}
      </Notice>
    );
  }
  return null;
}

function Item({ item }: { item: ConversationItem }) {
  const { t } = useTranslation();
  switch (item.kind) {
    case 'user':
      return <p className="ml-6 self-end rounded-lg bg-accent-subtle px-3 py-2 text-md whitespace-pre-wrap text-text">{item.text}</p>;
    case 'assistant':
      return (
        <p className="mr-6 text-md whitespace-pre-wrap text-text" data-testid="assistant-text">
          {item.text}
        </p>
      );
    case 'tool': {
      const icon =
        item.decision === 'denied' ? (
          <IconShieldX className="size-icon-sm text-warning" aria-hidden />
        ) : item.ok === undefined ? (
          <IconTool className="size-icon-sm text-text-subtle" aria-hidden />
        ) : item.ok ? (
          <IconCheck className="size-icon-sm text-success" aria-hidden />
        ) : (
          <IconX className="size-icon-sm text-danger" aria-hidden />
        );
      const state =
        item.decision === 'denied'
          ? t('assistant.tool.denied')
          : item.ok === undefined
            ? t('assistant.tool.running')
            : item.ok
              ? t('assistant.tool.done')
              : t('assistant.tool.failed');
      return (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-sunken px-2 py-1 text-sm" data-testid="tool-call">
          <span className="flex items-center gap-1 text-text">
            {icon}
            <span className="font-mono">{item.name}</span>
            <span className="text-text-subtle">· {state}</span>
          </span>
          {item.reason ? <span className="text-text-muted">{item.reason}</span> : null}
          <code className="truncate font-mono text-xs text-text-subtle" title={item.summary}>
            {item.summary}
          </code>
        </div>
      );
    }
    case 'stopped':
      return <p className="text-sm text-text-muted">{t('assistant.stopped')}</p>;
    case 'error':
      return (
        <p role="alert" className="text-sm text-danger">
          {item.message}
        </p>
      );
  }
}

export function AssistantPanel() {
  const { t } = useTranslation();
  const status = selectedStatus(useAssistant((s) => s.state));
  const items = useAssistant((s) => s.items);
  const connected = useStudio((s) => s.connection.state === 'connected');
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const busy = status.state === 'busy';
  const ready = status.state === 'ready' && connected;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [items]);

  const send = () => {
    const text = draft.trim();
    if (!text || !ready) return;
    setDraft('');
    void platform().agent.send(text);
  };

  return (
    <aside aria-label={t('assistant.title')} className="flex w-dialog-sm shrink-0 flex-col border-l border-border bg-surface">
      <Header />
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
        <Setup />
        {items.length === 0 && (status.state === 'ready' || busy) ? <p className="text-sm text-text-muted">{t('assistant.empty')}</p> : null}
        {items.map((item) => (
          <Item key={item.key} item={item} />
        ))}
        {busy ? <Busy label={t(`assistant.working.${status.agent}`)} /> : null}
      </div>
      <Form
        className="flex flex-col gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {!connected && (status.state === 'ready' || busy) ? <p className="text-sm text-text-muted">{t('assistant.needsSolidCraft')}</p> : null}
        <TextField value={draft} onChange={setDraft} aria-label={t('assistant.composer')} isDisabled={!ready}>
          <TextArea
            rows={3}
            placeholder={t('assistant.placeholder')}
            className="w-full resize-none rounded-md border border-border-strong bg-surface p-2 text-md text-text outline-none placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
        </TextField>
        <div className="flex justify-end gap-2">
          {busy ? (
            <Button
              onPress={() => {
                void platform().agent.stop();
              }}
            >
              <IconPlayerStop className="size-icon-sm" aria-hidden />
              {t('assistant.stop')}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" isDisabled={!ready || draft.trim() === ''}>
            <IconArrowUp className="size-icon-sm" aria-hidden />
            {t('assistant.send')}
          </Button>
        </div>
      </Form>
    </aside>
  );
}
