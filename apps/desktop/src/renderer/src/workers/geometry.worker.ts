/// <reference lib="webworker" />
import { buildRenderMesh, parseTagged3mf, renderMeshTransferables } from '@partbuddy/geometry';

import type { ParseRequest, ParseResponse } from './protocol';

// Parsing and edge derivation run off the UI thread (ADR 0004, step 3 and 4).
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, bodies } = event.data;
  try {
    const parsed = bodies.map((body) => {
      const mesh = parseTagged3mf(body.mesh);
      if (mesh.faceCount !== body.faces.faces.length) {
        throw new Error(`${body.name}: ${mesh.faceCount} tagged faces, ${body.faces.faces.length} in the face table`);
      }
      return { name: body.name, render: buildRenderMesh(mesh, body.faces), faces: body.faces };
    });
    const response: ParseResponse = { id, ok: true, bodies: parsed };
    scope.postMessage(response, parsed.flatMap((body) => renderMeshTransferables(body.render)));
  } catch (error) {
    const response: ParseResponse = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
    scope.postMessage(response);
  }
};
