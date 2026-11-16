import { describe, expect, it } from 'vitest';

import { adapterName, isSoftware } from '../src/renderer/src/viewer/graphicsInfo';

describe('graphics info', () => {
  it('names the adapter without ANGLE and its API', () => {
    expect(adapterName('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA GeForce RTX 4070');
    expect(adapterName('ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel(R) UHD Graphics 770');
    expect(adapterName('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe('Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE))');
    expect(adapterName('Apple M2')).toBe('Apple M2');
  });

  it('tells software drawing apart', () => {
    expect(isSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftware('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(isSoftware('ANGLE (AMD, AMD Radeon RX 7800 XT (0x0000747E) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isSoftware(null)).toBe(false);
  });
});
