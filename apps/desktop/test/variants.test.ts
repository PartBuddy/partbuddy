import { describe, expect, it, vi } from 'vitest';

import { engineSteps } from '../src/main/agents/engineSteps';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { Questions } from '../src/main/agents/questions';
import { OFFER_VARIANTS_TOOL, Variants, VARIANT_DONE_TOOL, type Measured } from '../src/main/agents/variants';
import type { AgentEvent, VariantsState } from '../src/shared/contract';
import { variantsAsked } from '../src/renderer/src/variants/variantRequest';

const body = { name: 'Body1', mesh: new Uint8Array([1]), faces: { model: 'Box', body: 'Body1', units: 'mm' as const, faces: [] } };

/** A design whose undo depth grows with every change; each depth has its own volume. */
function setup() {
  const design = { documentId: 'doc-1', revision: 10, undo: 1, redo: 0 };
  const volume = (undo: number) => 4000 - (undo - 1) * 10;
  const sent: { text: string; note: string; variant: { index: number; count: number } }[] = [];
  const states: VariantsState[] = [];
  const mentions: string[] = [];
  const quiet: boolean[] = [];
  const replayed: unknown[][] = [];
  const recorded: string[] = [];
  const change = (steps = 1) => {
    design.undo += steps;
    design.redo = 0;
    design.revision += 1;
  };
  const variants = new Variants({
    history: () => Promise.resolve({ ...design }),
    travel: (command, count) => {
      design.undo += command === 'edit.undo' ? -count : count;
      design.redo += command === 'edit.undo' ? count : -count;
      design.revision += 1;
      return Promise.resolve();
    },
    mirrored: () => Promise.resolve([body]),
    measure: (): Promise<Measured> => Promise.resolve({ volume: volume(design.undo), faces: 6 + design.undo - 1, bbox: { min: [0, 0, 0], max: [20, 20, 10] } }),
    replay: (steps) => {
      replayed.push(steps);
      change(steps.length);
      return Promise.resolve();
    },
    send: (text, note, variant) => {
      sent.push({ text, note, variant });
      return Promise.resolve();
    },
    quiet: (on) => quiet.push(on),
    recordUser: async (phrase, work) => {
      recorded.push(phrase.key);
      await work();
    },
    mention: (text) => mentions.push(text),
    emit: (state) => states.push(state),
    thumbnailTimeoutMs: 20,
  });
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name) => {
      if (name === 'execute') change();
      return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
    },
  };
  const tools = variants.tools(upstream, () => ({ content: [{ type: 'text', text: 'offered' }] }));
  const done: AgentEvent = { type: 'done', ok: true, durationMs: 1, detail: null };
  return { design, variants, tools, sent, states, mentions, quiet, replayed, recorded, done };
}

