/** What the 3D view draws with (issue #484): the backend and the graphics adapter Chromium uses. */
export interface GraphicsInfo {
  backend: 'webgl2' | 'none';
  /** The adapter as the driver names it (through ANGLE on Windows), or null where it is hidden. */
  adapter: string | null;
  /** Drawn by the CPU: SwiftShader when the GPU is blocked or turned off, or another software rasteriser. */
  software: boolean;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/i;

export function isSoftware(adapter: string | null): boolean {
  return adapter !== null && SOFTWARE.test(adapter);
}

/** "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)" reads as "NVIDIA GeForce RTX 4070". */
export function adapterName(adapter: string): string {
  const angle = /^ANGLE \((?:[^,]*), ([^,]+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D.*| OpenGL.*| Metal.*)?(?:,.*)?\)$/i.exec(adapter);
  return (angle?.[1] ?? adapter).trim();
}
