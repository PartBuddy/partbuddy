import { IconExternalLink, IconSearch, IconWorld } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { ResearchSource } from '../../../shared/contract';

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const linkClass = 'inline-flex min-w-0 items-center gap-1 text-accent-text underline outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus';

/**
 * A source of the assistant's research (B7): a web search with the pages it found, or a page it
 * read. The links open in the browser; the text of the pages never shows here.
 */
export function SourceCard({ source }: { source: ResearchSource }) {
  const { t } = useTranslation();
  if (source.kind === 'search') {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm" data-testid="source-card" data-kind="search">
        <span className="flex items-center gap-2 text-text-muted">
          <IconSearch className="size-icon-sm shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{t('assistant.source.search', { query: source.query ?? '' })}</span>
        </span>
        {source.links && source.links.length > 0 ? (
          <ul className="flex flex-col gap-1 pl-5">
            {source.links.map((link) => (
              <li key={link.url} className="flex min-w-0 items-baseline gap-2">
                <a href={link.url} target="_blank" rel="noreferrer" className={linkClass} title={link.url}>
                  <span className="truncate">{link.title}</span>
                </a>
                <span className="shrink-0 text-xs text-text-subtle">{host(link.url)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  if (!source.url) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm" data-testid="source-card" data-kind="page">
      <IconWorld className="size-icon-sm shrink-0 text-text-muted" aria-hidden />
      <span className="shrink-0 text-text-muted">{t('assistant.source.page')}</span>
      <a href={source.url} target="_blank" rel="noreferrer" className={linkClass} title={source.url}>
        <span className="truncate">{source.title ?? host(source.url)}</span>
        <IconExternalLink className="size-icon-sm shrink-0" aria-hidden />
      </a>
    </div>
  );
}
