import {
  CameraControls,
  GizmoHelper,
  GizmoViewcube,
  Grid,
  Line,
  OrthographicCamera,
  PerspectiveCamera,
  PointMaterial,
} from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { IconMapPin } from '@tabler/icons-react';
import { featureOf, SKETCH_STYLE, surfaceKind } from '@partbuddy/geometry';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Box3, BufferAttribute, Mesh, Object3D, OrthographicCamera as ThreeOrthographicCamera, PMREMGenerator, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { acceleratedRaycast } from 'three-mesh-bvh';

import type { MirroredSketch } from '../../../shared/contract';
import { samePick, useStudio, type BodyModel, type Pick, type StandardView } from '../state/store';
import { Busy } from '../ui/Feedback';
import { ConnectionNotice } from './ConnectionNotice';
import { DimensionHud } from './DimensionHud';
import { LiveBar } from './LiveBar';
import { PICK_PIXELS, segmentCandidates, vertexCandidates, type Project } from './picking';
import { useTokenColors, type ViewerColors } from './useTokenColors';
import { StepPreviews } from './StepPreviews';
import { ViewTools } from './ViewTools';
import { edgeLabel, viewStateOf, type CameraView } from './viewState';
import { platform } from '../platform';
import { selectedStatus, useAssistant } from '../assistant/store';
import { NotePins } from '../notes/NotePins';
import { Pen, ViewCapture } from './Pen';

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
  // Studio look: soft room light from above (Z up).
  environmentIntensity: 0.55,
  // Highlight line widths in CSS pixels.
  hoverEdgeWidth: 3,
  selectedEdgeWidth: 3.5,
  selectedFaceOutline: 2.5,
  vertexPixels: 11,
  // A press that moves less than this is a click, not an orbit.
  clickSlop: 4,
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

/** The body meshes, for picking; filled by each body, indexed like the bodies. */
type MeshList = RefObject<(Mesh | null)[]>;