describe('variants (M2c, ADR 0021)', () => {
  it('builds variants one turn each, records them, resets the design and replays the one taken', async () => {
    const { design, variants, tools, sent, mentions, quiet, replayed, recorded, done } = setup();
    await variants.begin('Round the top edges', 2, '[PartBuddy: earlier note]');
    expect(sent[0]?.variant).toEqual({ index: 1, count: 2 });
    expect(sent[0]?.note).toContain('[PartBuddy: earlier note]');
    expect(sent[0]?.note).toContain('build variant 1 of 2');
    expect(quiet).toEqual([true]);

    // Variant 1: a fillet, then done.
    await tools.callTool('execute', { command: 'solid.fillet', params: { edges: [[10, 0, 10]], radius: 1 } });
    expect((await tools.callTool('partbuddy_ask', { question: 'Which?', options: [] })).isError).toBe(true);
    await tools.callTool(VARIANT_DONE_TOOL, { name: 'Soft', difference: 'R1 on the top edges' });
    expect((await tools.callTool('execute', { command: 'solid.chamfer', params: {} })).isError).toBe(true);
    variants.thumbnail(1, 'data:image/webp;base64,AAAA');
    variants.observe(done);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    // Back at the start before variant 2; variant 2 must differ from the first.
    expect(design.undo).toBe(1);
    expect(sent[1]?.note).toContain('differ clearly from the variants so far: 1. Soft: R1 on the top edges');

    // Variant 2 ends without variant_done: not kept, the design is reset anyway.
    await tools.callTool('execute', { command: 'solid.box', params: {} });
    variants.observe(done);
    await vi.waitFor(() => expect(variants.snapshot().state).toBe('ready'));
    expect(design.undo).toBe(1);
    expect(variants.snapshot().variants.map((variant) => variant.status)).toEqual(['kept', 'failed']);
    expect(quiet).toEqual([true, false]);
    expect(mentions.at(-1)).toContain('1 variant(s)');

    await variants.take(1);
    expect(replayed).toEqual([[{ command: 'solid.fillet', params: { edges: [[10, 0, 10]], radius: 1 } }]]);
    expect(recorded).toEqual(['variantTaken']);
    expect(variants.snapshot().state).toBe('idle');
  });

  it('refuses to take a variant when the design changed since', async () => {
    const { design, variants, tools, done } = setup();
    await variants.begin('Thicker', 2);
    await tools.callTool('execute', { command: 'solid.shell', params: {} });
    await tools.callTool(VARIANT_DONE_TOOL, { name: 'A', difference: 'a' });
    variants.observe(done);
    await vi.waitFor(() => expect(variants.snapshot().variants).toHaveLength(2));
    await tools.callTool('execute', { command: 'solid.shell', params: {} });
    await tools.callTool(VARIANT_DONE_TOOL, { name: 'B', difference: 'b' });
    variants.observe(done);
    await vi.waitFor(() => expect(variants.snapshot().state).toBe('ready'));
    design.undo += 1;
    await expect(variants.take(2)).rejects.toThrow(/changed since/);
  });

  it('stops after the turn the user stopped', async () => {
    const { variants, tools, sent } = setup();
    await variants.begin('Three ways', 3);
    await tools.callTool('execute', { command: 'solid.fillet', params: {} });
    await tools.callTool(VARIANT_DONE_TOOL, { name: 'A', difference: 'a' });
    variants.observe({ type: 'done', ok: false, durationMs: 1, detail: 'stopped' });
    await vi.waitFor(() => expect(variants.snapshot().state).toBe('ready'));
    expect(sent).toHaveLength(1);
  });

  it('turns tool calls into engine steps for replay', () => {
    expect(
      engineSteps([
        { name: 'execute', args: { command: 'solid.box', params: { length: 20 } } },
        { name: 'set_parameter', args: { name: 'W', value: 40 } },
        { name: 'batch', args: { commands: [{ command: 'measure', params: {} }, { command: 'undo' }, { command: 'sketch.create', params: { plane: 'XY' } }] } },
      ]),
    ).toEqual([
      { command: 'solid.box', params: { length: 20 } },
      { command: 'parameters.change', params: { name: 'W', expression: 40 } },
      { command: 'edit.undo', params: {} },
      { command: 'sketch.create', params: { plane: 'XY' } },
    ]);
  });

  it('reads "show me three" and "zeig mir drei" as a request for variants', () => {
    expect(variantsAsked('Show me three ways to mount it')).toBe(3);
    expect(variantsAsked('zeig mir zwei Halter')).toBe(2);
    expect(variantsAsked('Zeige mir 4 Varianten')).toBe(4);
    expect(variantsAsked('show me the hole')).toBeNull();
  });

  it('lets the assistant offer variants as a card that blocks changes until the user answers', async () => {
    const events: AgentEvent[] = [];
    const questions = new Questions((event) => events.push(event));
    const result = questions.offerVariants({ request: 'Three clip widths', count: 3 });
    expect(result.isError).not.toBe(true);
    expect(events[0]).toMatchObject({ type: 'question', question: { kind: 'variants', request: 'Three clip widths', count: 3 } });
    const id = (events[0] as Extract<AgentEvent, { type: 'question' }>).question.id;
    expect(questions.isOpen(id)).toBe(true);
    const gated = questions.tools({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [] }) });
    expect((await gated.callTool('execute', { command: 'solid.box', params: {} })).isError).toBe(true);
    expect(questions.answer({ question: id, choice: 'go' })).toContain('chose to see 3 variants');
    expect(OFFER_VARIANTS_TOOL).toBe('partbuddy_offer_variants');
  });
});
