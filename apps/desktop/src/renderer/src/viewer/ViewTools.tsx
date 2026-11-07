import { IconArrowsExchange, IconArrowsSplit2, IconBox, IconBoxMultiple, IconCheck, IconCube, IconFocusCentered, IconLayoutGrid, IconMaximize, IconPerspective, IconRulerMeasure, IconSlice, IconStack2 } from '@tabler/icons-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  TooltipTrigger,
} from 'react-aria-components';

import { useStudio, type DisplayMode, type Section, type StandardView } from '../state/store';
import { CadIcon } from '../ui/CadIcon';
import { bodiesBox, faceSection, sectionSpan } from './section';
import { ViewIcon } from '../ui/ViewIcon';
import { iconButtonClass, toggleSelected } from '../ui/Button';
import { tooltipClass } from '../ui/Tooltip';
import { segmentClass, segmentGroupClass, SliderBar } from '../ui/Choice';
import { POPOVER_OFFSET, menuClass, menuItemClass, popoverClass } from '../ui/Overlay';

/** View tools: the shared icon button look; a tool that stays on shows the accent's quiet fill. */
const tool = `${iconButtonClass('md')} text-xs font-semibold ${toggleSelected}`;

/** The assembled/plate switch: a segmented control. */
const segment = segmentClass('md');

/** Keys as in Blender's number pad, which many makers know: 1 front, 3 right, 7 top, 0 iso, 5 projection. */
const VIEW_KEYS: Record<string, StandardView> = { '1': 'front', '3': 'right', '7': 'top', '0': 'iso', f: 'fit' };
/** Ctrl with the same keys (by physical key, so it works on every layout). */
const OPPOSITE_KEYS: Record<string, StandardView> = { Digit1: 'back', Numpad1: 'back', Digit3: 'left', Numpad3: 'left', Digit7: 'bottom', Numpad7: 'bottom' };

function inTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      {children}
      <Tooltip placement="bottom" offset={6} className={tooltipClass}>
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}

const DISPLAY_MODES: DisplayMode[] = ['shadedEdges', 'shaded', 'hiddenEdges', 'xray', 'wireframe'];
/** Shift with 1 to 5 picks a display mode, by physical key so it works on every keyboard layout. */
const MODE_KEYS: Record<string, DisplayMode> = Object.fromEntries(DISPLAY_MODES.map((mode, i) => [`Digit${String(i + 1)}`, mode]));