function Body({ index, body, colors, register }: { index: number; body: BodyModel; colors: ViewerColors; register: (index: number, mesh: Mesh | null) => void }) {
  const hover = useStudio((s) => s.hover);
  const selections = useStudio((s) => s.selections);
  const changes = useStudio((s) => s.changes);
  const stepHighlight = useStudio((s) => s.stepHighlight);
  const { model } = body;

  useEffect(() => {
    const attribute = model.geometry.getAttribute('color') as BufferAttribute;
    const changed = new Set(changes?.bodies.find((entry) => entry.body === index)?.faces ?? []);
    // A work-log card under the pointer lights up the faces of its step that still exist.
    const stepFaces = new Set(stepHighlight?.find((entry) => entry.body === body.name)?.faces ?? []);
    if (stepHighlight) {
      changed.clear();
      for (const face of model.table.faces) if (stepFaces.has(face.name)) changed.add(face.index);
    }
    const hovered = hover?.kind === 'face' && hover.body === index ? hover.face : -1;
    const selected = new Set(selections.filter((pick) => pick.kind === 'face' && pick.body === index).map((pick) => (pick.kind === 'face' ? pick.face : -1)));
    for (let v = 0; v < model.vertexFaces.length; v += 1) {
      const face = model.vertexFaces[v] ?? -1;
      let color = colors.body;
      if (changed.has(face)) color = colors.changed;
      if (face === hovered) color = colors.hover;
      if (selected.has(face)) color = colors.selection;
      attribute.setXYZ(v, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }, [model, index, colors, hover, selections, changes, stepHighlight, body.name]);

  return (
    <group name={body.name}>
      <mesh
        ref={(mesh) => {
          register(index, mesh);
        }}
        geometry={model.geometry}
        userData={{ body: index }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.5}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={model.edges} raycast={noRaycast}>
        <lineBasicMaterial color={colors.edge} />
      </lineSegments>
    </group>
  );
}

/** Segments of one edge, or of every edge around one face, as a flat xyz list for a fat line. */
function edgePoints(model: BodyModel['model'], edges: number[]): number[] {
  const points: number[] = [];
  for (const edge of edges) {
    const first = model.edgeRanges[edge * 2] ?? 0;
    const count = model.edgeRanges[edge * 2 + 1] ?? 0;
    points.push(...model.edgeSegments.subarray(first * 6, (first + count) * 6));
  }
  return points;
}

function edgesAroundFace(model: BodyModel['model'], face: number): number[] {
  const edges: number[] = [];
  for (let e = 0; e < model.edgeLengths.length; e += 1) {
    if (model.edgeFaces[e * 2] === face || model.edgeFaces[e * 2 + 1] === face) edges.push(e);
  }
  return edges;
}

/** Pre-highlight and selection: a fat line for edges and face outlines, a dot for a vertex. */
function Highlight({ pick, bodies, color, selected }: { pick: Pick; bodies: BodyModel[]; color: ViewerColors['hover']; selected: boolean }) {
  const model = bodies[pick.body]?.model;
  const points = useMemo(() => {
    if (!model) return [];
    if (pick.kind === 'edge') return edgePoints(model, [pick.edge]);
    if (pick.kind === 'face' && selected) return edgePoints(model, edgesAroundFace(model, pick.face));
    return [];
  }, [model, pick, selected]);
  const vertex = useMemo(
    () => (model && pick.kind === 'vertex' ? Float32Array.from(model.vertices.subarray(pick.vertex * 3, pick.vertex * 3 + 3)) : null),
    [model, pick],
  );
  if (!model) return null;
  const width = pick.kind === 'face' ? scene.selectedFaceOutline : selected ? scene.selectedEdgeWidth : scene.hoverEdgeWidth;
  return (
    <group name={selected ? 'selection' : 'hover'}>
      {points.length > 0 ? <Line points={points} segments color={color} lineWidth={width} raycast={noRaycast} /> : null}
      {vertex ? (
        <points raycast={noRaycast} renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[vertex, 3]} />
          </bufferGeometry>
          <PointMaterial color={color} size={scene.vertexPixels} sizeAttenuation={false} depthTest={false} transparent />
        </points>
      ) : null}
    </group>
  );
}

function Highlights({ bodies, colors }: { bodies: BodyModel[]; colors: ViewerColors }) {
  const hover = useStudio((s) => s.hover);
  const selections = useStudio((s) => s.selections);
  return (
    <>
      {hover && !selections.some((pick) => samePick(pick, hover)) ? <Highlight pick={hover} bodies={bodies} color={colors.hover} selected={false} /> : null}
      {selections.map((pick) => (
        <Highlight key={`${pick.kind}:${pick.body}:${pick.kind === 'face' ? pick.face : pick.kind === 'edge' ? pick.edge : pick.vertex}`} pick={pick} bodies={bodies} color={colors.selection} selected />
      ))}
    </>
  );
}

/**
 * Picks what is under the pointer: a vertex within a few pixels first, then an edge, then the face
 * hit by the ray (M1a). Edges and vertices hidden behind the part are skipped: a ray towards them
 * must not hit the mesh before reaching them. A press that does not move selects; empty space
 * clears the selection.
 */
function Picker({ bodies, meshes }: { bodies: BodyModel[]; meshes: MeshList }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const setHover = useStudio((s) => s.setHover);
  const select = useStudio((s) => s.select);
  const toggle = useStudio((s) => s.toggle);

  useEffect(() => {
    const dom = gl.domElement;
    const raycaster = new Raycaster();
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const ndc = new Vector2();
    const scratch = new Vector3();
    const radius = boundsOf(bodies, []).radius;
    const tolerance = Math.max(0.01, radius * 1e-3);

    const pickAt = (clientX: number, clientY: number): Pick | null => {
      const rect = dom.getBoundingClientRect();
      const pointer = { x: clientX - rect.left, y: clientY - rect.top };
      const list = meshes.current.filter((mesh): mesh is Mesh => mesh !== null);
      const project: Project = (x, y, z) => {
        scratch.set(x, y, z).project(camera);
        if (scratch.z < -1 || scratch.z > 1) return null;
        return { x: ((scratch.x + 1) / 2) * rect.width, y: ((1 - scratch.y) / 2) * rect.height, depth: scratch.z };
      };
      const firstHit = (x: number, y: number) => {
        ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        return raycaster.intersectObjects(list, false)[0] ?? null;
      };
      const visible = (point: [number, number, number]) => {
        const screen = project(...point);
        if (!screen) return false;
        const hit = firstHit(screen.x, screen.y);
        const along = scratch.set(...point).sub(raycaster.ray.origin).dot(raycaster.ray.direction);
        return !hit || hit.distance >= along - tolerance;
      };

      // Vertices first, then edges: the nearest visible candidate over all bodies wins.
      let best: { pick: Pick; pixels: number } | null = null;
      for (const [index, body] of bodies.entries()) {
        for (const candidate of vertexCandidates(body.model.vertices, project, pointer, PICK_PIXELS.vertex).slice(0, 4)) {
          if (best !== null && best.pixels <= candidate.pixels) break;
          if (visible(candidate.point)) {
            best = { pick: { kind: 'vertex', body: index, vertex: candidate.index, point: candidate.point }, pixels: candidate.pixels };
            break;
          }
        }
      }
      if (best !== null) return best.pick;
      for (const [index, body] of bodies.entries()) {
        for (const candidate of segmentCandidates(body.model.edgeSegments, project, pointer, PICK_PIXELS.edge).slice(0, 6)) {
          if (best !== null && best.pixels <= candidate.pixels) break;
          if (visible(candidate.point)) {
            const edge = body.model.edgeOfSegment[candidate.index] ?? 0;
            best = { pick: { kind: 'edge', body: index, edge, point: candidate.point }, pixels: candidate.pixels };
            break;
          }
        }
      }
      if (best !== null) return best.pick;
      const hit = firstHit(pointer.x, pointer.y);
      if (!hit || hit.faceIndex == null || !hit.face) return null;
      const index = (hit.object.userData as { body?: number }).body ?? 0;
      const face = bodies[index]?.model.triangleFaces[hit.faceIndex];
      if (face === undefined) return null;
      const n = hit.face.normal;
      return { kind: 'face', body: index, face, point: [hit.point.x, hit.point.y, hit.point.z], normal: [n.x, n.y, n.z] };
    };

    let frame = 0;
    let last: { x: number; y: number } | null = null;
    let pressed: { x: number; y: number } | null = null;
    // In pen mode the pointer draws (Pen.tsx); nothing is hovered or selected.
    const drawing = () => useStudio.getState().pen;
    const onMove = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY };
      if (frame || event.buttons !== 0 || drawing()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (last) setHover(pickAt(last.x, last.y));
      });
    };
    const onLeave = () => {
      last = null;
      setHover(null);
    };
    const onDown = (event: PointerEvent) => {
      pressed = event.button === 0 && !drawing() ? { x: event.clientX, y: event.clientY } : null;
    };
    const onUp = (event: PointerEvent) => {
      if (!pressed || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
      pressed = null;
      if (moved > scene.clickSlop) return;
      const pick = pickAt(event.clientX, event.clientY);
      // Ctrl or Shift adds to the selection or removes from it; a plain click starts anew.
      if ((event.ctrlKey || event.shiftKey || event.metaKey) && pick) toggle(pick);
      else select(pick);
    };
    const onKey = (event: KeyboardEvent) => {
      // Escape in a field of the HUD resets the field first; outside it clears the selection.
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape' && !target?.closest('input, textarea')) select(null);
    };
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [camera, gl, bodies, meshes, setHover, select, toggle]);
  return null;
}

