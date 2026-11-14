/**
 * Helpers of the measuring group "normteile-policy". The shared harness does not hand out what the
 * app's mirror says about standard parts (`structure.standardParts`), nor the print check as the app
 * runs it (without standard parts), nor an UpstreamTools to stack other wrappers on; these do.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ToolResult, UpstreamTools } from '../../apps/desktop/src/main/agents/gateProxy';
import { printCheckNote } from '../../apps/desktop/src/main/print/printCheckNote';
import { mirrorActiveDesign, type ControlRequester } from '../../apps/desktop/src/main/solidcraft/mirror';
import { reportOf } from '../../apps/desktop/src/renderer/src/print/report';
import { buildRenderMesh, buildViewerModel, checkPrint, parseTagged3mf, type PrintCheckProfile } from '../../packages/geometry/src/index';
import type { Audit, Step } from './harness';

/** The app's mirror over `audit.batch`: the same requests `mirrorActiveDesign` sends in the app. */
const requesterOf = (audit: Audit): ControlRequester => ({
  request: async <T>(_method: string, params?: Record<string, unknown>) => ({ results: await audit.batch((params?.commands ?? []) as Step[]) }) as T,
});

/**
 * What the app does with the design as it stands: the mirror's bodies and standard parts, the bodies
 * that go to print check, size list and export (supervisor.ts: all mirrored bodies but the standard
 * parts), the check as usePrintCheck.ts runs it on them, and the note the assistant gets.
 */
export async function appState(audit: Audit, profile: PrintCheckProfile) {
  const mirror = await mirrorActiveDesign(requesterOf(audit), audit.dir);
  const standardParts = mirror.structure.standardParts ?? [];
  const standard = new Set(standardParts);
  const mirrored = mirror.bodies.map((body) => body.name);
  const printed = mirror.bodies.filter((body) => !standard.has(body.name));
  const check = checkPrint(
    printed.map((body) => ({ name: body.name, model: buildViewerModel(buildRenderMesh(parseTagged3mf(body.mesh), body.faces), body.faces) })),
    profile,
    mirror.structure.features,
  );
  // Camera boxes and face lists are long and say nothing here.
  const findings = check.findings.map((finding) => ({ ...finding, box: undefined, places: 'places' in finding ? finding.places.map((place) => ({ body: place.body, faces: place.faces.length })) : undefined }));
  return {
    mirrored,
    standardParts,
    printed: printed.map((body) => body.name),
    features: mirror.structure.features.map((feature) => ({ name: feature.name, suppressed: feature.suppressed, error: feature.error, warning: feature.warning })),
    check: { status: check.status, findings },
    note: printCheckNote(reportOf(check, profile.nozzle, 0)),
  };
}

/** The harness' tools (block and mechanism over SolidCraft) as UpstreamTools, to stack the app's other wrappers on. */
export const upstreamOf = (audit: Audit): UpstreamTools => ({
  instructions: () => undefined,
  listTools: () => Promise.resolve([]),
  callTool: async (name, args): Promise<ToolResult> => {
    const reply = await audit.tool(name, args);
    return { content: [{ type: 'text', text: reply.text }], isError: reply.isError };
  },
});

/** A step whose failure is the result: SolidCraft's or the tool's own words. */
export async function attempt<T>(run: () => Promise<T>): Promise<T | { failed: string }> {
  try {
    return await run();
  } catch (cause) {
    return { failed: (cause as Error).message };
  }
}

/** `audit.finish` for a case whose name has a folder in it (out/normteile-policy/<case>): the harness joins the name onto its folder. */
export async function finish(audit: Audit, name: string, result: unknown): Promise<void> {
  mkdirSync(dirname(join(audit.dir, `${name}.stl`)), { recursive: true });
  await audit.finish(result);
}

export const text = (reply: { text: string }): unknown => {
  try {
    return JSON.parse(reply.text);
  } catch {
    return reply.text;
  }
};
