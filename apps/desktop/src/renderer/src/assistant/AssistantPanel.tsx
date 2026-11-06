import { IconArrowUp, IconPencil, IconPhoto, IconPlayerStop, IconPointer, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button as AriaButton, Form, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { selectionName, selectionsOf } from '../viewer/viewState';
import { Button } from '../ui/Button';
import { Busy } from '../ui/Feedback';
import { ChatResizer, useChatWidth } from '../shell/ChatResizer';
import { AgentChip } from './AgentChip';
import { sendToAssistant } from './send';
import { QuestionCard } from './QuestionCard';
import { Answer } from './Answer';
import { rowsOf } from './rows';
import { StepCard } from './StepCard';
import { Queries, WorkGroup } from './WorkGroup';
import { selectedStatus, useAssistant, type ConversationItem } from './store';
import { emptySketch, SketchPad, type SketchPicture, type SketchState } from './SketchPad';
import { photoPicture } from './photo';
import { SourceCard } from './SourceCard';
import { ToolCall } from './ToolCall';

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
  if (status.agent === 'local') {
    if (status.state === 'checking') return <Busy label={t('assistant.state.local.checking')} />;
    if (status.state === 'unavailable') {
      return (
        <Notice title={t('assistant.local.unavailableTitle')} body={status.detail ?? t('assistant.state.local.unavailable')}>
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

/** "8 faces · Base plate", "2 faces, 1 edge · Base plate, Lid". */
function selectionSummary(t: TFunction, selected: { faces: number; edges: number; vertices: number; bodies: string[] }): string {
  const parts = [
    selected.faces > 0 ? t('assistant.selected.faces', { count: selected.faces }) : null,
    selected.edges > 0 ? t('assistant.selected.edges', { count: selected.edges }) : null,
    selected.vertices > 0 ? t('assistant.selected.vertices', { count: selected.vertices }) : null,
  ].filter(Boolean);
  return t('assistant.selected.line', { what: parts.join(', '), bodies: selected.bodies.join(', ') });
}

function Item({ item, quiet }: { item: ConversationItem; quiet: boolean }) {
  const { t } = useTranslation();
  switch (item.kind) {
    case 'user':
      return (
        <div className="ml-6 flex flex-col items-end gap-1 self-end">
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
          <p className="rounded-lg bg-accent-subtle px-3 py-2 text-md whitespace-pre-wrap text-text">{item.text}</p>
        </div>
      );
    case 'assistant':
      return (
        <Answer text={item.text} streaming={item.open} quiet={quiet} />
      );
    case 'tool':
      return <ToolCall item={item} />;
    case 'step':
    case 'question':
      return null;
    case 'stopped':
      return <p className="text-sm text-text-muted">{t('assistant.stopped')}</p>;
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
        <p role="alert" className="text-sm text-danger">
          {item.message}
        </p>
      );
    case 'source':
      return <SourceCard source={item.source} />;
  }
}

const tip = 'rounded-sm bg-surface-raised px-2 py-1 text-xs text-text shadow-2';

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
  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const busy = status.state === 'busy';
  const ready = status.state === 'ready' && connected;
  const [width, setWidth, maxWidth] = useChatWidth();
  // A sketch for the next message (F4, F9); its elements stay while it is not sent, to draw on.
  const [sketching, setSketching] = useState(false);
  const [sketch, setSketch] = useState<{ state: SketchState; picture: SketchPicture } | null>(null);
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

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [items]);

  const send = () => {
    // A sketch or a photo alone is a message too: build a part from it.
    const text = draft.trim() || (photo ? t('assistant.photo.defaultText') : sketch ? t('assistant.sketch.defaultText') : '');
    if (!text || !ready) return;
    setDraft('');
    setSketch(null);
    setPhoto(null);
    void sendToAssistant(text, selections, undefined, photo ? undefined : (sketch ?? undefined), photo?.png);
  };

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
      {/* The route and its status live in the chip beside the composer; the heading stays for screen readers. */}
      <h2 id="assistant-title" className="sr-only">
        {t('assistant.title')}
      </h2>
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
        <Setup />
        {items.length === 0 && (status.state === 'ready' || busy) ? <p className="text-sm text-text-muted">{t('assistant.empty')}</p> : null}
        {rowsOf(items, busy).map((row) =>
          row.kind === 'item' && row.item.kind === 'question' ? (
            <QuestionCard
              key={row.item.key}
              item={row.item}
              ready={ready}
              answer={(text, answer) => {
                void platform().agent.send(text, [], answer);
              }}
              change={() => {
                setDraft(t('assistant.planCard.changeDraft'));
                composer.current?.focus();
              }}
            />
          ) : row.kind === 'step' ? (
            <StepCard key={row.item.key} item={row.item} tools={row.tools} disabled={busy || !connected} />
          ) : row.kind === 'queries' ? (
            <Queries key={row.tools[0]?.key} tools={row.tools} />
          ) : row.kind === 'work' ? (
            <WorkGroup key={row.key} entries={row.entries} live={row.live} disabled={busy || !connected} />
          ) : (
            <Item key={row.item.key} item={row.item} quiet={row.quiet} />
          ),
        )}
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
            ref={composer}
            rows={3}
            placeholder={t('assistant.placeholder')}
            className="w-full resize-none rounded-md border border-border-strong bg-surface p-2 text-md text-text outline-none placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
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
              }
            }}
          />
        </TextField>
        {selections.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1" data-testid="composer-selections" aria-label={t('assistant.selectionsGoWith', { count: selections.length })}>
            <span className="text-xs text-text-muted">{t('assistant.selectionsGoWith', { count: selections.length })}</span>
            {selections.map((entry, i) => (
              <span key={`${entry.kind}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-sunken py-0 pl-2 pr-1 tabular-nums text-xs text-text">
                <span className="truncate">{selectionName(entry)}</span>
                <AriaButton
                  aria-label={t('assistant.removeSelection', { name: selectionName(entry) })}
                  className="inline-flex size-icon items-center justify-center rounded-full text-text-subtle outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                  onPress={() => {
                    const pick = picks[i];
                    if (pick) deselect(pick);
                  }}
                >
                  <IconX className="size-icon-sm" aria-hidden />
                </AriaButton>
              </span>
            ))}
          </div>
        ) : null}
        {selection && selections.length === 1 ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted" data-testid="composer-selection">
            <IconPointer className="size-icon-sm shrink-0" aria-hidden />
            <span className="truncate" title={`${selectionName(selection)} · ${selection.body}`}>
              {t('assistant.selectionGoesWith', { kind: selection.kind, name: `${selectionName(selection)} · ${selection.body}` })}
            </span>
          </span>
        ) : null}
        {sketch ? (
          <div className="flex items-center gap-2" data-testid="composer-sketch">
            <AriaButton
              aria-label={t('assistant.sketch.edit')}
              onPress={() => {
                setSketching(true);
              }}
              className="overflow-hidden rounded-md border border-border outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus"
            >
              <img src={sketch.picture.thumbnail} alt="" className="block h-control-lg w-auto" draggable={false} />
            </AriaButton>
            <span className="mr-auto text-xs text-text-muted">{t('assistant.sketch.goesWith')}</span>
            <AriaButton
              aria-label={t('assistant.sketch.remove')}
              onPress={() => {
                setSketch(null);
              }}
              className="inline-flex size-control-sm items-center justify-center rounded-sm text-text-subtle outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
              data-testid="composer-sketch-remove"
            >
              <IconX className="size-icon-sm" aria-hidden />
            </AriaButton>
          </div>
        ) : null}
        {photo ? (
          <div className="flex items-center gap-2" data-testid="composer-photo">
            <img src={photo.thumbnail} alt="" className="block h-control-lg w-auto rounded-md border border-border" draggable={false} />
            <span className="mr-auto text-xs text-text-muted">{t('assistant.photo.goesWith')}</span>
            <AriaButton
              aria-label={t('assistant.photo.remove')}
              onPress={() => {
                setPhoto(null);
              }}
              className="inline-flex size-control-sm items-center justify-center rounded-sm text-text-subtle outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
              data-testid="composer-photo-remove"
            >
              <IconX className="size-icon-sm" aria-hidden />
            </AriaButton>
          </div>
        ) : null}
        {photoFailed ? (
          <p role="alert" className="text-xs text-danger">
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
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto flex min-w-0">
            <AgentChip />
          </span>
          {/* Icons only, so the route chip keeps its room while Stop shows; the name comes as a tooltip. */}
          <TooltipTrigger delay={400}>
          <Button
            onPress={() => {
              setSketching(true);
            }}
            isDisabled={!ready}
            aria-label={t('assistant.sketch.open')}
            data-testid="composer-sketch-open"
          >
            <IconPencil className="size-icon-sm" aria-hidden />
          </Button>
          <Tooltip placement="top" offset={6} className={tip}>
            {t('assistant.sketch.button')}
          </Tooltip>
          </TooltipTrigger>
          <TooltipTrigger delay={400}>
          <Button
            onPress={() => {
              photoInput.current?.click();
            }}
            isDisabled={!ready}
            aria-label={t('assistant.photo.open')}
            data-testid="composer-photo-open"
          >
            <IconPhoto className="size-icon-sm" aria-hidden />
          </Button>
          <Tooltip placement="top" offset={6} className={tip}>
            {t('assistant.photo.button')}
          </Tooltip>
          </TooltipTrigger>
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
          <Button type="submit" variant="primary" isDisabled={!ready || (draft.trim() === '' && !sketch && !photo)}>
            <IconArrowUp className="size-icon-sm" aria-hidden />
            {t('assistant.send')}
          </Button>
        </div>
      </Form>
      {sketching ? (
        <SketchPad
        initial={sketch?.state ?? emptySketch()}
        onClose={() => {
          setSketching(false);
        }}
        onAttach={(state, picture) => {
          setSketch({ state, picture });
          setPhoto(null);
          setSketching(false);
          composer.current?.focus();
        }}
        />
      ) : null}
    </aside>
  );
}
