import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Box3, BufferAttribute, Group, Quaternion, Sphere, Vector3 } from 'three';

import { playbackOrder, type PlayStep } from '../../../shared/assembly';
import { platform } from '../platform';
import { useStudio, type BodyModel } from '../state/store';
import type { NestRequest, NestResponse } from '../workers/nest.worker';
import { suggestAssembly, type PartBox } from './assemblyOrder';
import { activeStep, explodeAlong, playbackPoses, type Box } from './explode';
import type { NestResult, Vec2 } from './nesting';
import type { ViewerColors } from './useTokenColors';
import { requestShadow } from './SceneLook';

/**
 * How the bodies move between the views of a print of several parts (viewport CAD round,
 * 2026-11-07): assembled, exploded along the joining directions, played as an assembly, or laid
 * out on the printer's bed. Each view gives every body a target pose; the animator glides the
 * bodies there, so every change of view is animated and closing it is the way back.
 */

const noRaycast = () => null;
type Vec3 = [number, number, number];

/** A body's pose: where it stands and how it is turned, and whether it shows. */
export interface Pose {
  position: Vec3;
  quaternion: [number, number, number, number];
  visible: boolean;
}
export const REST: Pose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], visible: true };

/** Seconds per assembly step in the playback. */
export const STEP_SECONDS = 1.6;
/** Plate layout: gap between parts and to the bed edge (mm), turns tried per part. */
const PLATE = { spacing: 5, margin: 6, rotations: 24, maxPoints: 4000 };

