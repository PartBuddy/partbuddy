import type { MessageAnswer, Selection } from '../../../shared/contract';
import { platform } from '../platform';

/** Sends a message to the assistant with the selection that goes along. */
export async function sendToAssistant(text: string, selections: Selection[] = [], answer?: MessageAnswer): Promise<void> {
  await platform().agent.send(text, selections, answer);
}
