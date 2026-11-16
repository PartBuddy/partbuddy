# WebGPU probe

Measures whether three's `WebGPURenderer` would draw PartBuddy's 3D view faster than the
`WebGLRenderer` it uses (issue #484). One heavy scene, built like the view: a part of about a
million triangles in standard material, room light, three lights, its edges and a contact
shadow. Both renderers draw 120 frames of an orbit in PartBuddy's Electron, on the real graphics
card, in a hidden window. Each frame waits until the GPU is done.

```bash
cd apps/desktop
npx electron ../../tools/webgpu-probe/main.cjs
```

The result is written to `probe.json` and the run log to `probe.log`, both beside this file.
To measure the other card of a two-card computer, set Windows' graphics preference for
`electron.exe` (the entry PartBuddy writes for itself, see `src/main/gpuPreference.ts`), then
remove it again.

## Result, 2026-11-16

Electron 45.2.3, three 0.187.0, 1440 × 900 at a pixel ratio of 1.5, 1,056,000 triangles,
Windows Server 2025. Median time per frame (95th percentile):

| Graphics card | WebGL | WebGPU |
| --- | --- | --- |
| NVIDIA Quadro RTX 4000 | 1.3 ms (1.4) | 4.0 ms (5.1) |
| Intel UHD Graphics 770 | 9.8 ms (11.0) | 13.3 ms (14.5) |

WebGPU was slower on both cards, so it was not taken (product owner, 2026-11-16). The
silhouette, the grid and the edge lines of the view are WebGL shaders and would also have to be
written again in TSL. The probe can be run again when three or Chromium change.
