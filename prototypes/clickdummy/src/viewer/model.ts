import { BufferAttribute, BufferGeometry } from 'three';
import { computeBoundsTree } from 'three-mesh-bvh';

import { deriveEdges } from '../geometry/edges';
import { sameCylinder, type FaceTable } from '../geometry/faceTable';
import type { TaggedMesh } from '../geometry/tagged3mf';

export interface ViewerModel {
  mesh: TaggedMesh;
  table: FaceTable;
  /** Render geometry: vertices split per face, so normals are smooth within a face only. */
  geometry: BufferGeometry;
  /** Face index per render vertex, used to colour faces. */
  vertexFaces: Uint32Array;
  /** B-rep edges as line segments. */
  edges: BufferGeometry;
}

/** Builds render geometry from the tagged mesh (runs once per mirrored revision). */
export function buildViewerModel(mesh: TaggedMesh, table: FaceTable): ViewerModel {
  const remap = new Map<number, number>();
  const positions: number[] = [];
  const vertexFaces: number[] = [];
  const index = new Uint32Array(mesh.indices.length);

  for (let i = 0; i < mesh.indices.length; i += 1) {
    const vertex = mesh.indices[i]!;
    const face = mesh.triangleFaces[Math.floor(i / 3)]!;
    const key = vertex * 4096 + face;
    let mapped = remap.get(key);
    if (mapped === undefined) {
      mapped = positions.length / 3;
      remap.set(key, mapped);
      positions.push(mesh.positions[vertex * 3]!, mesh.positions[vertex * 3 + 1]!, mesh.positions[vertex * 3 + 2]!);
      vertexFaces.push(face);
    }
    index[i] = mapped;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Indirect keeps the index order, so triangle i still maps to mesh.triangleFaces[i] (ADR 0004).
  computeBoundsTree.call(geometry, { indirect: true });

  const { edges } = deriveEdges(mesh, (a, b) => {
    const fa = table.faces[a];
    const fb = table.faces[b];
    return fa !== undefined && fb !== undefined && sameCylinder(fa, fb);
  });
  const total = edges.reduce((sum, edge) => sum + edge.segments.length, 0);
  const segments = new Float32Array(total);
  let offset = 0;
  for (const edge of edges) {
    segments.set(edge.segments, offset);
    offset += edge.segments.length;
  }
  const edgeGeometry = new BufferGeometry();
  edgeGeometry.setAttribute('position', new BufferAttribute(segments, 3));

  return { mesh, table, geometry, vertexFaces: Uint32Array.from(vertexFaces), edges: edgeGeometry };
}
