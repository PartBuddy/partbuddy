import { deriveEdges } from './edges';
import { sameCylinder, type FaceTable } from './faceTable';
import type { TaggedMesh } from './tagged3mf';

/**
 * Render buffers of one mirrored revision, as plain typed arrays. Building them needs no three.js,
 * so this runs in a worker and the buffers are transferred to the UI thread (ADR 0004).
 */
export interface RenderMesh {
  /** Vertices split per face, so normals are smooth within a face only; xyz per vertex. */
  positions: Float32Array;
  /** Three indices per triangle, in the order of `TaggedMesh.indices`. */
  index: Uint32Array;
  /** Face index per render vertex, used to colour faces. */
  vertexFaces: Uint32Array;
  /** B-rep face index per triangle (`ft:face`). */
  triangleFaces: Uint32Array;
  /** B-rep edges as line segments, xyz xyz per segment; smooth cylinder seams are left out. */
  edgeSegments: Float32Array;
}

export function buildRenderMesh(mesh: TaggedMesh, table: FaceTable): RenderMesh {
  const remap = new Map<number, number>();
  const positions: number[] = [];
  const vertexFaces: number[] = [];
  const index = new Uint32Array(mesh.indices.length);

  for (let i = 0; i < mesh.indices.length; i += 1) {
    const vertex = mesh.indices[i]!;
    const face = mesh.triangleFaces[Math.floor(i / 3)]!;
    // A vertex shared by several faces is split once per face.
    const key = vertex * (mesh.faceCount + 1) + face;
    let mapped = remap.get(key);
    if (mapped === undefined) {
      mapped = positions.length / 3;
      remap.set(key, mapped);
      positions.push(mesh.positions[vertex * 3]!, mesh.positions[vertex * 3 + 1]!, mesh.positions[vertex * 3 + 2]!);
      vertexFaces.push(face);
    }
    index[i] = mapped;
  }

  const { edges } = deriveEdges(mesh, (a, b) => {
    const fa = table.faces[a];
    const fb = table.faces[b];
    return fa !== undefined && fb !== undefined && sameCylinder(fa, fb);
  });
  const total = edges.reduce((sum, edge) => sum + edge.segments.length, 0);
  const edgeSegments = new Float32Array(total);
  let offset = 0;
  for (const edge of edges) {
    edgeSegments.set(edge.segments, offset);
    offset += edge.segments.length;
  }

  return {
    positions: Float32Array.from(positions),
    index,
    vertexFaces: Uint32Array.from(vertexFaces),
    triangleFaces: mesh.triangleFaces.slice(),
    edgeSegments,
  };
}

/** The buffers of a render mesh, for `postMessage` transfer lists. */
export function renderMeshTransferables(mesh: RenderMesh): ArrayBuffer[] {
  return [mesh.positions, mesh.index, mesh.vertexFaces, mesh.triangleFaces, mesh.edgeSegments].map(
    (array) => array.buffer as ArrayBuffer,
  );
}
