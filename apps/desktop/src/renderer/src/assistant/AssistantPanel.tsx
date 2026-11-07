import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconArrowUpRight,
  IconDownload,
  IconLock,
  IconLogin,
  IconPencil,
  IconPhoto,
  IconPlayerStopFilled,
  IconPlugConnectedX,
  IconPointer,
  IconRefresh,
  IconServerOff,
  IconSparkles,
  IconWifiOff,
  IconX,
} from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button as AriaButton, Dialog, Form, ProgressBar, Modal, ModalOverlay, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components';

import type { MessageAnswer } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { selectionLabel, selectionName, selectionsOf } from '../viewer/viewState';
import { Button, IconButton, pressable } from '../ui/Button';
import { tooltipClass } from '../ui/Tooltip';
import { Busy } from '../ui/Feedback';
import { ChatResizer, useChatWidth } from '../shell/ChatResizer';
import { AgentChip } from './AgentChip';
import { sendToAssistant } from './send';
import { QuestionCard } from './QuestionCard';
import { Answer } from './Answer';
import { rowsOf, sameEntries, sameList } from './rows';
import { StepCard } from './StepCard';
import { Queries, WorkGroup } from './WorkGroup';
import { selectedStatus, useAssistant, type Attachment, type ConversationItem } from './store';
import { emptySketch, SketchPad, type SketchPicture, type SketchState } from './SketchPad';
import { photoPicture } from './photo';
import { useChatScroll } from './useChatScroll';
import { card } from './Fold';
import { SourceCard } from './SourceCard';
import { ToolCall } from './ToolCall';
import { MessageActions } from './MessageActions';

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

