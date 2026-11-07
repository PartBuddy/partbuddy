import { IconCheck, IconCopy } from '@tabler/icons-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { harden } from 'rehype-harden';
import { defaultRehypePlugins, Streamdown, type StreamdownProps } from 'streamdown';

import { codeHighlighter } from './codeHighlight';

/**
 * Assistant answers as Markdown with Streamdown (building blocks, issue #18). Model output is
 * untrusted: raw HTML stays text (no rehype-raw), the sanitizer runs, no image is ever loaded
 * (also no data: images), and only http and https links stay links ("*" in rehype-harden); the
 * main process opens https links in the system browser and nothing else.
 */
const rehypePlugins: NonNullable<StreamdownProps['rehypePlugins']> = [
  ...(defaultRehypePlugins.sanitize ? [defaultRehypePlugins.sanitize] : []),
  [
    harden,
    {
      defaultOrigin: 'https://partbuddy.invalid',
      allowedLinkPrefixes: ['*'],
      allowedImagePrefixes: [],
      allowDataImages: false,
    },
  ],
];

// Code blocks coloured by Shiki (chat polish); a grammar loads on first use of its language.
const plugins: NonNullable<StreamdownProps['plugins']> = { code: codeHighlighter };
const controls: NonNullable<StreamdownProps['controls']> = { code: { copy: true, download: false }, table: false, mermaid: false };
// Words of a streaming answer fade in instead of popping up; none under reduced motion (styles.css).
const animated: NonNullable<StreamdownProps['animated']> = { animation: 'fadeIn', duration: 160, sep: 'word' };
// Tabler, like every icon in the app; Streamdown passes only a size.
const icons: NonNullable<StreamdownProps['icons']> = {
  CopyIcon: ({ size }) => <IconCopy size={size ?? 14} aria-hidden />,
  CheckIcon: ({ size }) => <IconCheck size={size ?? 14} aria-hidden />,
};

/**
 * Streamdown splits the text into blocks and renders only the changed last block while tokens
 * arrive; the memo keeps every finished answer from rendering again at all.
 */
export const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useTranslation();
  // A wide table scrolls on its own; the keyboard reaches it too (WCAG 2.1.1, axe: scrollable-region-focusable).
  const components = useMemo<NonNullable<StreamdownProps['components']>>(
    () => ({
      // The hast node stays out of the DOM attributes.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      table: ({ node, children, ...props }) => (
        <div className="cs-table" role="region" aria-label={t('assistant.message.table')} tabIndex={0}>
          <table {...props} data-streamdown="table">
            {children}
          </table>
        </div>
      ),
    }),
    [t],
  );
  return (
    <Streamdown
      className="cs-markdown flex min-w-0 flex-col gap-2 text-md text-text"
      rehypePlugins={rehypePlugins}
      plugins={plugins}
      controls={controls}
      icons={icons}
      components={components}
      translations={{ copyCode: t('assistant.message.copyCode'), copied: t('assistant.message.copied') }}
      lineNumbers={false}
      linkSafety={{ enabled: false }}
      animated={animated}
      {...(streaming ? { caret: 'circle' as const } : {})}
      isAnimating={streaming}
      parseIncompleteMarkdown
    >
      {text}
    </Streamdown>
  );
});
