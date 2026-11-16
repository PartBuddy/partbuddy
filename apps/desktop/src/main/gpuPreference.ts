import { execFile } from 'node:child_process';

import type { GpuPreference } from '../shared/contract';

/**
 * Where Windows keeps the graphics preference per program, the same entry Settings › System ›
 * Display › Graphics writes: per user, no administrator needed. Chromium itself cannot pick the
 * adapter for WebGL on Windows, so this is the way that holds (issue #484).
 */
const KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';

/** The `reg.exe` arguments that set or (automatic) remove the preference for `program`. */
export function windowsGpuArgs(program: string, preference: GpuPreference): string[] {
  if (preference === 'auto') return ['delete', KEY, '/v', program, '/f'];
  return ['add', KEY, '/v', program, '/t', 'REG_SZ', '/d', `GpuPreference=${preference === 'high' ? 2 : 1};`, '/f'];
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

/** Chromium's switch on macOS, read at the start. */
export function macGpuSwitch(preference: GpuPreference): string | null {
  return preference === 'high' ? 'force_high_performance_gpu' : preference === 'low' ? 'force_low_power_gpu' : null;
}
