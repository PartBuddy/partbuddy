import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { Markdown } from './Markdown';

/** Height of a quiet answer: about four lines of chat text. */
const QUIET_HEIGHT = '6.5rem';

/**
 * An answer of the assistant (UI upgrade, chat). The newest shows in full; an earlier one is
 * quiet: cut to a few lines with "Show more" when it is longer, so the chat stays readable.
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
    <div className="mr-6 flex flex-col items-start gap-1">
      <div
        ref={box}
        data-testid="assistant-text"
        data-quiet={shortened}
        className={shortened ? 'relative overflow-hidden text-text-muted' : ''}
        style={shortened ? { maxHeight: QUIET_HEIGHT, maskImage: overflows ? 'linear-gradient(to bottom, black 60%, transparent)' : undefined } : undefined}
      >
        <Markdown text={text} streaming={streaming} />
      </div>
      {quiet && (overflows || expanded) ? (
        <AriaButton
          onPress={() => {
            setExpanded(!expanded);
          }}
          className="rounded-sm text-xs text-accent outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          data-testid="answer-more"
        >
          {expanded ? t('assistant.showLess') : t('assistant.showMore')}
        </AriaButton>
      ) : null}
    </div>
  );
}
