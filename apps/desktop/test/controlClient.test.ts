import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ControlClient, ControlError } from '../src/main/solidcraft/controlClient';
import { FakeSolidCraft } from './fakeSolidCraft';

let dir: string;
let fake: FakeSolidCraft;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'partbuddy-client-'));
  fake = new FakeSolidCraft({ controlDir: dir });
  await fake.start();
});

afterEach(async () => {
  await fake.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('control channel client', () => {
  it('authenticates with the first request and reads replies by id', async () => {
    const client = await ControlClient.open({ port: fake.port, token: fake.token });
    await expect(client.request('document.revision')).resolves.toEqual({ document_id: fake.documentId, revision: 1 });
    await expect(client.request('document.revision')).resolves.toMatchObject({ revision: 1 });
    client.close();
  });

  it('reports a wrong token as unauthorized', async () => {
    const client = await ControlClient.open({ port: fake.port, token: 'cd'.repeat(32) });
    const error = await client.request('document.revision').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ControlError);
    expect((error as ControlError).kind).toBe('unauthorized');
  });

  it('passes design.changed events and refuses a second subscription', async () => {
    const client = await ControlClient.open({ port: fake.port, token: fake.token });
    await client.request('control.subscribe');
    const seen = new Promise((resolve) => client.onEvent(resolve));
    fake.change();
    await expect(seen).resolves.toEqual({
      event: 'design.changed',
      params: { document_id: fake.documentId, revision: 2 },
    });
    await expect(client.request('control.subscribe')).rejects.toThrow(/already subscribed/);
    client.close();
  });

  it('fails pending requests and notifies when the app goes away', async () => {
    const client = await ControlClient.open({ port: fake.port, token: fake.token });
    await client.request('document.revision');
    const closed = new Promise((resolve) => client.onClose(resolve));
    await fake.stop();
    await expect(closed).resolves.toBeTypeOf('string');
    await expect(client.request('document.revision')).rejects.toThrow(/closed/);
  });

  it('cannot connect where nothing listens', async () => {
    const port = fake.port;
    await fake.stop();
    await expect(ControlClient.open({ port, token: fake.token })).rejects.toThrow();
  });
});
