import { IconCornerUpLeft, IconEyeCheck, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { Fold } from './Fold';
import type { ConversationItem } from './store';
import { pressable } from '../ui/Button';

export type ReviewItem = Extract<ConversationItem, { kind: 'review' }>;

/**
 * The review before "done" in the chat (main/agents/review.ts): "checked: front, top, angled" that opens to its three
 * pictures, each shown large on a click; a route without pictures gets the line alone. Being sent back for it and
 * ending without it are quiet notes, not errors.
 */
export function ReviewLine({ item, show }: { item: ReviewItem; show?: ((src: string, label: string) => void) | undefined }) {
  const { t } = useTranslation();
  if (item.outcome !== 'reviewed') {
    const Icon = item.outcome === 'sentBack' ? IconCornerUpLeft : IconInfoCircle;
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-text-muted" data-testid="review-note" data-outcome={item.outcome}>
        <Icon className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
        {t(`assistant.review.${item.outcome}`)}
      </p>
    );
  }
  const line = (
    <>
      <IconEyeCheck className="size-icon-sm shrink-0 text-success" aria-hidden />
      <span className="min-w-0 truncate">
        {item.pictures.length > 0
          ? t('assistant.review.views', { views: item.pictures.map((picture) => t(`assistant.review.view.${picture.view}`)).join(', ') })
          : t(item.picturesFailed ? 'assistant.review.noPictures' : 'assistant.review.text')}
      </span>
    </>
  );
  if (item.pictures.length === 0) {
    return (
      <p className="flex min-h-control-sm items-center gap-2 px-1 text-sm text-text-muted" data-testid="review-line">
        {line}
      </p>
    );
  }
  return (
    <Fold testId="review-line" summary={line} lazy>
      <div className="flex flex-wrap gap-1">
        {item.pictures.map((picture) => {
          const label = t(`assistant.review.picture.${picture.view}`);
          return (
            <AriaButton
              key={picture.view}
              onPress={() => show?.(picture.src, label)}
              aria-label={label}
              className={`overflow-hidden rounded-md border border-border hover:border-border-strong pressed:border-accent ${pressable}`}
              data-testid="review-picture"
            >
              {/* 640 × 480 from SolidCraft, shown small by CSS; the button's label names it. */}
              <img src={picture.src} alt="" className="block aspect-[4/3] w-[6rem] object-cover" draggable={false} />
            </AriaButton>
          );
        })}
      </div>
    </Fold>
  );
}
