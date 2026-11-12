import { isAbsolute, join, resolve } from 'node:path';

/**
 * Photo import (plan step F6): photos of a real object go to the assistant as pictures and are
 * kept in the project's "photos" folder, so SolidCraft can lay one out as a canvas or compare the
 * model's outline with it.
 */

/** The only photo files the assistant may hand to SolidCraft (policy.ts): PartBuddy's own, in a project. */
export const PHOTO_FILE = /^[^*?"<>|]+[\\/]photos[\\/]photo-\d{8}-\d{6}(-\d)?\.png$/;

/** The photos PartBuddy kept and named to the assistant while it runs, as `resolve` writes their paths, in lower case. */
const kept = new Set<string>();

/**
 * Whether a path is one of the photos PartBuddy itself kept and named to the assistant in this
 * run: the same file, not a path of the same form. A path of that form in another project, on a
 * network share (`//server/share/photos/…`, which alone would make SolidCraft reach for the server),
 * a device path (two backslashes, a dot, then the drive), a short 8.3 name or a relative path is none of them.
 */
export function isKeptPhoto(path: unknown): boolean {
  if (typeof path !== 'string' || !PHOTO_FILE.test(path) || path.includes('..')) return false;
  if (/^[\\/]{2}/.test(path) || !isAbsolute(path)) return false;
  return kept.has(resolve(path).toLowerCase());
}

/** Where a photo sent at `when` is kept in the project folder `project`; the second and later of one message get `-2`, `-3` … */
export function photoFile(project: string, when: Date, index = 0): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${String(when.getFullYear())}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return join(project, 'photos', `photo-${day}-${time}${index > 0 ? `-${String(index + 1)}` : ''}.png`);
}

/**
 * What the model hears with one or more photos. A photo has perspective and no scale, so the model
 * asks for the few dimensions that decide the part; tracing and comparing only pay off for a
 * straight-on view. `files` holds where each photo was kept, null where it could not be.
 */
export function photoNote(files: readonly (string | null)[]): string {
  const saved = files.filter((file): file is string => file !== null);
  for (const file of saved) kept.add(resolve(file).toLowerCase());
  // Forward slashes: SolidCraft takes them, and the model copies them into JSON unescaped.
  const paths = saved.map((file) => `\`${file.replaceAll('\\', '/')}\``).join(', ');
  return (
    (files.length > 1
      ? `[PartBuddy: the ${String(files.length)} attached pictures are photos of a real object, perhaps from different sides. They have perspective and no scale: never read sizes off their pixels. `
      : '[PartBuddy: the attached picture is a photo of a real object. It has perspective and no scale: never read sizes off its pixels. ') +
    'Say in one sentence what you see and what part you take the user to want (often a holder for the object or a part that fits it); ' +
    'ask with a clarification card for the two or three critical dimensions the message does not give (such as the width and depth where it sits, ' +
    'a hole spacing or a wall it clamps), then build it printable as designed.' +
    (saved.length > 0
      ? ` ${saved.length > 1 ? 'The photos are saved at' : 'The photo is saved at'} ${paths}. Only if the outline matters and a photo looks straight onto the object: ` +
        'lay it out with `canvas.insert` {path, plane, width}, scale it with `canvas.calibrate` from a dimension the user gave, model on it, ' +
        'and check the outline with `compare_picture` {reference: that path}. Skip this for a photo taken at an angle.]'
      : ']')
  );
}
