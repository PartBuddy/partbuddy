import { IconBox, IconCube, IconMaximize, IconPerspective } from '@tabler/icons-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, ToggleButton, Tooltip, TooltipTrigger } from 'react-aria-components';

import { useStudio, type StandardView } from '../state/store';

const tool =
  'inline-flex size-control-md items-center justify-center rounded-md text-xs font-semibold text-text outline-none transition-colors ' +
  'hover:bg-surface-hover pressed:bg-surface-selected selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';

/** Keys as in Blender's number pad, which many makers know: 1 front, 3 right, 7 top, 0 iso, 5 projection. */
const VIEW_KEYS: Record<string, StandardView> = { '1': 'front', '3': 'right', '7': 'top', '0': 'iso', f: 'fit' };

function inTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={400}>
      {children}
      <Tooltip placement="left" offset={6} className="rounded-sm bg-surface-raised px-2 py-1 text-xs text-text shadow-2">
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}

/** Standard views and the projection switch, beside the view cube (M1a). */
export function ViewTools() {
  const { t } = useTranslation();
  const projection = useStudio((s) => s.projection);
  const setProjection = useStudio((s) => s.setProjection);
  const requestView = useStudio((s) => s.requestView);
  const ortho = projection === 'orthographic';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || inTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === '5') {
        setProjection(useStudio.getState().projection === 'orthographic' ? 'perspective' : 'orthographic');
      } else if (VIEW_KEYS[key]) {
        requestView(VIEW_KEYS[key]);
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [requestView, setProjection]);

  const views: { view: StandardView; key: string; icon: ReactNode }[] = [
    { view: 'fit', key: 'F', icon: <IconMaximize className="size-icon-sm" aria-hidden /> },
    { view: 'iso', key: '0', icon: <IconCube className="size-icon-sm" aria-hidden /> },
    { view: 'front', key: '1', icon: <span aria-hidden>{t('viewer.views.front').slice(0, 1)}</span> },
    { view: 'right', key: '3', icon: <span aria-hidden>{t('viewer.views.right').slice(0, 1)}</span> },
    { view: 'top', key: '7', icon: <span aria-hidden>{t('viewer.views.top').slice(0, 1)}</span> },
  ];

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('viewer.views.toolbar')}
      className="pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-1 shadow-2"
      data-testid="view-tools"
    >
      {views.map(({ view, key, icon }) => (
        <Tip key={view} label={`${t(`viewer.views.${view}`)} (${key})`}>
          <AriaButton
            aria-label={t(`viewer.views.${view}`)}
            aria-keyshortcuts={key}
            className={tool}
            onPress={() => {
              requestView(view);
            }}
          >
            {icon}
          </AriaButton>
        </Tip>
      ))}
      <span aria-hidden className="mx-1 h-hairline bg-border" />
      <Tip label={`${t(ortho ? 'viewer.views.ortho' : 'viewer.views.perspective')} (5)`}>
        <ToggleButton
          aria-label={t('viewer.views.ortho')}
          aria-keyshortcuts="5"
          isSelected={ortho}
          onChange={(selected) => {
            setProjection(selected ? 'orthographic' : 'perspective');
          }}
          className={tool}
          data-testid="projection"
        >
          {ortho ? <IconBox className="size-icon-sm" aria-hidden /> : <IconPerspective className="size-icon-sm" aria-hidden />}
        </ToggleButton>
      </Tip>
    </div>
  );
}
