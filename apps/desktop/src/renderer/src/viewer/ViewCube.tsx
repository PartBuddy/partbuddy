import type { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CanvasTexture, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, Vector3, Vector4, type Camera, type Color, type WebGLRenderer } from 'three';

import type { ViewerColors } from './useTokenColors';
import { cubeRegions, cubeViewDirection, regionGeometry, type CubeFace, type CubeRegion } from './viewCubeGeometry';

const SIZE = 120;
const MARGIN = 12;
const css = (color: Color) => color.getStyle();

function faceTexture(label: string, base: Color, colors: ViewerColors, hover: boolean) {
  const canvas = document.createElement('canvas');
  // Two texels per logical pixel, independent of the viewport's adaptive DPR.
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(2, 2);
    const tint = hover ? base.clone().lerp(colors.selection, 0.3) : base;
    const gradient = ctx.createLinearGradient(0, 0, 30, 128);
    gradient.addColorStop(0, css(tint.clone().lerp(colors.sky, 0.12)));
    gradient.addColorStop(0.65, css(tint));
    gradient.addColorStop(1, css(tint.clone().lerp(colors.ground, 0.08)));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = css(hover ? colors.selection : colors.cubeStroke);
    ctx.lineWidth = hover ? 3 : 1;
    ctx.strokeRect(0.5, 0.5, 127, 127);
    ctx.fillStyle = css(colors.cubeText);
    let fontSize = 32;
    ctx.font = `600 ${fontSize}px 'Segoe UI Variable', 'Segoe UI', sans-serif`;
    fontSize *= Math.min(1, 82 / Math.max(1, ctx.measureText(label).width));
    ctx.font = `600 ${fontSize}px 'Segoe UI Variable', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 65);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createCube(colors: ViewerColors, labels: Record<CubeFace, string>) {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1.95, 1.95, 1.95, -1.95, 0.1, 20);
  const regions = cubeRegions();
  const textures: CanvasTexture[] = [];
  const materials: MeshBasicMaterial[] = [];
  const meshes = regions.map((region) => {
    const base = colors.cube.clone().lerp(colors.body, 0.18);
    base.lerp(region.direction[2] > 0 ? colors.sky : colors.ground, region.direction[2] > 0 ? 0.16 : 0.06);
    if (region.direction[0] > 0) base.lerp(colors.ground, 0.07);
    if (!region.face) base.lerp(colors.cubeStroke, 0.22);
    const normal = new MeshBasicMaterial({ color: base, toneMapped: false });
    const hover = new MeshBasicMaterial({ color: base.clone().lerp(colors.selection, 0.65), toneMapped: false });
    if (region.face) {
      const map = faceTexture(labels[region.face], base, colors, false);
      const hoverMap = faceTexture(labels[region.face], base, colors, true);
      textures.push(map, hoverMap);
      normal.map = map;
      hover.map = hoverMap;
      normal.color.setRGB(1, 1, 1);
      hover.color.setRGB(1, 1, 1);
    }
    materials.push(normal, hover);
    const mesh = new Mesh(regionGeometry(region), normal);
    scene.add(mesh);
    return mesh;
  });
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    const shadow = colors.shadow;
    gradient.addColorStop(0, `rgba(${shadow.r * 255}, ${shadow.g * 255}, ${shadow.b * 255}, 0.16)`);
    gradient.addColorStop(1, `rgba(${shadow.r * 255}, ${shadow.g * 255}, ${shadow.b * 255}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const shadowTexture = new CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = SRGBColorSpace;
  textures.push(shadowTexture);
  const shadowMaterial = new SpriteMaterial({ map: shadowTexture, depthTest: false, depthWrite: false, toneMapped: false });
  const shadow = new Sprite(shadowMaterial);
  shadow.scale.set(3.5, 3.2, 1);
  shadow.renderOrder = -1;
  scene.add(shadow);
  return {
    scene, camera, regions, meshes, shadow,
    raycaster: new Raycaster(), pointer: new Vector2(),
    viewport: new Vector4(), scissor: new Vector4(),
    hovered: -1, animating: false,
    refreshHover: null as (() => void) | null,
    hover(index: number) {
      if (this.hovered === index) return;
      this.hovered = index;
      meshes.forEach((mesh, i) => {
        const material = materials[i * 2 + (i === index ? 1 : 0)];
        if (material) mesh.material = material;
      });
    },
    dispose() {
      meshes.forEach((mesh) => { mesh.geometry.dispose(); });
      materials.forEach((material) => { material.dispose(); });
      textures.forEach((texture) => { texture.dispose(); });
      shadowMaterial.dispose();
      // Sprite's geometry is shared by Three.js; it is not owned by this overlay.
      scene.clear();
    },
  };
}

type Cube = ReturnType<typeof createCube>;

function orient(cube: Cube, mainCamera: Camera) {
  mainCamera.getWorldQuaternion(cube.camera.quaternion);
  cube.camera.position.set(0, 0, 6).applyQuaternion(cube.camera.quaternion);
  cube.camera.updateMatrixWorld();
  cube.shadow.position.set(0.08, -0.16, -2).applyQuaternion(cube.camera.quaternion);
  cube.scene.updateMatrixWorld();
}

function draw(cube: Cube, gl: WebGLRenderer, width: number, height: number) {
  gl.getViewport(cube.viewport);
  gl.getScissor(cube.scissor);
  const scissorTest = gl.getScissorTest();
  const autoClear = gl.autoClear;
  try {
    gl.autoClear = false;
    gl.setViewport(width - SIZE - MARGIN, height - SIZE - MARGIN, SIZE, SIZE);
    gl.setScissor(width - SIZE - MARGIN, height - SIZE - MARGIN, SIZE, SIZE);
    gl.setScissorTest(true);
    gl.clearDepth();
    gl.render(cube.scene, cube.camera);
  } finally {
    gl.setViewport(cube.viewport);
    gl.setScissor(cube.scissor);
    gl.setScissorTest(scissorTest);
    gl.autoClear = autoClear;
  }
}

/** Only camera-controls owns the main camera, including during cube transitions. */
function turn(controls: CameraControls, region: CubeRegion, reducedMotion: boolean) {
  const target = controls.getTarget(new Vector3());
  const distance = controls.getPosition(new Vector3()).distanceTo(target);
  const position = cubeViewDirection(region.direction).multiplyScalar(distance).add(target);
  return controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, !reducedMotion);
}

