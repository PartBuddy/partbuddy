import type { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Vector3 } from 'three';

import { cellDirection, FACE_ORDER, faceTransform, viewRotation, type CubeFace, type Vec3 } from './navCube';

/**
 * The view cube (2026-11-07, Manuel: "something professional and ready-made"): Bentley's iTwin.js
 * CubeNavigationAid (MIT), its geometry (navCube.ts) and look: flat faces with a soft gradient, a
 * hairline border, the label in the system font, 3 × 3 cells per face for corners, edges and centre
 * that light up under the pointer. HTML over the canvas, so text stays crisp; colours from the
 * design tokens. A click turns the view through camera-controls, animated.
 * shortcut: no dragging the cube to orbit and no 90° turn arrows (iTwin has both); the view itself
 * orbits. Add them if users reach for them.
 */

const CUBE = 64;
const BOX = 96;
const CELLS = [-1, 0, 1] as const;

/** Every face element, for the frame loop to turn without React. */
type FaceRefs = Partial<Record<CubeFace, HTMLDivElement | null>>;

/** Outside the component: turns the face elements to the camera (the compiler keeps hook values immutable). */
function turnFaces(faces: FaceRefs, world: ArrayLike<number>, last: { key: string }): void {
  const rotation = viewRotation(world);
  const key = rotation.map((value) => value.toFixed(4)).join(',');
  if (key === last.key) return;
  last.key = key;
  for (const face of FACE_ORDER) {
    const element = faces[face];
    if (element) element.style.transform = faceTransform(rotation, face, CUBE / 2);
  }
}

const faceStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: '14px 1fr 14px',
  gridTemplateRows: '14px 1fr 14px',
  background: 'linear-gradient(var(--cs-color-surface-raised), var(--cs-color-surface-sunken))',
  boxShadow: 'inset 0 0 0 1px var(--cs-color-border-strong)',
  backfaceVisibility: 'hidden',
  pointerEvents: 'auto',
};

/** The link between the cube (HTML beside the canvas) and the canvas, where the camera and its controls live. */
const link: { faces: FaceRefs; last: { key: string }; controls: CameraControls | null } = { faces: {}, last: { key: '' }, controls: null };

function setControls(controls: CameraControls | null): void {
  link.controls = controls;
}

/** Inside the canvas: turns the cube with the camera every frame the view draws, and lends it the controls. */
export function ViewCubeSync() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as CameraControls | null;
  useEffect(() => {
    setControls(controls);
    return () => {
      setControls(null);
    };
  }, [controls]);
  useFrame(() => {
    turnFaces(link.faces, camera.matrixWorld.elements, link.last);
  });
  return null;
}

/** Turns the view to look from `direction` at what it looks at, keeping the distance. */
function look(direction: Vec3): void {
  const { controls } = link;
  if (!controls) return;
    const target = controls.getTarget(new Vector3());
    const distance = controls.getPosition(new Vector3()).distanceTo(target);
    // Straight up or down leans a hair to the front, so "up" stays defined.
    const d = new Vector3(direction[0], direction[1] === 0 && direction[0] === 0 ? -1e-4 : direction[1], direction[2]).normalize().multiplyScalar(distance);
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    void controls.setFocalOffset(0, 0, 0, animate);
    void controls.setLookAt(target.x + d.x, target.y + d.y, target.z + d.z, target.x, target.y, target.z, animate);
}

/** The cube itself, an overlay in the view's top right corner. */
export function ViewCube() {
  const { t } = useTranslation();
  return (
    <div
      id="view-cube"
      role="group"
      aria-label={t('viewer.cube.title')}
      className="pointer-events-none absolute right-3 top-3 z-10 flex select-none items-center justify-center"
      style={{ width: BOX, height: BOX }}
      data-view-overlay
    >
      <div style={{ position: 'relative', width: CUBE, height: CUBE, perspective: 300, transformStyle: 'preserve-3d' }}>
        {FACE_ORDER.map((face) => (
          <div
            key={face}
            ref={(element) => {
              link.faces[face] = element;
              link.last.key = '';
            }}
            style={faceStyle}
            data-face={face}
          >
            {CELLS.map((row) =>
              CELLS.map((column) => {
                const centre = row === 0 && column === 0;
                const direction = cellDirection(face, column, row);
                return (
                  <button
                    key={`${String(row)}${String(column)}`}
                    type="button"
                    tabIndex={centre ? 0 : -1}
                    aria-label={centre ? t(`viewer.cube.${face}`) : undefined}
                    aria-hidden={centre ? undefined : true}
                    onClick={(event) => {
                      event.stopPropagation();
                      look(direction);
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    className={`cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-text outline-none hover:bg-accent-subtle focus-visible:bg-accent-subtle ${centre ? 'flex items-center justify-center' : ''}`}
                  >
                    {centre ? t(`viewer.cube.${face}`) : null}
                  </button>
                );
              }),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
