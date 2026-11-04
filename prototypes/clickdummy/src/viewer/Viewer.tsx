import { CameraControls, GizmoHelper, GizmoViewcube, Grid, Html } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { IconMapPin, IconNotes } from '@tabler/icons-react';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BufferAttribute, Mesh, Object3D } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';

import { featureOf, surfaceKind } from '../geometry/faceTable';
import { useStudio, type FacePick } from '../state/store';
import { Banner, Busy, EmptyState } from '../ui/Feedback';
import { Button } from '../ui/Button';
import type { ViewerModel } from './model';
import { useModelState } from './ModelContext';
import { useTokenColors, type ViewerColors } from './useTokenColors';

Object3D.DEFAULT_UP.set(0, 0, 1);
Mesh.prototype.raycast = acceleratedRaycast;

/** Scene constants in model units (mm). Colours come from design tokens. */
const scene = {
  cameraPosition: [78, -96, 70] as [number, number, number],
  fieldOfView: 32,
  gridCell: 4,
  gridSection: 20,
  gridFade: 260,
  keyLight: [60, -80, 120] as [number, number, number],
  fillLight: [-90, 60, 40] as [number, number, number],
  gizmoMargin: [64, 64] as [number, number],
  // Canvas texture font of the view cube labels (drawn into a WebGL texture, not CSS).
  cubeFont: "600 18px Segoe UI, sans-serif",
};

function pickFrom(event: ThreeEvent<PointerEvent | MouseEvent>, model: ViewerModel): FacePick | null {
  if (event.faceIndex == null || !event.face) return null;
  const face = model.mesh.triangleFaces[event.faceIndex];
  if (face === undefined) return null;
  const n = event.face.normal;
  return { face, point: [event.point.x, event.point.y, event.point.z], normal: [n.x, n.y, n.z] };
}

