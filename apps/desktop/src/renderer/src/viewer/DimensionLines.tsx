import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3, type Color, type Mesh } from 'three';

import type { DimensionMark } from '../../../shared/contract';

type Vec3 = [number, number, number];
type Placed = NonNullable<DimensionMark['geometry']>;

/** Drawing of a dimension (UI upgrade, view look), in CSS pixels where it should not scale with the zoom. */
const STYLE = {
  arrowLength: 9,
  arrowWidth: 6,
  dimensionWidth: 1.25,
  extensionWidth: 1,
  extensionOpacity: 0.65,
  /** Gap between the part and an extension line, and how far the line runs past the dimension line, as parts of the offset. */
  extensionGap: 0.18,
  extensionOvershoot: 0.22,
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : scale(a, 1 / l);
};
const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Any direction at right angles to `axis`. */
function across(axis: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const v = new Vector3(...axis).cross(new Vector3(...helper)).normalize();
  return [v.x, v.y, v.z];
}

/** A unit arrowhead: the tip at the origin, pointing along +X, flat in the XY plane. */
const ARROW = (() => {
  const geometry = new BufferGeometry();
  const half = STYLE.arrowWidth / STYLE.arrowLength / 2;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, -1, half, 0, -1, -half, 0]), 3));
  return geometry;
})();

const scratch = new Vector3();

/** World length of one CSS pixel at a point, for either camera. */
function worldPerPixel(camera: PerspectiveCamera | OrthographicCamera, height: number, at: Vector3): number {
  if ('isOrthographicCamera' in camera && camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / height;
  const perspective = camera as PerspectiveCamera;
  const distance = scratch.copy(at).sub(perspective.position).length();
  return (2 * distance * Math.tan((perspective.fov * Math.PI) / 360)) / height;
}

/** A filled arrowhead with its tip at `tip`, pointing along `direction`, lying in the plane of `side`; the same size on screen at any zoom. */
function Arrow({ tip, direction, side, color }: { tip: Vec3; direction: Vec3; side: Vec3; color: Color }) {
  const mesh = useRef<Mesh>(null);
  const at = useMemo(() => new Vector3(...tip), [tip]);
  const quaternion = useMemo(() => {
    const x = new Vector3(...direction).normalize();
    const y = new Vector3(...side).normalize();
    const z = new Vector3().crossVectors(x, y).normalize();
    y.crossVectors(z, x);
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  }, [direction, side]);
  useFrame(({ camera, size }) => {
    if (mesh.current) mesh.current.scale.setScalar(STYLE.arrowLength * worldPerPixel(camera, size.height, at));
  });
  return (
    <mesh ref={mesh} geometry={ARROW} position={tip} quaternion={quaternion} raycast={() => null}>
      <meshBasicMaterial color={color} side={DoubleSide} />
    </mesh>
  );
}

/**
 * The lines of one dimension, drawn the way a technical drawing does: extension lines that start
 * a little off the part and run a little past the dimension line, the dimension line with an
 * arrowhead at each end, and for a radius or diameter a leader with the arrow on the rim.
 */
export function DimensionLines({ geometry: g, kind, color }: { geometry: Placed; kind: DimensionMark['kind']; color: Color }) {
  if (same(g.from, g.to)) return null;
  const along = unit(sub(g.to, g.from));
  const offsetLength = length(g.offset);

  if (offsetLength === 0) {
    // A leader: radius from the centre, diameter across, the label beyond the rim.
    const side = across(along);
    const twoArrows = kind !== 'radius';
    return (
      <group>
        <Line points={[g.from, g.anchor]} color={color} lineWidth={STYLE.dimensionWidth} raycast={() => null} />
        <Arrow tip={g.to} direction={along} side={side} color={color} />
        {twoArrows ? <Arrow tip={g.from} direction={scale(along, -1)} side={side} color={color} /> : null}
      </group>
    );
  }

  const out = unit(g.offset);
  const a = add(g.from, g.offset);
  const b = add(g.to, g.offset);
  const gap = scale(out, offsetLength * STYLE.extensionGap);
  const over = scale(out, offsetLength * STYLE.extensionOvershoot);
  return (
    <group>
      <Line points={[add(g.from, gap), add(a, over)]} color={color} lineWidth={STYLE.extensionWidth} transparent opacity={STYLE.extensionOpacity} raycast={() => null} />
      <Line points={[add(g.to, gap), add(b, over)]} color={color} lineWidth={STYLE.extensionWidth} transparent opacity={STYLE.extensionOpacity} raycast={() => null} />
      <Line points={[a, b]} color={color} lineWidth={STYLE.dimensionWidth} raycast={() => null} />
      <Arrow tip={a} direction={scale(along, -1)} side={out} color={color} />
      <Arrow tip={b} direction={along} side={out} color={color} />
    </group>
  );
}
