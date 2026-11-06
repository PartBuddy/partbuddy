/**
 * Local servers with an OpenAI API besides Ollama and Strata (F8, ADR 0011): LM Studio, llama.cpp
 * and vLLM on their documented ports. Each tells its models and, where it can, their context,
 * picture input and whether they are loaded. Whether a model calls tools llama.cpp says
 * (`chat_template_caps.supports_tools`) and LM Studio (`capabilities: ["tool_use"]`); otherwise
 * the local route tests it once before first use (localAgent.ts). Formats checked on 2026-11-06
 * against llama.cpp b12144, LM Studio 0.4.28 and vLLM 0.33.0 on the home server.
 */

export type OpenAiServerName = 'LM Studio' | 'llama.cpp' | 'vLLM';

export interface ServerModel {
  id: string;
  context: number | null;
  vision: boolean;
  /** Not in memory yet; the first request loads it, which can take a while. */
  loading: boolean;
  /** Calls tools as the server says; null when it does not say, then a test call decides. */
  tools: boolean | null;
  /** Working on another request when PartBuddy last looked (llama.cpp's `/slots`). */
  busy: boolean;
}

export interface OpenAiServer {
  name: OpenAiServerName;
  url: string;
  models: ServerModel[];
}

/** Documented defaults (research § 3.3): llama.cpp moved from 8080 to 9931; 8080 is Strata's too. */
export const OPENAI_SERVERS: { name: OpenAiServerName; url: string }[] = [
  { name: 'LM Studio', url: 'http://127.0.0.1:1234' },
  { name: 'llama.cpp', url: 'http://127.0.0.1:9931' },
  { name: 'llama.cpp', url: 'http://127.0.0.1:8080' },
  { name: 'vLLM', url: 'http://127.0.0.1:8000' },
];

const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null);
const entries = (body: unknown): Record<string, unknown>[] => {
  const data = (body as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data.filter((entry) => typeof entry === 'object' && entry !== null) as Record<string, unknown>[]).slice(0, 50) : [];
};

/** The plain OpenAI list: ids, with vLLM's `max_model_len` or llama.cpp's `meta.n_ctx` and input modalities. */
export function modelsFromList(body: unknown): ServerModel[] {
  return entries(body).flatMap((entry) => {
    const id = text(entry.id);
    if (!id) return [];
    const inputs = (entry.architecture as { input_modalities?: unknown } | undefined)?.input_modalities;
    const context = positive(entry.max_model_len) ?? positive((entry.meta as { n_ctx?: unknown } | null | undefined)?.n_ctx);
    return [{ id, context, vision: Array.isArray(inputs) && inputs.includes('image'), loading: false, tools: null, busy: false }];
  });
}

/** LM Studio's own list (`/api/v0/models`): language models only, with type, state and context. */
export function modelsFromLmStudio(body: unknown): ServerModel[] {
  return entries(body).flatMap((entry) => {
    const id = text(entry.id);
    if (!id || (entry.type !== 'llm' && entry.type !== 'vlm')) return [];
    // "tool_use" marks native tool calling; without it LM Studio still prompts tools in its default format, so a test decides.
    const tools = Array.isArray(entry.capabilities) && entry.capabilities.includes('tool_use') ? true : null;
    // A loaded model runs with the context it was loaded with; one not loaded yet is loaded by PartBuddy with enough (localAgent.ts).
    const loaded = entry.state === 'loaded';
    const context = loaded ? positive(entry.loaded_context_length) : positive(entry.max_context_length);
    return [{ id, context, vision: entry.type === 'vlm', loading: !loaded, tools, busy: false }];
  });
}

/** What llama.cpp's `/props` adds: the context it runs with, picture input and whether its chat template takes tools. */
export function llamaProps(body: unknown): { context: number | null; vision: boolean; tools: boolean | null } {
  const props = (body ?? {}) as {
    default_generation_settings?: { n_ctx?: unknown };
    modalities?: { vision?: unknown };
    chat_template_caps?: { supports_tools?: unknown };
  };
  const tools = props.chat_template_caps?.supports_tools;
  return { context: positive(props.default_generation_settings?.n_ctx), vision: props.modalities?.vision === true, tools: typeof tools === 'boolean' ? tools : null };
}

async function getJson(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

/**
 * Loads a model in LM Studio with the context PartBuddy needs. LM Studio's own on-demand load
 * would use its default of 8,192 tokens, too few for SolidCraft's tools (`/api/v1/models/load`,
 * checked with 0.4.28).
 */
export async function loadInLmStudio(fetchFn: typeof fetch, url: string, model: string, context: number): Promise<void> {
  const response = await fetchFn(`${url}/api/v1/models/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, context_length: context }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`LM Studio could not load ${model}: HTTP ${String(response.status)} ${(await response.text()).slice(0, 200)}`);
}

/** One server and its models, or null when nothing answers there. */
export async function probeServer(fetchFn: typeof fetch, name: OpenAiServerName, url: string, timeoutMs = 1500): Promise<OpenAiServer | null> {
  try {
    if (name === 'LM Studio') {
      const own = await getJson(fetchFn, `${url}/api/v0/models`, timeoutMs).catch(() => null);
      const models = own?.body ? modelsFromLmStudio(own.body) : modelsFromList((await getJson(fetchFn, `${url}/v1/models`, timeoutMs)).body);
      return { name, url, models };
    }
    if (name === 'llama.cpp') {
      const health = await getJson(fetchFn, `${url}/health`, timeoutMs);
      // Strata answers here too and is found on its own (strata.ts).
      if ((health.body as { service?: unknown } | null)?.service === 'strata') return null;
      // 503 while the model loads: the server is there, its model not yet.
      if (health.status === 503) return { name, url, models: [] };
      if (health.status !== 200) return null;
      const [list, props, slots] = await Promise.all([
        getJson(fetchFn, `${url}/v1/models`, timeoutMs),
        getJson(fetchFn, `${url}/props`, timeoutMs).catch(() => null),
        getJson(fetchFn, `${url}/slots`, timeoutMs).catch(() => null),
      ]);
      const extra = llamaProps(props?.body);
      // Every slot busy: a new request waits for one to come free.
      const slotList = Array.isArray(slots?.body) ? (slots.body as { is_processing?: unknown }[]) : [];
      const busy = slotList.length > 0 && slotList.every((slot) => slot.is_processing === true);
      return { name, url, models: modelsFromList(list.body).map((model) => ({ ...model, context: extra.context ?? model.context, vision: model.vision || extra.vision, tools: extra.tools, busy })) };
    }
    const list = await getJson(fetchFn, `${url}/v1/models`, timeoutMs);
    return list.status === 200 ? { name, url, models: modelsFromList(list.body) } : null;
  } catch {
    return null;
  }
}

/** Every LM Studio, llama.cpp and vLLM that answers, in parallel; `skip` leaves out ports already taken (Strata). */
export async function findOpenAiServers(fetchFn: typeof fetch = fetch, skip: readonly string[] = [], servers = OPENAI_SERVERS): Promise<OpenAiServer[]> {
  const found = await Promise.all(servers.filter((server) => !skip.includes(server.url)).map((server) => probeServer(fetchFn, server.name, server.url)));
  return found.filter((server): server is OpenAiServer => server !== null);
}
