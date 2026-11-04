import { describe, expect, it } from 'vitest';

import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { addedToHistory, phrasesText, WorkLog, type DesignHistory } from '../src/main/agents/workLog';
import { agentEventSchema, type AgentEvent } from '../src/shared/contract';
import { describeToolCall, describeUserAction } from '../src/shared/stepPhrases';
import { reduce, type ConversationItem } from '../src/renderer/src/assistant/store';

/**
 * A design with SolidCraft's linear undo history: every change pushes one entry, a change after
 * Undo drops the redo entries, as SolidCraft 0.30.1 does.
 */
class FakeDesign {
  documentId = 'doc-1';
  revision = 1;
  undo = 0;
  redo = 0;

  change(features = 1): void {
    this.undo += features;
    this.redo = 0;
    this.revision += 1;
  }

  history(): Promise<DesignHistory> {
    return Promise.resolve({ documentId: this.documentId, revision: this.revision, undo: this.undo, redo: this.redo });
  }

  travel(command: 'edit.undo' | 'edit.redo', count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      if (command === 'edit.undo') {
        if (this.undo === 0) throw new Error('nothing to undo');
        this.undo -= 1;
        this.redo += 1;
      } else {
        if (this.redo === 0) throw new Error('nothing to redo');
        this.redo -= 1;
        this.undo += 1;
      }
      this.revision += 1;
    }
    return Promise.resolve();
  }
}

function setup() {
  const design = new FakeDesign();
  const events: AgentEvent[] = [];
  const log = new WorkLog({
    history: () => design.history(),
    travel: (command, count) => design.travel(command, count),
    emit: (event) => {
      // Every event must pass the bridge's contract.
      agentEventSchema.parse(event);
      events.push(event);
    },
  });
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, args): Promise<ToolResult> => {
      if (name === 'execute' || name === 'batch' || name === 'set_parameter') {
        const commands = name === 'batch' ? (args.commands as unknown[]).length : 1;
        if (!JSON.stringify(args).includes('inspect')) design.change(commands);
      }
      if (name === 'undo') void design.travel('edit.undo', 1);
      return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
    },
  };
  return { design, events, log, tools: log.tools(upstream) };
}

const steps = (events: AgentEvent[]) => events.filter((event): event is Extract<AgentEvent, { type: 'step' }> => event.type === 'step').map((event) => event.step);
const lastStates = (events: AgentEvent[]) => events.filter((event): event is Extract<AgentEvent, { type: 'steps' }> => event.type === 'steps').at(-1);

describe('work log', () => {
  it('records a step for each changing tool call, with its undo depth and tool call', async () => {
    const { events, tools } = setup();
    await tools.callTool('execute', { command: 'solid.box', params: { length: 20, width: 20, height: 10 } }, 'call-1');
    await tools.callTool('inspect_design', {}, 'call-2');
    await tools.callTool('batch', { commands: [{ command: 'sketch.create', params: { plane: 'XY' } }, { command: 'solid.extrude', params: { distance: 5 } }] }, 'call-3');
    const recorded = steps(events);
    expect(recorded.map((step) => [step.toolId, step.depth])).toEqual([
      ['call-1', 1],
      ['call-3', 3],
    ]);
    expect(phrasesText(recorded[0]?.phrases ?? [])).toBe('Box 20 × 20 × 10 mm');
    expect(lastStates(events)).toMatchObject({ current: recorded[1]?.id, states: [{ state: 'applied' }, { state: 'applied' }] });
  });

  it('does not record calls that only read, even when they run commands', async () => {
    const { events, tools } = setup();
    await tools.callTool('execute', { command: 'document.inspect', params: {} }, 'c1');
    expect(steps(events)).toEqual([]);
  });

  it('goes back to a step and forward again, and tells the model once', async () => {
    const { design, events, tools, log } = setup();
    await tools.callTool('execute', { command: 'solid.box', params: { length: 1, width: 1, height: 1 } }, 'c1');
    await tools.callTool('execute', { command: 'solid.fillet', params: { edges: [[0, 0, 0], [1, 0, 0]], radius: 2 } }, 'c2');
    await tools.callTool('execute', { command: 'solid.hole', params: { position: [0, 0, 1], diameter: 3 } }, 'c3');
    const [first, , third] = steps(events);
    if (!first || !third) throw new Error('steps missing');

    await log.goTo(first.id);
    expect(design.undo).toBe(1);
    expect(lastStates(events)).toMatchObject({ current: first.id, states: [{ state: 'applied' }, { state: 'undone' }, { state: 'undone' }] });
    const note = log.takeNote();
    expect(note).toContain('back to the state after the step "Box 1 × 1 × 1 mm"');
    expect(note).toContain('the 2 later steps are undone');
    expect(log.takeNote()).toBeNull();

    await log.goTo(third.id);
    expect(design.undo).toBe(3);
    expect(lastStates(events)?.current).toBe(third.id);
  });

  it('marks undone steps as replaced once a new change follows', async () => {
    const { design, events, tools, log } = setup();
    await tools.callTool('execute', { command: 'solid.box', params: {} }, 'c1');
    await tools.callTool('execute', { command: 'solid.chamfer', params: { edges: [[0, 0, 0]], distance: 1 } }, 'c2');
    const [first, second] = steps(events);
    if (!first || !second) throw new Error('steps missing');
    await log.goTo(first.id);
    // The user's own fillet: one more history entry after Undo.
    await log.recordUser(describeUserAction({ kind: 'action', action: 'fillet', size: 2, count: 4 }), () => {
      design.change();
      return Promise.resolve();
    });
    const states = lastStates(events)?.states ?? [];
    expect(states.find((entry) => entry.id === second.id)?.state).toBe('discarded');
    await expect(log.goTo(second.id)).rejects.toThrow(/replaced/);
    expect(log.takeNote()).toContain('the user changed the design: Fillet 2 mm on 4 edges');
  });

  it('follows undo from elsewhere and forgets steps of another design', async () => {
    const { design, events, tools, log } = setup();
    await tools.callTool('execute', { command: 'solid.box', params: {} }, 'c1');
    await design.travel('edit.undo', 1);
    log.observe(await design.history());
    expect(lastStates(events)).toMatchObject({ current: null, states: [{ state: 'undone' }] });
    // A mirrored revision older than what PartBuddy read itself does not move the cards back.
    log.observe({ documentId: 'doc-1', revision: 1, undo: 0, redo: 0 });
    expect(lastStates(events)?.states[0]?.state).toBe('undone');
    log.observe({ documentId: 'doc-2', revision: 1, undo: 0, redo: 0 });
    expect(lastStates(events)?.states[0]?.state).toBe('discarded');
  });
});

