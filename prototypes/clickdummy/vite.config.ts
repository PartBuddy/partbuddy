import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // The prototype ships three.js, drei and React Aria in one chunk; the product splits per panel.
  build: { target: 'es2024', sourcemap: true, chunkSizeWarningLimit: 2048 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
