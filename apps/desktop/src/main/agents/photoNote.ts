import { join } from 'node:path';

/**
 * Photo import (plan step F6): a photo of a real object goes to the assistant as a picture and is
 * kept in the project's "photos" folder, so SolidCraft can lay it out as a canvas or compare the
 * model's outline with it.
 */

/** The only photo files the assistant may hand to SolidCraft (policy.ts): PartBuddy's own, in a project. */
export const PHOTO_FILE = /^[^*?"<>|]+[\\/]photos[\\/]photo-\d{8}-\d{6}\.png$/;

/** Where a photo sent at `when` is kept in the project folder `project`. */
export function photoFile(project: string, when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${String(when.getFullYear())}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return join(project, 'photos', `photo-${day}-${time}.png`);
}

/**
 * What the model hears with a photo. A photo has perspective and no scale, so the model asks for
 * the few dimensions that decide the part; tracing and comparing only pay off for a straight-on view.
 */
export function photoNote(file: string | null): string {
  return (
    '[PartBuddy: the attached picture is a photo of a real object. It has perspective and no scale: never read sizes off its pixels. ' +
    'Say in one sentence what you see and what part you take the user to want (often a holder for the object or a part that fits it); ' +
    'ask with a clarification card for the two or three critical dimensions the message does not give (such as the width and depth where it sits, ' +
    'a hole spacing or a wall it clamps), then build it printable as designed.' +
    (file
      ? // Forward slashes: SolidCraft takes them, and the model copies them into JSON unescaped.
        ` The photo is saved at \`${file.replaceAll('\\', '/')}\`. Only if the outline matters and the photo looks straight onto the object: ` +
        'lay it out with `canvas.insert` {path, plane, width}, scale it with `canvas.calibrate` from a dimension the user gave, model on it, ' +
        'and check the outline with `compare_picture` {reference: that path}. Skip this for a photo taken at an angle.]'
      : ']')
  );
}
