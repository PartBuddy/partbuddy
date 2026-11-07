import {
  CameraControls,
  GizmoHelper,
  GizmoViewcube,
  GizmoViewport,
  Grid,
  Line,
  OrthographicCamera,
  PerspectiveCamera,
  PointMaterial,
} from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { SKETCH_STYLE } from '@partbuddy/geometry';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { BackSide, Box3, BufferAttribute, DoubleSide, GreaterDepth, Group, Quaternion, LineSegments, Mesh, Object3D, OrthographicCamera as ThreeOrthographicCamera, Plane, PMREMGenerator, Raycaster, ShaderMaterial, Sphere, Vector2, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { acceleratedRaycast } from 'three-mesh-bvh';

import type { PlayStep } from '../../../shared/assembly';
import type { MirroredSketch } from '../../../shared/contract';
import { samePick, useStudio, type BodyModel, type DisplayMode, type Pick } from '../state/store';
import { Busy } from '../ui/Feedback';
import { ConnectionNotice } from './ConnectionNotice';
import { Ghost, SelectionDock, SelectionGhost } from './DimensionHud';
import { ContactLight, GroundShadow, SkyLight } from './SceneLook';
import { silhouetteMaterial } from './silhouette';
import { bodiesBox, keeps, useSectionPlane } from './section';
import { LiveBar } from './LiveBar';
import { blendWeights, PREVIEW_BLEND } from './blend';
import { PICK_PIXELS, segmentCandidates, vertexCandidates, type Project } from './picking';
import { useTokenColors, type ViewerColors } from './useTokenColors';
import { StepPreviews } from './StepPreviews';
import { gridStep, needsReframe } from './framing';
import { pickBox, selectionBox, VIEW_DIRECTIONS, type PickArrays } from './camera';
import { ViewTools } from './ViewTools';
import { viewStateOf, type CameraView } from './viewState';
import { platform } from '../platform';
import { selectedStatus, useAssistant } from '../assistant/store';
import { NotePins } from '../notes/NotePins';
import { DimensionMarks, useDimensionMarks } from './Dimensions';
import { activeStep, type Vec3 as ExplodeVec } from './explode';
import { Animator, PlateBed, PlaybackCamera, PlaybackClock, usePlateLayout, usePlaySteps, useProjectViewData, useTargetPoses, type PlateLayout, type Pose } from './motion';
import { PlateBar } from './PlateBar';
import { AssemblyPlayer } from './AssemblyPlayer';

Object3D.DEFAULT_UP.set(0, 0, 1);
Mesh.prototype.raycast = acceleratedRaycast;

/** Scene constants in model units (mm). Colours come from design tokens. */
const scene = {
  viewDirection: [0.55, -0.68, 0.48] as [number, number, number],
  fieldOfView: 32,
  // Grid cells follow the part's size (framing.gridStep); a section line every five cells.
  gridSections: 5,
  // The grid fades out at this many part radii, never closer than gridFadeMin mm.
  gridFadeRadii: 6,
  gridFadeMin: 120,
  // Key light from front left and above, the camera from front right: faces turned to the camera
  // differ in brightness, which gives depth. The fill light from the right softens it.
  keyLight: [-70, -90, 130] as [number, number, number],
  fillLight: [100, 30, 50] as [number, number, number],
  gizmoMargin: [64, 64] as [number, number],
  // The axis triad in the lower left corner.
  triadMargin: [48, 48] as [number, number],
  triadScale: 28,
  // Matte faces and strong model edges (UI upgrade, view look "calm").
  roughness: 0.8,
  edgeWidth: 1.6,
  // Silhouettes of curved faces, a little thinner than the model edges (CSS pixels).
  silhouetteWidth: 1.4,
  // How far a changed face moves from the body colour toward the change colour.
  changeTint: 0.45,
  hoverTint: 0.35,
  selectionTint: 0.55,
  // See-through faces in the X-ray display mode.
  xrayOpacity: 0.3,
  // Studio look: soft room light from above (Z up).
  environmentIntensity: 0.45,
  // Highlight line widths in CSS pixels.
  hoverEdgeWidth: 3,
  selectedEdgeWidth: 3.5,
  selectedFaceOutline: 2.5,
  vertexPixels: 11,
  // A press that moves less than this is a click, not an orbit.
  clickSlop: 4,
  // Canvas texture font of the view cube labels (drawn into a WebGL texture, not CSS).
  cubeFont: '500 17px Segoe UI Variable, Segoe UI, sans-serif',
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

/** The ghost of a value typed into the parameter panel (UI upgrade step 6). */
function ParameterGhost({ color }: { color: ViewerColors['selection'] }) {
  const ghost = useStudio((s) => s.parameterGhost);
  return ghost ? <Ghost preview={ghost} color={color} /> : null;
}

function Body({
  index,
  body,
  colors,
  register,
  registerGroup,
  mode,
  plane,
  emphasis,
}: {
  index: number;
  body: BodyModel;
  colors: ViewerColors;
  register: (index: number, mesh: Mesh | null) => void;
  /** The group the animator moves between assembled, exploded, played and on the plate. */
  registerGroup: (index: number, group: Group | null) => void;
  mode: DisplayMode;
  plane: Plane | null;
  /** The part of the assembly step that plays, or a part that does not fit the bed. */
  emphasis: 'active' | 'misfit' | null;
}) {
  const hover = useStudio((s) => s.hover);
  const selections = useStudio((s) => s.selections);
  const changes = useStudio((s) => s.changes);
  const stepHighlight = useStudio((s) => s.stepHighlight);
  // With a ghost on screen, how much of the part as it is now shows.
  const fade = useStudio((s) => (s.selectionGhost || s.parameterGhost || s.markGhost ? blendWeights(PREVIEW_BLEND).before : 1));
  const { model } = body;

  useEffect(() => {
    const attribute = model.geometry.getAttribute('color') as BufferAttribute;
    const changed = new Set(changes?.bodies.find((entry) => entry.body === index)?.faces ?? []);
    // A body that is new as a whole is not tinted: the whole part in the change colour reads as a
    // toy, not as a change. Changed faces of an existing body get a tint of the body colour.
    if (changed.size >= model.table.faces.length) changed.clear();
    const tint = colors.body.clone().lerp(colors.changed, scene.changeTint);
    // Hover and selection tint the face; the outline drawn around it carries the strong colour.
    const hoverTint = colors.body.clone().lerp(colors.hover, scene.hoverTint);
    const selectedTint = colors.body.clone().lerp(colors.selection, scene.selectionTint);
    // A work-log card under the pointer lights up the faces of its step that still exist.
    const stepFaces = new Set(stepHighlight?.find((entry) => entry.body === body.name)?.faces ?? []);
    if (stepHighlight) {
      changed.clear();
      for (const face of model.table.faces) if (stepFaces.has(face.name)) changed.add(face.index);
    }
    const hovered = hover?.kind === 'face' && hover.body === index ? hover.face : -1;
    const selected = new Set(selections.filter((pick) => pick.kind === 'face' && pick.body === index).map((pick) => (pick.kind === 'face' ? pick.face : -1)));
    // A whole part stands out in the playback (the step that plays) and on the plate (does not fit).
    const whole = emphasis === 'active' ? colors.body.clone().lerp(colors.selection, scene.selectionTint) : emphasis === 'misfit' ? colors.body.clone().lerp(colors.misfit, 0.6) : null;
    for (let v = 0; v < model.vertexFaces.length; v += 1) {
      const face = model.vertexFaces[v] ?? -1;
      let color = whole ?? colors.body;
      if (changed.has(face)) color = stepHighlight ? colors.changed : tint;
      if (face === hovered) color = hoverTint;
      if (selected.has(face)) color = selectedTint;
      attribute.setXYZ(v, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }, [model, index, colors, hover, selections, changes, stepHighlight, body.name, emphasis]);

  const clipping = useMemo(() => (plane ? [plane] : []), [plane]);
  return (
    <group
      name={body.name}
      ref={(group) => {
        registerGroup(index, group);
      }}
    >
      <mesh
        ref={(mesh) => {
          register(index, mesh);
        }}
        geometry={model.geometry}
        userData={{ body: index }}
        // A cut part would cast the shadow of what is cut away.
        castShadow={plane === null}
        receiveShadow
      >
        {/* Wireframe keeps the faces for picking but does not draw them. */}
        <meshStandardMaterial
          key={`${mode}-${plane ? 'cut' : 'whole'}-${fade < 1 ? 'fade' : 'solid'}`}
          vertexColors
          roughness={scene.roughness}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          visible={mode !== 'wireframe'}
          transparent={mode === 'xray' || fade < 1}
          opacity={(mode === 'xray' ? scene.xrayOpacity : 1) * fade}
          depthWrite={mode !== 'xray' && fade > 0.5}
          clippingPlanes={clipping}
        />
      </mesh>
      {plane && (mode === 'shadedEdges' || mode === 'shaded' || mode === 'hiddenEdges') ? (
        // The inside of the cut, seen through the open section: drawn flat in the section colour,
        // it reads as a filled cut face. Not in X-ray, where every inside shows through.
        <mesh geometry={model.geometry} raycast={noRaycast}>
          <meshBasicMaterial color={colors.section} side={BackSide} clippingPlanes={clipping} />
        </mesh>
      ) : null}
      {plane === null && (mode === 'shadedEdges' || mode === 'hiddenEdges') && fade > 0 ? <Silhouette geometry={model.geometry} color={colors.edge} opacity={fade} /> : null}
      {mode === 'hiddenEdges' && fade > 0 ? <HiddenEdges geometry={model.edges} color={colors.hiddenEdge} plane={clipping} /> : null}
      {mode === 'shaded' || fade === 0 ? null : plane === null && mode !== 'xray' ? (
        <FatEdges geometry={model.edges} color={colors.edge} width={scene.edgeWidth} opacity={fade} />
      ) : (
        <lineSegments geometry={model.edges} raycast={noRaycast}>
          <lineBasicMaterial key={plane ? 'cut' : 'whole'} color={colors.edge} clippingPlanes={clipping} />
        </lineSegments>
      )}
    </group>
  );
}

/**
 * The section plane itself, faint and outlined, so the user sees where it cuts and how it lies
 * when it follows a slanted face (viewport CAD round). Never picked.
 */
function SectionPlaneMark({ plane, bodies, color }: { plane: Plane; bodies: BodyModel[]; color: ViewerColors['section'] }) {
  const { position, quaternion, size } = useMemo(() => {
    const box = bodiesBox(bodies);
    const centre = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3()).length() * 0.75;
    return { position: plane.projectPoint(centre, new Vector3()), quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), plane.normal), size };
  }, [plane, bodies]);
  const h = size / 2;
  return (
    <group position={position} quaternion={quaternion} name="section plane">
      <mesh raycast={noRaycast} renderOrder={3}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={[[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0], [-h, -h, 0]]} color={color} lineWidth={1} transparent opacity={0.6} raycast={noRaycast} />
    </group>
  );
}

/** Explosion lines: dashed, from where each part sits assembled to where it stands now. */
function ExplosionLines({ bodies, targets, color }: { bodies: BodyModel[]; targets: Map<string, Pose>; color: ViewerColors['edge'] }) {
  const lines = useMemo(
    () =>
      bodies.flatMap((body, i) => {
        const offset = targets.get(body.name)?.position;
        if (!offset || Math.hypot(...offset) < 0.01) return [];
        const centre = new Box3().setFromBufferAttribute(body.model.geometry.getAttribute('position') as BufferAttribute).getCenter(new Vector3());
        return [{ key: `${body.name}-${String(i)}`, points: [centre.toArray(), centre.clone().add(new Vector3(...offset)).toArray()] as [ExplodeVec, ExplodeVec] }];
      }),
    [bodies, targets],
  );
  return (
    <>
      {lines.map((line) => (
        <Line key={line.key} points={line.points} color={color} lineWidth={1} dashed dashSize={2} gapSize={1.5} raycast={noRaycast} />
      ))}
    </>
  );
}

/**
 * Edges behind the faces, dashed and faint (display mode "hidden edges"): drawn only where the
 * depth test fails, so they never cover the visible edges.
 */
function HiddenEdges({ geometry, color, plane }: { geometry: BodyModel['model']['edges']; color: ViewerColors['edge']; plane: Plane[] }) {
  const lines = useRef<LineSegments>(null);
  const diagonal = useMemo(() => {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    return geometry.boundingBox?.getSize(new Vector3()).length() ?? 100;
  }, [geometry]);
  useEffect(() => {
    lines.current?.computeLineDistances();
  }, [geometry]);
  const dash = Math.min(scene.dashMax, Math.max(scene.dashMin, diagonal * scene.dashPerDiagonal));
  return (
    <lineSegments ref={lines} geometry={geometry} raycast={noRaycast} renderOrder={1}>
      <lineDashedMaterial color={color} dashSize={dash} gapSize={dash * 0.7} depthFunc={GreaterDepth} depthWrite={false} transparent opacity={0.7} clippingPlanes={plane} />
    </lineSegments>
  );
}

/** The outline of curved faces where they turn away (see silhouette.ts); one draw call per body. */
function Silhouette({ geometry, color, opacity }: { geometry: BodyModel['model']['geometry']; color: ViewerColors['edge']; opacity: number }) {
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(() => silhouetteMaterial(color, scene.silhouetteWidth), [color]);
  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );
  const mesh = useRef<Mesh>(null);
  useEffect(() => {
    // Through the mesh: the compiler keeps memoised values immutable.
    const current = mesh.current?.material as ShaderMaterial | undefined;
    if (!current) return;
    const uniforms = current.uniforms as { resolution: { value: Vector2 }; width: { value: number }; opacity: { value: number } };
    uniforms.resolution.value.set(size.width * dpr, size.height * dpr);
    uniforms.width.value = scene.silhouetteWidth * dpr;
    uniforms.opacity.value = opacity;
    current.transparent = opacity < 1;
    invalidate();
  }, [material, size, dpr, opacity, invalidate]);
  return <mesh ref={mesh} geometry={geometry} material={material} raycast={noRaycast} />;
}