function boxOf(body: BodyModel): Box {
  const box = new Box3().setFromBufferAttribute(body.model.geometry.getAttribute('position') as BufferAttribute);
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/** The bodies' boxes by name. */
export function useBodyBoxes(bodies: BodyModel[]): Map<string, Box> {
  return useMemo(() => new Map(bodies.map((body) => [body.name, boxOf(body)])), [bodies]);
}

/**
 * The assembly order as it plays: the assistant's (ADR 0026), cut to the bodies that exist, or the
 * one proposed from the geometry when there is none or none of its parts exist any more.
 */
export function usePlaySteps(bodies: BodyModel[]): { steps: PlayStep[]; source: 'assistant' | 'suggested' } {
  const { t } = useTranslation();
  const stored = useStudio((s) => s.assembly);
  const standard = useStudio((s) => (s.model.status === 'ready' ? s.model.structure.standardParts : undefined));
  const boxes = useBodyBoxes(bodies);
  return useMemo(() => {
    const names = new Set(bodies.map((body) => body.name));
    if (stored) {
      const steps = playbackOrder(stored)
        .map((step) => ({ ...step, bodies: step.bodies.filter((body) => names.has(body)) }))
        .filter((step) => step.bodies.length > 0);
      // Bodies the assistant's order does not name yet join at the end, from above.
      const named = new Set(steps.flatMap((step) => step.bodies));
      const rest = bodies.filter((body) => !named.has(body.name));
      if (steps.length > 0) {
        const extra = rest.map((body): PlayStep => ({ name: t('assembly.join', { part: body.name, target: steps[0]?.bodies[0] ?? '' }), bodies: [body.name], target: steps[0]?.bodies[0] ?? null, direction: [0, 0, -1], group: null }));
        return { steps: [...steps, ...extra], source: 'assistant' };
      }
    }
    const parts: PartBox[] = bodies.map((body) => ({ name: body.name, ...(boxes.get(body.name) ?? { min: [0, 0, 0], max: [0, 0, 0] }), standard: standard?.includes(body.name) ?? false }));
    const plan = suggestAssembly(parts, (part, target) => (target ? t('assembly.join', { part, target }) : t('assembly.base', { part })));
    return { steps: plan ? playbackOrder(plan) : [], source: 'suggested' };
  }, [stored, bodies, boxes, standard, t]);
}

/** Keeps the assembly order and the print faces of the open project in the store, read again with every design. */
export function useProjectViewData(): void {
  const documentId = useStudio((s) => (s.model.status === 'ready' ? s.model.documentId : null));
  useEffect(() => {
    let live = true;
    const api = platform();
    void Promise.all([api.assembly.get(), api.design.printFaces()])
      .then(([plan, faces]) => {
        if (!live) return;
        useStudio.getState().setAssembly(plan);
        useStudio.getState().setPrintFaces(faces);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [documentId]);
  useEffect(
    () =>
      platform().assembly.onChange((plan) => {
        useStudio.getState().setAssembly(plan);
      }),
    [],
  );
}

/** How each body is turned to lie on its print face (or as designed), with its footprint and height that way. */
function plateInput(body: BodyModel, face: string | undefined): { quaternion: Quaternion; points: Vec2[]; floor: number; height: number } {
  const normal = face ? body.model.table.faces.find((entry) => entry.name === face)?.planeNormal : undefined;
  const quaternion = normal ? new Quaternion().setFromUnitVectors(new Vector3(...normal).normalize(), new Vector3(0, 0, -1)) : new Quaternion();
  const positions = (body.model.geometry.getAttribute('position') as BufferAttribute).array;
  const count = positions.length / 3;
  const stride = Math.max(1, Math.floor(count / PLATE.maxPoints));
  const points: Vec2[] = [];
  let floor = Infinity;
  let top = -Infinity;
  const v = new Vector3();
  for (let i = 0; i < count; i += 1) {
    v.set(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0).applyQuaternion(quaternion);
    floor = Math.min(floor, v.z);
    top = Math.max(top, v.z);
    if (i % stride === 0) points.push([v.x, v.y]);
  }
  return { quaternion, points, floor, height: top - floor };
}

export interface PlateLayout {
  status: 'computing' | 'ready' | 'error';
  /** The input the layout was worked out for; another input means a new one is on its way. */
  input?: unknown;
  result: NestResult | null;
  poses: Map<string, { position: Vec3; quaternion: Quaternion; plate: number }>;
}

const COMPUTING: PlateLayout = { status: 'computing', result: null, poses: new Map() };

/** The layout on the bed, worked out in a worker while the plate view is open. */
export function usePlateLayout(bodies: BodyModel[], open: boolean, bed: [number, number, number] | null): PlateLayout {
  const faces = useStudio((s) => s.printFaces);
  const standard = useStudio((s) => (s.model.status === 'ready' ? s.model.structure.standardParts : undefined));
  const [layout, setLayout] = useState<PlateLayout>({ status: 'computing', result: null, poses: new Map() });
  // Standard parts (screws, nuts) are bought, not printed: they stay off the plate.
  const inputs = useMemo(
    () => (open ? bodies.filter((body) => !standard?.includes(body.name)).map((body) => ({ name: body.name, ...plateInput(body, faces[body.name]) })) : []),
    [bodies, faces, open, standard],
  );
  useEffect(() => {
    if (!open || !bed || inputs.length === 0) return;
    const worker = new Worker(new URL('../workers/nest.worker.ts', import.meta.url), { type: 'module' });
    const request: NestRequest = { id: 1, parts: inputs.map((input) => ({ id: input.name, points: input.points, height: input.height })), options: { bed, spacing: PLATE.spacing, margin: PLATE.margin, rotations: PLATE.rotations } };
    worker.onmessage = (event: MessageEvent<NestResponse>) => {
      const response = event.data;
      if (!response.ok) {
        console.warn(`plate layout failed: ${response.message}`);
        setLayout({ status: 'error', result: null, poses: new Map(), input: inputs });
        return;
      }
      const poses = new Map<string, { position: Vec3; quaternion: Quaternion; plate: number }>();
      for (const placement of response.result.placements) {
        const input = inputs.find((entry) => entry.name === placement.id);
        if (!input) continue;
        const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), placement.angle);
        poses.set(placement.id, { position: [placement.x, placement.y, -input.floor], quaternion: turn.multiply(input.quaternion), plate: placement.plate });
      }
      setLayout({ status: 'ready', result: response.result, poses, input: inputs });
    };
    worker.onerror = (event) => {
      console.warn(`plate layout failed: ${event.message}`);
      setLayout({ status: 'error', result: null, poses: new Map(), input: inputs });
    };
    worker.postMessage(request);
    return () => {
      worker.terminate();
    };
  }, [inputs, open, bed]);
  return layout.input === inputs ? layout : COMPUTING;
}

/** The target pose of every body for the view that is open. */
export function useTargetPoses(bodies: BodyModel[], steps: PlayStep[], layout: PlateLayout): Map<string, Pose> {
  const boxes = useBodyBoxes(bodies);
  const explode = useStudio((s) => s.explode);
  const viewMode = useStudio((s) => s.viewMode);
  const plate = useStudio((s) => s.plate);
  const position = useStudio((s) => s.playback?.position ?? null);
  return useMemo(() => {
    const poses = new Map<string, Pose>();
    if (viewMode === 'plate' && layout.status === 'ready') {
      for (const body of bodies) {
        const pose = layout.poses.get(body.name);
        // A body without a place (a standard part) does not show on the plate.
        poses.set(body.name, pose ? { position: pose.position, quaternion: pose.quaternion.toArray(), visible: pose.plate === plate } : { ...REST, visible: false });
      }
    } else if (position !== null) {
      for (const [name, pose] of playbackPoses(steps, boxes, position)) poses.set(name, { ...REST, position: pose.offset, visible: pose.visible });
    } else if (explode !== null) {
      for (const [name, offset] of explodeAlong(steps, boxes, explode)) poses.set(name, { ...REST, position: offset });
    }
    return poses;
  }, [bodies, steps, boxes, explode, viewMode, plate, position, layout]);
}

/** Plate and playback look from the front, above: the bed and each step read best that way. */
const OVERVIEW = new Vector3(0.45, -0.8, 0.75).normalize();

/**
 * Looks at a box from the overview direction and fits it. A sphere, not fitToBox: camera-controls
 * turns a box fit to the nearest axis, which flattened the plate into a front view.
 */
function frameBox(controls: CameraControls, box: Box3): void {
  const sphere = box.getBoundingSphere(new Sphere());
  const centre = sphere.center;
  const from = centre.clone().addScaledVector(OVERVIEW, sphere.radius * 4 + 1);
  const animate = !reducedMotion();
  void controls.setFocalOffset(0, 0, 0, animate);
  void controls.setLookAt(from.x, from.y, from.z, centre.x, centre.y, centre.z, animate);
  void controls.fitToSphere(sphere, animate);
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Glides every body group toward its target pose (about a third of a second), and keeps drawing
 * only while something moves: on-demand rendering stays on.
 */
export function Animator({ bodies, groups, targets }: { bodies: BodyModel[]; groups: RefObject<(Group | null)[]>; targets: Map<string, Pose> }) {
  const invalidate = useThree((state) => state.invalidate);
  const target = useRef(targets);
  useEffect(() => {
    target.current = targets;
    invalidate();
  }, [targets, invalidate]);
  const gl = useThree((state) => state.gl);
  useFrame((_, delta) => {
    if (!glide(bodies, groups.current, target.current, delta)) return;
    // Moving parts throw their shadows anew (the shadow map does not update on its own).
    requestShadow(gl);
    invalidate();
  });
  return null;
}

const scratch = { position: new Vector3(), quaternion: new Quaternion() };

/** One frame of the glide: moves each group a step toward its pose; true while anything still moves. */
function glide(bodies: BodyModel[], groups: (Group | null)[], targets: Map<string, Pose>, delta: number): boolean {
  const k = reducedMotion() ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 12);
  let moving = false;
  for (const [i, body] of bodies.entries()) {
    const group = groups[i];
    if (!group) continue;
    const pose = targets.get(body.name) ?? REST;
    scratch.position.set(...pose.position);
    scratch.quaternion.set(...pose.quaternion);
    group.visible = pose.visible;
    if (group.position.distanceToSquared(scratch.position) > 1e-6 || group.quaternion.angleTo(scratch.quaternion) > 1e-4) {
      group.position.lerp(scratch.position, k);
      group.quaternion.slerp(scratch.quaternion, k);
      moving = true;
    } else {
      group.position.copy(scratch.position);
      group.quaternion.copy(scratch.quaternion);
    }
  }
  return moving;
}

/** Advances the playback while it plays and stops at the end. */
export function PlaybackClock({ count }: { count: number }) {
  const invalidate = useThree((state) => state.invalidate);
  const playing = useStudio((s) => s.playback?.playing ?? false);
  useEffect(() => {
    if (playing) invalidate();
  }, [playing, invalidate]);
  useFrame((_, delta) => {
    const { playback, setPlayback } = useStudio.getState();
    if (!playback?.playing) return;
    const position = Math.min(count, playback.position + Math.min(delta, 0.1) / STEP_SECONDS);
    setPlayback({ position, playing: position < count });
    invalidate();
  });
  return null;
}

/**
 * Keeps an exploded view in frame (audit B-19): a moment after the slider stops, the camera fits all
 * parts where they now stand, keeping its direction.
 */
export function ExplodeCamera({ bodies, targets }: { bodies: BodyModel[]; targets: Map<string, Pose> }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const boxes = useBodyBoxes(bodies);
  useEffect(() => {
    if (!controls) return;
    const timer = setTimeout(() => {
      const box = new Box3();
      for (const [name, own] of boxes) {
        const offset = new Vector3(...(targets.get(name)?.position ?? REST.position));
        box.union(new Box3(new Vector3(...own.min).add(offset), new Vector3(...own.max).add(offset)));
      }
      if (!box.isEmpty()) void controls.fitToSphere(box.getBoundingSphere(new Sphere()), !reducedMotion());
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [controls, boxes, targets]);
  return null;
}

/** Turns the camera to the step that plays: the moving part, where it comes from and what it joins. */
export function PlaybackCamera({ steps, bodies }: { steps: PlayStep[]; bodies: BodyModel[] }) {
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const boxes = useBodyBoxes(bodies);
  const step = useStudio((s) => (s.playback ? activeStep(s.playback.position, steps.length) : -1));
  useEffect(() => {
    const current = steps[step];
    if (!controls || !current) return;
    const box = new Box3();
    const start = playbackPoses(steps, boxes, step);
    for (const name of [...current.bodies, ...(current.target ? [current.target] : [])]) {
      const own = boxes.get(name);
      if (!own) continue;
      box.union(new Box3(new Vector3(...own.min), new Vector3(...own.max)));
      const offset = start.get(name)?.offset;
      if (offset) box.union(new Box3(new Vector3(...own.min).add(new Vector3(...offset)), new Vector3(...own.max).add(new Vector3(...offset))));
    }
    if (box.isEmpty()) return;
    frameBox(controls, box);
  }, [controls, step, steps, boxes]);
  return null;
}

/** The printer's bed in the plate view: the plate itself, its outline and its size along two edges. */
export function PlateBed({ bed, colors }: { bed: [number, number, number]; colors: ViewerColors }) {
  const { t } = useTranslation();
  const controls = useThree((state) => state.controls) as CameraControls | null;
  // drei's Html rebuilds its React root when the canvas connects its events after the first commit, and
  // that rebuild can leave the label empty: the labels wait for the connection (plate opened while the canvas mounts).
  const connected = useThree((state) => state.events.connected != null);
  const [width, depth] = bed;
  useEffect(() => {
    if (!controls) return;
    frameBox(controls, new Box3(new Vector3(0, 0, 0), new Vector3(width, depth, Math.min(bed[2], 30))));
  }, [controls, width, depth, bed]);
  const outline: Vec3[] = [
    [0, 0, 0.05],
    [width, 0, 0.05],
    [width, depth, 0.05],
    [0, depth, 0.05],
    [0, 0, 0.05],
  ];
  const label = 'pointer-events-none whitespace-nowrap rounded-sm bg-surface-raised px-1 text-xs tabular-nums text-text-muted shadow-1';
  return (
    <group name="print bed">
      <mesh position={[width / 2, depth / 2, -0.06]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={colors.bed} roughness={0.9} metalness={0} />
      </mesh>
      <Line points={outline} color={colors.bedEdge} lineWidth={1.2} raycast={noRaycast} />
      {connected ? (
        <>
          <Html position={[width / 2, -10, 0]} center zIndexRange={[12, 11]}>
            <span className={label} data-testid="bed-width">
              {t('units.mm', { value: width })}
            </span>
          </Html>
          <Html position={[-14, depth / 2, 0]} center zIndexRange={[12, 11]}>
            <span className={label} data-testid="bed-depth">
              {t('units.mm', { value: depth })}
            </span>
          </Html>
        </>
      ) : null}
    </group>
  );
}
