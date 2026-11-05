import { useTranslation } from 'react-i18next';

import { selectedStatus, useAssistant } from '../assistant/store';
import { Busy } from '../ui/Feedback';
import { buildActivity, type BuildActivity } from './buildActivity';

/** The latest tool call as a line: running or last, in the work log's words. */
function useActivityText(activity: BuildActivity): string {
  const { t } = useTranslation();
  if (activity.phrase) {
    const what = t(`steps.${activity.phrase.key}`, activity.phrase.values);
    return t(activity.running ? 'build.running' : 'build.last', { what });
  }
  if (activity.running) return t('build.working');
  return t('live.thinking');
}

function useBuild(): { busy: boolean; activity: BuildActivity } {
  const busy = useAssistant((s) => selectedStatus(s.state).state === 'busy');
  const items = useAssistant((s) => s.items);
  return { busy, activity: buildActivity(items) };
}

/**
 * The build in the middle of an empty view (UI upgrade step 7): while the assistant works and
 * nothing is built yet, the largest area of the app says what happens instead of "No body".
 * Sketches and bodies replace it as soon as SolidCraft has them.
 */
export function BuildCard() {
  const { t } = useTranslation();
  const { activity } = useBuild();
  const text = useActivityText(activity);
  return (
    <div className="pointer-events-auto flex w-full flex-1 items-center justify-center">
      <div
        className="flex w-dialog-sm max-w-full flex-col gap-2 rounded-lg border border-border bg-surface-raised p-5 shadow-2"
        role="status"
        aria-live="polite"
        data-testid="build-card"
      >
        <Busy label={activity.plan ?? t('build.title')} />
        <p className="text-md text-text" data-testid="build-activity">
          {text}
        </p>
        <p className="text-xs text-text-subtle">{t('build.progress', { steps: activity.steps, calls: activity.calls })}</p>
      </div>
    </div>
  );
}

/** The same, as a line over a design that already shows something. */
export function BuildLine() {
  const { t } = useTranslation();
  const { busy, activity } = useBuild();
  const text = useActivityText(activity);
  if (!busy) return null;
  return (
    <div className="flex max-w-dialog-sm flex-col gap-1 rounded-md bg-surface-raised px-3 py-2 shadow-2" role="status" aria-live="polite" data-testid="live-step">
      {activity.plan ? (
        <p className="line-clamp-2 text-xs text-text-subtle" title={activity.plan}>
          {activity.plan}
        </p>
      ) : null}
      <Busy label={text} />
      <p className="text-xs text-text-subtle">{t('build.progress', { steps: activity.steps, calls: activity.calls })}</p>
    </div>
  );
}

/** Whether the assistant works right now, for callers that pick between the card and the empty state. */
export function useAssistantBusy(): boolean {
  return useAssistant((s) => selectedStatus(s.state).state === 'busy');
}
