import { ContactShadows } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, CanvasTexture, Color, DirectionalLight, SRGBColorSpace, Vector3 } from 'three';

import type { BodyModel } from '../state/store';

/**
 * The look of the view with depth (UI upgrade step 8): a background with a soft vertical gradient,
 * a sky light from above (Z up) that sets top and bottom faces apart, and a key light that throws a
 * soft shadow of the part onto the floor under it. Everything follows the design tokens and the
 * theme; nothing takes clicks.
 */

/** The background as a vertical gradient from `top` to `bottom` (a small texture the GPU stretches). */
export function GradientBackground({ top, bottom }: { top: Color; bottom: Color }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    // Read from the store inside the effect: the scene is three.js state, not React state.
    const { scene, invalidate } = get();
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, `#${top.getHexString()}`);
    gradient.addColorStop(1, `#${bottom.getHexString()}`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const previous = scene.background;
    scene.background = texture;
    invalidate();
    return () => {
      scene.background = previous;
      texture.dispose();
    };
  }, [get, top, bottom]);
  return null;
}

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

/** Where the part stands: its box centre, radius, footprint and lowest point. */
function usePlacement(bodies: BodyModel[]) {
  return useMemo(() => {
    const box = boxOf(bodies);
    if (!box) return null;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    return { center, size, radius: Math.max(size.length() / 2, 1), floor: box.min.z };
  }, [bodies]);
}

/**
 * The key light, placed along `direction` around the part, with a shadow camera that just fits it:
 * the part shades itself (a clip on its plate, the inside of a hole), which gives corners depth.
 */
export function KeyLight({ bodies, direction, intensity }: { bodies: BodyModel[]; direction: [number, number, number]; intensity: number }) {
  const light = useRef<DirectionalLight>(null);
  const invalidate = useThree((state) => state.invalidate);
  const placement = usePlacement(bodies);
  const position = useMemo(
    () => (placement ? placement.center.clone().add(new Vector3(...direction).normalize().multiplyScalar(placement.radius * 4)) : new Vector3(...direction)),
    [placement, direction],
  );

  useEffect(() => {
    const current = light.current;
    if (!current || !placement) return;
    current.target.position.copy(placement.center);
    current.target.updateMatrixWorld();
    const camera = current.shadow.camera;
    const extent = placement.radius * 1.2;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = placement.radius;
    camera.far = placement.radius * 7;
    camera.updateProjectionMatrix();
    current.shadow.needsUpdate = true;
    invalidate();
  }, [placement, invalidate]);

  return (
    <directionalLight
      ref={light}
      position={position}
      intensity={intensity}
      castShadow={placement !== null}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-bias={-0.0004}
      shadow-normalBias={placement ? placement.radius * 0.003 : 0}
    />
  );
}

/**
 * A soft contact shadow on the floor under the part, as a picture taken from below and blurred
 * (drei's ContactShadows). drei builds it for a Y-up scene; the group turns it to Z up. Its blur
 * works in texels, so a coarse texture gives a visible soft rim on parts of 100 mm and more. It
 * is drawn once per design state, not every frame.
 */
export function GroundShadow({ bodies, opacity, color }: { bodies: BodyModel[]; opacity: number; color: Color }) {
  const placement = usePlacement(bodies);
  if (!placement) return null;
  const span = Math.max(placement.size.x, placement.size.y) * 1.6 + placement.radius * 0.4;
  const key = bodies.map((body) => body.model.geometry.uuid).join(',');
  return (
    <group rotation={[Math.PI / 2, 0, 0]} position={[placement.center.x, placement.center.y, placement.floor - 0.01]}>
      <ContactShadows key={key} frames={1} scale={span} far={Math.max(placement.size.z, 1)} blur={6} opacity={opacity} resolution={256} color={color} />
    </group>
  );
}