/**
 * Soft studio light from a room environment (no download), turned so its ceiling is +Z. It is
 * built when the browser is idle and small (64 px faces are plenty for soft light), so the first
 * frame of a design and the live steps are never held up by it.
 */
function StudioLight() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    // Read from the store inside the effect: the scene is three.js state, not React state.
    const { gl, scene: threeScene, invalidate } = get();
    let release: (() => void) | null = null;
    const build = () => {
      const pmrem = new PMREMGenerator(gl);
      const environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: 64 }).texture;
      pmrem.dispose();
      threeScene.environment = environment;
      threeScene.environmentIntensity = scene.environmentIntensity;
      threeScene.environmentRotation.set(Math.PI / 2, 0, 0);
      invalidate();
      release = () => {
        threeScene.environment = null;
        environment.dispose();
      };
    };
    const idle = requestIdleCallback(build, { timeout: 1500 });
    return () => {
      cancelIdleCallback(idle);
      release?.();
    };
  }, [get]);
  return null;
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
    lookFrom(controls, scene.viewDirection, bounds, false);
  }, [controls, documentId, bounds]);
  return null;
}

/** Looks at the design from `direction` and fits it into the view, in either projection. */
function lookFrom(controls: CameraControls, direction: [number, number, number], bounds: Sphere, animate: boolean): void {
  const d = new Vector3(...direction).normalize().multiplyScalar(bounds.radius * 4.2);
  const { x, y, z } = bounds.center;
  void controls.setLookAt(x + d.x, y + d.y, z + d.z, x, y, z, animate);
  void controls.fitToSphere(bounds, animate);
}