export function ViewCube({ colors }: { colors: ViewerColors }) {
  const { t } = useTranslation();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const invalidate = useThree((s) => s.invalidate);
  const cubeRef = useRef<Cube | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const container = canvas.parentElement;
    if (!container) return;
    const cube = createCube(colors, {
      front: t('viewer.cube.front'), back: t('viewer.cube.back'),
      left: t('viewer.cube.left'), right: t('viewer.cube.right'),
      top: t('viewer.cube.top'), bottom: t('viewer.cube.bottom'),
    });
    cubeRef.current = cube;
    const marker = document.createElement('div');
    marker.id = 'view-cube';
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, { position: 'absolute', top: `${MARGIN}px`, right: `${MARGIN}px`, width: `${SIZE}px`, height: `${SIZE}px`, pointerEvents: 'none' });
    container.appendChild(marker);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let pressed: { id: number; region: number; x: number; y: number } | null = null;
    let oldCursor: string | null = null;
    let savedSmoothTime: number | null = null;
    let generation = 0;
    let pointer: { clientX: number; clientY: number } | null = null;
    let outsidePress = false;
    let suppressClick = false;
    const restoreTiming = () => {
      if (controls && savedSmoothTime !== null) controls.smoothTime = savedSmoothTime;
      savedSmoothTime = null;
      cube.animating = false;
    };
    const hit = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.right + SIZE + MARGIN;
      const y = event.clientY - rect.top - MARGIN;
      if (x < 0 || y < 0 || x > SIZE || y > SIZE) return -1;
      orient(cube, camera);
      cube.pointer.set(x / SIZE * 2 - 1, 1 - y / SIZE * 2);
      cube.raycaster.setFromCamera(cube.pointer, cube.camera);
      const intersection = cube.raycaster.intersectObjects(cube.meshes, false)[0];
      return intersection ? cube.meshes.indexOf(intersection.object as Mesh<ReturnType<typeof regionGeometry>, MeshBasicMaterial>) : -1;
    };
    const hover = (index: number) => {
      cube.hover(index);
      if (index >= 0) {
        oldCursor ??= canvas.style.cursor;
        canvas.style.cursor = 'pointer';
      } else if (oldCursor !== null) {
        canvas.style.cursor = oldCursor;
        oldCursor = null;
      }
      invalidate();
    };
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    cube.refreshHover = () => {
      if (!pointer || outsidePress) return;
      const index = hit(pointer);
      if (index !== cube.hovered) hover(index);
    };
    const move = (event: PointerEvent) => {
      pointer = { clientX: event.clientX, clientY: event.clientY };
      // A scene orbit that crosses the overlay must still receive its complete gesture.
      if (outsidePress) return;
      const index = hit(event);
      if (index >= 0 || pressed) stop(event);
      if (index !== cube.hovered) hover(index);
    };
    const down = (event: PointerEvent) => {
      const index = hit(event);
      suppressClick = index >= 0;
      if (index < 0) { outsidePress = true; return; }
      stop(event);
      if (event.button !== 0 || pressed) return;
      pressed = { id: event.pointerId, region: index, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      hover(index);
    };
    const up = (event: PointerEvent) => {
      if (outsidePress) { outsidePress = false; return; }
      if (!pressed || pressed.id !== event.pointerId) {
        if (hit(event) >= 0) stop(event);
        return;
      }
      stop(event);
      const press = pressed;
      pressed = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!controls || hit(event) !== press.region || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) return;
      const region = cube.regions[press.region];
      if (!region) return;
      const token = ++generation;
      savedSmoothTime ??= controls.smoothTime;
      // Critically damped easing; most of the turn completes in approximately 400 ms.
      controls.smoothTime = 0.08;
      cube.animating = !motion.matches;
      void turn(controls, region, motion.matches).finally(() => {
        if (generation === token) { restoreTiming(); invalidate(); }
      });
      invalidate();
    };
    const cancel = (event?: Event) => {
      if (pressed && event) stop(event);
      if (pressed && canvas.hasPointerCapture(pressed.id)) canvas.releasePointerCapture(pressed.id);
      pressed = null;
      outsidePress = false;
      pointer = null;
      hover(-1);
    };
    const leave = () => { pointer = null; hover(-1); };
    const releaseOutside = () => { outsidePress = false; };
    const block = (event: MouseEvent) => { if (hit(event) >= 0) stop(event); };
    const click = (event: MouseEvent) => {
      if (suppressClick) stop(event);
      else block(event);
      suppressClick = false;
    };
    // Ancestor capture runs before canvas picking AND camera-controls' capture listeners.
    container.addEventListener('pointermove', move, true);
    container.addEventListener('pointerdown', down, true);
    container.addEventListener('pointerup', up, true);
    container.addEventListener('pointercancel', cancel, true);
    window.addEventListener('pointerup', releaseOutside);
    window.addEventListener('pointercancel', releaseOutside);
    canvas.addEventListener('pointerleave', leave);
    container.addEventListener('click', click, true);
    container.addEventListener('dblclick', block, true);
    container.addEventListener('contextmenu', block, true);
    container.addEventListener('wheel', block, { capture: true, passive: false });
    invalidate();
    return () => {
      generation++;
      restoreTiming();
      cancel();
      container.removeEventListener('pointermove', move, true);
      container.removeEventListener('pointerdown', down, true);
      container.removeEventListener('pointerup', up, true);
      container.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('pointerup', releaseOutside);
      window.removeEventListener('pointercancel', releaseOutside);
      canvas.removeEventListener('pointerleave', leave);
      container.removeEventListener('click', click, true);
      container.removeEventListener('dblclick', block, true);
      container.removeEventListener('contextmenu', block, true);
      container.removeEventListener('wheel', block, true);
      marker.remove();
      cube.dispose();
      cubeRef.current = null;
    };
  }, [camera, gl, controls, colors, invalidate, t]);

  useFrame(({ size }) => {
    const cube = cubeRef.current;
    if (!cube) return;
    orient(cube, camera);
    cube.refreshHover?.();
    draw(cube, gl, size.width, size.height);
    if (cube.animating || cube.hovered >= 0) invalidate();
  }, 3);
  return null;
}
