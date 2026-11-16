import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, net: {}, shell: {} }));
vi.mock('electron-updater', () => ({ autoUpdater: { on: vi.fn() } }));

const { newerRelease } = await import('../src/main/updates');

const page = 'https://github.com/PartBuddy/partbuddy/releases/tag/v0.3.3';

describe('the macOS look for a new version (2026-11-16)', () => {
  it('tells of a newer release with its page', () => {
    expect(newerRelease({ tag_name: 'v0.3.3', html_url: page }, '0.3.2')).toEqual({ version: '0.3.3', page });
  });

  it('stays quiet for the same or an older release', () => {
    expect(newerRelease({ tag_name: 'v0.3.3', html_url: page }, '0.3.3')).toBeNull();
    expect(newerRelease({ tag_name: 'v0.3.1', html_url: page }, '0.3.3')).toBeNull();
  });

  it('ignores an answer it cannot trust or read', () => {
    expect(newerRelease({ tag_name: 'v9.0.0', html_url: 'https://evil.example/download' }, '0.3.3')).toBeNull();
    expect(newerRelease({ tag_name: 'latest', html_url: page }, '0.3.3')).toBeNull();
    expect(newerRelease({ message: 'API rate limit exceeded' }, '0.3.3')).toBeNull();
    expect(newerRelease(null, '0.3.3')).toBeNull();
  });
});
