import { IconFocus2, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, SwitchButton, SwitchField } from 'react-aria-components';

import { useStudio } from '../state/store';
import { BuildLine } from './BuildStatus';

/** How many faces and sketch curves the latest step changed, with the camera follow switch. */
function Changes() {
  const { t } = useTranslation();
  const changes = useStudio((s) => s.changes);
  const follow = useStudio((s) => s.followChanges);
  const setFollow = useStudio((s) => s.setFollowChanges);
  const clear = useStudio((s) => s.clearChanges);
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-md bg-surface-raised px-2 py-1 text-sm text-text shadow-2">
      {changes ? (
        <span role="status" className="flex items-center gap-1" data-testid="live-changes">
          <span aria-hidden className="size-dot rounded-full bg-changed" />
          {[
            changes.count > 0 ? t('live.changed', { count: changes.count }) : null,
            changes.sketchCurves > 0 ? t('live.sketchChanged', { count: changes.sketchCurves }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          <AriaButton
            aria-label={t('live.clear')}
            onPress={clear}
            className="rounded-sm text-text-subtle outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
          >
            <IconX className="size-icon-sm" aria-hidden />
          </AriaButton>
        </span>
      ) : null}
      <SwitchField isSelected={follow} onChange={setFollow}>
        <SwitchButton className="group flex items-center gap-1 outline-none">
        <span
          aria-hidden
          className="flex h-icon w-control-sm items-center rounded-full border border-border-strong bg-surface p-hairline group-selected:bg-accent group-focus-visible:outline-2 group-focus-visible:outline-focus"
        >
          <span className="size-dot rounded-full bg-text-subtle transition-transform group-selected:translate-x-full group-selected:bg-on-accent" />
        </span>
        <IconFocus2 className="size-icon-sm text-text-subtle" aria-hidden />
        {t('live.follow')}
        </SwitchButton>
      </SwitchField>
    </div>
  );
}

export function LiveBar() {
  const ready = useStudio((s) => s.model.status === 'ready' && (s.model.bodies.length > 0 || s.model.sketches.length > 0));
  if (!ready) return null;
  return (
    <div className="flex flex-col items-start gap-2" data-view-overlay>
      <BuildLine />
      <Changes />
    </div>
  );
}