/** Directions of the standard views (Z up, front is -Y); top leans a hair to the front to keep "up" defined. */
const VIEW_DIRECTIONS: Record<Exclude<StandardView, 'fit'>, [number, number, number]> = {
  iso: scene.viewDirection,
  front: [0, -1, 0],
  right: [1, 0, 0],
  top: [0, -1e-4, 1],
};

/** Runs the standard view the user asked for (buttons or keys in ViewTools). */
function StandardViews({ bodies, sketches }: { bodies: BodyModel[]; sketches: MirroredSketch[] }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const request = useStudio((s) => s.viewRequest);
  const bounds = useMemo(() => boundsOf(bodies, sketches), [bodies, sketches]);
  const done = useRef(0);
  useEffect(() => {
    if (!controls || !request || request.serial === done.current || bounds.radius <= 0) return;
    done.current = request.serial;
    if (request.view === 'fit') void controls.fitToSphere(bounds, true);
    else lookFrom(controls, VIEW_DIRECTIONS[request.view], bounds, true);
  }, [controls, request, bounds]);
  return null;
}

/** The camera the user last looked through, kept when switching between projections. */
const lastView = { position: new Vector3(78, -96, 70), target: new Vector3(0, 0, 0), height: 1 };

/**
 * Perspective or orthographic camera with the same view: switching keeps where the camera looks
 * from and how large the part appears (zoom matched to the perspective distance).
 */
function Cameras() {
  const projection = useStudio((s) => s.projection);
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const size = useThree((state) => state.size);
  const fov = scene.fieldOfView;

  useEffect(() => {
    if (!controls) return;
    const remember = () => {
      controls.getPosition(lastView.position);
      controls.getTarget(lastView.target);
      lastView.height = size.height;
    };
    controls.addEventListener('update', remember);
    // A new camera gets new controls: put them where the previous camera was.
    const distance = lastView.position.distanceTo(lastView.target);
    const { position: p, target: t } = lastView;
    void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
    if (controls.camera instanceof ThreeOrthographicCamera) {
      void controls.zoomTo(size.height / (2 * distance * Math.tan((fov * Math.PI) / 360)), false);
    }
    return () => {
      controls.removeEventListener('update', remember);
    };
  }, [controls, fov, size.height]);

  return projection === 'orthographic' ? (
    <OrthographicCamera makeDefault position={lastView.position.toArray()} near={-10000} far={10000} />
  ) : (
    <PerspectiveCamera makeDefault position={lastView.position.toArray()} fov={fov} near={0.5} far={5000} />
  );
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
  const selections = useStudio((s) => s.selections);
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
      void platform().viewer.report(viewStateOf(model, selections, changes, camera));
    }, REPORT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [model, selections, changes, camera]);
  return null;
}

/** The note pins; changes to notes wait while the assistant works, like every change of the design. */
function ScenePins({ bodies }: { bodies: BodyModel[] }) {
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  return <NotePins bodies={bodies} busy={busy} />;
}

