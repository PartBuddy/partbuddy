import type { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ViewportGizmo, type GizmoOptions } from 'three-viewport-gizmo';

import type { ViewerColors } from './useTokenColors';

/**
 * The view cube (viewport CAD round, 2026-11-07, after Manuel found drei's cube too basic): the
 * free three-viewport-gizmo (MIT) with rounded faces, edges and corners that each turn the view,
 * a hover highlight in the accent colour and an animated turn. Colours from the design tokens,
 * labels in the user's language, Z up as in the rest of the view.
 */
const hex = (color: ViewerColors['edge']) => `#${color.getHexString()}`;

export function ViewCube({ colors }: { colors: ViewerColors }) {
  const { t } = useTranslation();
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as CameraControls | null;
  const invalidate = useThree((state) => state.invalidate);
  const gizmo = useRef<ViewportGizmo | null>(null);
  // R3F's wrapper of the canvas, positioned, so the cube sits in the view's corner.
  const container = gl.domElement.parentElement;

  useEffect(() => {
    if (!container) return;
    const accent = hex(colors.selection);
    // Flat tones of the part colour per side, lighter on top and darker to the right, as a lit cube.
    const tone = { top: colors.body.clone().lerp(colors.sky, 0.45), side: colors.body.clone().lerp(colors.sky, 0.15), shade: colors.body.clone().lerp(colors.ground, 0.12) };
    const face = (label: string, color: ViewerColors['edge']) => ({
      label,
      color: hex(color),
      labelColor: hex(colors.edge),
      hover: { color: accent, labelColor: hex(colors.axisLabel) },
    });
    const options: GizmoOptions = {
      type: 'cube',
      container,
      id: 'view-cube',
      placement: 'top-right',
      size: 112,
      offset: { top: 12, right: 12 },
      animated: true,
      speed: 1.6,
      font: { family: 'Segoe UI Variable, Segoe UI, sans-serif', weight: 600 },
      // One rounded body in the face tone; edges and corners show only under the pointer, in the accent colour.
      background: { enabled: true, color: hex(tone.shade), opacity: 1, hover: { color: hex(tone.shade), opacity: 1 } },
      corners: { enabled: true, color: hex(tone.shade), opacity: 0, hover: { color: accent, opacity: 1 } },
      edges: { enabled: true, color: hex(tone.shade), opacity: 0, hover: { color: accent, opacity: 1 } },
      // Z up: +X right, +Y back, +Z top.
      x: face(t('viewer.cube.right'), tone.shade),
      nx: face(t('viewer.cube.left'), tone.shade),
      y: face(t('viewer.cube.back'), tone.side),
      ny: face(t('viewer.cube.front'), tone.side),
      z: face(t('viewer.cube.top'), tone.top),
      nz: face(t('viewer.cube.bottom'), tone.side),
    };
    const created = new ViewportGizmo(camera, gl, options);
    gizmo.current = created;
    // The gizmo turns the camera itself; camera-controls is told where it went, and steps aside meanwhile.
    const start = () => {
      if (controls) controls.enabled = false;
    };
    const end = () => {
      if (controls) controls.enabled = true;
    };
    const change = () => {
      if (controls) void controls.setPosition(camera.position.x, camera.position.y, camera.position.z, false);
      invalidate();
    };
    created.addEventListener('start', start);
    created.addEventListener('end', end);
    created.addEventListener('change', change);
    const follow = () => {
      if (!controls) return;
      controls.getTarget(created.target);
      created.update();
    };
    controls?.addEventListener('update', follow);
    follow();
    // Hover highlights need a frame; the view draws on demand.
    const wake = () => {
      invalidate();
    };
    container.addEventListener('pointermove', wake);
    return () => {
      controls?.removeEventListener('update', follow);
      container.removeEventListener('pointermove', wake);
      created.removeEventListener('start', start);
      created.removeEventListener('end', end);
      created.removeEventListener('change', change);
      created.dispose();
      gizmo.current = null;
    };
  }, [camera, gl, controls, colors, container, invalidate, t]);

  // After the scene and the axis triad; keeps drawing while its turn animates.
  useFrame(() => {
    const current = gizmo.current;
    if (!current) return;
    current.render();
    if (current.animating) invalidate();
  }, 3);
  return null;
}
