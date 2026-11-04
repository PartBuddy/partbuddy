import { CameraControls, GizmoHelper, GizmoViewcube, Grid } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { IconMapPin } from '@tabler/icons-react';
import { featureOf, surfaceKind, type ViewerModel } from '@partbuddy/geometry';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Box3, BufferAttribute, Mesh, Object3D, Sphere } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';

import { sameFace, useStudio, type BodyModel, type FacePick } from '../state/store';
import { Busy } from '../ui/Feedback';
import { ConnectionNotice } from './ConnectionNotice';
import { useTokenColors, type ViewerColors } from './useTokenColors';

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
};

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
  const { model } = body;

  useEffect(() => {
    const attribute = model.geometry.getAttribute('color') as BufferAttribute;
    for (let v = 0; v < model.vertexFaces.length; v += 1) {
      const ref = { body: index, face: model.vertexFaces[v] ?? -1 };
      let color = colors.body;
      if (sameFace(ref, hover)) color = colors.hover;
      if (sameFace(ref, selection)) color = colors.selection;
      attribute.setXYZ(v, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }, [model, index, colors, hover, selection]);

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

function boundsOf(bodies: BodyModel[]): Sphere {
  const box = new Box3();
  for (const body of bodies) {
    if (body.model.geometry.boundingBox) box.union(body.model.geometry.boundingBox);
  }
  return box.isEmpty() ? new Sphere() : box.getBoundingSphere(new Sphere());
}

/**
 * Frames the design once per document; later revisions keep the user's camera. Runs inside the
 * canvas, because the camera controls exist only after the canvas has mounted its children.
 */
function FrameDesign({ documentId, bodies }: { documentId: string; bodies: BodyModel[] }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const bounds = useMemo(() => boundsOf(bodies), [bodies]);
  const framed = useRef<string | null>(null);

  useEffect(() => {
    if (!controls || framed.current === documentId || bounds.radius === 0) return;
    framed.current = documentId;
    const distance = bounds.radius * 4.2;
    const [dx, dy, dz] = scene.viewDirection;
    const { x, y, z } = bounds.center;
    void controls.setLookAt(x + dx * distance, y + dy * distance, z + dz * distance, x, y, z, false);
  }, [controls, documentId, bounds]);
  return null;
}

function Scene({ documentId, bodies }: { documentId: string; bodies: BodyModel[] }) {
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
      <FrameDesign documentId={documentId} bodies={bodies} />
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
    <main className="relative min-h-0 flex-1 bg-surface-sunken" aria-label={t('viewer.canvasLabel')}>
      {model.status === 'ready' && model.bodies.length > 0 ? (
        <>
          <div className={`h-full w-full ${offline ? 'opacity-50 grayscale' : ''}`} data-testid="viewport">
            <Scene documentId={model.documentId} bodies={model.bodies} />
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
      </div>
    </main>
  );
}
