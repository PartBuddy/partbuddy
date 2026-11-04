import type { FaceTable, RenderMesh } from '@partbuddy/geometry';

export interface ParseRequest {
  id: number;
  bodies: { name: string; mesh: Uint8Array; faces: FaceTable }[];
}

export type ParseResponse =
  | { id: number; ok: true; bodies: { name: string; render: RenderMesh; faces: FaceTable }[] }
  | { id: number; ok: false; message: string };
