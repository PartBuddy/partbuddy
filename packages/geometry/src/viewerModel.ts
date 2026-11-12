import { BufferAttribute, BufferGeometry } from 'three';
import { computeBoundsTree } from 'three-mesh-bvh';

import type { FaceTable } from './faceTable';
import type { RenderMesh } from './renderMesh';

export interface ViewerModel {
  table: FaceTable;
  /** B-rep face index per triangle, so a raycast's `faceIndex` maps to a face. */
  triangleFaces: Uint32Array;
  /** Render geometry with a picking BVH. */
  geometry: BufferGeometry;
  /** Face index per render vertex, used to colour faces. */
  vertexFaces: Uint32Array;
  /** B-rep edges as line segments. */
  edges: BufferGeometry;
  /** The same segments as plain numbers, xyz xyz per segment, for picking. */
  edgeSegments: Float32Array;
  /** B-rep edge index per segment. */
  edgeOfSegment: Uint32Array;
  /** Per B-rep edge: its two face indices (lower first). */
  edgeFaces: Uint32Array;
  /** Per B-rep edge: first segment and segment count. */
  edgeRanges: Uint32Array;
  /** Per B-rep edge: length in mm. */
  edgeLengths: Float32Array;
  /** B-rep vertices, xyz per vertex. */
  vertices: Float32Array;
  /** Mesh edges with a triangle on one side only: above 0 the body is an open shell, not a solid. */
  openEdges: number;
}

/** Wraps render buffers into three.js geometry with a BVH (runs once per mirrored revision). */
export function buildViewerModel(mesh: RenderMesh, table: FaceTable): ViewerModel {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(mesh.positions.length), 3));
  geometry.setIndex(new BufferAttribute(mesh.index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Indirect keeps the index order, so triangle i still maps to triangleFaces[i] (ADR 0004).
  computeBoundsTree.call(geometry, { indirect: true });

  const edges = new BufferGeometry();
  edges.setAttribute('position', new BufferAttribute(mesh.edgeSegments, 3));

  const edgeOfSegment = new Uint32Array(mesh.edgeSegments.length / 6);
  for (let e = 0; e < mesh.edgeLengths.length; e += 1) {
    const first = mesh.edgeRanges[e * 2] ?? 0;
    edgeOfSegment.fill(e, first, first + (mesh.edgeRanges[e * 2 + 1] ?? 0));
  }

  return {
    table,
    triangleFaces: mesh.triangleFaces,
    geometry,
    vertexFaces: mesh.vertexFaces,
    edges,
    edgeSegments: mesh.edgeSegments,
    edgeOfSegment,
    edgeFaces: mesh.edgeFaces,
    edgeRanges: mesh.edgeRanges,
    edgeLengths: mesh.edgeLengths,
    vertices: mesh.vertices,
    openEdges: mesh.openEdges,
  };
}

/** Frees the GPU buffers and the BVH of a model that is no longer shown. */
export function disposeViewerModel(model: ViewerModel): void {
  model.geometry.dispose();
  model.edges.dispose();
}
