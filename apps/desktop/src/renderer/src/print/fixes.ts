import { counterboresOf, filletFeatureOf, holeRoof, isSupportBody, ribsFor, steppedBridge, type Down, type PrintFinding, type ViewerModel } from '@partbuddy/geometry';

import type { PrintFix } from '../../../shared/contract';

/**
 * The fix for a support finding (M7f step 2): which SolidCraft change takes the support away, built
 * from the mirrored mesh. Pure, so it is tested without a window; the light offers it as a button.
 */

/** At most this many triangles per face go to the main process; long faces are sampled evenly. */
const MAX_TRIANGLES = 200;

type Point = [number, number, number];
type Triangle = [Point, Point, Point];
interface Body {
  name: string;
  model: ViewerModel;
}

function trianglesOf(model: ViewerModel, face: number): Triangle[] {
  const positions = model.geometry.getAttribute('position').array;
  const index = model.geometry.index?.array ?? [];
  const mine: number[] = [];
  for (let t = 0; t < index.length / 3; t += 1) if (model.triangleFaces[t] === face) mine.push(t);
  const stride = Math.max(1, Math.ceil(mine.length / MAX_TRIANGLES));
  const corner = (v: number): Point => [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
  return mine.filter((_, i) => i % stride === 0).map((t) => [corner(index[t * 3] ?? 0), corner(index[t * 3 + 1] ?? 0), corner(index[t * 3 + 2] ?? 0)]);
}

/** What the fix needs of the print profile: the printer's layer and the material's overhang limit. */
export interface FixProfile {
  layer: number;
  overhang: number;
}

/**
 * The fix of a support finding for its first body, or null when there is none. Overhangs without
 * a shape to change ("other") get support walls printed into the model (M7f step 4).
 */
export function fixFor(finding: PrintFinding, bodies: readonly Body[], down: Down, profile: FixProfile): PrintFix | null {
  if (finding.kind !== 'support' || finding.ribs) return null;
  const place = finding.places[0];
  const body = bodies.find((item) => item.name === place?.body);
  if (!place || !body) return null;
  const faceIndex = (name: string) => body.model.table.faces.findIndex((face) => face.name === name);
  const { layer } = profile;

  if (finding.cause === 'other') {
    const ribs = ribsFor(body.model, down, profile.overhang, layer).slice(0, 60);
    const first = bodies.filter((item) => isSupportBody(item.name)).length + 1;
    return ribs.length > 0 ? { fix: 'ribs', body: body.name, first, ribs } : null;
  }

  if (finding.cause === 'fillet') {
    const byFeature = new Map<number, Triangle[][]>();
    for (const name of place.faces) {
      const feature = filletFeatureOf(name);
      const face = faceIndex(name);
      if (feature === null || face < 0) continue;
      const triangles = trianglesOf(body.model, face);
      if (triangles.length === 0) continue;
      byFeature.set(feature, [...(byFeature.get(feature) ?? []), triangles].slice(0, 50));
    }
    const fillets = [...byFeature].slice(0, 20).map(([feature, faces]) => ({ feature, faces }));
    return fillets.length > 0 ? { fix: 'chamfer', body: body.name, fillets } : null;
  }

  if (finding.cause === 'counterbore') {
    const wanted = new Set(place.faces.map(faceIndex));
    const bridges = counterboresOf(body.model, down)
      .filter((counterbore) => wanted.has(counterbore.step))
      .slice(0, 20)
      .map((counterbore) => steppedBridge(counterbore, down, layer));
    return bridges.length > 0 ? { fix: 'bridge', body: body.name, bridges } : null;
  }

  // One roof per hole: SolidCraft splits a cylinder into pieces with the same roof.
  const roofs = new Map<string, NonNullable<ReturnType<typeof holeRoof>>>();
  for (const name of place.faces) {
    const roof = holeRoof(body.model, faceIndex(name), down);
    if (roof) roofs.set(JSON.stringify([roof.origin, roof.xDir, roof.radius]), roof);
  }
  const list = [...roofs.values()].slice(0, 20).map(({ origin, xDir, yDir, points, length }) => ({ origin, xDir, yDir, points, length }));
  return list.length > 0 ? { fix: 'roof', body: body.name, roofs: list } : null;
}