/** Why the assistant cannot work yet and what helps (chat polish: a card with its sign). */
function Notice({ title, body, icon: Icon, children }: { title: string; body: string; icon: IconType; children?: React.ReactNode }) {
  // eslint-disable-next-line no-control-regex -- terminal colour codes in a program's output
  const plain = body.replace(/\u001b\[[0-9;]*m/g, '');
  return (
    <div role="status" className={`${card} gap-2 border-border p-3 text-sm text-text-muted`} data-testid="assistant-notice">
      <p className="flex items-center gap-2 font-semibold text-text">
        <Icon className="size-icon shrink-0 text-accent" aria-hidden />
        {title}
      </p>
      {/* Details from a program can be a long path or a stack: they wrap anywhere, lose terminal colour
          codes and stop after four lines; the whole text is in the tooltip and the log file. */}
      <p className="line-clamp-4 [overflow-wrap:anywhere]" title={plain}>
        {plain}
      </p>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/** The assistant thinks or works between visible output (chat polish): its name with a passing light. */
function Working({ label }: { label: string }) {
  return (
    <ProgressBar isIndeterminate aria-label={label} className="flex items-center gap-2 px-1 text-sm" data-testid="assistant-working">
      <IconSparkles className="size-icon-sm shrink-0 text-accent" aria-hidden />
      <span className="cs-shimmer">{label}</span>
    </ProgressBar>
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
  if (status.agent === 'local') {
    if (status.state === 'checking') return <Busy label={t('assistant.state.local.checking')} />;
    if (status.state === 'unavailable') {
      return (
        <Notice icon={IconServerOff} title={t('assistant.local.unavailableTitle')} body={status.detail ?? t('assistant.state.local.unavailable')}>
          {refresh}
        </Notice>
      );
    }
    return null;
  }
  if (status.agent === 'chatgpt') {
    if (status.state === 'checking') return <Busy label={t('assistant.chatgpt.waiting')} />;
    if (status.state === 'signedOut' || status.state === 'unavailable') {
      return (
        <Notice
          icon={status.state === 'signedOut' ? IconLogin : IconLock}
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
      <Notice icon={IconDownload} title={t('assistant.notInstalledTitle')} body={t('assistant.notInstalledBody')}>
        {refresh}
      </Notice>
    );
  }
  if (status.state === 'signedOut') {
    return (
      <Notice icon={IconLogin} title={t('assistant.signedOutTitle')} body={t('assistant.signedOutBody')}>
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
      <Notice icon={IconLock} title={t('assistant.needsSubscriptionTitle')} body={t('assistant.needsSubscriptionBody')}>
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
      <Notice icon={IconAlertTriangle} title={t('assistant.unavailableTitle')} body={t('assistant.unavailableBody', { detail: status.detail ?? '–' })}>
        {refresh}
      </Notice>
    );
  }
  return null;
}

/** "8 faces · Base plate", "2 faces, 1 edge · Base plate, Lid". */
function selectionSummary(t: TFunction, selected: { faces: number; edges: number; vertices: number; bodies: string[] }): string {
  const parts = [
    selected.faces > 0 ? t('assistant.selected.faces', { count: selected.faces }) : null,
    selected.edges > 0 ? t('assistant.selected.edges', { count: selected.edges }) : null,
    selected.vertices > 0 ? t('assistant.selected.vertices', { count: selected.vertices }) : null,
  ].filter(Boolean);
  return t('assistant.selected.line', { what: parts.join(', '), bodies: selected.bodies.join(', ') });
}

/** How a turn can end without an answer, as Claude Code and PartBuddy's own loop report it. */
const FAILURE_REASONS = new Set(['failed', 'error_during_execution', 'error_max_turns', 'signedOut']);

/** Requests an empty chat offers as a start: a holder, a housing, a part after a photo. */
const EXAMPLES = ['holder', 'housing', 'photo'] as const;

function Item({
  item,
  quiet,
  retry = null,
  open,
  resend = null,
}: {
  item: ConversationItem;
  quiet: boolean;
  retry?: (() => void) | null;
  open?: (attachment: Attachment) => void;
  /** Sends a message of the user once more; null while the assistant cannot take one. */
  resend?: ((text: string) => void) | null;
}) {
  const { t } = useTranslation();
  switch (item.kind) {
    case 'user':
      return (
        <div className="group/message ml-6 flex max-w-[85%] min-w-0 flex-col items-end gap-1 self-end">
          {item.selection ? (
            // The count and the body; the exact names, which mean little to most people, on hover.
            <span className="flex items-center gap-1 text-xs text-text-muted" data-testid="message-selection" title={item.selection}>
              <IconPointer className="size-icon-sm shrink-0" aria-hidden />
              {item.selected ? selectionSummary(t, item.selected) : t('assistant.withSelection', { face: item.selection })}
            </span>
          ) : null}
          {item.sketch ? (
            <span className="flex items-center gap-1 text-xs text-text-muted" data-testid="message-sketch">
              <IconPencil className="size-icon-sm shrink-0" aria-hidden />
              {t('assistant.sketch.sent')}
            </span>
          ) : null}
          {item.photo ? (
            <span className="flex items-center gap-1 text-xs text-text-muted" data-testid="message-photo">
              <IconPhoto className="size-icon-sm shrink-0" aria-hidden />
              {t('assistant.photo.sent')}
            </span>
          ) : null}
          {item.attachment && open ? (
            // The picture that went along; a sketch opens again to change it, a photo shows large.
            <AriaButton
              onPress={() => {
                if (item.attachment) open(item.attachment);
              }}
              aria-label={t(item.attachment.sketch ? 'assistant.sketch.reopen' : 'assistant.photo.show')}
              className={`overflow-hidden rounded-md border border-border hover:border-border-strong pressed:border-accent ${pressable}`}
              data-testid="message-attachment"
            >
              <img src={item.attachment.thumbnail} alt="" className="block h-[5rem] w-auto" draggable={false} />
            </AriaButton>
          ) : null}
          {/* The actions sit beside the bubble, so a calm chat keeps no empty row under each message. */}
          <div className="flex min-w-0 items-center gap-1">
            <MessageActions
              text={item.text}
              resend={
                resend
                  ? () => {
                      resend(item.text);
                    }
                  : null
              }
            />
            <p className="min-w-0 rounded-lg bg-accent-subtle px-3 py-2 text-md break-words whitespace-pre-wrap text-text">{item.text}</p>
          </div>
        </div>
      );
    case 'assistant':
      return (
        <Answer text={item.text} streaming={item.open} quiet={quiet} />
      );
    case 'tool':
      return <ToolCall item={item} framed />;
    case 'step':
    case 'question':
      return null;
    case 'stopped':
      // Stopped by the user stays quiet; anything else failed and says why (polish round 1).
      if (item.detail === 'stopped' || item.detail === null) {
        return (
          <p className="flex items-center gap-1 px-1 text-sm text-text-muted">
            <IconPlayerStopFilled className="size-icon-sm shrink-0" aria-hidden />
            {t('assistant.stopped')}
          </p>
        );
      }
      return (
        <div role="alert" className={`${card} items-start gap-1 border-danger px-3 py-2`} data-testid="turn-failed">
          <p className="flex items-center gap-2 text-sm font-medium text-danger">
            <IconAlertTriangle className="size-icon-sm shrink-0" aria-hidden />
            {t('assistant.failed.title')}
          </p>
          <p className="text-sm text-text-muted">
            {t(`assistant.failed.reason.${FAILURE_REASONS.has(item.detail) ? item.detail : 'other'}`)} {t('assistant.failed.log')}
          </p>
          {/* Signed out mid-chat: the way back sits in the card; the sign-in notice is far up the chat. */}
          {item.detail === 'signedOut' ? (
            <Button
              variant="primary"
              onPress={() => {
                void platform().agent.signIn();
              }}
              data-testid="turn-sign-in"
            >
              <IconLogin className="size-icon-sm" aria-hidden />
              {t('assistant.signIn')}
            </Button>
          ) : null}
          {retry ? (
            <Button onPress={retry} data-testid="turn-retry">
              <IconRefresh className="size-icon-sm" aria-hidden />
              {t('assistant.failed.retry')}
            </Button>
          ) : null}
        </div>
      );
    case 'session':
      return (
        <div className="flex items-center gap-2 py-1 text-xs text-text-subtle" role="separator" data-testid="earlier-session">
          <span aria-hidden className="h-hairline flex-1 bg-border" />
          {t('assistant.earlierSession', { date: new Date(item.savedAt) })}
          <span aria-hidden className="h-hairline flex-1 bg-border" />
        </div>
      );
    case 'error':
      return (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-text [overflow-wrap:anywhere]">
          <IconAlertTriangle className="mt-hairline size-icon-sm shrink-0 text-danger" aria-hidden />
          {item.message}
        </p>
      );
    case 'source':
      return <SourceCard source={item.source} />;
  }
}


/** Whether the computer has a network; the assistants need one (local models aside). */
function useOnline(): boolean {
  return useSyncExternalStore(
    (changed) => {
      window.addEventListener('online', changed);
      window.addEventListener('offline', changed);
      return () => {
        window.removeEventListener('online', changed);
        window.removeEventListener('offline', changed);
      };
    },
    () => navigator.onLine,
  );
}

/*
 * Every token of a streaming answer rebuilds the rows; these keep every row whose items did not
 * change from rendering again, so only the open answer does (chat polish).
 */
const StepRow = memo(StepCard, (a, b) => a.item === b.item && a.disabled === b.disabled && sameList(a.tools, b.tools));
const QueriesRow = memo(Queries, (a, b) => sameList(a.tools, b.tools));
const WorkRow = memo(WorkGroup, (a, b) => a.live === b.live && a.disabled === b.disabled && sameEntries(a.entries, b.entries));
const QuestionRow = memo(QuestionCard);
const ItemRow = memo(Item);

/** What goes along with the next message, as chips in the composer. */
const chip = 'inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface text-xs text-text tabular-nums';
const chipPicture = `shrink-0 overflow-hidden rounded-sm border border-border hover:border-border-strong pressed:border-accent ${pressable}`;
/** Send and Stop: a round button at the composer's end. */
const round = `inline-flex size-control-md shrink-0 items-center justify-center rounded-full ${pressable}`;

/** The first picture among pasted or dropped files; other files are left to the window's import. */
function pictureIn(data: DataTransfer | null): File | null {
  return [...(data?.files ?? [])].find((file) => file.type.startsWith('image/')) ?? null;
}

/** Whether a drag carries a picture; while dragging, only the items' types can be read. */
function dragsPicture(data: DataTransfer | null): boolean {
  return [...(data?.items ?? [])].some((item) => item.kind === 'file' && item.type.startsWith('image/'));
}

export function AssistantPanel() {
  const { t } = useTranslation();
  const status = selectedStatus(useAssistant((s) => s.state));
  const items = useAssistant((s) => s.items);
  const connected = useStudio((s) => s.connection.state === 'connected');
  const model = useStudio((s) => s.model);
  const picks = useStudio((s) => s.selections);
  const deselect = useStudio((s) => s.deselect);
  const selections = selectionsOf(model, picks);
  const [selection] = selections;
  const [draft, setDraft] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const busy = status.state === 'busy';
  const ready = status.state === 'ready' && connected;
  // The composer takes text while it can send or while the assistant works on the last message.
  const writable = ready || (busy && connected);
  const [width, setWidth, maxWidth] = useChatWidth();
  const documentId = useStudio((s) => (s.model.status === 'ready' ? s.model.documentId : null));
  const { list, content, atEnd, toEnd, handlers } = useChatScroll(documentId);
  // A sketch for the next message (F4, F9); its elements stay while it is not sent, to draw on.
  const [sketching, setSketching] = useState(false);
  const [sketch, setSketch] = useState<{ state: SketchState; picture: SketchPicture } | null>(null);
  // The structure tree's empty states: "Ask the assistant" drafts a message, "Draw a sketch" opens the pad.
  const request = useStudio((s) => s.assistantRequest);
  const [handled, setHandled] = useState(() => request?.serial ?? 0);
  if (request && request.serial !== handled) {
    setHandled(request.serial);
    if (request.what === 'sketch') setSketching(true);
    else setDraft((current) => current || t('parameters.askDraft'));
  }
  useEffect(() => {
    if (request?.what === 'parameters') composer.current?.focus();
  }, [request]);
  // A photo of a real object for the next message (F6); one picture goes along, a sketch or a photo.
  const [photo, setPhoto] = useState<SketchPicture | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  // A picture dragged over the chat; pasted and dropped pictures go along like a chosen photo.
  const [dropping, setDropping] = useState(false);
  const attachPhoto = (file: Blob) => {
    setPhotoFailed(false);
    photoPicture(file).then(
      (picture) => {
        setPhoto(picture);
        setSketch(null);
        composer.current?.focus();
      },
      () => {
        setPhotoFailed(true);
      },
    );
  };

  const send = () => {
    // A sketch or a photo alone is a message too: build a part from it.
    const text = draft.trim() || (photo ? t('assistant.photo.defaultText') : sketch ? t('assistant.sketch.defaultText') : '');
    if (!text || !ready) return;
    setDraft('');
    setSketch(null);
    setPhoto(null);
    // The user's own message always brings the chat back to its end.
    toEnd();
    useAssistant.getState().attachNext(photo ? { thumbnail: photo.thumbnail, photo: photo.png } : sketch ? { thumbnail: sketch.picture.thumbnail, sketch: sketch.state } : null);
    void sendToAssistant(text, selections, undefined, photo ? undefined : (sketch ?? undefined), photo?.png);
  };
  // A sent sketch opens again as the start of a new one; a sent photo shows large.
  const [padStart, setPadStart] = useState<SketchState | null>(null);
  const [shownPhoto, setShownPhoto] = useState<string | null>(null);
  const openAttachment = useCallback((attachment: Attachment) => {
    if (attachment.sketch) {
      setPadStart(attachment.sketch);
      setSketching(true);
    } else if (attachment.photo) {
      setShownPhoto(URL.createObjectURL(new Blob([new Uint8Array(attachment.photo)], { type: 'image/png' })));
    }
  }, [setPadStart, setSketching, setShownPhoto]);
  // After a failed turn: the last message once more, as text (shortcut: a sketch or photo that went with it does not go again).
  const lastUser = items.findLast((item) => item.kind === 'user');
  const retryLast = ready && lastUser?.kind === 'user' ? () => void sendToAssistant(lastUser.text) : null;
  // The newest finished answer of this session (not of a restored chat), for screen readers.
  const sessionStart = items.findLastIndex((item) => item.kind === 'session');
  const lastAnswer = items.findLast((item, i) => i > sessionStart && item.kind === 'assistant' && !item.open);
  const online = useOnline();
  const newest = items.at(-1);
  const streamingNow = newest?.kind === 'assistant' && newest.open;
  const resend = useMemo(() => (ready ? (text: string) => void sendToAssistant(text) : null), [ready]);
  const answer = useCallback(
    (text: string, choice: MessageAnswer) => {
      toEnd();
      void platform().agent.send(text, [], choice);
    },
    [toEnd],
  );
  const change = useCallback(() => {
    setDraft(t('assistant.planCard.changeDraft'));
    composer.current?.focus();
  }, [t, setDraft]);

  return (
    <aside
      aria-labelledby="assistant-title"
      className="relative flex shrink-0 flex-col border-l border-border bg-surface"
      style={{ width }}
      data-testid="assistant-panel"
      // A picture dropped anywhere on the chat goes with the next message; the window's own drop
      // (FileDrop) sees the handled event and leaves it, other files still import there.
      onDragOver={(event) => {
        if (!ready || !dragsPicture(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const file = ready ? pictureIn(event.dataTransfer) : null;
        if (!file) return;
        event.preventDefault();
        attachPhoto(file);
      }}
    >
      {dropping ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-surface-raised p-4 text-center" data-testid="chat-drop">
          <p className="flex items-center gap-2 text-md font-semibold text-text">
            <IconPhoto className="size-icon shrink-0 text-accent" aria-hidden />
            {t('assistant.photo.drop')}
          </p>
        </div>
      ) : null}
      <ChatResizer width={width} max={maxWidth} onChange={setWidth} />
      {/* Screen readers hear that an answer is there, once, not every streamed word; the answer
          itself stays the one place its text is (a copy here would read twice). */}
      <p className="sr-only" aria-live="polite" data-testid="chat-announcer">
        {lastAnswer ? <span key={lastAnswer.key}>{t('assistant.announce')}</span> : null}
      </p>
      {/* The route and its status live in the chip beside the composer; the heading stays for screen readers. */}
      <h2 id="assistant-title" className="sr-only">
        {t('assistant.title')}
      </h2>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={list} {...handlers} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" data-testid="chat-list">
      <div ref={content} className="cs-chat-list flex flex-col gap-2 p-3">
        <Setup />
        {items.length === 0 && (status.state === 'ready' || busy) ? (
          // A way in for an empty chat (polish round 1): examples fill the input, they do not send.
          <div className="flex flex-col gap-2 pt-4" data-testid="chat-start">
            <p className="flex items-center gap-2 text-lg font-semibold text-text">
              <IconSparkles className="size-icon shrink-0 text-accent" aria-hidden />
              {t('assistant.start.title')}
            </p>
            <p className="text-sm text-text-muted">{t('assistant.empty')}</p>
            {EXAMPLES.map((example) => (
              <AriaButton
                key={example}
                onPress={() => {
                  setDraft(t(`assistant.examples.${example}`));
                  composer.current?.focus();
                }}
                className={`${card} flex-row items-start gap-2 border-border px-3 py-2 text-left text-sm text-text hover:border-border-strong hover:bg-surface-hover pressed:bg-surface-pressed ${pressable}`}
                data-testid="chat-example"
              >
                <IconArrowUpRight className="mt-hairline size-icon-sm shrink-0 text-text-subtle" aria-hidden />
                {t(`assistant.examples.${example}`)}
              </AriaButton>
            ))}
            <p className="text-xs text-text-muted">{t('assistant.examples.hint')}</p>
          </div>
        ) : null}
        {rowsOf(items, busy).map((row) =>
          row.kind === 'item' && row.item.kind === 'question' ? (
            <QuestionRow key={row.item.key} item={row.item} ready={ready} answer={answer} change={change} />
          ) : row.kind === 'step' ? (
            <StepRow key={row.item.key} item={row.item} tools={row.tools} disabled={busy || !connected} />
          ) : row.kind === 'queries' ? (
            <QueriesRow key={row.tools[0]?.key} tools={row.tools} />
          ) : row.kind === 'work' ? (
            <WorkRow key={row.key} entries={row.entries} live={row.live} disabled={busy || !connected} />
          ) : (
            <ItemRow key={row.item.key} item={row.item} quiet={row.quiet} retry={row.item === items.at(-1) ? retryLast : null} open={openAttachment} resend={resend} />
          ),
        )}
        {/* While words stream in, the answer itself shows the work; otherwise a quiet "working" line. */}
        {busy && !streamingNow ? (
          <Working label={t(`assistant.working.${status.agent}`)} />
        ) : null}
      </div>
      </div>
      {!atEnd && items.length > 0 ? (
        <AriaButton
          onPress={() => {
            toEnd(true);
          }}
          className={`absolute bottom-2 left-1/2 inline-flex h-control-md whitespace-nowrap -translate-x-1/2 animate-fade-in items-center gap-1 rounded-full border border-border bg-surface-raised px-3 text-sm text-text shadow-2 hover:bg-surface-hover pressed:bg-surface-pressed ${pressable}`}
          data-testid="chat-to-latest"
        >
          <IconArrowDown className="size-icon-sm" aria-hidden />
          {t('assistant.scroll.toLatest')}
        </AriaButton>
      ) : null}
      </div>
      <Form
        className="flex flex-col gap-1 px-3 pt-1 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {!online ? (
          <p className="flex items-center gap-1 px-1 text-xs text-warning" role="status" data-testid="composer-offline">
            <IconWifiOff className="size-icon-sm shrink-0" aria-hidden />
            {t('assistant.offline')}
          </p>
        ) : null}
        {!connected && (status.state === 'ready' || busy) ? (
          <p className="flex items-center gap-1 px-1 text-xs text-text-muted" data-testid="composer-locked">
            <IconPlugConnectedX className="size-icon-sm shrink-0" aria-hidden />
            {t('assistant.needsSolidCraft')}
          </p>
        ) : null}
        {/* One floating card (chat polish): what goes along, the text, then tools, route and Send. */}
        <div
          className={`flex min-w-0 flex-col gap-1 rounded-lg border bg-surface-raised p-2 shadow-2 transition-colors has-[textarea:focus-visible]:border-accent ${writable ? 'border-border-strong' : 'border-border'}`}
          data-testid="composer"
          data-state={busy ? 'working' : ready ? 'ready' : 'locked'}
        >
          {selections.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1" data-testid="composer-selections" aria-label={t('assistant.selectionsGoWith', { count: selections.length })}>
              <span className="text-xs text-text-muted">{t('assistant.selectionsGoWith', { count: selections.length })}</span>
              {selections.map((entry, i) => (
                <span key={`${entry.kind}-${i}`} className={`${chip} pr-1 pl-2`}>
                  <span className="truncate" title={selectionName(entry)}>
                    {selectionLabel(t, entry)}
                  </span>
                  <IconButton
                    label={t('assistant.removeSelection', { name: selectionLabel(t, entry) })}
                    onPress={() => {
                      const pick = picks[i];
                      if (pick) deselect(pick);
                    }}
                  >
                    <IconX className="size-icon-sm" aria-hidden />
                  </IconButton>
                </span>
              ))}
            </div>
          ) : null}
          {selection && selections.length === 1 ? (
            <span className={`${chip} self-start px-2`} data-testid="composer-selection">
              <IconPointer className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
              <span className="truncate" title={`${selectionName(selection)} · ${selection.body}`}>
                {t('assistant.selectionGoesWith', { kind: selection.kind, name: `${selectionLabel(t, selection)} · ${selection.body}` })}
              </span>
            </span>
          ) : null}
          {sketch || photo ? (
            <div className="flex flex-wrap gap-1">
              {sketch ? (
                <span className={`${chip} p-1 pr-1`} data-testid="composer-sketch">
                  <AriaButton
                    aria-label={t('assistant.sketch.edit')}
                    onPress={() => {
                      setSketching(true);
                    }}
                    className={chipPicture}
                  >
                    <img src={sketch.picture.thumbnail} alt="" className="block h-control-lg w-auto" draggable={false} />
                  </AriaButton>
                  <span className="truncate" title={t('assistant.sketch.goesWith')}>
                    {t('assistant.sketch.button')}
                  </span>
                  <IconButton
                    label={t('assistant.sketch.remove')}
                    onPress={() => {
                      setSketch(null);
                    }}
                    data-testid="composer-sketch-remove"
                  >
                    <IconX className="size-icon-sm" aria-hidden />
                  </IconButton>
                </span>
              ) : null}
              {photo ? (
                <span className={`${chip} p-1 pr-1`} data-testid="composer-photo">
                  <AriaButton
                    aria-label={t('assistant.photo.show')}
                    onPress={() => {
                      openAttachment({ thumbnail: photo.thumbnail, photo: photo.png });
                    }}
                    className={chipPicture}
                  >
                    <img src={photo.thumbnail} alt="" className="block h-control-lg w-auto" draggable={false} />
                  </AriaButton>
                  <span className="truncate" title={t('assistant.photo.goesWith')}>
                    {t('assistant.photo.button')}
                  </span>
                  <IconButton
                    label={t('assistant.photo.remove')}
                    onPress={() => {
                      setPhoto(null);
                    }}
                    data-testid="composer-photo-remove"
                  >
                    <IconX className="size-icon-sm" aria-hidden />
                  </IconButton>
                </span>
              ) : null}
            </div>
          ) : null}
          {/* Typing goes on while the assistant works; only sending waits (chat polish). */}
          <TextField value={draft} onChange={setDraft} aria-label={t('assistant.composer')} isDisabled={!writable}>
            <TextArea
              ref={composer}
              rows={2}
              placeholder={t('assistant.placeholder')}
              className="max-h-[40vh] w-full resize-none bg-transparent px-1 py-1 text-md text-text outline-none [field-sizing:content] placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-disabled"
              onPaste={(event) => {
                // A picture from the clipboard (a screenshot, a copied photo) goes along; text pastes as usual.
                const file = pictureIn(event.clipboardData);
                if (!file) return;
                event.preventDefault();
                attachPhoto(file);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                } else if (event.key === 'Escape' && busy) {
                  // Like Send's place: Esc stops the assistant while it works.
                  event.preventDefault();
                  void platform().agent.stop();
                }
              }}
            />
          </TextField>
          {photoFailed ? (
            <p role="alert" className="px-1 text-xs text-danger">
              {t('assistant.photo.failed')}
            </p>
          ) : null}
          <input
            ref={photoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            data-testid="composer-photo-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) attachPhoto(file);
            }}
          />
          <div className="flex min-w-0 items-center gap-1">
            {/* Icons only, so the route chip keeps its room; the name comes as a tooltip. */}
            <IconButton
              size="md"
              onPress={() => {
                setSketching(true);
              }}
              isDisabled={!ready}
              label={t('assistant.sketch.open')}
              tooltip={t('assistant.sketch.button')}
              tooltipPlacement="top"
              data-testid="composer-sketch-open"
            >
              <IconPencil className="size-icon-sm" aria-hidden />
            </IconButton>
            <IconButton
              size="md"
              onPress={() => {
                photoInput.current?.click();
              }}
              isDisabled={!ready}
              label={t('assistant.photo.open')}
              tooltip={t('assistant.photo.button')}
              tooltipPlacement="top"
              data-testid="composer-photo-open"
            >
              <IconPhoto className="size-icon-sm" aria-hidden />
            </IconButton>
            <span className="flex min-w-0 flex-1">
              <AgentChip />
            </span>
            {/* Stop takes Send's place while the assistant works, so the chip keeps its room (Manuel, 2026-11-06). */}
            <TooltipTrigger delay={500} closeDelay={0}>
              {busy ? (
                <AriaButton
                  onPress={() => {
                    void platform().agent.stop();
                  }}
                  aria-label={t('assistant.stop')}
                  className={`${round} border border-border-strong bg-surface text-text hover:bg-surface-hover pressed:bg-surface-pressed`}
                  data-testid="composer-stop"
                >
                  <IconPlayerStopFilled className="size-icon-sm" aria-hidden />
                </AriaButton>
              ) : (
                <AriaButton
                  type="submit"
                  isDisabled={!ready || (draft.trim() === '' && !sketch && !photo)}
                  aria-label={t('assistant.send')}
                  className={`${round} bg-accent text-on-accent hover:bg-accent-hover pressed:bg-accent-pressed`}
                  data-testid="composer-send"
                >
                  <IconArrowUp className="size-icon-sm" aria-hidden />
                </AriaButton>
              )}
              <Tooltip placement="top" offset={6} className={tooltipClass}>
                {busy ? t('assistant.stopHint') : t('assistant.sendHint')}
              </Tooltip>
            </TooltipTrigger>
          </div>
        </div>
      </Form>
      {sketching ? (
        <SketchPad
        initial={sketch?.state ?? padStart ?? emptySketch()}
        onClose={() => {
          setSketching(false);
          setPadStart(null);
        }}
        onAttach={(state, picture) => {
          setSketch({ state, picture });
          setPhoto(null);
          setSketching(false);
          setPadStart(null);
          composer.current?.focus();
        }}
        />
      ) : null}
      {shownPhoto ? (
        <ModalOverlay
          isOpen
          isDismissable
          onOpenChange={(next) => {
            if (next) return;
            URL.revokeObjectURL(shownPhoto);
            setShownPhoto(null);
          }}
          className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6 entering:animate-fade-in"
        >
          <Modal className="max-h-full max-w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-3 entering:animate-dialog-in">
            <Dialog aria-label={t('assistant.photo.show')} className="outline-none" data-testid="photo-large">
              <img src={shownPhoto} alt="" className="block max-h-[calc(100dvh_-_3rem)] max-w-full object-contain" />
            </Dialog>
          </Modal>
        </ModalOverlay>
      ) : null}
    </aside>
  );
}