/** Model edges as fat lines, for a look with stronger edges (lines of WebGL are always 1 px). */
function FatEdges({ geometry, color, width, opacity }: { geometry: BodyModel['model']['edges']; color: ViewerColors['edge']; width: number; opacity: number }) {
  const points = useMemo(() => Array.from((geometry.getAttribute('position') as BufferAttribute).array as Float32Array), [geometry]);
  if (points.length === 0) return null;
  return <Line points={points} segments color={color} lineWidth={width} transparent={opacity < 1} opacity={opacity} raycast={noRaycast} />;
}

/** The world axes through the origin on the ground, X red and Y green, as CAD programs draw them. */
function OriginAxes({ colors, reach }: { colors: ViewerColors; reach: number }) {
  return (
    <group name="origin axes" position={[0, 0, 0.02]}>
      <Line points={[[-reach, 0, 0], [reach, 0, 0]]} color={colors.axisX} lineWidth={1} transparent opacity={0.45} raycast={noRaycast} />
      <Line points={[[0, -reach, 0], [0, reach, 0]]} color={colors.axisY} lineWidth={1} transparent opacity={0.45} raycast={noRaycast} />
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
  const plane = useSectionPlane(bodies);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const setHover = useStudio((s) => s.setHover);
  const select = useStudio((s) => s.select);
  const toggle = useStudio((s) => s.toggle);

  useEffect(() => {
    const dom = gl.domElement;
    const raycaster = new Raycaster();
    // With a section the first hit may lie in the part that is cut away; then every hit is needed.
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = plane === null;
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
        return raycaster.intersectObjects(list, false).find((hit) => keeps(plane, hit.point)) ?? null;
      };
      const visible = (point: [number, number, number]) => {
        if (!keeps(plane, point)) return false;
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
    const onMove = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY };
      if (frame || event.buttons !== 0) return;
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
      pressed = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
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
  }, [camera, gl, bodies, meshes, setHover, select, toggle, plane]);
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
 * Frames the design when a document first shows something, then keeps it in view while it grows
 * (the assistant often starts with a small sketch), until the user moves the camera: from then on
 * the camera is theirs. Runs inside the canvas, because the camera controls exist only after the
 * canvas has mounted its children.
 */
function FrameDesign({ documentId, bodies, sketches }: { documentId: string; bodies: BodyModel[]; sketches: MirroredSketch[] }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const canvas = useThree((state) => state.gl.domElement);
  const follow = useStudio((s) => s.followChanges);
  const bounds = useMemo(() => boundsOf(bodies, sketches), [bodies, sketches]);
  const framing = useRef<{ documentId: string | null; framed: Sphere | null; userMoved: boolean; controls: CameraControls | null }>({
    documentId: null,
    framed: null,
    userMoved: false,
    controls: null,
  });

  useEffect(() => {
    if (!controls) return;
    const moved = () => {
      framing.current.userMoved = true;
    };
    // Turning and panning report as control; a click to select starts a control without one, so
    // it leaves the camera to the framing. The wheel reports neither and is watched on the canvas.
    controls.addEventListener('control', moved);
    canvas.addEventListener('wheel', moved, { passive: true });
    return () => {
      controls.removeEventListener('control', moved);
      canvas.removeEventListener('wheel', moved);
    };
  }, [controls, canvas]);

  useEffect(() => {
    // An empty box gives a sphere of radius -1 (a sketch without curves yet): nothing to frame.
    if (!controls || bounds.radius <= 0) return;
    const state = framing.current;
    if (state.documentId !== documentId) {
      framing.current = { documentId, framed: bounds.clone(), userMoved: false, controls };
      lookFrom(controls, scene.viewDirection, bounds, false);
      return;
    }
    // A new camera (the canvas swaps its default one for ours right after mounting) has another
    // field of view: the distance that framed the design no longer does, so it is fitted again.
    const newCamera = state.controls !== controls;
    state.controls = controls;
    // Following changes moves the camera on its own; a user who moved it keeps their view.
    if (state.userMoved || follow || !(newCamera || needsReframe(state.framed, bounds))) return;
    state.framed = bounds.clone();
    centrePivot(controls, !newCamera);
    void controls.fitToSphere(bounds, !newCamera);
    keepView(controls);
  }, [controls, documentId, bounds, follow]);
  return null;
}

/** Drops the pivot a drag under the cursor set (a focal offset in camera-controls), so a fit or view centres again. */
function centrePivot(controls: CameraControls, animate: boolean): void {
  void controls.setFocalOffset(0, 0, 0, animate);
}

/** Looks at the design from `direction` and fits it into the view, in either projection. */
function lookFrom(controls: CameraControls, direction: [number, number, number], bounds: Sphere, animate: boolean): void {
  const d = new Vector3(...direction).normalize().multiplyScalar(bounds.radius * 4.2);
  const { x, y, z } = bounds.center;
  centrePivot(controls, animate);
  void controls.setLookAt(x + d.x, y + d.y, z + d.z, x, y, z, animate);
  void controls.fitToSphere(bounds, animate);
  keepView(controls);
}

/**
 * Remembers where a camera move ends as the view to keep. The canvas may replace its camera right
 * after mounting (and does on a projection switch); the new camera starts from this view.
 */
function keepView(controls: CameraControls): void {
  controls.getPosition(lastView.position, true);
  controls.getTarget(lastView.target, true);
}

/** The arrays of a body a pick refers to, for the selection box. */
function pickArrays(model: BodyModel['model']): PickArrays {
  return {
    positions: (model.geometry.getAttribute('position') as BufferAttribute).array,
    index: model.geometry.getIndex()?.array ?? [],
    triangleFaces: model.triangleFaces,
    edgeSegments: model.edgeSegments,
    edgeRanges: model.edgeRanges,
    vertices: model.vertices,
  };
}

/** A selection smaller than this (mm) is framed with its neighbourhood. */
const SELECTION_CONTEXT = 12;

/** Runs the standard view the user asked for (buttons or keys in ViewTools). */
function StandardViews({ bodies, sketches }: { bodies: BodyModel[]; sketches: MirroredSketch[] }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const request = useStudio((s) => s.viewRequest);
  const bounds = useMemo(() => boundsOf(bodies, sketches), [bodies, sketches]);
  const done = useRef(0);
  useEffect(() => {
    if (!controls || !request || request.serial === done.current || bounds.radius <= 0) return;
    done.current = request.serial;
    if (request.view === 'fit') {
      centrePivot(controls, true);
      void controls.fitToSphere(bounds, true);
    } else if (request.view === 'selection') {
      const picks = useStudio.getState().selections;
      const box = selectionBox(
        picks.map((pick) => {
          const model = bodies[pick.body]?.model;
          return model ? pickBox(pickArrays(model), pick) : null;
        }),
        SELECTION_CONTEXT,
      );
      // Nothing selected: fit everything, as Fit does.
      centrePivot(controls, true);
      // A sphere keeps the direction the user looks from (a box fit turns to the nearest axis).
      if (box) void controls.fitToSphere(new Box3(new Vector3(...box.min), new Vector3(...box.max)).getBoundingSphere(new Sphere()), true);
      else void controls.fitToSphere(bounds, true);
    } else {
      lookFrom(controls, request.view === 'iso' ? scene.viewDirection : VIEW_DIRECTIONS[request.view], bounds, true);
    }
  }, [controls, request, bounds, bodies]);
  return null;
}

/**
 * CAD navigation on top of the camera controls: zoom goes toward the cursor, and a drag turns
 * around the point of the part under the cursor where the press began (empty space keeps the
 * last pivot), as in Onshape and Fusion.
 */
function CursorNavigation({ meshes }: { meshes: MeshList }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (!controls) return;
    const dom = gl.domElement;
    const raycaster = new Raycaster();
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const ndc = new Vector2();
    const onDown = (event: PointerEvent) => {
      // Only at rest: camera-controls moves the camera when the pivot changes during a transition.
      if (event.button !== 0 || controls.active) return;
      const rect = dom.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(meshes.current.filter((mesh): mesh is Mesh => mesh !== null), false)[0];
      if (hit) controls.setOrbitPoint(hit.point.x, hit.point.y, hit.point.z);
    };
    // Capture: before the controls start turning around the old pivot.
    dom.addEventListener('pointerdown', onDown, { capture: true });
    return () => {
      dom.removeEventListener('pointerdown', onDown, { capture: true });
    };
  }, [controls, camera, gl, meshes]);
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
  const height = useRef(size.height);
  useEffect(() => {
    height.current = size.height;
  }, [size.height]);

  useEffect(() => {
    if (!controls) return;
    const remember = () => {
      controls.getPosition(lastView.position);
      controls.getTarget(lastView.target);
      lastView.height = height.current;
    };
    controls.addEventListener('update', remember);
    // A new camera gets new controls: put them where the previous camera was. Only then: a
    // resize of the view must not undo the framing of the design that happened since.
    const distance = lastView.position.distanceTo(lastView.target);
    const { position: p, target: t } = lastView;
    void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
    if (controls.camera instanceof ThreeOrthographicCamera) {
      void controls.zoomTo(height.current / (2 * distance * Math.tan((fov * Math.PI) / 360)), false);
    }
    return () => {
      controls.removeEventListener('update', remember);
    };
  }, [controls, fov]);

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
    centrePivot(controls, true);
    void controls.fitToBox(target, true, { paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12 });
  }, [follow, controls, serial, box]);
  return null;
}

