import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { Markdown } from './Markdown';
import { MessageActions } from './MessageActions';
import { linkClass } from '../ui/Button';

/** Height of a quiet answer: about four lines of chat text. */
const QUIET_HEIGHT = '6.5rem';

/**
 * An answer of the assistant (UI upgrade, chat). The newest shows in full; an earlier one is
 * quiet: cut to a few lines with "Show more" when it is longer, so the chat stays readable. It
 * takes the chat's full width (no bubble), so tables and code blocks fit or scroll on their own.
 */
export function Answer({ text, streaming, quiet }: { text: string; streaming: boolean; quiet: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shortened = quiet && !expanded;

  useLayoutEffect(() => {
    const element = box.current;
    if (element) setOverflows(element.scrollHeight > element.clientHeight + 1);
  }, [text, shortened]);

  return (
    <div className="group/message relative flex min-w-0 flex-col gap-1">
      <div
        ref={box}
        data-testid="assistant-text"
        data-quiet={shortened}
        className={shortened ? 'relative min-w-0 overflow-hidden text-text-muted' : 'min-w-0'}
        style={shortened ? { maxHeight: QUIET_HEIGHT, maskImage: overflows ? 'linear-gradient(to bottom, black 60%, transparent)' : undefined } : undefined}
      >
        <Markdown text={text} streaming={streaming} />
      </div>
      {quiet && (overflows || expanded) ? (
        <AriaButton
          onPress={() => {
            setExpanded(!expanded);
          }}
          className={`self-start text-xs ${linkClass}`}
          data-testid="answer-more"
        >
          {expanded ? t('assistant.showLess') : t('assistant.showMore')}
        </AriaButton>
      ) : null}
      {/* Over the answer's top corner, inside its box: no row kept free under every answer (audit C-17). */}
      {streaming ? null : (
        <div className="absolute top-0 right-0 rounded-md focus-within:bg-surface group-hover/message:bg-surface">
          <MessageActions text={text} />
        </div>
      )}
    </div>
  );
}