describe('history growth', () => {
  const at = (revision: number, undo: number, redo: number): DesignHistory => ({ documentId: 'd', revision, undo, redo });
  it('counts new entries and changes that replaced the redo history', () => {
    expect(addedToHistory(at(1, 2, 0), at(2, 3, 0))).toBe(true);
    expect(addedToHistory(at(1, 2, 1), at(2, 2, 0))).toBe(true);
    expect(addedToHistory(at(1, 2, 0), at(2, 2, 0))).toBe(false);
    expect(addedToHistory(at(1, 2, 0), at(1, 3, 0))).toBe(false);
  });
});

describe('step phrases', () => {
  it('describes a sketch with its shapes and the extrusion', () => {
    const phrases = describeToolCall('batch', {
      commands: [
        { command: 'sketch.create', params: { plane: 'XY' } },
        { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 20] } },
        { command: 'sketch.circle.center', params: { center: [10, 10], radius: 2.5 } },
        { command: 'sketch.line', params: { points: [[0, 0], [1, 1]] } },
        { command: 'sketch.dimension', params: {} },
        { command: 'sketch.finish', params: {} },
        { command: 'solid.extrude', params: { distance: '12 mm' } },
        { command: 'model.faces', params: { body: 'Body1' } },
      ],
    });
    expect(phrasesText(phrases)).toBe('Sketch on XY; Rectangle 40 × 20 mm; Circle ⌀ 5 mm; 1 sketch curve; 1 sketch dimension; Extruded by 12 mm');
  });

  it('falls back to the command or tool name', () => {
    expect(phrasesText(describeToolCall('execute', { command: 'solid.split_body', params: {} }))).toBe('SolidCraft: solid.split_body');
    expect(phrasesText(describeToolCall('undo', {}))).toBe('SolidCraft: undo');
    expect(phrasesText(describeToolCall('set_parameter', { name: 'wall', value: 2 }))).toBe('Parameter wall = 2');
  });
});

describe('step cards in the conversation', () => {
  it('puts the card where its tool call was and moves the call into it', () => {
    let items: ConversationItem[] = [];
    const step = { id: 'step-1', source: 'assistant' as const, phrases: [{ key: 'mirror' as const, values: {} }], toolId: 'c1', documentId: 'd', revision: 2, depth: 1 };
    const events: AgentEvent[] = [
      { type: 'user', text: 'Mirror it' },
      { type: 'tool', id: 'c1', name: 'execute', summary: '{}', decision: 'allowed' },
      { type: 'step', step },
      { type: 'tool', id: 'c1', name: 'execute', summary: '{}', decision: 'allowed', ok: true },
      { type: 'steps', states: [{ id: 'step-1', state: 'undone' }], current: null },
    ];
    for (const event of events) items = reduce(items, event);
    expect(items.map((item) => item.kind)).toEqual(['user', 'step', 'tool']);
    expect(items[1]).toMatchObject({ state: 'undone', current: false });
    expect(items[2]).toMatchObject({ step: 'step-1', ok: true });
  });
});
