import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Box3, Plane, Raycaster, Vector2, Vector3, type Color, type Mesh } from 'three';

import { insidePolygon, SAMPLE_PIXELS, summarizeStroke, type ScreenDirection, type StrokeSample, type Vec2, type Vec3 } from '../../../shared/drawing';
import { useStudio, type BodyModel } from '../state/store';
import { edgeLabel } from './viewState';

/** Strokes sit this far in front of the faces, so the model does not hide them. */
const LIFT_MM = 0.3;
/** Wider than a pick, so a drawing reads at a glance. */
const LINE_PIXELS = 3;
/** Pictures of the view are at most this wide (ADR 0020). */
const MAX_IMAGE_WIDTH = 1600;

type Sampled = StrokeSample & { line: Vec3 };

interface Ray {
  hit: { body: number; face: string; world: Vec3; normal: Vec3 } | null;
  /** The ray's point on the plane through the view's target, for samples off the model. */
  off: Vec3;
}

/**
 * Pen mode (M2b-2, ADR 0020): while it is on, the left button draws on the view instead of
 * selecting and turning it. Every 8 px the pointer is picked against the model; the stroke is drawn
 * as a line on the faces it crosses and summarised for the assistant when the button comes up.
 * Escape leaves pen mode.
 */
export function Pen({ bodies, meshes, color }: { bodies: BodyModel[]; meshes: RefObject<(Mesh | null)[]>; color: Color }) {
  const pen = useStudio((s) => s.pen);
  const setPen = useStudio((s) => s.setPen);
  const addStroke = useStudio((s) => s.addStroke);
  const strokes = useStudio((s) => s.strokes);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  const [live, setLive] = useState<Vec3[] | null>(null);
  const serial = useRef(0);

  useEffect(() => {
    if (!pen) return;
    // The camera controls are off while drawing (Viewer passes enabled={!pen}).
    const controls = get().controls as ({ getTarget?: (out: Vector3) => Vector3 } & object) | null;
    const dom = gl.domElement;
    const raycaster = new Raycaster();
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const ndc = new Vector2();
    const scratch = new Vector3();
    const bounds = new Box3();
    for (const body of bodies) {
      body.model.geometry.computeBoundingBox();
      if (body.model.geometry.boundingBox) bounds.union(body.model.geometry.boundingBox);
    }
    const target = controls?.getTarget ? controls.getTarget(new Vector3()) : bounds.getCenter(new Vector3());
    const tolerance = Math.max(0.01, bounds.getSize(new Vector3()).length() * 1e-3);
    const meshList = () => meshes.current.filter((mesh): mesh is Mesh => mesh !== null);

    const screenOf = (point: Vec3): Vec2 | null => {
      const rect = dom.getBoundingClientRect();
      scratch.set(...point).project(camera);
      if (scratch.z < -1 || scratch.z > 1) return null;
      return [((scratch.x + 1) / 2) * rect.width, ((1 - scratch.y) / 2) * rect.height];
    };
    const cast = (x: number, y: number): Ray => {
      const rect = dom.getBoundingClientRect();
      ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), target);
      const offPoint = raycaster.ray.intersectPlane(plane, new Vector3()) ?? raycaster.ray.at(10, new Vector3());
      const off: Vec3 = [offPoint.x, offPoint.y, offPoint.z];
      const hit = raycaster.intersectObjects(meshList(), false)[0];
      if (!hit || hit.faceIndex == null || !hit.face) return { hit: null, off };
      const body = (hit.object.userData as { body?: number }).body ?? 0;
      const model = bodies.at(body)?.model;
      const face = model?.table.faces[model.triangleFaces[hit.faceIndex] ?? -1];
      if (!face) return { hit: null, off };
      const n = hit.face.normal;
      return { hit: { body, face: face.name, world: [hit.point.x, hit.point.y, hit.point.z], normal: [n.x, n.y, n.z] }, off };
    };
    const sample = (clientX: number, clientY: number): Sampled => {
      const rect = dom.getBoundingClientRect();
      const screen: Vec2 = [clientX - rect.left, clientY - rect.top];
      const { hit, off } = cast(...screen);
      if (!hit) return { screen, world: off, body: null, face: null, line: off };
      const line: Vec3 = [hit.world[0] + hit.normal[0] * LIFT_MM, hit.world[1] + hit.normal[1] * LIFT_MM, hit.world[2] + hit.normal[2] * LIFT_MM];
      return { screen, world: hit.world, body: bodies.at(hit.body)?.name ?? null, face: hit.face, line };
    };

    /** Faces and edges whose visible middle lies inside a loop. */
    const enclosed = (polygon: Vec2[]): { faces: string[]; edges: string[] } => {
      const faces: string[] = [];
      const edges: string[] = [];
      for (const body of bodies) {
        for (const face of body.model.table.faces) {
          const screen = screenOf(face.point);
          if (!screen || !insidePolygon(screen, polygon)) continue;
          if (cast(...screen).hit?.face === face.name) faces.push(face.name);
        }
        const segments = body.model.edgeSegments;
        const seen = new Set<number>();
        for (let s = 0; s < body.model.edgeOfSegment.length; s += 1) {
          const edge = body.model.edgeOfSegment[s] ?? 0;
          if (seen.has(edge)) continue;
          const middle: Vec3 = [
            ((segments[s * 6] ?? 0) + (segments[s * 6 + 3] ?? 0)) / 2,
            ((segments[s * 6 + 1] ?? 0) + (segments[s * 6 + 4] ?? 0)) / 2,
            ((segments[s * 6 + 2] ?? 0) + (segments[s * 6 + 5] ?? 0)) / 2,
          ];
          const screen = screenOf(middle);
          if (!screen || !insidePolygon(screen, polygon)) continue;
          seen.add(edge);
          const ray = cast(...screen);
          const along = scratch.set(...middle).sub(raycaster.ray.origin).dot(raycaster.ray.direction);
          const hitDistance = ray.hit ? scratch.set(...ray.hit.world).sub(raycaster.ray.origin).dot(raycaster.ray.direction) : Infinity;
          if (hitDistance >= along - tolerance) edges.push(edgeLabel(body.model, edge).name);
        }
      }
      return { faces, edges };
    };

    /** Where a stroke off the model lies on screen, seen from the middle of the part. */
    const direction = (samples: StrokeSample[]): ScreenDirection | undefined => {
      const middle = screenOf(bounds.getCenter(new Vector3()).toArray());
      if (!middle || samples.length === 0) return undefined;
      const x = samples.reduce((sum, s) => sum + s.screen[0], 0) / samples.length - middle[0];
      const y = samples.reduce((sum, s) => sum + s.screen[1], 0) / samples.length - middle[1];
      if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left';
      return y >= 0 ? 'below' : 'above';
    };

    let current: Sampled[] | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      dom.setPointerCapture(event.pointerId);
      current = [sample(event.clientX, event.clientY)];
      setLive(current.map((s) => s.line));
    };
    const onMove = (event: PointerEvent) => {
      if (!current || (event.buttons & 1) === 0) return;
      const last = current.at(-1);
      const rect = dom.getBoundingClientRect();
      if (last && Math.hypot(event.clientX - rect.left - last.screen[0], event.clientY - rect.top - last.screen[1]) < SAMPLE_PIXELS) return;
      current.push(sample(event.clientX, event.clientY));
      setLive(current.map((s) => s.line));
    };
    const onUp = (event: PointerEvent) => {
      if (!current || event.button !== 0) return;
      const samples = current;
      current = null;
      setLive(null);
      const end = sample(event.clientX, event.clientY);
      const lastSample = samples.at(-1);
      if (lastSample && Math.hypot(end.screen[0] - lastSample.screen[0], end.screen[1] - lastSample.screen[1]) >= 2) samples.push(end);
      const plain: StrokeSample[] = samples.map(({ screen, world, body, face }) => ({ screen, world, body, face }));
      const summary = summarizeStroke(plain, {
        inside: enclosed(plain.map((s) => s.screen)),
        ...(plain.every((s) => s.body === null) ? { direction: direction(plain) } : {}),
      });
      serial.current += 1;
      addStroke({ id: serial.current, summary, line: samples.map((s) => s.line) });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPen(false);
    };
    dom.addEventListener('pointerdown', onDown, { capture: true });
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      dom.removeEventListener('pointerdown', onDown, { capture: true });
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      setLive(null);
    };
  }, [pen, bodies, meshes, camera, gl, get, addStroke, setPen]);

  const radius = Math.max(0.6, LIFT_MM * 3);
  return (
    <group name="strokes">
      {[...strokes.map((stroke) => ({ key: `s${String(stroke.id)}`, line: stroke.line })), ...(live ? [{ key: 'live', line: live }] : [])].map(({ key, line }) =>
        line.length > 1 ? (
          <Line key={key} points={line} color={color} lineWidth={LINE_PIXELS} />
        ) : line[0] ? (
          <mesh key={key} position={line[0]}>
            <sphereGeometry args={[radius, 12, 8]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

/** Lets the composer take a PNG of the view with the strokes, at most 1600 px wide. */
export function ViewCapture() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const setCaptureView = useStudio((s) => s.setCaptureView);
  useEffect(() => {
    setCaptureView(async () => {
      // toBlob takes the picture when it is called: right after rendering, before the browser may
      // clear the drawing buffer.
      gl.render(scene, camera);
      const full = await new Promise<Blob | null>((resolve) => {
        gl.domElement.toBlob(resolve, 'image/png');
      });
      if (!full) return null;
      const bitmap = await createImageBitmap(full);
      const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    });
    return () => {
      setCaptureView(null);
    };
  }, [gl, scene, camera, setCaptureView]);
  return null;
}
