import { BackSide, Color, ShaderMaterial, Vector2 } from 'three';

/**
 * Silhouette edges (viewport CAD round, 2026-11-07): curved faces have no B-rep edge where they
 * turn away from the camera, so a cylinder lost its outline. The back faces of the body, pushed
 * outward along their normals by a fixed number of screen pixels, draw a dark rim exactly there,
 * in one draw call and at any zoom (the "inverted hull" of CAD and toon renderers). The front
 * faces hide the rest of it. Sections clip it like the body.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
uniform float width;
uniform vec2 resolution;
void main() {
  #include <begin_vertex>
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vec3 n = normalize(normalMatrix * normal);
  vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
  float len = length(dir);
  // Pixels to clip space; times w so the rim keeps its width under perspective.
  if (len > 1e-6) clip.xy += dir / len * width / resolution * 2.0 * clip.w;
  gl_Position = clip;
  #include <clipping_planes_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <clipping_planes_pars_fragment>
uniform vec3 color;
uniform float opacity;
void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4(color, opacity);
  #include <colorspace_fragment>
}
`;

/** The silhouette material: `width` in device pixels, `resolution` the drawing buffer size. */
export function silhouetteMaterial(color: Color, width: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      color: { value: color.clone() },
      opacity: { value: 1 },
      width: { value: width },
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    clipping: true,
  });
}
