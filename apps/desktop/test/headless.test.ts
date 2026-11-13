import { describe, expect, it } from 'vitest';

import { HeadlessEngine, type Revision } from '../src/main/solidcraft/headless';

/**
 * The engine's change checks against a stand-in for SolidCraft whose revision the test moves by
 * hand. Tool calls other than `batch` stay open until the test ends them, so a check can be put
 * between a call and its own check.
 */
function setup() {
  let revision = 1;
  const open: (() => void)[] = [];
  const logged: string[] = [];
  const client = {
    getInstructions: () => undefined,
    listTools: () => Promise.resolve({ tools: [] }),
    callTool: ({ name }: { name: string }) => {
      if (name === 'batch') {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: [{ document_id: 'doc', revision }] }) }] });
      }
      return new Promise((resolve) => {
        open.push(() => {
          resolve({ content: [{ type: 'text', text: '{}' }] });
        });
      });
    },
  };
  const engine = Reflect.construct(HeadlessEngine, [client, (message: string) => logged.push(message)]) as HeadlessEngine;
  const told: Revision[] = [];
  engine.onChange((next) => told.push(next));
  return {
    engine,
    told,
    logged,
    /** The design changes: SolidCraft counts the revision up. */
    move: () => {
      revision += 1;
    },
    /** Ends the oldest open tool call. */
    answer: () => {
      open.shift()?.();
    },
  };
}

describe('headless engine: telling a change', () => {
  it('tells a change of PartBuddy whose revision a trial recorded first', async () => {
    const { engine, told, logged, move } = setup();
    await engine.unchanged();
    // The change is built; a trial that ran beside it ends before the change's own check.
    move();
    await engine.unchanged();
    await engine.changed();
    expect(told).toEqual([{ documentId: 'doc', revision: 2 }]);
    expect(logged).toHaveLength(1);
  });

  it('tells a change of the assistant whose revision a trial recorded while the call ran', async () => {
    const { engine, told, move, answer } = setup();
    await engine.unchanged();
    const call = engine.tools.callTool('extrude', {});
    move();
    await engine.unchanged();
    answer();
    await call;
    expect(told).toEqual([{ documentId: 'doc', revision: 2 }]);
  });

  it('tells nothing after a trial alone, nor after the assistant reads when the trial is over', async () => {
    const { engine, told, move, answer } = setup();
    await engine.unchanged();
    move();
    await engine.unchanged();
    expect(told).toEqual([]);
    const read = engine.tools.callTool('inspect', {});
    answer();
    await read;
    expect(told).toEqual([]);
  });

  it('tells each of two changes that follow one another', async () => {
    const { engine, told, move, answer } = setup();
    await engine.unchanged();
    move();
    await engine.changed();
    const call = engine.tools.callTool('extrude', {});
    move();
    answer();
    await call;
    expect(told.map((next) => next.revision)).toEqual([2, 3]);
  });

  it('counts a call as over with its check, so a later trial is not taken for its change', async () => {
    const { engine, told, move, answer } = setup();
    await engine.unchanged();
    const first = engine.tools.callTool('inspect', {});
    answer();
    await first;
    // A trial after the call moves the revision; the next read must not mirror it.
    move();
    await engine.unchanged();
    const second = engine.tools.callTool('inspect', {});
    answer();
    await second;
    expect(told).toEqual([]);
  });
});

describe('headless engine: counting what may change the design (review of BC-04, S1)', () => {
  it('counts tool calls and batches beyond reading, not reads or trials', async () => {
    const { engine, answer } = setup();
    expect(engine.changes).toBe(0);
    await engine.requester.request('engine.batch', { commands: [{ command: 'document.revision', params: {} }, { command: 'model.faces', params: { body: 'A' } }, { command: 'file.export', params: {} }], rollback: false });
    await engine.requester.request('engine.batch', { commands: [{ command: 'body.print_face', params: { body: 'A' } }], rollback: true });
    await engine.requester.request('document.inspect');
    expect(engine.changes).toBe(0);
    await engine.requester.request('engine.batch', { commands: [{ command: 'document.revision', params: {} }, { command: 'body.print_face', params: { body: 'A' } }], rollback: false });
    expect(engine.changes).toBe(1);
    const call = engine.tools.callTool('execute', { command: 'body.rename' });
    expect(engine.changes).toBe(2);
    answer();
    await call;
  });
});
