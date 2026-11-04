import { CameraControls, GizmoHelper, GizmoViewcube, Grid, Line } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { IconMapPin } from '@tabler/icons-react';
import { featureOf, SKETCH_STYLE, surfaceKind, type ViewerModel } from '@partbuddy/geometry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box3, BufferAttribute, Mesh, Object3D, Sphere, Vector3 } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';

import type { MirroredSketch } from '../../../shared/contract';
import { sameFace, useStudio, type BodyModel, type FacePick } from '../state/store';
import { Busy } from '../ui/Feedback';
import { ConnectionNotice } from './ConnectionNotice';
import { LiveBar } from './LiveBar';
import { useTokenColors, type ViewerColors } from './useTokenColors';
import { viewStateOf, type CameraView } from './viewState';
import { platform } from '../platform';

Object3D.DEFAULT_UP.set(0, 0, 1);
Mesh.prototype.raycast = acceleratedRaycast;

/** Scene constants in model units (mm). Colours come from design tokens. */
const scene = {
  viewDirection: [0.55, -0.68, 0.48] as [number, number, number],
  fieldOfView: 32,
  gridCell: 4,
  gridSection: 20,
  gridFade: 260,
  keyLight: [60, -80, 120] as [number, number, number],
  fillLight: [-90, 60, 40] as [number, number, number],
  gizmoMargin: [64, 64] as [number, number],
  // Canvas texture font of the view cube labels (drawn into a WebGL texture, not CSS).
  cubeFont: '600 18px Segoe UI, sans-serif',
  // Sketch line widths in CSS pixels; the sketch being edited is drawn stronger.
  sketchWidth: 1.5,
  activeSketchWidth: 2.25,
  constructionWidth: 1,
  // Construction dashes follow the sketch size, so they read alike on small and large parts.
  dashPerDiagonal: 1 / 80,
  dashMin: 0.4,
  dashMax: 8,
};

const noRaycast = () => null;

function pickFrom(event: ThreeEvent<PointerEvent | MouseEvent>, body: number, model: ViewerModel): FacePick | null {
  if (event.faceIndex == null || !event.face) return null;
  const face = model.triangleFaces[event.faceIndex];
  if (face === undefined) return null;
  const n = event.face.normal;
  return { body, face, point: [event.point.x, event.point.y, event.point.z], normal: [n.x, n.y, n.z] };
}

