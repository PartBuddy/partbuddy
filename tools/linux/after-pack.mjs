import { chmod, copyFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

/** Set Linux's display backend before Electron initializes Ozone, for both AppImage and dir builds. */
export default async function afterPack({ electronPlatformName, appOutDir }) {
  if (electronPlatformName !== 'linux') return;
  const launcher = join(appOutDir, 'partbuddy');
  await rename(launcher, join(appOutDir, 'partbuddy-bin'));
  await copyFile(new URL('./launcher.sh', import.meta.url), launcher);
  await chmod(launcher, 0o755);
}
