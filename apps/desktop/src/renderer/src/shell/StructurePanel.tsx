import { IconBox, IconEye, IconEyeOff, IconFileImport, IconFocusCentered, IconPencil, IconPencilPlus, IconNut, IconTransform } from '@tabler/icons-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleButton } from 'react-aria-components';
import { Box3, Vector3 } from 'three';

import { NotesSection } from '../notes/NotesSection';
import { bodyKindOf } from './bodyKinds';
import { useFileImport } from './fileImport';
import { ParametersSection } from './ParametersSection';
import { ExpandToggle, NEW_PART, PartDetails, PrintedToggle, useParts } from './PartDetails';
import { RenameField, Tree, TreeEmpty, TreeExtra, TreeItem, TreeSection, type TreeAction } from './Tree';
import { platform } from '../platform';
import { useStudio, type ModelState } from '../state/store';
import { IconButton, iconButtonClass } from '../ui/Button';
import { CadIcon } from '../ui/CadIcon';

/** Row tools in the tree: as tall as the row, reached by the tree's own keys, not by Tab. */
const tool = iconButtonClass('sm');

function EyeToggle({ name, visible, onToggle }: { name: string; visible: boolean; onToggle: (visible: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <ToggleButton
      aria-label={t(visible ? 'structure.hide' : 'structure.show', { name })}
      isSelected={visible}
      onChange={onToggle}
      excludeFromTabOrder
      // Shown on hover, focus and selection; always for a hidden item, like a CAD browser.
      className={`${tool} ${visible ? 'invisible group-hover/row:visible group-focus-visible/row:visible group-aria-selected/row:visible' : ''}`}
    >
      {visible ? <IconEye className="size-icon-sm" aria-hidden /> : <IconEyeOff className="size-icon-sm" aria-hidden />}
    </ToggleButton>
  );
}

/**
 * "Convert to faces" at a mesh body (B4, `mesh.convert`, closed meshes only). SolidCraft has no
 * repair for parts from STEP or IGES, so they and modelled parts get nothing.
 */
function ConvertButton({ body }: { body: string }) {
  const { t } = useTranslation();
  const setNotice = useStudio((s) => s.setNotice);
  const [busy, setBusy] = useState(false);
  const label = t('structure.convert', { name: body });
  const run = () => {
    setBusy(true);
    void platform()
      .design.convertMesh(body)
      .then((result) => {
        if (result.ok) setNotice({ tone: 'success', text: t('structure.convertDone', { name: body }) });
        else if (result.reason === 'openMesh') setNotice({ tone: 'danger', text: t('structure.openMesh', { name: body }) });
        else setNotice({ tone: 'danger', text: t('actions.failed', { detail: result.detail.slice(0, 200) }) });
      })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <IconButton label={label} tooltip={t('structure.convertHint')} isDisabled={busy} onPress={run} excludeFromTabOrder data-testid="structure-convert">
      <IconTransform className="size-icon-sm" aria-hidden />
    </IconButton>
  );
}

type Ready = Extract<ModelState, { status: 'ready' }>;

/** Where the camera goes on a double click: the body's or the sketch's box; null when it is not on screen. */
function boxOf(model: Ready, item: { kind: 'body'; name: string } | { kind: 'sketch'; id: number }): { min: [number, number, number]; max: [number, number, number] } | null {
  const box = new Box3();
  if (item.kind === 'body') {
    const geometry = model.bodies.find((body) => body.name === item.name)?.model.geometry;
    if (!geometry) return null;
    geometry.computeBoundingBox();
    if (geometry.boundingBox) box.copy(geometry.boundingBox);
  } else {
    const sketch = model.sketches.find((entry) => entry.id === item.id);
    if (!sketch) return null;
    const point = new Vector3();
    for (let i = 0; i < sketch.positions.length; i += 3) box.expandByPoint(point.fromArray(sketch.positions, i));
  }
  return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
}

/**
 * The structure tree on the left (M1c, CAD-style browser): parameters, bodies, sketches and notes
 * in folding sections. A row selects its body or sketch in the view and the view's selection marks
 * its body's row; a double click frames it. The eye shows or hides it; SolidCraft hides a sketch
 * once a feature uses it.
 */
export function StructurePanel() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  const treeSelection = useStudio((s) => s.treeSelection);
  const picks = useStudio((s) => s.selections);
  const selectInTree = useStudio((s) => s.selectInTree);
  const requestFocus = useStudio((s) => s.requestFocus);
  const requestAssistant = useStudio((s) => s.requestAssistant);
  const { intoDesign } = useFileImport();
  const ready = model.status === 'ready' ? model : null;
  // The parts list (P6): printed bodies get a printed switch, every body its copies and a note.
  const printable = ready ? ready.structure.bodies.map((body) => body.name).filter((name) => ready.structure.standardParts?.includes(name) !== true) : [];
  const { parts, save } = useParts(ready?.documentId ?? null, printable);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (model.status !== 'ready') return null;
  const { bodies, sketches } = model.structure;
  const editing = new Set(model.sketches.filter((sketch) => sketch.active).map((sketch) => sketch.id));
  // Bodies with a face, edge or vertex selected in the view.
  const pickedInView = new Set(picks.map((pick) => model.bodies[pick.body]?.name));

  const fail = (error: unknown) => {
    setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
  };
  const toggle = (command: { bodies: string[]; sketches: number[]; visible: boolean }) => {
    void platform().design.visibility(command).catch(fail);
  };
  const focus = (item: { kind: 'body'; name: string } | { kind: 'sketch'; id: number }) => {
    selectInTree(item);
    const box = boxOf(model, item);
    if (box) requestFocus(box);
  };
  const rename = (body: string, name: string | null) => {
    setRenaming(null);
    if (name === null) return;
    void platform()
      .design.renameBody(body, name)
      .then(() => {
        // The parts list is kept by body name; its note moves with the body.
        const note = parts[body];
        if (note) save(name, note, printable.map((entry) => (entry === body ? name : entry)));
        if (treeSelection?.kind === 'body' && treeSelection.name === body) selectInTree({ kind: 'body', name });
      })
      .catch(fail);
  };
  const progress = {
    printed: printable.reduce((sum, name) => sum + (parts[name]?.printed ?? 0), 0),
    total: printable.reduce((sum, name) => sum + (parts[name]?.quantity ?? 1), 0),
  };

  return (
    <Tree label={t('structure.title')} first="section:parameters" testId="structure">
      <ParametersSection />
      <TreeSection
        id="section:bodies"
        icon={<IconBox className="size-icon-sm" aria-hidden />}
        title={t('structure.bodiesTitle')}
        label={t('structure.bodies', { count: bodies.length })}
        count={bodies.length}
        meta={
          printable.length > 0 ? (
            <span className="shrink-0 text-xs font-normal text-text-subtle tabular-nums" data-testid="parts-progress" title={t('parts.progress', progress)}>
              {t('parts.tile', progress)}
            </span>
          ) : null
        }
      >
        {bodies.length === 0 ? (
          <TreeEmpty
            icon={<IconBox className="size-icon" aria-hidden />}
            text={t('structure.noBodies')}
            action={{ label: t('structure.insertFile'), icon: <IconFileImport className="size-icon-sm" aria-hidden />, onPress: () => intoDesign(), testId: 'structure-empty-insert' }}
          />
        ) : null}
        {bodies.map((body) => {
          const kind = bodyKindOf(body, model.structure.features);
          const standard = model.structure.standardParts?.includes(body.name) === true;
          const note = parts[body.name] ?? NEW_PART;
          const keep = (next: typeof note) => {
            save(body.name, next);
          };
          const open = expanded === body.name;
          const item = { kind: 'body', name: body.name } as const;
          const actions: TreeAction[] = [
            { id: 'rename', label: t('structure.rename'), icon: <IconPencil className="size-icon-sm" aria-hidden />, shortcut: 'F2', onAction: () => setRenaming(body.name) },
            {
              id: 'visibility',
              label: t(body.visible ? 'structure.hideShort' : 'structure.showShort'),
              icon: body.visible ? <IconEyeOff className="size-icon-sm" aria-hidden /> : <IconEye className="size-icon-sm" aria-hidden />,
              onAction: () => toggle({ bodies: [body.name], sketches: [], visible: !body.visible }),
            },
            { id: 'focus', label: t('structure.focus'), icon: <IconFocusCentered className="size-icon-sm" aria-hidden />, onAction: () => focus(item) },
          ];
          return (
            <Fragment key={body.name}>
              <TreeItem
                id={`body:${body.name}`}
                label={body.name}
                selected={(treeSelection?.kind === 'body' && treeSelection.name === body.name) || pickedInView.has(body.name)}
                dimmed={!body.visible}
                expanded={open}
                onExpand={(next) => setExpanded(next ? body.name : null)}
                onSelect={() => selectInTree(item)}
                onOpen={() => focus(item)}
                onSpace={() => toggle({ bodies: [body.name], sketches: [], visible: !body.visible })}
                onRename={() => setRenaming(body.name)}
                rename={renaming === body.name ? <RenameField name={body.name} label={t('structure.renameLabel', { name: body.name })} onDone={(name) => rename(body.name, name)} /> : undefined}
                actions={actions}
                testId="structure-body"
                data={{ visible: body.visible }}
                className="group/row"
              >
                {standard ? <IconNut className="size-icon-sm shrink-0 text-text-muted" aria-hidden /> : <IconBox className="size-icon-sm shrink-0 text-text-muted" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{body.name}</span>
                {standard ? <span className="shrink-0 text-xs text-accent-text">{t('structure.standardPart')}</span> : kind === 'mesh' ? <span className="shrink-0 text-xs text-accent-text">{t('structure.mesh')}</span> : null}
                {kind === 'mesh' && !standard ? <ConvertButton body={body.name} /> : null}
                {standard ? null : <PrintedToggle body={body.name} note={note} onChange={keep} />}
                <ExpandToggle body={body.name} open={open} onToggle={() => setExpanded(open ? null : body.name)} />
                <EyeToggle name={body.name} visible={body.visible} onToggle={(visible) => toggle({ bodies: [body.name], sketches: [], visible })} />
              </TreeItem>
              {open ? (
                <TreeExtra className="mr-1 mb-1 ml-5">
                  <PartDetails key={`${body.name}:${model.documentId}`} body={body.name} note={note} standard={standard} onChange={keep} />
                </TreeExtra>
              ) : null}
            </Fragment>
          );
        })}
      </TreeSection>
      <TreeSection
        id="section:sketches"
        icon={<CadIcon name="sketch" className="size-icon-sm" />}
        title={t('structure.sketchesTitle')}
        label={t('structure.sketches', { count: sketches.length })}
        count={sketches.length}
      >
        {sketches.length === 0 ? (
          <TreeEmpty
            icon={<IconPencil className="size-icon" aria-hidden />}
            text={t('structure.noSketches')}
            action={{ label: t('structure.drawSketch'), icon: <IconPencilPlus className="size-icon-sm" aria-hidden />, onPress: () => requestAssistant('sketch'), testId: 'structure-empty-sketch' }}
          />
        ) : null}
        {sketches.map((sketch) => {
          const name = sketch.name || `#${String(sketch.id)}`;
          const item = { kind: 'sketch', id: sketch.id } as const;
          return (
            <TreeItem
              key={sketch.id}
              id={`sketch:${String(sketch.id)}`}
              label={name}
              selected={treeSelection?.kind === 'sketch' && treeSelection.id === sketch.id}
              dimmed={!sketch.visible}
              onSelect={() => selectInTree(item)}
              onOpen={() => focus(item)}
              onSpace={() => toggle({ bodies: [], sketches: [sketch.id], visible: !sketch.visible })}
              actions={[
                {
                  id: 'visibility',
                  label: t(sketch.visible ? 'structure.hideShort' : 'structure.showShort'),
                  icon: sketch.visible ? <IconEyeOff className="size-icon-sm" aria-hidden /> : <IconEye className="size-icon-sm" aria-hidden />,
                  onAction: () => toggle({ bodies: [], sketches: [sketch.id], visible: !sketch.visible }),
                },
                { id: 'focus', label: t('structure.focus'), icon: <IconFocusCentered className="size-icon-sm" aria-hidden />, onAction: () => focus(item) },
              ]}
              testId="structure-sketch"
              data={{ visible: sketch.visible }}
              className="group/row"
            >
              <CadIcon name="sketch" className="size-icon-sm shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {editing.has(sketch.id) ? <span className="shrink-0 text-xs text-accent-text">{t('structure.editing')}</span> : null}
              <EyeToggle name={name} visible={sketch.visible} onToggle={(visible) => toggle({ bodies: [], sketches: [sketch.id], visible })} />
            </TreeItem>
          );
        })}
      </TreeSection>
      <NotesSection />
    </Tree>
  );
}
