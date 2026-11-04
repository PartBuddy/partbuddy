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

  return { table, triangleFaces: mesh.triangleFaces, geometry, vertexFaces: mesh.vertexFaces, edges };
}

/** Frees the GPU buffers and the BVH of a model that is no longer shown. */
export function disposeViewerModel(model: ViewerModel): void {
  model.geometry.dispose();
  model.edges.dispose();
}