/** Moves the camera to a finding of the ready-to-print check (M7) when the user asks for it. */
function FocusRequest() {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const request = useStudio((s) => s.focusRequest);
  const done = useRef(0);
  useEffect(() => {
    if (!controls || !request || request.serial === done.current) return;
    done.current = request.serial;
    const target = new Box3(new Vector3(...request.box.min), new Vector3(...request.box.max));
    // A small spot stays in context: frame at least a 30 mm neighbourhood.
    const size = target.getSize(new Vector3());
    target.expandByVector(new Vector3(Math.max(0, 30 - size.x) / 2, Math.max(0, 30 - size.y) / 2, Math.max(0, 30 - size.z) / 2));
    centrePivot(controls, true);
    void controls.fitToBox(target, true, { paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12 });
  }, [controls, request]);
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

function Scene({ documentId, bodies, sketches, steps, layout }: { documentId: string; bodies: BodyModel[]; sketches: MirroredSketch[]; steps: PlayStep[]; layout: PlateLayout }) {
  const { t } = useTranslation();
  const displayMode = useStudio((s) => s.displayMode);
  const plane = useSectionPlane(bodies);
  const colors = useTokenColors();
  // The exploded view, the playback and the plate are for looking: picks, notes and dimensions sit on the assembled part.
  const exploded = useStudio((s) => s.explode !== null);
  const plateOpen = useStudio((s) => s.viewMode === 'plate');
  const playback = useStudio((s) => s.playback !== null);
  const moved = exploded || plateOpen || playback;
  const targets = useTargetPoses(bodies, steps, layout);
  const bed = useStudio((s) => s.print?.printer.bed ?? null);
  // Select the step number, not a list: a new list on every read would loop (React #185).
  const playing = useStudio((s) => (s.playback ? activeStep(s.playback.position, steps.length) : -1));
  const active = steps[playing]?.bodies ?? [];
  const misfits = plateOpen ? (layout.result?.misfits.map((entry) => entry.id) ?? []) : [];
  const meshes = useRef<(Mesh | null)[]>([]);
  const register = useCallback((index: number, mesh: Mesh | null) => {
    meshes.current[index] = mesh;
  }, []);
  const groups = useRef<(Group | null)[]>([]);
  const registerGroup = useCallback((index: number, group: Group | null) => {
    groups.current[index] = group;
  }, []);
  const radius = useMemo(() => Math.max(1, boundsOf(bodies, sketches).radius), [bodies, sketches]);
  const cell = gridStep(radius);
  const fadeDistance = Math.max(scene.gridFadeMin, radius * scene.gridFadeRadii);
  // drei orders cube faces +X, -X, +Y, -Y, +Z, -Z; with Z up, -Y is the front view.
  const cubeFaces = ['right', 'left', 'back', 'front', 'top', 'bottom'].map((face) => t(`viewer.cube.${face}`));

  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      // The canvas starts with a camera of its own before ours takes over; with the same field of
      // view, a framing done in between keeps fitting.
      camera={{ fov: scene.fieldOfView, near: 0.5, far: 5000, position: lastView.position.toArray() }}
      onCreated={({ gl, get }) => {
        // Sections clip the bodies only, not the grid, the highlights or the pins.
        gl.localClippingEnabled = true;
        // The picture itself is the image; labels, pins and the HUD are HTML beside the canvas and
        // stay reachable for keyboards and screen readers (a role="img" wrapper would hide them).
        gl.domElement.setAttribute('role', 'img');
        gl.domElement.setAttribute('aria-label', t('viewer.canvasLabel'));
        // Frame and draw-call counters for the viewport measures (e2e/viewport-shots.spec.ts).
        (gl.domElement as HTMLCanvasElement & { __r3f?: unknown }).__r3f = get;
      }}
    >
      <Cameras />
      <color attach="background" args={[colors.background]} />
      <StudioLight />
      <SkyLight sky={colors.sky} ground={colors.ground} />
      <directionalLight position={scene.keyLight} intensity={0.85} />
      <ContactLight bodies={bodies} intensity={0.35} />
      {moved ? null : <GroundShadow bodies={bodies} color={colors.shadow} opacity={colors.background.getHSL({ h: 0, s: 0, l: 0 }).l < 0.3 ? 0.35 : 0.12} />}
      <directionalLight position={scene.fillLight} intensity={0.3} />
      {bodies.map((body, i) => (
        <Body
          key={`${body.name}-${i}`}
          index={i}
          body={body}
          colors={colors}
          register={register}
          registerGroup={registerGroup}
          mode={displayMode}
          plane={plane}
          emphasis={active.includes(body.name) ? 'active' : misfits.includes(body.name) ? 'misfit' : null}
        />
      ))}
      <Animator bodies={bodies} groups={groups} targets={targets} />
      {playback ? (
        <>
          <PlaybackClock count={steps.length} />
          <PlaybackCamera steps={steps} bodies={bodies} />
        </>
      ) : null}
      {plateOpen && bed ? <PlateBed bed={bed} colors={colors} /> : null}
      {plane ? <SectionPlaneMark plane={plane} bodies={bodies} color={colors.section} /> : null}
      {exploded ? <ExplosionLines bodies={bodies} targets={targets} color={colors.edge} /> : null}
      {moved ? null : (
        <>
          <Highlights bodies={bodies} colors={colors} />
          <SelectionGhost color={colors.selection} />
          <ScenePins bodies={bodies} />
          <DimensionMarks color={colors.dimension} ghostColor={colors.selection} meshes={meshes} plane={plane} />
          <ParameterGhost color={colors.selection} />
          <Picker bodies={bodies} meshes={meshes} />
        </>
      )}
      {sketches.map((sketch) => (
        <Sketch key={sketch.id} sketch={sketch} colors={colors} />
      ))}
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={cell}
        sectionSize={cell * scene.gridSections}
        cellColor={colors.grid}
        sectionColor={colors.gridSection}
        cellThickness={0.5}
        sectionThickness={0.9}
        fadeDistance={fadeDistance}
        fadeStrength={1.5}
        infiniteGrid
        position={[0, 0, -0.01]}
      />
      <OriginAxes colors={colors} reach={fadeDistance} />
      <CameraControls makeDefault dollyToCursor />
      <FrameDesign documentId={documentId} bodies={bodies} sketches={sketches} />
      <StandardViews bodies={bodies} sketches={sketches} />
      <CursorNavigation meshes={meshes} />
      <FollowChanges />
      <FocusRequest />
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
      {/* Drawn after the cube's helper, which renders the scene: priority 1 would draw the scene again over the cube. */}
      <GizmoHelper alignment="bottom-left" margin={scene.triadMargin} renderPriority={2}>
        <GizmoViewport
          axisColors={[`#${colors.axisX.getHexString()}`, `#${colors.axisY.getHexString()}`, `#${colors.axisZ.getHexString()}`]}
          labelColor={`#${colors.axisLabel.getHexString()}`} hideNegativeAxes axisHeadScale={0.8} scale={scene.triadScale} disabled />
      </GizmoHelper>
    </Canvas>
  );
}

