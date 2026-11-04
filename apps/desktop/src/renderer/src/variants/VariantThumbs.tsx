import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';

const WIDTH = 224;
const HEIGHT = 140;
const QUALITY = 0.8;

/**
 * Takes the picture of a variant while the view shows it (M2c): PartBuddy mirrors the variant,
 * waits for this picture and only then resets the design, so the picture is exactly the variant.
 */
export function VariantThumbs() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let frame = 0;
    const taken = new Set<string>();
    const due = () => {
      const { model, variants } = useStudio.getState();
      if (model.status !== 'ready' || variants.documentId !== model.documentId) return null;
      return variants.variants.find((variant) => variant.status === 'capturing' && variant.revision === model.revision && !taken.has(`${String(variant.index)}:${String(variant.revision)}`)) ?? null;
    };
    const capture = () => {
      frame = 0;
      const variant = due();
      if (!variant) return;
      taken.add(`${String(variant.index)}:${String(variant.revision)}`);
      let image: string | null = null;
      try {
        gl.render(scene, camera);
        const source = gl.domElement;
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const context = canvas.getContext('2d');
        if (context && source.width > 0 && source.height > 0) {
          const scale = Math.min(source.width / WIDTH, source.height / HEIGHT);
          const width = WIDTH * scale;
          const height = HEIGHT * scale;
          context.drawImage(source, (source.width - width) / 2, (source.height - height) / 2, width, height, 0, 0, WIDTH, HEIGHT);
          image = canvas.toDataURL('image/webp', QUALITY);
        }
      } catch {
        image = null;
      }
      if (image) void platform().variants.thumbnail(variant.index, image).catch(() => undefined);
    };
    // Two frames: the new model is drawn in the frame after it arrives.
    const schedule = () => {
      if (frame !== 0 || !due()) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(capture);
      });
    };
    const off = useStudio.subscribe(schedule);
    schedule();
    return () => {
      off();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [gl, scene, camera]);
  return null;
}
