import {
  AmbientLight,
  Box3,
  DirectionalLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { BodyModel } from '../state/store';

/** Size of the picture in pixels: twice the tile of the start page, sharp on 200 % displays. */
export const THUMBNAIL_SIZE = { width: 480, height: 360 } as const;

/**
 * Look of the picture (B3). The tiles sit on light and dark pages alike, so the background stays
 * transparent and the part takes a neutral grey with dark edges, from the same corner as the view's
 * standard isometric view.
 */
const look = {
  viewDirection: new Vector3(0.55, -0.68, 0.48).normalize(),
  fieldOfView: 30,
  body: 0xb9bfc8,
  edge: 0x2f343b,
  edgeOpacity: 0.55,
  roughness: 0.8,
  ambient: 1.2,
  key: 2.2,
  keyFrom: new Vector3(-70, -90, 130),
  fill: 0.9,
  fillFrom: new Vector3(100, 30, 50),
  /** Room around the part, as a share of the picture. */
  margin: 1,
};

let renderer: WebGLRenderer | null = null;

/** One small renderer for every picture; a second WebGL context beside the view's, made once. */
function pictureRenderer(): WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

/** The bounds of the bodies, or null when there is nothing to show. */
function boundsOf(bodies: BodyModel[]): Sphere | null {
  const box = new Box3();
  for (const body of bodies) {
    const geometry = body.model.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
  }
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new Sphere());
  return sphere.radius > 0 ? sphere : null;
}

/**
 * Draws the bodies from the isometric corner into a PNG and returns it as base64 (without the
 * data URL prefix), or null when there are no bodies or WebGL is not available. The geometry is
 * the view's own; only materials and lights are made here and freed again.
 */
export function renderThumbnail(bodies: BodyModel[]): string | null {
  const bounds = boundsOf(bodies);
  if (!bounds) return null;
  let gl: WebGLRenderer;
  try {
    gl = pictureRenderer();
  } catch {
    return null;
  }
  const scene = new Scene();
  const faces = new MeshStandardMaterial({ color: look.body, roughness: look.roughness, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edges = new LineBasicMaterial({ color: look.edge, transparent: true, opacity: look.edgeOpacity });
  for (const body of bodies) {
    scene.add(new Mesh(body.model.geometry, faces));
    scene.add(new LineSegments(body.model.edges, edges));
  }
  scene.add(new AmbientLight(0xffffff, look.ambient));
  const key = new DirectionalLight(0xffffff, look.key);
  key.position.copy(bounds.center).add(look.keyFrom);
  key.target.position.copy(bounds.center);
  scene.add(key, key.target);
  const fill = new DirectionalLight(0xffffff, look.fill);
  fill.position.copy(bounds.center).add(look.fillFrom);
  fill.target.position.copy(bounds.center);
  scene.add(fill, fill.target);

  const camera = new PerspectiveCamera(look.fieldOfView, THUMBNAIL_SIZE.width / THUMBNAIL_SIZE.height, 0.1, 100_000);
  camera.up.set(0, 0, 1);
  // Far enough that the sphere around the part fits the narrower side of the picture.
  const halfAngle = (look.fieldOfView * Math.PI) / 360;
  const distance = (bounds.radius * look.margin) / Math.sin(halfAngle);
  camera.position.copy(bounds.center).addScaledVector(look.viewDirection, distance);
  camera.near = Math.max(0.1, distance - bounds.radius * 2);
  camera.far = distance + bounds.radius * 2;
  camera.lookAt(bounds.center);
  camera.updateProjectionMatrix();

  try {
    gl.render(scene, camera);
    const url = gl.domElement.toDataURL('image/png');
    const prefix = 'data:image/png;base64,';
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  } catch {
    return null;
  } finally {
    faces.dispose();
    edges.dispose();
    gl.renderLists.dispose();
  }
}
