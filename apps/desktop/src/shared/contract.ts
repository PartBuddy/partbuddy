import { z } from 'zod';

import { eventChannels, invokeChannels, type EventChannel, type InvokeChannel } from './channels';

/**
 * The one contract of the typed IPC bridge (ADR 0013). Every channel has a request and a
 * response schema; the main process validates each request and, in development builds, each
 * response and event. Nothing here carries API keys or paths outside the app's own folders.
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const faceInfoSchema = z
  .object({
    index: z.number().int().nonnegative(),
    name: z.string().min(1),
    exact: z.boolean(),
    area: z.number(),
    centroid: vec3,
    point: vec3,
    planeNormal: vec3.optional(),
    cylinder: z.object({ origin: vec3, axis: vec3, radius: z.number() }).strict().optional(),
  })
  .strict();

export const faceTableSchema = z
  .object({
    model: z.string(),
    body: z.string(),
    units: z.literal('mm'),
    faces: z.array(faceInfoSchema),
  })
  .strict();

export const connectionStateSchema = z.enum([
  'searching',
  'notInstalled',
  'notRunning',
  'starting',
  'connecting',
  'connected',
  'lost',
  'failed',
]);

export const connectionStatusSchema = z
  .object({
    state: connectionStateSchema,
    /** Control port of the SolidCraft app PartBuddy talks to, once known. */
    port: z.number().int().positive().optional(),
    /** True when PartBuddy started this SolidCraft and closes it on quit. */
    owned: z.boolean(),
    documentId: z.string().optional(),
    revision: z.number().int().nonnegative().optional(),
    /** Mirror state: idle, a newer revision is being mirrored, or the last mirror failed. */
    mirror: z.enum(['idle', 'rebuilding', 'failed']),
    /** Short technical detail for the failed and lost states; never contains a token. */
    detail: z.string().max(500).optional(),
  })
  .strict();

export const mirroredBodySchema = z
  .object({
    name: z.string().min(1),
    /** Face-tagged 3MF bytes as exported by SolidCraft (ADR 0004). */
    mesh: z.instanceof(Uint8Array),
    faces: faceTableSchema,
  })
  .strict();

export const mirrorRevisionSchema = z
  .object({
    documentId: z.string(),
    revision: z.number().int().nonnegative(),
    designName: z.string(),
    bodies: z.array(mirroredBodySchema),
  })
  .strict();

export const appInfoSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    locale: z.string(),
    platform: z.enum(['win32', 'darwin', 'linux']),
  })
  .strict();

/** External agent (ADR 0015). Only sign-in state and plan type are shown, never account data. */
export const agentStatusSchema = z
  .object({
    agent: z.literal('claude-code'),
    state: z.enum(['checking', 'notInstalled', 'signedOut', 'ready', 'busy', 'unavailable']),
    version: z.string().max(40).optional(),
    method: z.string().max(40).optional(),
    plan: z.string().max(40).optional(),
    detail: z.string().max(500).optional(),
  })
  .strict();

export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), text: z.string() }).strict(),
  z.object({ type: z.literal('textDelta'), text: z.string() }).strict(),
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z
    .object({
      type: z.literal('tool'),
      id: z.string(),
      name: z.string(),
      summary: z.string().max(2000),
      decision: z.enum(['allowed', 'denied']),
      reason: z.string().max(500).optional(),
      ok: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('done'), ok: z.boolean(), durationMs: z.number().nullable(), detail: z.string().nullable() }).strict(),
  z.object({ type: z.literal('error'), message: z.string().max(500) }).strict(),
]);

export const agentMessageSchema = z.object({ text: z.string().min(1).max(20_000) }).strict();

const none = z.undefined();

export const invokeContract = {
  [invokeChannels.appInfo]: { request: none, response: appInfoSchema },
  [invokeChannels.solidcraftStatus]: { request: none, response: connectionStatusSchema },
  [invokeChannels.solidcraftRetry]: { request: none, response: none },
  [invokeChannels.solidcraftStart]: { request: none, response: none },
  [invokeChannels.mirrorCurrent]: { request: none, response: mirrorRevisionSchema.nullable() },
  [invokeChannels.agentStatus]: { request: none, response: agentStatusSchema },
  [invokeChannels.agentRefresh]: { request: none, response: agentStatusSchema },
  [invokeChannels.agentSend]: { request: agentMessageSchema, response: none },
  [invokeChannels.agentStop]: { request: none, response: none },
  [invokeChannels.agentSignIn]: { request: none, response: none },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

export const eventContract = {
  [eventChannels.solidcraftStatus]: connectionStatusSchema,
  [eventChannels.mirrorRevision]: mirrorRevisionSchema,
  [eventChannels.agentStatus]: agentStatusSchema,
  [eventChannels.agentEvent]: agentEventSchema,
} as const satisfies Record<EventChannel, z.ZodType>;

export type FaceTableMessage = z.infer<typeof faceTableSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type MirroredBody = z.infer<typeof mirroredBodySchema>;
export type MirrorRevision = z.infer<typeof mirrorRevisionSchema>;
export type AppInfo = z.infer<typeof appInfoSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;

export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['response']>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;
