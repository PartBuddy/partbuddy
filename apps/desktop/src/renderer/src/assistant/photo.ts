import type { SketchPicture } from './SketchPad';

/** The long edge a photo is scaled to: what the models look at anyway, and it keeps the PNG small. */
export const PHOTO_EDGE = 1568;
/** The bridge takes pictures up to 4 MB (contract.ts). */
const MAX_BYTES = 4 * 1024 * 1024;

/** The longest edge a photo of `width` × `height` keeps, never larger than the original. */
function scaledSize(width: number, height: number, edge = PHOTO_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A photo (PNG or JPEG) as the PNG the assistant gets (F6), upright as the camera took it, and a
 * small picture for the composer. A photo that is still over 4 MB is scaled down further.
 */
export async function photoPicture(file: Blob): Promise<SketchPicture> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let edge = PHOTO_EDGE;
    for (;;) {
      const size = scaledSize(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2D canvas');
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((done) => {
        canvas.toBlob(done, 'image/png');
      });
      if (!blob) throw new Error('the photo could not be read');
      if (blob.size > MAX_BYTES && edge > 400) {
        edge = Math.round(edge * 0.75);
        continue;
      }
      const thumb = scaledSize(size.width, size.height, 160);
      const small = document.createElement('canvas');
      small.width = thumb.width;
      small.height = thumb.height;
      small.getContext('2d')?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      return { png: new Uint8Array(await blob.arrayBuffer()), thumbnail: small.toDataURL('image/png') };
    }
  } finally {
    bitmap.close();
  }
}
