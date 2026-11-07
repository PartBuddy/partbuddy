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
    <div className="group/message flex min-w-0 flex-col gap-1">
      <div
        ref={box}
        data-testid="assistant-text"
        data-quiet={shortened}
        className={shortened ? 'relative min-w-0 overflow-hidden text-text-muted' : 'min-w-0'}
        style={shortened ? { maxHeight: QUIET_HEIGHT, maskImage: overflows ? 'linear-gradient(to bottom, black 60%, transparent)' : undefined } : undefined}
      >
        <Markdown text={text} streaming={streaming} />
      </div>
      <div className="flex min-h-control-sm items-center gap-2">
        {quiet && (overflows || expanded) ? (
          <AriaButton
            onPress={() => {
              setExpanded(!expanded);
            }}
            className={`text-xs ${linkClass}`}
            data-testid="answer-more"
          >
            {expanded ? t('assistant.showLess') : t('assistant.showMore')}
          </AriaButton>
        ) : null}
        {streaming ? null : <MessageActions text={text} />}
      </div>
    </div>
  );
}
