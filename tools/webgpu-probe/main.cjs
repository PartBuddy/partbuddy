// WebGPU probe for issue #484: draws one heavy scene like PartBuddy's view (a part of about a million
// triangles with standard material, room light, its edges and a contact shadow) with three's
// WebGLRenderer and with its WebGPURenderer, in PartBuddy's Electron on the real graphics card, and
// writes the GPU time per frame of both to probe.json beside this file. The window stays hidden.
//
//   cd apps/desktop && npx electron ../../tools/webgpu-probe [--force_high_performance_gpu]
const { app, BrowserWindow } = require('electron');
const { appendFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');

// three exports no package.json; its CommonJS build lies in build/.
const three = dirname(dirname(require.resolve('three', { paths: [join(__dirname, '..', '..', 'apps', 'desktop')] })));
// Electron on Windows does not hand its console to a pipe, so the run logs into a file.
const logFile = join(__dirname, 'probe.log');
writeFileSync(logFile, '');
const log = (line) => appendFileSync(logFile, `${line}\n`);

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 900, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } });
  window.webContents.on('console-message', (event) => log(`page: ${event.message}`));
  window.webContents.on('render-process-gone', (_event, details) => log(`renderer gone: ${details.reason}`));
  try {
    await window.loadFile(join(__dirname, 'index.html'), { query: { three: pathToFileURL(three).href } });
    log('page loaded');
    const result = await window.webContents.executeJavaScript('window.probe()');
    writeFileSync(join(__dirname, 'probe.json'), JSON.stringify({ gpu: app.getGPUFeatureStatus(), ...result }, null, 2));
    log('done');
  } catch (error) {
    log(`failed: ${String(error)}`);
  }
  app.quit();
});
