export { meshMetrics, overhangFindings, type MeshMetrics, type OverhangFinding } from './analysis';
export { deriveEdges, type BrepEdge } from './edges';
export { diffFaces, isUnchanged, type FaceDiff } from './faceDiff';
export {
  faceTableFromModelFaces,
  featureOf,
  sameCylinder,
  surfaceKind,
  type FaceInfo,
  type FaceTable,
  type SurfaceKind,
} from './faceTable';
export { buildRenderMesh, renderMeshTransferables, type RenderMesh } from './renderMesh';
export { FACE_TAG_NAMESPACE, parseTagged3mf, type TaggedMesh } from './tagged3mf';
export { buildViewerModel, disposeViewerModel, type ViewerModel } from './viewerModel';
export {
  curvePolyline,
  SKETCH_STYLE,
  sketchFromInspect,
  tessellateSketch,
  type SketchCurve,
  type SketchLines,
  type SketchModel,
  type SketchPlane,
} from './sketch';
