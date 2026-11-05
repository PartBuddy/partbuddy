import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { storedChatSchema, type StoredChat, type StoredChatItem } from '../../shared/contract';
import { phrasesText } from '../agents/workLog';

/** The chat file of a design: `Grundplatte.sc` → `Grundplatte.chat.json`, next to it. */
export function chatFileOf(design: string): string {
  return `${design.replace(/\.sc$/i, '')}.chat.json`;
}

const shorten = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * The note the model gets once after a restart (decided with Manuel on 2026-11-05): not the whole
 * conversation, which would fill its context with old tool output, but what was asked last, the
 * last answer and how many steps were built. Everything else it reads from the design itself.
 */
export function chatDigest(items: readonly StoredChatItem[], maxChars = 1500): string | null {
  const requests = items.flatMap((item) => (item.kind === 'user' ? [shorten(item.text, 160)] : []));
  if (requests.length === 0) return null;
  const answers = items.flatMap((item) => (item.kind === 'assistant' ? [shorten(item.text, 400)] : []));
  const steps = items.filter((item) => item.kind === 'step' && item.state === 'applied');
  const lastSteps = steps.slice(-6).flatMap((item) => (item.kind === 'step' ? [shorten(phrasesText(item.step.phrases), 120)] : []));
  const lines = [
    '[PartBuddy: the user worked on this design with you in an earlier session. A short summary of that conversation, oldest first:',
    ...requests.slice(-6).map((request) => `- The user asked: ${request}`),
    ...(answers.length > 0 ? [`- Your last answer: ${answers.at(-1) ?? ''}`] : []),
    ...(steps.length > 0 ? [`- ${String(steps.length)} steps were built, the last ones: ${lastSteps.join(' | ')}`] : []),
    'Inspect the design before you change it; the summary may miss details.]',
  ];
  const text = lines.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars - 2)}…]` : text;
}

export interface ChatArchiveOptions {
  /** The file of the open design, or null while it has none yet. */
  designFile(): string | null;
  log(message: string): void;
}

/**
 * Keeps the conversation next to the design file and reads it back after a restart. A save before
 * the design has a file is held and written once it has one (the first autosave).
 */
export class ChatArchive {
  private pending: StoredChatItem[] | null = null;
  private digest: string | null = null;

  constructor(private readonly options: ChatArchiveOptions) {}

  /** The conversation saved with the open design; arms the summary for the model's next message. */
  load(): StoredChat | null {
    const design = this.options.designFile();
    if (!design) return null;
    const file = chatFileOf(design);
    if (!existsSync(file)) return null;
    try {
      const parsed = storedChatSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (!parsed.success) {
        this.options.log(`the saved conversation does not match its format and is left out: ${file}`);
        return null;
      }
      this.digest = chatDigest(parsed.data.items);
      return parsed.data;
    } catch (error) {
      this.options.log(`the saved conversation could not be read: ${(error as Error).message}`);
      return null;
    }
  }

  save(items: StoredChatItem[]): void {
    this.pending = items;
    this.flush();
  }

  /** Writes the held conversation once the design has a file. */
  flush(): void {
    const design = this.options.designFile();
    if (!design || !this.pending) return;
    const file = chatFileOf(design);
    const chat: StoredChat = { version: 1, savedAt: new Date().toISOString(), items: this.pending };
    try {
      // Written next to it first and then moved, so a crash never leaves half a file.
      writeFileSync(`${file}.tmp`, JSON.stringify(chat), 'utf8');
      renameSync(`${file}.tmp`, file);
      this.pending = null;
    } catch (error) {
      this.options.log(`the conversation could not be saved: ${(error as Error).message}`);
    }
  }

  /** The summary of the earlier session, once: for the first message after a restart. */
  takeDigest(): string | null {
    const digest = this.digest;
    this.digest = null;
    return digest;
  }
}
