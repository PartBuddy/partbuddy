import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The installer and the update check take their version from the app's package.json; release-please
// keeps the release's in its manifest. A release PR that leaves one behind would ship a wrong version
// (0.2.0 nearly went out as 0.1.0), so its CI fails here instead.
describe('release version', () => {
  it("is the app's version too", () => {
    const root = join(__dirname, '..', '..', '..');
    const manifest = JSON.parse(readFileSync(join(root, '.release-please-manifest.json'), 'utf8')) as Record<string, string>;
    const app = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
    expect(app.version).toBe(manifest['.']);
  });
});
