import { readFileSync } from 'node:fs';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

/**
 * Strict content security policy for the renderer (architecture: security boundaries). The
 * development server needs inline scripts and a WebSocket for hot reload; builds do not.
 */
function contentSecurityPolicy(): Plugin {
  const strict = [
    "default-src 'none'",
    "script-src 'self'",
    "worker-src 'self'",
    // React Aria and drei set element styles; no style sheets are loaded from elsewhere.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    // No frame-ancestors: a <meta> CSP ignores it and logs an error at every start (audit X-03); the
    // page is a file in Electron's own window, never framed.
  ];
  return {
    name: 'partbuddy-csp',
    transformIndexHtml(_html, context) {
      const policy = context.server
        ? strict
            .map((rule) =>
              rule.startsWith('script-src')
                ? "script-src 'self' 'unsafe-inline'"
                : rule.startsWith('connect-src')
                  ? "connect-src 'self' ws://localhost:*"
                  : rule,
            )
            .join('; ')
        : strict.join('; ');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
    },
  };
}

/**
 * The main process bundles every dependency except the native credential store, so the installer
 * (B10) carries no second copy of the renderer's libraries in `node_modules`.
 */
const NATIVE = ['@napi-rs/keyring'];
const bundled = Object.keys((JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> }).dependencies).filter(
  (name) => !NATIVE.includes(name),
);

export default defineConfig({
  main: {
    // Workspace packages ship TypeScript sources and are bundled in, like every other dependency.
    build: { target: 'node24', sourcemap: true, externalizeDeps: { exclude: bundled } },
  },
  preload: {
    // A sandboxed preload can only require 'electron', so everything else is bundled in.
    build: { target: 'node24', sourcemap: true, externalizeDeps: false },
  },
  renderer: {
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    build: {
      target: 'chrome156',
      sourcemap: true,
      // three.js, drei and React Aria form one view chunk; panels are split once they exist.
      chunkSizeWarningLimit: 2048,
    },
    worker: { format: 'es' },
  },
});
