import type { ToolResult, UpstreamTools } from './gateProxy';

/** Overlap volume, mm³, below which a resized part counts as seated as before (the kernel's own noise on a seat). */
const GROWN = 0.5;

type Pair = { volume_mm3?: unknown; a?: unknown; b?: unknown; a_part?: { component?: unknown }; b_part?: { component?: unknown } };

/** The bodies the part's component overlaps and by how much, from `inspect.interference` over the whole design. */
function overlapsOf(result: unknown, component: string): Map<string, number> {
  const pairs = (result as { interferences?: unknown } | undefined)?.interferences;
  const found = new Map<string, number>();
  for (const pair of Array.isArray(pairs) ? (pairs as Pair[]) : []) {
    const volume = typeof pair.volume_mm3 === 'number' ? pair.volume_mm3 : 0;
    const [ownA, ownB] = [pair.a_part?.component === component, pair.b_part?.component === component];
    if (ownA === ownB) continue;
    const other = String(ownA ? pair.b : pair.a);
    found.set(other, (found.get(other) ?? 0) + volume);
  }
  return found;
}

/** The component's name in SolidCraft's answer to `parts.resize`. */
function nameOf(result: ToolResult): string | null {
  const text = result.content.find((part) => part.type === 'text')?.text;
  try {
    const reply = JSON.parse(typeof text === 'string' ? text : '') as { name?: unknown };
    return typeof reply.name === 'string' && reply.name !== '' ? reply.name : null;
  } catch {
    return null;
  }
}

/**
 * `parts.resize` changes the part, not the hole it sits in (audit S-21): an M4 in the 3.4 mm hole of an M3 was not
 * noticed, since the print check leaves standard parts out (a screw in a pilot hole or an insert overlaps on purpose).
 * So the overlap of the part with the rest is measured before and after, and what grew is said with the answer.
 * shortcut: only `execute` with the component named; a resize inside a batch, or by id, goes unmeasured.
 */
export function withResizeCheck(upstream: UpstreamTools, log: (line: string) => void = () => undefined): UpstreamTools {
  const measure = async (component: string, callId: string | undefined): Promise<Map<string, number> | null> => {
    const result = await upstream.callTool('batch', { commands: [{ command: 'inspect.interference', params: {} }] }, callId).catch(() => null);
    const text = result?.content.find((part) => part.type === 'text')?.text;
    try {
      const reply = JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[]; failed?: unknown };
      return reply.failed || result?.isError ? null : overlapsOf(reply.results?.[0], component);
    } catch {
      return null;
    }
  };
  return {
    instructions: () => upstream.instructions(),
    listTools: () => upstream.listTools(),
    callTool: async (name, args, callId): Promise<ToolResult> => {
      const params = args.params as { component?: unknown } | undefined;
      const component = name === 'execute' && args.command === 'parts.resize' && typeof params?.component === 'string' ? params.component : null;
      if (!component) return upstream.callTool(name, args, callId);
      const before = await measure(component, callId);
      const result = await upstream.callTool(name, args, callId);
      if (result.isError || !before) return result;
      // SolidCraft names the component after its new size ("SHCS M3x8" becomes "SHCS M4x10", measured with 0.45.0).
      const renamed = nameOf(result) ?? component;
      const after = await measure(renamed, callId);
      if (!after) {
        log(`parts.resize of ${component}: the overlap after it could not be measured`);
        return result;
      }
      const grown = [...after].filter(([body, volume]) => volume - (before.get(body) ?? 0) > GROWN);
      if (grown.length === 0) return result;
      const said = grown.map(([body, volume]) => `${body} by ${String(Math.round(volume * 10) / 10)} mm³ (before ${String(Math.round((before.get(body) ?? 0) * 10) / 10)})`).join(', ');
      log(`parts.resize of ${component} grew its overlap: ${said}`);
      const note = `PartBuddy measured: after the resize, ${renamed} overlaps ${said}. The hole it sits in was not changed: build it again for the new size with partbuddy_block, unless the overlap is meant (a pilot hole for a screw that cuts its thread, an insert).`;
      return { ...result, content: [...result.content, { type: 'text', text: note }] };
    },
  };
}
