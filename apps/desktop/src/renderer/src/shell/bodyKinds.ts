import type { Structure } from '../../../shared/contract';

/**
 * What a body of the design is, from the timeline feature that made it last (B4): a mesh body from
 * an STL, 3MF or OBJ file (SolidCraft's `MeshFeature`), a part imported from STEP or IGES
 * (`BaseFeature`), or a part modelled in SolidCraft. A converted mesh is a modelled part again.
 */
export type BodyKind = 'mesh' | 'imported' | 'model';

export function bodyKindOf(body: Structure['bodies'][number], features: Structure['features']): BodyKind {
  if (body.feature === null) return 'model';
  const type = features.find((feature) => feature.id === body.feature)?.type;
  if (type === 'MeshFeature') return 'mesh';
  if (type === 'BaseFeature') return 'imported';
  return 'model';
}
