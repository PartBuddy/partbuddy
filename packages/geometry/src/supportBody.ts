/**
 * Bodies of support printed into the model (M7f step 4) are named `Print support <n>`; the check
 * and the orientation proposal know them by it and leave them out of what they judge.
 */
export const SUPPORT_BODY = 'Print support';

export function isSupportBody(name: string): boolean {
  return name === SUPPORT_BODY || name.startsWith(`${SUPPORT_BODY} `);
}
