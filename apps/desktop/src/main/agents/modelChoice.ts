import type { AgentKind, AgentStatus, ModelChoice, ModelOption, Phase, PhaseChoices } from '../../shared/contract';

/**
 * Model and effort of an assistant route (plan step B1, decided 2026-11-05): chosen at the chip in
 * the chat input, in effect from the next turn, and kept as the default for new chats when the user
 * asks for that. Only what the user's plan offers can be chosen.
 */

/**
 * What Claude Code runs with until the user chooses: Opus at medium effort (Manuel, 2026-11-12), not
 * Claude Code's own default, which is the plan's frontier model. Provisional until the models are
 * compared on PartBuddy's own tasks (audit of 2026-11-12, phase 7).
 */
export const CLAUDE_STANDARD: ModelChoice = { model: 'opus', effort: 'medium' };

/** Where the defaults for new chats are kept (the assistant settings file of the installation). */
export interface ChoiceStore {
  get(route: AgentKind): ModelChoice | null;
  set(route: AgentKind, choice: ModelChoice): void;
}

/**
 * The effort a model runs with when none is chosen: its own default when the plan names it, else
 * "medium", else its first level. Always a named level, so the menu shows what really runs
 * (Manuel, 2026-11-06: a "Default" button did not say which level that is).
 */
export function fallbackEffort(option: ModelOption): string | null {
  if (option.defaultEffort && option.efforts.includes(option.defaultEffort)) return option.defaultEffort;
  return option.efforts.includes('medium') ? 'medium' : (option.efforts[0] ?? null);
}

/**
 * The choice as the plan allows it: null when the model is not offered; an effort the model does
 * not take, or none, becomes its fallback level. Claude Code accepts unknown effort names silently
 * (checked with 2.1.302), so PartBuddy checks them itself.
 */
export function allowedChoice(options: readonly ModelOption[], choice: ModelChoice | null): ModelChoice | null {
  if (!choice) return null;
  const option = options.find((item) => item.id === choice.model);
  if (!option) return null;
  return { model: option.id, effort: choice.effort !== null && option.efforts.includes(choice.effort) ? choice.effort : fallbackEffort(option) };
}

/** The fields of a route's status that show the choice. */
export function choiceStatus(options: readonly ModelOption[] | null, current: ModelChoice | null, stored: ModelChoice | null) {
  return {
    ...(options && options.length > 0 ? { models: options.slice(0, 200) } : {}),
    ...(current ? { model: current.model } : {}),
    ...(current?.effort ? { effort: current.effort } : {}),
    ...(stored ? { defaultChoice: stored } : {}),
  };
}

/** A status without the choice fields, before they are set again from the current choice. */
export function withoutChoice(status: AgentStatus): AgentStatus {
  const rest: AgentStatus = { ...status };
  delete rest.models;
  delete rest.model;
  delete rest.effort;
  delete rest.defaultChoice;
  delete rest.phase;
  delete rest.phases;
  delete rest.pinned;
  delete rest.phaseDefaults;
  return rest;
}

/** The models per step a route runs with for new chats (issue #446), kept in the settings. */
export interface PhaseStore {
  phases(route: AgentKind): PhaseChoices;
  setPhase(route: AgentKind, phase: Phase, choice: ModelChoice | null): void;
}

/**
 * PartBuddy's standard per step for Claude Code: plan and build with the route's own choice (CLAUDE_STANDARD, or the one
 * the user kept for new chats), review with the small model. Manuel, 2026-11-15, after one run each: building with
 * Sonnet (−38 % tokens) or Opus at low effort (−18 %) came out visibly plainer, so the user picks a lighter build model.
 */
export const CLAUDE_PHASES: PhaseChoices = { review: { model: 'haiku', effort: null } };

/** A model the account lists as its small one: GPT's mini and nano, Codex's spark and luna, Claude's haiku. */
const SMALL = /mini|nano|spark|luna|haiku/i;

/**
 * The standard per step where the route names no models of its own (ChatGPT, whose list changes with the account):
 * build as planned (as on Claude Code), review with the account's small model, or the plan's at its lowest effort.
 */
export function listedPhases(options: readonly ModelOption[], plan: ModelChoice | null): PhaseChoices {
  if (!plan) return {};
  const option = options.find((item) => item.id === plan.model);
  const low = option?.efforts.includes('low') ? 'low' : (option?.efforts[0] ?? plan.effort);
  const small = options.find((item) => SMALL.test(item.id) || SMALL.test(item.name));
  return {
    review: small ? { model: small.id, effort: small.efforts.includes('low') ? 'low' : fallbackEffort(small) } : { model: plan.model, effort: low },
  };
}

/**
 * The model each step runs with: the one pinned for this chat for every step, else the user's choice for the step,
 * else PartBuddy's standard for it, else the plan's model. Only what the account offers is taken.
 */
export function phaseChoices(options: readonly ModelOption[], plan: ModelChoice | null, pinned: ModelChoice | null, stored: PhaseChoices, standard: PhaseChoices): Required<PhaseChoices> | null {
  const base = allowedChoice(options, pinned) ?? allowedChoice(options, stored.plan ?? null) ?? allowedChoice(options, plan);
  if (!base) return null;
  if (pinned && allowedChoice(options, pinned)) return { plan: base, build: base, review: base };
  const step = (phase: 'build' | 'review') => allowedChoice(options, stored[phase] ?? null) ?? allowedChoice(options, standard[phase] ?? null) ?? base;
  return { plan: base, build: step('build'), review: step('review') };
}

/** The status fields of the steps: the step of the turn, each step's model, the pin and the user's models per step. */
export function phaseStatus(steps: Required<PhaseChoices> | null, phase: Phase, pinned: boolean, stored: PhaseChoices) {
  return {
    phase,
    ...(steps ? { phases: steps } : {}),
    ...(pinned ? { pinned: true } : {}),
    ...(Object.keys(stored).length > 0 ? { phaseDefaults: stored } : {}),
  };
}
