import { describe, expect, it } from 'vitest';

import { gpuAdapters, macGpuSwitch, windowsGpuArgs } from '../src/main/gpuPreference';

const program = 'C:\\Program Files\\PartBuddy\\PartBuddy.exe';
const key = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';

describe('graphics preference', () => {
  it('writes the entry Windows writes for its graphics settings', () => {
    expect(windowsGpuArgs(program, 'high')).toEqual(['add', key, '/v', program, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f']);
    expect(windowsGpuArgs(program, 'low')).toEqual(['add', key, '/v', program, '/t', 'REG_SZ', '/d', 'GpuPreference=1;', '/f']);
  });

  it('names one particular card the way Windows does', () => {
    expect(windowsGpuArgs(program, '8086&A780&7D991462')).toEqual(['add', key, '/v', program, '/t', 'REG_SZ', '/d', 'SpecificAdapter=8086&A780&7D991462;GpuPreference=1073741824;', '/f']);
    expect(macGpuSwitch('8086&A780&7D991462')).toBeNull();
  });

  it('lists each card once, without the processor driver', () => {
    // As Electron 45 reported them on the server (2026-11-16): the active card again in its role, and Microsoft's driver.
    const quadro = { vendorId: 4318, deviceId: 7857, subSysId: 312479784, deviceString: 'NVIDIA Quadro RTX 4000' };
    const devices = [quadro, { vendorId: 32902, deviceId: 42880, subSysId: 2107184226, deviceString: 'Intel(R) UHD Graphics 770' }, quadro, { vendorId: 5140, deviceId: 140, subSysId: 0, deviceString: 'Microsoft Basic Render Driver' }];
    expect(gpuAdapters(devices)).toEqual([
      { id: '10DE&1EB1&12A01028', name: 'NVIDIA Quadro RTX 4000' },
      { id: '8086&A780&7D991462', name: 'Intel(R) UHD Graphics 770' },
    ]);
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
