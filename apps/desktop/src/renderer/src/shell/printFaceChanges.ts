/**
 * The bodies that had a print face and have none now while they are still shown: SolidCraft no longer holds it (an
 * undo, or no flat face of the body after a change). A renamed or hidden body is not among them.
 */
export function goneFaces(before: Readonly<Record<string, string>>, now: Readonly<Record<string, string>>, shown: readonly string[]): string[] {
  return Object.keys(before).filter((body) => !now[body] && shown.includes(body));
}
