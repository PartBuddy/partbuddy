import { harden } from 'rehype-harden';
import { defaultRehypePlugins, Streamdown, type StreamdownProps } from 'streamdown';

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

export function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Streamdown
      className="cs-markdown flex flex-col gap-2 text-md text-text"
      rehypePlugins={rehypePlugins}
      controls={false}
      linkSafety={{ enabled: false }}
      isAnimating={streaming}
      parseIncompleteMarkdown
    >
      {text}
    </Streamdown>
  );
}
