/**
 * Strata (ADR 0011, F8): a local server with an OpenAI API on 127.0.0.1:8080. `/health` names the
 * service, so it is told apart from llama.cpp on the same port, and gives the model, its context,
 * picture input and whether an API key is needed (read from Strata's serve/server.py, 2026-11-06).
 */

export const STRATA_URL = 'http://127.0.0.1:8080';
/** Strata reads `reasoning_effort` on the OpenAI API. */
export const STRATA_EFFORTS = ['low', 'medium', 'high'];

export interface StrataFound {
  model: string;
  /** Tokens of context; null while it loads (Strata reports 0 then). */
  context: number | null;
  vision: boolean;
  /** The server wants an API key, which PartBuddy cannot send yet. */
  keyNeeded: boolean;
  loaded: boolean;
  /** Answering another request when PartBuddy last looked (`/status`). */
  busy: boolean;
}

/** What `/health` says, or null when the answer is not Strata's. */
export function strataFromHealth(body: unknown): StrataFound | null {
  const health = (body ?? {}) as Record<string, unknown>;
  if (health.service !== 'strata' || typeof health.model !== 'string' || health.model.length === 0) return null;
  const context = typeof health.max_context === 'number' && health.max_context > 0 ? health.max_context : null;
  return {
    model: health.model.slice(0, 120),
    context,
    vision: health.images === true,
    keyNeeded: health.api_key === true,
    loaded: health.loaded !== false,
    busy: false,
  };
}

/** Strata and its model, or null when nothing answers there or it is another server. */
export async function findStrata(fetchFn: typeof fetch = fetch, base = STRATA_URL, timeoutMs = 1500): Promise<StrataFound | null> {
  try {
    const response = await fetchFn(`${base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const found = response.ok ? strataFromHealth(await response.json()) : null;
    if (!found || found.keyNeeded) return found;
    const status = await fetchFn(`${base}/status`, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    const body = status?.ok ? ((await status.json()) as { busy?: unknown }) : null;
    return { ...found, busy: body?.busy === true };
  } catch {
    return null;
  }
}