function Part({ model, colors }: { model: ViewerModel; colors: ViewerColors }) {
  const hoverFace = useStudio((s) => s.hoverFace);
  const selection = useStudio((s) => s.selection);
  const highlightFeature = useStudio((s) => s.highlightFeature);
  const setHoverFace = useStudio((s) => s.setHoverFace);
  const select = useStudio((s) => s.select);

  useEffect(() => {
    const attribute = model.geometry.getAttribute('color') as BufferAttribute;
    const featureFaces = new Set(
      highlightFeature
        ? model.table.faces.filter((f) => featureOf(f) === highlightFeature).map((f) => f.index)
        : [],
    );
    for (let v = 0; v < model.vertexFaces.length; v += 1) {
      const face = model.vertexFaces[v] ?? -1;
      let color = colors.body;
      if (featureFaces.has(face)) color = colors.feature;
      if (face === hoverFace) color = colors.hover;
      if (face === selection?.face) color = colors.selection;
      attribute.setXYZ(v, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }, [model, colors, hoverFace, selection, highlightFeature]);

  return (
    <group>
      <mesh
        geometry={model.geometry}
        onPointerMove={(event) => {
          event.stopPropagation();
          setHoverFace(pickFrom(event, model)?.face ?? null);
        }}
        onPointerOut={() => {
          setHoverFace(null);
        }}
        onClick={(event) => {
          event.stopPropagation();
          select(pickFrom(event, model));
        }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.62}
          metalness={0.04}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={model.edges} raycast={() => null}>
        <lineBasicMaterial color={colors.edge} />
      </lineSegments>
    </group>
  );
}

function NotePins() {
  const { t } = useTranslation();
  const notes = useStudio((s) => s.notes);
  const focusNote = useStudio((s) => s.focusNote);
  const focusNoteId = useStudio((s) => s.focusNoteId);
  return (
    <>
      {notes.map((note, i) => (
        <Html key={note.id} position={note.anchor.point} center zIndexRange={[20, 0]}>
          <button
            type="button"
            aria-label={t('notes.pinLabel', { number: i + 1, text: note.text })}
            onClick={() => {
              focusNote(note.id);
            }}
            className={`flex size-pin items-center justify-center rounded-full border-2 border-surface font-mono text-xs font-semibold text-on-accent shadow-2 outline-none focus-visible:outline-2 focus-visible:outline-focus ${
              focusNoteId === note.id ? 'bg-accent' : 'bg-note'
            }`}
          >
            {i + 1}
          </button>
        </Html>
      ))}
    </>
  );
}

function SelectionBar({ model }: { model: ViewerModel }) {
  const { t } = useTranslation();
  const selection = useStudio((s) => s.selection);
  const startNote = useStudio((s) => s.startNote);
  if (!selection) return null;
  const face = model.table.faces[selection.face];
  if (!face) return null;
  const kind = surfaceKind(face);
  return (
    <div
      role="region"
      aria-label={t('viewer.selection')}
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-2"
    >
      <div className="flex flex-col">
        <span className="text-xs text-text-subtle">{t(`viewer.surface.${kind}`)}</span>
        <span className="font-mono text-sm text-text">{face.name}</span>
      </div>
      <dl className="flex gap-3 text-sm">
        {face.cylinder ? (
          <div>
            <dt className="text-xs text-text-subtle">{t('viewer.radius')}</dt>
            <dd className="font-mono tabular-nums text-text">{t('units.mm', { value: face.cylinder.radius })}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-text-subtle">{t('viewer.area')}</dt>
          <dd className="font-mono tabular-nums text-text">{t('units.mm2', { value: face.area })}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">{t('viewer.anchor')}</dt>
          <dd className="text-text">{face.exact ? t('viewer.anchorExact') : t('viewer.anchorGeometric')}</dd>
        </div>
      </dl>
      <Button
        variant="primary"
        size="sm"
        onPress={() => {
          startNote(selection);
        }}
      >
        <IconNotes className="size-icon-sm" aria-hidden />
        {t('viewer.addNote')}
      </Button>
    </div>
  );
}

function Scene({ model }: { model: ViewerModel }) {
  const { t } = useTranslation();
  const colors = useTokenColors();
  const controls = useRef<CameraControls>(null);
  const select = useStudio((s) => s.select);
  const focusNoteId = useStudio((s) => s.focusNoteId);
  const notes = useStudio((s) => s.notes);
  // drei orders cube faces +X, -X, +Y, -Y, +Z, -Z; with Z up, -Y is the front view.
  const cubeFaces = ['right', 'left', 'back', 'front', 'top', 'bottom'].map((face) => t(`viewer.cube.${face}`));

  const target = useMemo(() => model.geometry.boundingSphere?.center.toArray() ?? [0, 0, 0], [model]);

  useEffect(() => {
    const [x, y, z] = scene.cameraPosition;
    const [tx = 0, ty = 0, tz = 0] = target;
    void controls.current?.setLookAt(x, y, z, tx, ty, tz, false);
  }, [target]);

  useEffect(() => {
    const note = notes.find((n) => n.id === focusNoteId);
    if (!note || !controls.current) return;
    const [x, y, z] = note.anchor.point;
    void controls.current.setTarget(x, y, z, true);
  }, [focusNoteId, notes]);

  return (
    <Canvas
      camera={{ position: scene.cameraPosition, fov: scene.fieldOfView, near: 1, far: 2000 }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        select(null);
      }}
      role="img"
      aria-label={t('viewer.canvasLabel')}
    >
      <color attach="background" args={[colors.background]} />
      <hemisphereLight args={[colors.background, colors.edge, 0.9]} />
      <directionalLight position={scene.keyLight} intensity={1.7} />
      <directionalLight position={scene.fillLight} intensity={0.55} />
      <Part model={model} colors={colors} />
      <NotePins />
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={scene.gridCell}
        sectionSize={scene.gridSection}
        cellColor={colors.grid}
        sectionColor={colors.grid}
        fadeDistance={scene.gridFade}
        infiniteGrid
        position={[0, 0, -0.01]}
      />
      <CameraControls ref={controls} makeDefault />
      <GizmoHelper alignment="top-right" margin={scene.gizmoMargin}>
        <GizmoViewcube
          faces={cubeFaces}
          font={scene.cubeFont}
          color={`#${colors.cube.getHexString()}`}
          hoverColor={`#${colors.hover.getHexString()}`}
          textColor={`#${colors.cubeText.getHexString()}`}
          strokeColor={`#${colors.cubeStroke.getHexString()}`}
        />
      </GizmoHelper>
    </Canvas>
  );
}

export function Viewer() {
  const { t } = useTranslation();
  const state = useModelState();
  const solidcraft = useStudio((s) => s.solidcraft);

  return (
    <div className="relative h-full w-full bg-surface-sunken">
      {state.status === 'loading' ? (
        <div className="flex h-full items-center justify-center">
          <Busy label={t('viewer.loading')} />
        </div>
      ) : null}
      {state.status === 'error' ? (
        <EmptyState title={t('viewer.errorTitle')} body={t('viewer.errorBody', { message: state.message })} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <div className={`h-full w-full ${solidcraft === 'disconnected' ? 'opacity-50 grayscale' : ''}`}>
            <Scene model={state.model} />
          </div>
          <SelectionBar model={state.model} />
          <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2">
            {solidcraft === 'rebuilding' ? <Busy label={t('viewer.rebuilding')} /> : null}
            {solidcraft === 'disconnected' ? (
              <div className="pointer-events-auto max-w-text-max">
                <Banner tone="warning" title={t('viewer.disconnectedTitle')}>
                  {t('viewer.disconnectedBody')}
                </Banner>
              </div>
            ) : null}
          </div>
          <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 text-xs text-text-subtle">
            <IconMapPin className="size-icon-sm" aria-hidden />
            {t('viewer.hint')}
          </p>
        </>
      ) : null}
    </div>
  );
}