/** How the bodies are drawn (UI upgrade step 9): a menu with one choice. */
function DisplayModeMenu() {
  const { t } = useTranslation();
  const mode = useStudio((s) => s.displayMode);
  const setMode = useStudio((s) => s.setDisplayMode);
  return (
    <MenuTrigger>
      <Tip label={t('viewer.display.title')}>
        <AriaButton aria-label={t('viewer.display.title')} className={tool} data-testid="display-mode">
          <IconBoxMultiple className="size-icon-sm" aria-hidden />
        </AriaButton>
      </Tip>
      <Popover placement="bottom" offset={POPOVER_OFFSET} className={popoverClass}>
        <Menu
          aria-label={t('viewer.display.title')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[mode]}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const [key] = [...keys];
            if (DISPLAY_MODES.includes(key as DisplayMode)) setMode(key as DisplayMode);
          }}
          className={menuClass}
        >
          {DISPLAY_MODES.map((id, i) => (
            <MenuItem
              key={id}
              id={id}
              aria-keyshortcuts={`Shift+${String(i + 1)}`}
              className={menuItemClass}
            >
              {({ isSelected }) => (
                <>
                  <span className="flex size-icon-sm items-center justify-center">{isSelected ? <IconCheck className="size-icon-sm text-accent-text" aria-hidden /> : null}</span>
                  <span className="flex-1">{t(`viewer.display.${id}`)}</span>
                  <kbd aria-hidden className="font-sans text-xs tabular-nums text-text-subtle">⇧{i + 1}</kbd>
                </>
              )}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/** The settings of an open section: axis, where it cuts, and which side stays. */
function SectionPanel({ section }: { section: Section }) {
  const { t } = useTranslation();
  const setSection = useStudio((s) => s.setSection);
  const model = useStudio((s) => s.model);
  // Where the cut lies in the part, in mm along its axis (polish round 2: the slider alone said nothing).
  const bodies = model.status === 'ready' ? model.bodies : [];
  const box = bodiesBox(bodies);
  const span = box.isEmpty() ? null : sectionSpan(section, box);
  const at = span ? span.min + Math.min(1, Math.max(0, section.position)) * (span.max - span.min) : null;
  // From the face it is aligned to, the offset counts from that face.
  const fromFace = section.face && at !== null ? at - section.face.normal.reduce((sum, v, i) => sum + (v * (section.face?.origin[i] ?? 0)), 0) / Math.hypot(...section.face.normal) : null;
  // A picked flat face can carry the section (viewport CAD round).
  const pick = useStudio((s) => (s.selection?.kind === 'face' ? s.selection : null));
  const pickedNormal = pick ? bodies[pick.body]?.model.table.faces[pick.face]?.planeNormal : undefined;
  return (
    <div
      role="group"
      aria-label={t('viewer.section.title')}
      className="pointer-events-auto absolute left-0 top-full z-10 mt-2 flex w-menu flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-testid="section-panel"
    >
      <span className="px-1 text-xs font-semibold text-text-muted">{t('viewer.section.title')}</span>
      <div className="flex items-center gap-2">
        <ToggleButtonGroup
          aria-label={t('viewer.section.axis')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={section.face ? [] : [section.axis]}
          onSelectionChange={(keys) => {
            const [axis] = [...keys];
            if (axis === 'x' || axis === 'y' || axis === 'z') setSection({ ...section, axis, face: undefined });
          }}
          className="flex gap-1"
        >
          {(['x', 'y', 'z'] as const).map((axis) => (
            <ToggleButton key={axis} id={axis} aria-label={t('viewer.section.along', { axis: axis.toUpperCase() })} className={tool}>
              {axis.toUpperCase()}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Tip label={t('viewer.section.alignFace')}>
          <ToggleButton
            aria-label={t('viewer.section.alignFace')}
            isSelected={section.face !== undefined}
            isDisabled={!pick || !pickedNormal}
            onChange={() => {
              if (pick && pickedNormal) setSection({ ...faceSection(pick.point, pickedNormal, box), flip: section.flip });
            }}
            className={tool}
            data-testid="section-face"
          >
            <CadIcon name="plane" className="size-icon-sm" />
          </ToggleButton>
        </Tip>
        <span className="flex-1" />
        <Tip label={t('viewer.section.flip')}>
          <AriaButton
            aria-label={t('viewer.section.flip')}
            className={tool}
            onPress={() => {
              setSection({ ...section, flip: !section.flip });
            }}
            data-testid="section-flip"
          >
            <IconArrowsExchange className="size-icon-sm" aria-hidden />
          </AriaButton>
        </Tip>
      </div>
      <Slider
        aria-label={t('viewer.section.position')}
        value={Math.round(section.position * 100)}
        minValue={0}
        maxValue={100}
        onChange={(value) => {
          setSection({ ...section, position: value / 100 });
        }}
        className="w-full"
        data-testid="section-position"
      >
        <SliderBar />
      </Slider>
      {fromFace !== null ? (
        <span className="px-1 text-xs tabular-nums text-text-muted" data-testid="section-at">
          {t('viewer.section.fromFace', { value: Math.round(fromFace * 10) / 10 })}
        </span>
      ) : at !== null ? (
        <span className="px-1 text-xs tabular-nums text-text-muted" data-testid="section-at">
          {t('viewer.section.at', { axis: section.axis.toUpperCase(), value: Math.round(at * 10) / 10 })}
        </span>
      ) : null}
      {!section.face && !pickedNormal ? <span className="px-1 text-xs text-text-subtle">{t('viewer.section.faceHint')}</span> : null}
    </div>
  );
}

/** The exploded view (F7): one slider from assembled to fully apart. */
function ExplodePanel({ amount }: { amount: number }) {
  const { t } = useTranslation();
  const setExplode = useStudio((s) => s.setExplode);
  return (
    <div
      role="group"
      aria-label={t('viewer.explode.title')}
      className="pointer-events-auto absolute left-0 top-full z-10 mt-2 flex w-menu flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-testid="explode-panel"
    >
      <Slider
        aria-label={t('viewer.explode.amount')}
        value={Math.round(amount * 100)}
        minValue={0}
        maxValue={100}
        onChange={(value) => {
          setExplode(value / 100);
        }}
        className="w-full"
        data-testid="explode-amount"
      >
        <div className="flex justify-between text-xs text-text-muted">
          <span>{t('viewer.explode.assembled')}</span>
          <span>{t('viewer.explode.apart')}</span>
        </div>
        <SliderBar />
      </Slider>
      <p className="text-xs text-text-muted">{t('viewer.explode.hint')}</p>
    </div>
  );
}

/** Standard views and the projection switch, beside the view cube (M1a). */
export function ViewTools() {
  const { t } = useTranslation();
  const projection = useStudio((s) => s.projection);
  const setProjection = useStudio((s) => s.setProjection);
  const requestView = useStudio((s) => s.requestView);
  const ortho = projection === 'orthographic';
  const dimensions = useStudio((s) => s.dimensions);
  const setDimensions = useStudio((s) => s.setDimensions);
  const section = useStudio((s) => s.section);
  const setSection = useStudio((s) => s.setSection);
  const explode = useStudio((s) => s.explode);
  const setExplode = useStudio((s) => s.setExplode);
  // The exploded view only means something for a print of several parts.
  const parts = useStudio((s) => (s.model.status === 'ready' ? s.model.bodies.length : 0));
  const viewMode = useStudio((s) => s.viewMode);
  const setViewMode = useStudio((s) => s.setViewMode);
  const playback = useStudio((s) => s.playback !== null);
  const setPlayback = useStudio((s) => s.setPlayback);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.altKey || inTextField(event.target)) return;
      const key = event.key.toLowerCase();
      // Ctrl with a view key looks from the opposite side, as in Blender: back, left, bottom.
      if (event.ctrlKey) {
        const opposite = OPPOSITE_KEYS[event.code];
        if (!opposite) return;
        requestView(opposite);
        event.preventDefault();
        return;
      }
      if (event.shiftKey && key === 'f') {
        requestView('selection');
      } else if (event.shiftKey && MODE_KEYS[event.code]) {
        useStudio.getState().setDisplayMode(MODE_KEYS[event.code] ?? 'shadedEdges');
      } else if (event.shiftKey) {
        return;
      } else if (key === 'm') {
        setDimensions(useStudio.getState().dimensions === 'off' ? 'feature' : 'off');
      } else if (key === '5') {
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
  }, [requestView, setProjection, setDimensions]);

  const views: { view: StandardView; key: string; icon: ReactNode }[] = [
    { view: 'fit', key: 'F', icon: <IconMaximize className="size-icon-sm" aria-hidden /> },
    { view: 'selection', key: 'Shift+F', icon: <IconFocusCentered className="size-icon-sm" aria-hidden /> },
    { view: 'iso', key: '0', icon: <IconCube className="size-icon-sm" aria-hidden /> },
    { view: 'front', key: '1', icon: <ViewIcon face="front" className="size-icon-sm" /> },
    { view: 'right', key: '3', icon: <ViewIcon face="right" className="size-icon-sm" /> },
    { view: 'top', key: '7', icon: <ViewIcon face="top" className="size-icon-sm" /> },
  ];

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={t('viewer.views.toolbar')}
      className="pointer-events-auto relative flex max-w-full flex-row flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-raised p-1 shadow-2"
      data-view-overlay
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
      <span aria-hidden className="my-1 w-hairline self-stretch bg-border" />
      <Tip label={`${t('dimensions.tool')} (M)`}>
        <ToggleButton
          aria-label={t('dimensions.tool')}
          aria-keyshortcuts="M"
          isSelected={dimensions !== 'off'}
          onChange={(on) => {
            setDimensions(on ? 'feature' : 'off');
          }}
          className={tool}
          data-testid="dimensions"
        >
          <CadIcon name="dimension" className="size-icon-sm" />
        </ToggleButton>
      </Tip>
      {dimensions === 'off' ? null : (
        <Tip label={t('dimensions.all')}>
          <ToggleButton
            aria-label={t('dimensions.all')}
            isSelected={dimensions === 'all'}
            onChange={(all) => {
              setDimensions(all ? 'all' : 'feature');
            }}
            className={tool}
            data-testid="dimensions-all"
          >
            <IconRulerMeasure className="size-icon-sm" aria-hidden />
          </ToggleButton>
        </Tip>
      )}
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
      <span aria-hidden className="my-1 w-hairline self-stretch bg-border" />
      <DisplayModeMenu />
      <Tip label={t('viewer.section.title')}>
        <ToggleButton
          aria-label={t('viewer.section.title')}
          isSelected={section !== null}
          onChange={(on) => {
            setSection(on ? { axis: 'z', position: 0.5, flip: false } : null);
          }}
          className={tool}
          data-testid="section"
        >
          <IconSlice className="size-icon-sm" aria-hidden />
        </ToggleButton>
      </Tip>
      {section ? <SectionPanel section={section} /> : null}
      {parts > 1 ? (
        <Tip label={t('viewer.explode.title')}>
          <ToggleButton
            aria-label={t('viewer.explode.title')}
            isSelected={explode !== null}
            onChange={(on) => {
              setExplode(on ? 0.6 : null);
            }}
            className={tool}
            data-testid="explode"
          >
            <IconArrowsSplit2 className="size-icon-sm" aria-hidden />
          </ToggleButton>
        </Tip>
      ) : null}
      {parts > 1 ? (
        <Tip label={t('assembly.title')}>
          <ToggleButton
            aria-label={t('assembly.title')}
            isSelected={playback}
            onChange={(on) => {
              // Opens at the start and plays at once; closing glides the parts back together.
              setPlayback(on ? { position: 0, playing: true } : null);
            }}
            className={tool}
            data-testid="assembly"
          >
            <IconStack2 className="size-icon-sm" aria-hidden />
          </ToggleButton>
        </Tip>
      ) : null}
      {explode !== null && parts > 1 ? <ExplodePanel amount={explode} /> : null}
      {parts > 1 ? (
        <>
          <span aria-hidden className="my-1 w-hairline self-stretch bg-border" />
          <ToggleButtonGroup
            aria-label={t('plate.switch')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[viewMode]}
            onSelectionChange={(keys) => {
              const [key] = [...keys];
              if (key === 'assembled' || key === 'plate') setViewMode(key);
            }}
            className={segmentGroupClass}
          >
            <ToggleButton id="assembled" className={segment} data-testid="view-assembled">
              <IconBox className="size-icon-sm" aria-hidden />
              {t('plate.assembled')}
            </ToggleButton>
            <ToggleButton id="plate" className={segment} data-testid="view-plate">
              <IconLayoutGrid className="size-icon-sm" aria-hidden />
              {t('plate.plate')}
            </ToggleButton>
          </ToggleButtonGroup>
        </>
      ) : null}
    </div>
  );
}
