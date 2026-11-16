import { execFile } from 'node:child_process';

import type { GpuPreference } from '../shared/contract';

/**
 * Where Windows keeps the graphics preference per program, the same entry Settings › System ›
 * Display › Graphics writes: per user, no administrator needed. Chromium itself cannot pick the
 * adapter for WebGL on Windows, so this is the way that holds (issue #484).
 */
const KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
/** What Windows writes as the preference when one particular card is chosen. */
const SPECIFIC = 1073741824;
/** Microsoft's Basic Render Driver: drawing on the processor, which "Draw without the graphics card" covers. */
const MICROSOFT = 0x1414;

/** The `reg.exe` arguments that set or (automatic) remove the preference for `program`. */
export function windowsGpuArgs(program: string, preference: GpuPreference): string[] {
  if (preference === 'auto') return ['delete', KEY, '/v', program, '/f'];
  const value =
    preference === 'high' ? 'GpuPreference=2;' : preference === 'low' ? 'GpuPreference=1;' : `SpecificAdapter=${preference};GpuPreference=${SPECIFIC};`;
  return ['add', KEY, '/v', program, '/t', 'REG_SZ', '/d', value, '/f'];
}

/** Sets Windows' preference for `program`; a removal of an entry that is not there counts as done. */
export function applyWindowsGpuPreference(program: string, preference: GpuPreference, log: (line: string) => void): Promise<void> {
  return new Promise((resolve) => {
    execFile('reg.exe', windowsGpuArgs(program, preference), { windowsHide: true }, (error, _stdout, stderr) => {
      if (error && preference !== 'auto') log(`warning: the graphics preference could not be set (${stderr.trim() || error.message})`);
      else log(`graphics preference for PartBuddy is now ${preference}`);
      resolve();
    });
  });
}

/** Chromium's switch on macOS, read at the start; a particular card is Windows only. */
export function macGpuSwitch(preference: GpuPreference): string | null {
  return preference === 'high' ? 'force_high_performance_gpu' : preference === 'low' ? 'force_low_power_gpu' : null;
}

/** A graphics card as Electron's `getGPUInfo('complete')` lists it in `gpuDevice`. */
export interface GpuDevice {
  vendorId?: number;
  deviceId?: number;
  subSysId?: number;
  deviceString?: string;
}

const hex = (value: number, digits: number) => (value >>> 0).toString(16).toUpperCase().padStart(digits, '0');

/**
 * The cards to choose from, by the id Windows writes for them. Chromium lists a card once per role, so
 * the same id comes up more than once; two identical cards share it too, and Windows cannot tell them apart.
 */
export function gpuAdapters(devices: readonly GpuDevice[]): { id: string; name: string }[] {
  const cards = new Map<string, string>();
  for (const { vendorId = 0, deviceId = 0, subSysId = 0, deviceString } of devices) {
    if (!vendorId || vendorId === MICROSOFT) continue;
    const id = `${hex(vendorId, 4)}&${hex(deviceId, 4)}&${hex(subSysId, 8)}`;
    if (!cards.has(id)) cards.set(id, deviceString?.trim() || id);
  }
  return [...cards].map(([id, name]) => ({ id, name }));
}
