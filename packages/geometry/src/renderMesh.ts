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
  /** Per B-rep edge: its two face indices (lower first). */
  edgeFaces: Uint32Array;
  /** Per B-rep edge: first segment and segment count in `edgeSegments`. */
  edgeRanges: Uint32Array;
  /** Per B-rep edge: length in mm. */
  edgeLengths: Float32Array;
  /** B-rep vertices (ends of open edges, each once), xyz per vertex. */
  vertices: Float32Array;
  /** Mesh edges with a triangle on one side only: above 0 the body is an open shell, not a solid. */
  openEdges: number;
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

  const { edges, openEdges } = deriveEdges(mesh, (a, b) => {
    const fa = table.faces[a];
    const fb = table.faces[b];
    return fa !== undefined && fb !== undefined && sameCylinder(fa, fb);
  });
  const total = edges.reduce((sum, edge) => sum + edge.segments.length, 0);
  const edgeSegments = new Float32Array(total);
  const edgeFaces = new Uint32Array(edges.length * 2);
  const edgeRanges = new Uint32Array(edges.length * 2);
  const edgeLengths = new Float32Array(edges.length);
  const corners = new Map<string, [number, number, number]>();
  let offset = 0;
  edges.forEach((edge, i) => {
    edgeSegments.set(edge.segments, offset);
    edgeFaces.set(edge.faces, i * 2);
    edgeRanges[i * 2] = offset / 6;
    edgeRanges[i * 2 + 1] = edge.segments.length / 6;
    edgeLengths[i] = edge.length;
    offset += edge.segments.length;
    for (const end of edge.ends) corners.set(end.join(','), end);
  });

  return {
    positions: Float32Array.from(positions),
    index,
    vertexFaces: Uint32Array.from(vertexFaces),
    triangleFaces: mesh.triangleFaces.slice(),
    edgeSegments,
    edgeFaces,
    edgeRanges,
    edgeLengths,
    vertices: Float32Array.from([...corners.values()].flat()),
    openEdges,
  };
}

/** The buffers of a render mesh, for `postMessage` transfer lists. */
export function renderMeshTransferables(mesh: RenderMesh): ArrayBuffer[] {
  return [
    mesh.positions,
    mesh.index,
    mesh.vertexFaces,
    mesh.triangleFaces,
    mesh.edgeSegments,
    mesh.edgeFaces,
    mesh.edgeRanges,
    mesh.edgeLengths,
    mesh.vertices,
  ].map(
    (array) => array.buffer as ArrayBuffer,
  );
}
