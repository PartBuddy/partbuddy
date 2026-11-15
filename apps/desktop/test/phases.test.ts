import { describe, expect, it } from 'vitest';

import type { ModelOption } from '../src/shared/contract';
import { CLAUDE_PHASES, listedPhases, phaseChoices } from '../src/main/agents/modelChoice';

const levels = ['low', 'medium', 'high'];
const claude: ModelOption[] = [
  { id: 'opus', name: 'Opus', efforts: levels },
  { id: 'sonnet', name: 'Sonnet', efforts: levels },
  { id: 'haiku', name: 'Haiku', efforts: levels },
];
const opus = { model: 'opus', effort: 'medium' };

describe('a model per step of the work (issue 446)', () => {
  it("plans with the route's choice, builds and reviews with PartBuddy's standard", () => {
    expect(phaseChoices(claude, opus, null, {}, CLAUDE_PHASES)).toEqual({ plan: opus, build: { model: 'sonnet', effort: 'medium' }, review: { model: 'haiku', effort: 'medium' } });
  });

  it("takes the user's model for a step, and one pinned in the chat for every step", () => {
    const stored = { build: { model: 'opus', effort: 'low' } };
    expect(phaseChoices(claude, opus, null, stored, CLAUDE_PHASES)?.build).toEqual({ model: 'opus', effort: 'low' });
    const pinned = { model: 'haiku', effort: 'high' };
    expect(phaseChoices(claude, opus, pinned, stored, CLAUDE_PHASES)).toEqual({ plan: pinned, build: pinned, review: pinned });
  });

  it("falls back to the plan's model where the plan does not offer a step's", () => {
    expect(phaseChoices([claude[0] as ModelOption], opus, null, {}, CLAUDE_PHASES)).toEqual({ plan: opus, build: opus, review: opus });
    expect(phaseChoices([], opus, null, {}, CLAUDE_PHASES)).toBeNull();
  });

  it('builds on a listed account at low effort and reviews with its small model', () => {
    const listed: ModelOption[] = [
      { id: 'gpt-6', name: 'GPT-6', efforts: levels },
      { id: 'gpt-6-mini', name: 'GPT-6 mini', efforts: ['low', 'medium'] },
    ];
    const plan = { model: 'gpt-6', effort: 'medium' };
    expect(listedPhases(listed, plan)).toEqual({ build: { model: 'gpt-6', effort: 'low' }, review: { model: 'gpt-6-mini', effort: 'low' } });
    expect(listedPhases([listed[0] as ModelOption], plan).review).toEqual({ model: 'gpt-6', effort: 'low' });
  });
});
