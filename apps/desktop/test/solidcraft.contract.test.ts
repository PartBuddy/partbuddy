import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseTagged3mf } from '@partbuddy/geometry';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';

import { ControlClient } from '../src/main/solidcraft/controlClient';
import { findRunning, systemEnvironment } from '../src/main/solidcraft/discovery';
import { mirrorActiveDesign } from '../src/main/solidcraft/mirror';

// ADR 0004 contract test against the installed SolidCraft: every `model.faces[].point` lies on
// a triangle tagged with the same face. Opt in with PARTBUDDY_E2E_SOLIDCRAFT=1 while a SolidCraft
// with a design is running; it only reads and exports into a temporary folder.
const enabled = process.env.PARTBUDDY_E2E_SOLIDCRAFT === '1';

describe.skipIf(!enabled)('SolidCraft contract (local)', () => {
  it('maps every face table point onto a triangle of the same face', async () => {
    const running = findRunning(systemEnvironment);
    if (!running.found) throw new Error(`no running SolidCraft found (${running.reason})`);
    const cacheDir = mkdtempSync(join(tmpdir(), 'partbuddy-contract-'));
    const client = await ControlClient.open({ port: running.endpoint.port, token: running.endpoint.token });
    try {
      const revision = await mirrorActiveDesign(client, cacheDir);
      expect(revision.bodies.length).toBeGreaterThan(0);
      for (const body of revision.bodies) {
        const mesh = parseTagged3mf(body.mesh);
        expect(mesh.faceCount, body.name).toBe(body.faces.faces.length);
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(Float32Array.from(mesh.positions), 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        const bvh = new MeshBVH(geometry, { indirect: true });
        const size = new Vector3();
        geometry.computeBoundingBox();
        geometry.boundingBox?.getSize(size);
        // Standard quality: chord tolerance 2e-4 of the body size (file.export documentation).
        const tolerance = Math.max(0.01, size.length() * 2e-4 * 2);
        for (const face of body.faces.faces) {
          const hit = bvh.closestPointToPoint(new Vector3(...face.point));
          expect(hit, face.name).not.toBeNull();
          expect(hit?.distance, face.name).toBeLessThan(tolerance);
          expect(mesh.triangleFaces[hit?.faceIndex ?? -1], face.name).toBe(face.index);
        }
      }
    } finally {
      client.close();
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
