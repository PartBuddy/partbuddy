import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { agentKindSchema, modelChoiceSchema, type AgentKind, type ModelChoice } from '../../shared/contract';
import type { ChoiceStore } from './modelChoice';

interface Stored {
  claudeApiBilling?: boolean;
  models?: Partial<Record<AgentKind, ModelChoice>>;
}

/**
 * The assistant settings of the installation, in one small file: whether Claude Code may run with
 * an API key (off by default, decided 2026-11-04) and the model and effort per route for new chats
 * (B1). The file is read back as untrusted input; what does not fit is ignored.
 */
export class AssistantSettings implements ChoiceStore {
  constructor(private readonly file: string) {}

  apiBilling(): boolean {
    return this.read().claudeApiBilling === true;
  }

  setApiBilling(allow: boolean): void {
    this.write({ ...this.read(), claudeApiBilling: allow });
  }

  get(route: AgentKind): ModelChoice | null {
    return this.read().models?.[route] ?? null;
  }

  set(route: AgentKind, choice: ModelChoice): void {
    const stored = this.read();
    this.write({ ...stored, models: { ...stored.models, [route]: modelChoiceSchema.parse(choice) } });
  }

  private read(): Stored {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
    if (typeof raw !== 'object' || raw === null) return {};
    const { claudeApiBilling, models } = raw as { claudeApiBilling?: unknown; models?: unknown };
    const stored: Stored = {};
    if (claudeApiBilling === true) stored.claudeApiBilling = true;
    if (typeof models === 'object' && models !== null) {
      for (const [route, choice] of Object.entries(models)) {
        const kind = agentKindSchema.safeParse(route);
        const parsed = modelChoiceSchema.safeParse(choice);
        if (kind.success && parsed.success) (stored.models ??= {})[kind.data] = parsed.data;
      }
    }
    return stored;
  }

  private write(stored: Stored): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(stored));
  }
}