const NO_BODIES: BodyModel[] = [];

export function Viewer() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const connection = useStudio((s) => s.connection);
  const offline = connection.state !== 'connected';
  useDimensionMarks();
  useProjectViewData();
  const bodies = model.status === 'ready' ? model.bodies : NO_BODIES;
  const { steps, source } = usePlaySteps(bodies);
  const plateOpen = useStudio((s) => s.viewMode === 'plate' && bodies.length > 1);
  const bed = useStudio((s) => s.print?.printer.bed ?? null);
  const layout = usePlateLayout(bodies, plateOpen, bed);
  const playback = useStudio((s) => s.playback !== null);
  // Leaving a design of several parts for one of a single part closes what only the first had.
  useEffect(() => {
    if (bodies.length > 1) return;
    const state = useStudio.getState();
    if (state.viewMode !== 'assembled') state.setViewMode('assembled');
    if (state.playback) state.setPlayback(null);
  }, [bodies.length]);

  return (
    <main
      // isolate: pins and dimension labels (drei Html, z 11–32) stay under dialogs, menus and the start page.
      className="relative isolate min-h-0 flex-1 bg-surface-sunken"
      aria-label={t('viewer.canvasLabel')}
      data-testid="viewer"
      data-revision={model.status === 'ready' ? model.revision : undefined}
      data-sketches={model.status === 'ready' ? model.sketches.length : undefined}
    >
      {model.status === 'ready' && (model.bodies.length > 0 || model.sketches.length > 0) ? (
        <>
          <div className={`h-full w-full ${offline ? 'opacity-50 grayscale' : ''}`} data-testid="viewport">
            <Scene documentId={model.documentId} bodies={model.bodies} sketches={model.sketches} steps={steps} layout={layout} />
          </div>
          {plateOpen ? <PlateBar layout={layout} bed={bed} /> : playback ? <AssemblyPlayer steps={steps} source={source} /> : <SelectionDock bodies={model.bodies} />}
        </>
      ) : null}
      {/* One column at the top left: view tools first, then what the view reports; nothing overlaps at any width. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-start gap-2 p-3">
        {model.status === 'ready' && (model.bodies.length > 0 || model.sketches.length > 0) ? <ViewTools /> : null}
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
