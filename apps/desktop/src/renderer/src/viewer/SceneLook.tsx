import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Color, DirectionalLight, Vector3 } from 'three';

import type { BodyModel } from '../state/store';

/**
 * The look of the view (viewport CAD round, 2026-11-07, after Onshape and Fusion): a flat neutral
 * background, a sky light from above (Z up) that sets top and bottom faces apart, and a faint
 * contact shadow straight under the part from a light overhead. No floor shadow thrown to the side:
 * it read as a game, not as a CAD view. Everything follows the design tokens; nothing takes clicks.
 */

/** Sky light from above and a darker bounce from below, in model space (Z up). */
export function SkyLight({ sky, ground }: { sky: Color; ground: Color }) {
  return <hemisphereLight args={[sky, ground, 0.45]} position={[0, 0, 1]} />;
}

/** Box around every body, or null for an empty design. */
function boxOf(bodies: BodyModel[]): Box3 | null {
  const box = new Box3();
  for (const body of bodies) {
    const geometry = body.model.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
  }
  return box.isEmpty() ? null : box;
}

/** Where the part stands: its box centre, radius and lowest point. */
function usePlacement(bodies: BodyModel[]) {
  return useMemo(() => {
    const box = boxOf(bodies);
    if (!box) return null;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    return { center, radius: Math.max(size.length() / 2, 1), floor: box.min.z };
  }, [bodies]);
}

/**
 * Asks for the shadow map once (it does not update on its own, see Viewer). A function outside the
 * components, because the compiler keeps hook values immutable.
 */
export function requestShadow(gl: { shadowMap: { needsUpdate: boolean } }): void {
  gl.shadowMap.needsUpdate = true;
}

/** Nearly straight down, a hair to the side so vertical faces do not shade alike. */
const OVERHEAD = new Vector3(0.12, -0.08, 1).normalize();

/**
 * A light from overhead whose shadow camera just fits the part: it lays the part's contact
 * shadow on the floor right under it and shades deep pockets a little. 1024 texels are plenty for
 * a soft shadow (the earlier side shadow needed 2048 and cost most of a frame in software WebGL).
 */
export function ContactLight({ bodies, intensity }: { bodies: BodyModel[]; intensity: number }) {
  const light = useRef<DirectionalLight>(null);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const placement = usePlacement(bodies);
  const position = useMemo(() => (placement ? placement.center.clone().addScaledVector(OVERHEAD, placement.radius * 4) : OVERHEAD.clone()), [placement]);

  useEffect(() => {
    const current = light.current;
    if (!current || !placement) return;
    current.target.position.copy(placement.center);
    current.target.updateMatrixWorld();
    const camera = current.shadow.camera;
    const extent = placement.radius * 1.4;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = placement.radius;
    camera.far = placement.radius * 7;
    camera.updateProjectionMatrix();
    current.shadow.needsUpdate = true;
    requestShadow(gl);
    invalidate();
  }, [placement, invalidate, gl]);

  return (
    <directionalLight
      ref={light}
      position={position}
      intensity={intensity}
      castShadow={placement !== null}
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-bias={-0.0004}
      shadow-radius={8}
      shadow-normalBias={placement ? placement.radius * 0.003 : 0}
    />
  );
}

/**
 * The contact shadow on the floor: a plane that shows nothing but the overhead light's shadow.
 * drei's ContactShadows cannot do this with Z up: its blur pass draws a plane fixed in Y-up world
 * space, which the turned shadow camera sees edge-on, so its texture stayed empty (found 2026-11-06).
 */
export function GroundShadow({ bodies, opacity, color }: { bodies: BodyModel[]; opacity: number; color: Color }) {
  const placement = usePlacement(bodies);
  if (!placement) return null;
  const span = placement.radius * 2.8;
  return (
    // Just under the grid, so the grid lines stay on top; never picked.
    <mesh position={[placement.center.x, placement.center.y, placement.floor - 0.02]} receiveShadow raycast={() => undefined}>
      <planeGeometry args={[span, span]} />
      <shadowMaterial color={color} opacity={opacity} transparent depthWrite={false} />
    </mesh>
  );
}
