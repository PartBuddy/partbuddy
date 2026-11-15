import { modelChoiceSchema, type AgentKind, type ModelChoice, type Phase, type PhaseChoices } from '../../shared/contract';
import type { SettingsStore } from '../settingsStore';
import type { ChoiceStore, PhaseStore } from './modelChoice';

/**
 * The assistant settings of the installation: whether Claude Code may run with an API key (off by
 * default, decided 2026-11-04), web research (B7) and the model and effort per route for new
 * chats (B1). Kept in the settings file; what does not fit reads as the default.
 */
export class AssistantSettings implements ChoiceStore, PhaseStore {
  constructor(private readonly store: SettingsStore) {}

  apiBilling(): boolean {
    return this.store.get('claudeApiBilling');
  }

  setApiBilling(allow: boolean): void {
    this.store.set('claudeApiBilling', allow);
  }

  /** Whether the assistant may search the web and read pages (B7); on unless the user turned it off. */
  webResearch(): boolean {
    return this.store.get('webResearch');
  }

  setWebResearch(allow: boolean): void {
    this.store.set('webResearch', allow);
  }

  get(route: AgentKind): ModelChoice | null {
    return this.store.get('models')[route] ?? null;
  }

  phases(route: AgentKind): PhaseChoices {
    return this.store.get('phaseModels')[route] ?? {};
  }

  setPhase(route: AgentKind, phase: Phase, choice: ModelChoice | null): void {
    const next: PhaseChoices = Object.fromEntries(Object.entries(this.phases(route)).filter(([step]) => step !== phase));
    if (choice) next[phase] = modelChoiceSchema.parse(choice);
    this.store.set('phaseModels', { ...this.store.get('phaseModels'), [route]: next });
  }

  set(route: AgentKind, choice: ModelChoice): void {
    this.store.set('models', { ...this.store.get('models'), [route]: modelChoiceSchema.parse(choice) });
  }
}
