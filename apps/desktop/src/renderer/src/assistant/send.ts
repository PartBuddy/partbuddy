import type { MessageAnswer, Selection } from '../../../shared/contract';
import type { SketchState } from '../../../shared/sketch';
import { platform } from '../platform';
import type { SketchPicture } from './SketchPad';

/** Sends a message to the assistant with the selection that goes along, and a sketch or a photo. */
export async function sendToAssistant(text: string, selections: Selection[] = [], answer?: MessageAnswer, sketch?: { picture: SketchPicture; state: SketchState }, photo?: Uint8Array): Promise<void> {
  await platform().agent.send(
    text,
    selections,
    answer,
    sketch ? { png: sketch.picture.png, ...(sketch.picture.elements ? { elements: sketch.picture.elements } : {}), state: sketch.state } : undefined,
    photo,
  );
}
