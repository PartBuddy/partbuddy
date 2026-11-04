import {
  buildRenderMesh,
  buildViewerModel as buildGeometry,
  type FaceTable,
  type TaggedMesh,
  type ViewerModel as GeometryModel,
} from '@partbuddy/geometry';

/** The prototype keeps the parsed mesh next to the render geometry for its check previews. */
export interface ViewerModel extends GeometryModel {
  mesh: TaggedMesh;
}

/** Builds render geometry from the tagged mesh (runs once per mirrored revision). */
export function buildViewerModel(mesh: TaggedMesh, table: FaceTable): ViewerModel {
  return { ...buildGeometry(buildRenderMesh(mesh, table), table), mesh };
}
