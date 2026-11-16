import { describe, expect, it } from 'vitest';

import { macGpuSwitch, windowsGpuArgs } from '../src/main/gpuPreference';

const program = 'C:\\Program Files\\PartBuddy\\PartBuddy.exe';
const key = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';

describe('graphics preference', () => {
  it('writes the entry Windows writes for its graphics settings', () => {
    expect(windowsGpuArgs(program, 'high')).toEqual(['add', key, '/v', program, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f']);
    expect(windowsGpuArgs(program, 'low')).toEqual(['add', key, '/v', program, '/t', 'REG_SZ', '/d', 'GpuPreference=1;', '/f']);
  });

  it('leaves the choice to Windows again by removing it', () => {
    expect(windowsGpuArgs(program, 'auto')).toEqual(['delete', key, '/v', program, '/f']);
  });

  it('asks Chromium on macOS', () => {
    expect(macGpuSwitch('high')).toBe('force_high_performance_gpu');
    expect(macGpuSwitch('low')).toBe('force_low_power_gpu');
    expect(macGpuSwitch('auto')).toBeNull();
  });
});