function Scene({ documentId, bodies, sketches }: { documentId: string; bodies: BodyModel[]; sketches: MirroredSketch[] }) {
  const { t } = useTranslation();
  // Drawing on the view (M2b-2) takes the left button from the camera controls.
  const pen = useStudio((s) => s.pen);
  const colors = useTokenColors();
  const meshes = useRef<(Mesh | null)[]>([]);
  const register = useCallback((index: number, mesh: Mesh | null) => {
    meshes.current[index] = mesh;
  }, []);
  // drei orders cube faces +X, -X, +Y, -Y, +Z, -Z; with Z up, -Y is the front view.
  const cubeFaces = ['right', 'left', 'back', 'front', 'top', 'bottom'].map((face) => t(`viewer.cube.${face}`));

  return (
    <Canvas dpr={[1, 2]} role="img" aria-label={t('viewer.canvasLabel')}>
      <Cameras />
      <color attach="background" args={[colors.background]} />
      <StudioLight />
      <directionalLight position={scene.keyLight} intensity={1.2} />
      <directionalLight position={scene.fillLight} intensity={0.35} />
      {bodies.map((body, i) => (
        <Body key={`${body.name}-${i}`} index={i} body={body} colors={colors} register={register} />
      ))}
      <Highlights bodies={bodies} colors={colors} />
      <DimensionHud bodies={bodies} accent={colors.selection} />
      <ScenePins bodies={bodies} />
      <Pen bodies={bodies} meshes={meshes} color={colors.note} />
      <ViewCapture />
      <Picker bodies={bodies} meshes={meshes} />
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
      <CameraControls makeDefault enabled={!pen} />
      <FrameDesign documentId={documentId} bodies={bodies} sketches={sketches} />
      <StandardViews bodies={bodies} sketches={sketches} />
      <FollowChanges />
      <ViewReporter />
      <StepPreviews />
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="font-mono tabular-nums text-text">{value}</dd>
    </div>
  );
}

function SelectionBar({ bodies }: { bodies: BodyModel[] }) {
  const { t } = useTranslation();
  const selection = useStudio((s) => s.selection);
  if (!selection) return null;
  const body = bodies[selection.body];
  if (!body) return null;
  const model = body.model;
  const mm = (value: number) => t('units.mm', { value });
  const point = (values: ArrayLike<number>) => Array.from(values, (value) => Math.round(value * 100) / 100).join('  ');

  let kind: string;
  let name: string;
  let facts: { label: string; value: string }[];
  if (selection.kind === 'face') {
    const face = model.table.faces[selection.face];
    if (!face) return null;
    kind = `${t(`viewer.surface.${surfaceKind(face)}`)} · ${featureOf(face)}`;
    name = face.name;
    facts = [
      ...(face.cylinder ? [{ label: t('viewer.radius'), value: mm(face.cylinder.radius) }] : []),
      { label: t('viewer.area'), value: t('units.mm2', { value: face.area }) },
      { label: t('viewer.anchor'), value: face.exact ? t('viewer.anchorExact') : t('viewer.anchorGeometric') },
    ];
  } else if (selection.kind === 'edge') {
    const label = edgeLabel(model, selection.edge);
    kind = t('viewer.kind.edge');
    name = label.name;
    facts = [{ label: t('viewer.length'), value: mm(model.edgeLengths[selection.edge] ?? 0) }];
  } else {
    kind = t('viewer.kind.vertex');
    name = point(model.vertices.subarray(selection.vertex * 3, selection.vertex * 3 + 3));
    facts = [];
  }
  return (
    <div
      role="region"
      aria-label={t('viewer.selection')}
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-2"
      data-testid="selection-bar"
      data-kind={selection.kind}
    >
      <div className="flex flex-col">
        <span className="text-xs text-text-subtle">
          {kind} · {t('viewer.body')} {body.name}
        </span>
        <span className="font-mono text-sm text-text" data-testid="selected-face">
          {name}
        </span>
      </div>
      {facts.length > 0 ? (
        <dl className="flex gap-3 text-sm">
          {facts.map((fact) => (
            <Fact key={fact.label} {...fact} />
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** While the pen is on: what it does, how many strokes wait, how to leave it. */
function PenHint() {
  const { t } = useTranslation();
  const pen = useStudio((s) => s.pen);
  const strokes = useStudio((s) => s.strokes.length);
  if (!pen) return null;
  return (
    <p
      role="status"
      className="pointer-events-none absolute bottom-3 left-1/2 flex max-w-dialog-sm -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text shadow-2"
      data-testid="pen-hint"
    >
      {t('viewer.pen.hint', { count: strokes })}
    </p>
  );
}

export function Viewer() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const connection = useStudio((s) => s.connection);
  const pen = useStudio((s) => s.pen);
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
          <PenHint />
          <ViewTools />
          {pen ? null : (
            <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 text-xs text-text-subtle">
              <IconMapPin className="size-icon-sm" aria-hidden />
              {t('viewer.hint')}
            </p>
          )}
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
