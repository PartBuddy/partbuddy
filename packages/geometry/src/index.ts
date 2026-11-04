export { meshMetrics, overhangFindings, type MeshMetrics, type OverhangFinding } from './analysis';
export { deriveEdges, edgeName, type BrepEdge } from './edges';
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
export {
  ACCEPT_MARGIN,
  ACCEPT_SCORE,
  edgeAnchor,
  faceAnchor,
  lineageOf,
  pointAnchor,
  resolveAnchor,
  signatureOf,
  signatureScore,
  type AnchorStatus,
  type FaceSignature,
  type LocalPosition,
  type NoteAnchor,
  type ResolvedAnchor,
} from './noteAnchors';
