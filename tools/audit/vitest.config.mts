// Plain object, no import: this folder is no workspace package and resolves no bare module.
// Run through the desktop app's vitest (tools/audit/README.md).
export default {
  root: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  test: {
    include: ['tools/audit/cases/**/*.case.ts'],
    environment: 'node',
    globals: true,
    // One SolidCraft at a time; a build may take minutes.
    fileParallelism: false,
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
};