function Body({ index, body, colors }: { index: number; body: BodyModel; colors: ViewerColors }) {
  const hover = useStudio((s) => s.hover);
  const selection = useStudio((s) => s.selection);
  const setHover = useStudio((s) => s.setHover);
  const select = useStudio((s) => s.select);
  const changes = useStudio((s) => s.changes);
  const { model } = body;

  useEffect(() => {
    const attribute = model.geometry.getAttribute('color') as BufferAttribute;
    const changed = new Set(changes?.bodies.find((entry) => entry.body === index)?.faces ?? []);
    for (let v = 0; v < model.vertexFaces.length; v += 1) {
      const ref = { body: index, face: model.vertexFaces[v] ?? -1 };
      let color = colors.body;
      if (changed.has(ref.face)) color = colors.changed;
      if (sameFace(ref, hover)) color = colors.hover;
      if (sameFace(ref, selection)) color = colors.selection;
      attribute.setXYZ(v, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }, [model, index, colors, hover, selection, changes]);

  return (
    <group name={body.name}>
      <mesh
        geometry={model.geometry}
        onPointerMove={(event) => {
          event.stopPropagation();
          const pick = pickFrom(event, index, model);
          setHover(pick ? { body: pick.body, face: pick.face } : null);
        }}
        onPointerOut={() => {
          setHover(null);
        }}
        onClick={(event) => {
          event.stopPropagation();
          select(pickFrom(event, index, model));
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

function sketchBox(sketch: MirroredSketch, box = new Box3()): Box3 {
  const point = new Vector3();
  for (let i = 0; i < sketch.positions.length; i += 3) box.expandByPoint(point.fromArray(sketch.positions, i));
  return box;
}

/**
 * One mirrored sketch (#21): free curves, fully constrained curves and the curves the latest
 * step changed in one fat line set, construction geometry dashed. Lines never take clicks, so
 * faces behind a sketch stay selectable.
 */
function Sketch({ sketch, colors }: { sketch: MirroredSketch; colors: ViewerColors }) {
  const changes = useStudio((s) => s.changes);
  const changed = useMemo(
    () => new Set(changes?.sketches.find((entry) => entry.sketch === sketch.id)?.curves ?? []),
    [changes, sketch.id],
  );
  const lines = useMemo(() => {
    const solid: number[] = [];
    const solidColors: [number, number, number][] = [];
    const construction: number[] = [];
    for (const curve of sketch.curves) {
      const moved = changed.has(curve.id);
      for (let s = curve.first; s < curve.first + curve.count; s += 1) {
        const segment = Array.from(sketch.positions.subarray(s * 6, s * 6 + 6));
        const style = sketch.styles[s];
        if (style === SKETCH_STYLE.construction) {
          construction.push(...segment);
          continue;
        }
        solid.push(...segment);
        const color = moved ? colors.changed : style === SKETCH_STYLE.constrained ? colors.sketchConstrained : colors.sketch;
        solidColors.push([color.r, color.g, color.b], [color.r, color.g, color.b]);
      }
    }
    const diagonal = sketchBox(sketch).getSize(new Vector3()).length();
    const dash = Math.min(scene.dashMax, Math.max(scene.dashMin, diagonal * scene.dashPerDiagonal));
    return { solid, solidColors, construction, dash };
  }, [sketch, changed, colors]);

  return (
    <group name={`sketch ${sketch.name}`}>
      {lines.solid.length > 0 ? (
        <Line
          points={lines.solid}
          segments
          vertexColors={lines.solidColors}
          lineWidth={sketch.active ? scene.activeSketchWidth : scene.sketchWidth}
          raycast={noRaycast}
        />
      ) : null}
      {lines.construction.length > 0 ? (
        <Line
          points={lines.construction}
          segments
          color={colors.sketchConstruction}
          dashed
          dashSize={lines.dash}
          gapSize={lines.dash * 0.6}
          lineWidth={scene.constructionWidth}
          raycast={noRaycast}
        />
      ) : null}
    </group>
  );
}

function boundsOf(bodies: BodyModel[], sketches: MirroredSketch[]): Sphere {
  const box = new Box3();
  for (const body of bodies) {
    if (body.model.geometry.boundingBox) box.union(body.model.geometry.boundingBox);
  }
  for (const sketch of sketches) sketchBox(sketch, box);
  return box.isEmpty() ? new Sphere() : box.getBoundingSphere(new Sphere());
}

/**
 * Frames the design once per document; later revisions keep the user's camera. Runs inside the
 * canvas, because the camera controls exist only after the canvas has mounted its children.
 */
function FrameDesign({ documentId, bodies, sketches }: { documentId: string; bodies: BodyModel[]; sketches: MirroredSketch[] }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const bounds = useMemo(() => boundsOf(bodies, sketches), [bodies, sketches]);
  const framed = useRef<string | null>(null);

  useEffect(() => {
    // An empty box gives a sphere of radius -1 (a sketch without curves yet): nothing to frame.
    if (!controls || framed.current === documentId || bounds.radius <= 0) return;
    framed.current = documentId;
    const distance = bounds.radius * 4.2;
    const [dx, dy, dz] = scene.viewDirection;
    const { x, y, z } = bounds.center;
    void controls.setLookAt(x + dx * distance, y + dy * distance, z + dz * distance, x, y, z, false);
  }, [controls, documentId, bounds]);
  return null;
}

/** Moves the camera to the faces the latest step changed, when the user turned it on. */
function FollowChanges() {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const changes = useStudio((s) => s.changes);
  const follow = useStudio((s) => s.followChanges);
  const serial = changes?.serial ?? 0;
  const box = changes?.box ?? null;

  useEffect(() => {
    if (!follow || !controls || !box) return;
    const target = new Box3(new Vector3(...box.min), new Vector3(...box.max));
    // Small changes (one fillet) stay in context: frame at least a 40 mm neighbourhood.
    const size = target.getSize(new Vector3());
    target.expandByVector(new Vector3(Math.max(0, 40 - size.x) / 2, Math.max(0, 40 - size.y) / 2, Math.max(0, 40 - size.z) / 2));
    void controls.fitToBox(target, true, { paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12 });
  }, [follow, controls, serial, box]);
  return null;
}

/** Quiet time before the view is reported again, so orbiting does not flood the bridge. */
const REPORT_DELAY_MS = 300;

/**
 * Reports what the view shows to the main process when the camera comes to rest, the selection
 * changes or a revision arrives, for the assistant's `partbuddy_view` tool. Runs inside the
 * canvas, where the camera controls live.
 */
function ViewReporter() {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const model = useStudio((s) => s.model);
  const selection = useStudio((s) => s.selection);
  const changes = useStudio((s) => s.changes);
  const [camera, setCamera] = useState<CameraView | null>(null);

  useEffect(() => {
    if (!controls) return;
    const read = () => {
      const position = controls.getPosition(new Vector3());
      const target = controls.getTarget(new Vector3());
      setCamera({ position: position.toArray(), target: target.toArray() });
    };
    read();
    controls.addEventListener('rest', read);
    controls.addEventListener('controlend', read);
    return () => {
      controls.removeEventListener('rest', read);
      controls.removeEventListener('controlend', read);
    };
  }, [controls]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void platform().viewer.report(viewStateOf(model, selection, changes, camera));
    }, REPORT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [model, selection, changes, camera]);
  return null;
}

function Scene({ documentId, bodies, sketches }: { documentId: string; bodies: BodyModel[]; sketches: MirroredSketch[] }) {
  const { t } = useTranslation();
  const colors = useTokenColors();
  const select = useStudio((s) => s.select);
  // drei orders cube faces +X, -X, +Y, -Y, +Z, -Z; with Z up, -Y is the front view.
  const cubeFaces = ['right', 'left', 'back', 'front', 'top', 'bottom'].map((face) => t(`viewer.cube.${face}`));

  return (
    <Canvas
      camera={{ position: [78, -96, 70], fov: scene.fieldOfView, near: 0.5, far: 5000 }}
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
      {bodies.map((body, i) => (
        <Body key={`${body.name}-${i}`} index={i} body={body} colors={colors} />
      ))}
      {sketches.map((sketch) => (
        <Sketch key={sketch.id} sketch={sketch} colors={colors} />
      ))}
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
      <CameraControls makeDefault />
      <FrameDesign documentId={documentId} bodies={bodies} sketches={sketches} />
      <FollowChanges />
      <ViewReporter />
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

function SelectionBar({ bodies }: { bodies: BodyModel[] }) {
  const { t } = useTranslation();
  const selection = useStudio((s) => s.selection);
  if (!selection) return null;
  const body = bodies[selection.body];
  const face = body?.model.table.faces[selection.face];
  if (!body || !face) return null;
  const kind = surfaceKind(face);
  return (
    <div
      role="region"
      aria-label={t('viewer.selection')}
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-2"
    >
      <div className="flex flex-col">
        <span className="text-xs text-text-subtle">
          {t(`viewer.surface.${kind}`)} · {t('viewer.body')} {body.name} · {featureOf(face)}
        </span>
        <span className="font-mono text-sm text-text" data-testid="selected-face">
          {face.name}
        </span>
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
    </div>
  );
}

export function Viewer() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const connection = useStudio((s) => s.connection);
  const offline = connection.state !== 'connected';

  return (
    <main
      className="relative min-h-0 flex-1 bg-surface-sunken"
      aria-label={t('viewer.canvasLabel')}
      data-testid="viewer"
      data-revision={model.status === 'ready' ? model.revision : undefined}
      data-sketches={model.status === 'ready' ? model.sketches.length : undefined}
    >
      {model.status === 'ready' && (model.bodies.length > 0 || model.sketches.length > 0) ? (
        <>
          <div className={`h-full w-full ${offline ? 'opacity-50 grayscale' : ''}`} data-testid="viewport">
            <Scene documentId={model.documentId} bodies={model.bodies} sketches={model.sketches} />
          </div>
          <SelectionBar bodies={model.bodies} />
          <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 text-xs text-text-subtle">
            <IconMapPin className="size-icon-sm" aria-hidden />
            {t('viewer.hint')}
          </p>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-start gap-2 p-3">
        {connection.state === 'connected' && connection.mirror === 'rebuilding' ? (
          <div className="rounded-md bg-surface-raised px-2 py-1 shadow-2">
            <Busy label={t('viewer.rebuilding')} />
          </div>
        ) : null}
        <ConnectionNotice />
        <LiveBar />
      </div>
    </main>
  );
}
