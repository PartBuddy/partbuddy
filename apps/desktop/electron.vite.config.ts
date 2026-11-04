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
    "frame-ancestors 'none'",
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

export default defineConfig({
  main: {
    // Workspace packages ship TypeScript sources and are bundled in.
    build: { target: 'node24', sourcemap: true, externalizeDeps: { exclude: ['@partbuddy/geometry'] } },
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
