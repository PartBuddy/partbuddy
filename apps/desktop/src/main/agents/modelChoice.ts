import type { AgentKind, AgentStatus, ModelChoice, ModelOption } from '../../shared/contract';

/**
 * Model and effort of an assistant route (plan step B1, decided 2026-11-05): chosen at the chip in
 * the chat input, in effect from the next turn, and kept as the default for new chats when the user
 * asks for that. Only what the user's plan offers can be chosen.
 */

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
    ...(options && options.length > 0 ? { models: options.slice(0, 30) } : {}),
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
  return rest;
}
