import { z } from 'zod';

import { eventChannels, invokeChannels, type EventChannel, type InvokeChannel } from './channels';
import { MAX_PHRASES_PER_STEP, STEP_PHRASE_KEYS } from './stepPhrases';

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
    /** Connected to the SolidCraft window, or to the engine PartBuddy runs without a window (ADR 0016). */
    engine: z.enum(['window', 'headless']).optional(),
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

/**
 * A visible or the active sketch as world-space line segments (issue #21): sketches have no body
 * to export, so the mirror carries their curves, flattened in the main process.
 */
export const mirroredSketchSchema = z
  .object({
    /** SolidCraft's sketch id; stable while the design is open. */
    id: z.number().int().nonnegative(),
    name: z.string(),
    /** The sketch SolidCraft is editing right now. */
    active: z.boolean(),
    /** World positions in mm, two points (six numbers) per segment. */
    positions: z.instanceof(Float32Array),
    /** Per segment: 0 free, 1 fully constrained, 2 construction geometry. */
    styles: z.instanceof(Uint8Array),
    /** The segments of each curve, to see which curves the latest step changed. */
    curves: z.array(
      z.object({ id: z.string().min(1), first: z.number().int().nonnegative(), count: z.number().int().nonnegative() }).strict(),
    ),
  })
  .strict()
  .refine((sketch) => sketch.positions.length === sketch.styles.length * 6, 'positions and styles disagree');

/** One step of the timeline as `document.inspect` reports it (M1c). */
export const timelineFeatureSchema = z
  .object({
    id: z.number().int().nonnegative(),
    name: z.string().max(200),
    type: z.string().max(80),
    error: z.string().max(500).nullable(),
    warning: z.string().max(500).nullable(),
    suppressed: z.boolean(),
    rolledBack: z.boolean(),
    /** Rebuild time in ms. */
    ms: z.number().nonnegative(),
  })
  .strict();

/** What the structure tree and the timeline show: every body and sketch, visible or not, and the features. */
export const structureSchema = z
  .object({
    features: z.array(timelineFeatureSchema).max(5000),
    /** Features before the rollback marker stay active; null when the marker is at the end. */
    marker: z.number().int().nonnegative().nullable(),
    bodies: z.array(z.object({ name: z.string().max(200), visible: z.boolean(), feature: z.number().int().nullable() }).strict()).max(500),
    sketches: z.array(z.object({ id: z.number().int().nonnegative(), name: z.string().max(200), visible: z.boolean() }).strict()).max(2000),
  })
  .strict();

export const mirrorRevisionSchema = z
  .object({
    documentId: z.string(),
    revision: z.number().int().nonnegative(),
    designName: z.string(),
    bodies: z.array(mirroredBodySchema),
    sketches: z.array(mirroredSketchSchema),
    structure: structureSchema,
    /** How many steps SolidCraft can undo and redo in this revision. */
    history: z.object({ undo: z.number().int().nonnegative(), redo: z.number().int().nonnegative() }).strict(),
    /** Time from asking SolidCraft for the export to having the files in the main process. */
    mirrorMs: z.number().nonnegative(),
  })
  .strict();

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Colours of the native window buttons, read from the design tokens by the renderer. */
export const titleBarColorsSchema = z
  .object({
    color: hexColor,
    symbolColor: hexColor,
    height: z.number().int().min(24).max(64),
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

export const agentKindSchema = z.enum(['claude-code', 'chatgpt']);

// Zod 4 numbers are finite by default.
const finite = z.number();
const point3 = z.tuple([finite, finite, finite]);

const bodyName = z.string().min(1).max(200);

/**
 * What the user selected in PartBuddy's view, as the assistant gets it with a message: a few
 * words of text instead of a screenshot (decided 2026-11-04, keep token use low). A face, an edge
 * or a vertex (M1, decided 2026-11-04).
 */
export const faceSelectionSchema = z
  .object({
    kind: z.literal('face'),
    body: bodyName,
    /** SolidCraft's stable face name (ADR 0004). */
    face: z.string().min(1).max(200),
    surface: z.enum(['plane', 'cylinder', 'other']),
    area: finite.nonnegative(),
    /** Where the user clicked, on the face, in mm. */
    point: point3,
    normal: point3,
    radius: finite.positive().optional(),
  })
  .strict();

export const edgeSelectionSchema = z
  .object({
    kind: z.literal('edge'),
    body: bodyName,
    /** SolidCraft's edge name: both face names, sorted, joined by "|". */
    edge: z.string().min(1).max(410),
    /** False when the two faces meet along more than one edge; the point tells them apart. */
    exact: z.boolean(),
    length: finite.nonnegative(),
    /** Where the user clicked, on the edge, in mm. */
    point: point3,
    /** End points of an open edge; none for a closed loop such as a full circle. */
    ends: z.array(point3).max(2),
    /** Radius when the edge lies on a cylinder (a hole or boss rim). */
    radius: finite.positive().optional(),
  })
  .strict();

export const vertexSelectionSchema = z.object({ kind: z.literal('vertex'), body: bodyName, point: point3 }).strict();

export const selectionSchema = z.discriminatedUnion('kind', [faceSelectionSchema, edgeSelectionSchema, vertexSelectionSchema]);

/**
 * What the user sees in PartBuddy's 3D view, reported by the renderer when it changes; the
 * assistant reads it with the `partbuddy_view` tool.
 */
export const viewStateSchema = z
  .object({
    camera: z.object({ position: point3, target: point3 }).strict().nullable(),
    selections: z.array(selectionSchema).max(20),
    bodies: z.array(z.object({ name: z.string().max(200), faces: z.number().int().nonnegative() }).strict()).max(500),
    sketches: z.array(z.object({ name: z.string().max(200), active: z.boolean() }).strict()).max(500),
    changes: z.object({ faces: z.number().int().nonnegative(), sketchCurves: z.number().int().nonnegative() }).strict().nullable(),
  })
  .strict();

/**
 * Assistant route (ADR 0015): the user's Claude Code, or ChatGPT plan usage in PartBuddy's own
 * loop. Shows sign-in state, plan and, for ChatGPT, the signed-in account's e-mail to the user.
 */
export const agentStatusSchema = z
  .object({
    agent: agentKindSchema,
    // needsSubscription: Claude Code is signed in, but not with a Claude subscription (decided 2026-11-04).
    state: z.enum(['checking', 'notInstalled', 'signedOut', 'needsSubscription', 'ready', 'busy', 'unavailable']),
    version: z.string().max(40).optional(),
    method: z.string().max(40).optional(),
    plan: z.string().max(40).optional(),
    account: z.string().max(200).optional(),
    /** The user allowed Claude Code to run with an API key, billed separately (off by default). */
    apiBillingAllowed: z.boolean().optional(),
    model: z.string().max(80).optional(),
    detail: z.string().max(500).optional(),
  })
  .strict();

/** One line of a work-log step (M2a): a message key and its values, shown in the user's language. */
export const stepPhraseSchema = z
  .object({
    key: z.enum(STEP_PHRASE_KEYS),
    values: z.record(z.string().max(40), z.union([z.string().max(80), z.number()])),
  })
  .strict();

/**
 * One change of the design in the work log (M2a): by the assistant (`toolId` names its tool call)
 * or by the user. `depth` is SolidCraft's undo depth after the step, which "go back" returns to.
 */
export const workStepSchema = z
  .object({
    id: z.string().max(40),
    source: z.enum(['assistant', 'user']),
    phrases: z.array(stepPhraseSchema).min(1).max(MAX_PHRASES_PER_STEP),
    toolId: z.string().max(40).optional(),
    documentId: z.string().max(200),
    revision: z.number().int().nonnegative(),
    depth: z.number().int().nonnegative(),
  })
  .strict();
/** applied: part of the design; undone: Redo or "go back" brings it back; discarded: replaced for good. */
export const workStepStateSchema = z.enum(['applied', 'undone', 'discarded']);

export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), text: z.string(), selection: z.string().max(400).optional() }).strict(),
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
  z.object({ type: z.literal('step'), step: workStepSchema }).strict(),
  z
    .object({
      type: z.literal('steps'),
      states: z.array(z.object({ id: z.string().max(40), state: workStepStateSchema }).strict()).max(1000),
      /** The newest applied step: the design is in its state. */
      current: z.string().max(40).nullable(),
    })
    .strict(),
]);
export const goToStepSchema = z.object({ step: z.string().min(1).max(40) }).strict();

/** Formats of the user's own export (ADR 0016): 3MF for slicers, STL, STEP for other CAD programs. */
export const exportFormatSchema = z.enum(['3mf', 'stl', 'step']);
export const exportRequestSchema = z.object({ format: exportFormatSchema }).strict();
/** The saved file's name only, never the folder (no paths outside the app's own folders here). */
export const exportResultSchema = z.object({ file: z.string().min(1).max(260) }).strict().nullable();

/** The dimension field at a selection (M1b): an edge length or the radius of a cylindrical face. */
export const dimensionTargetSchema = z.discriminatedUnion('measure', [
  z.object({ measure: z.literal('length'), body: bodyName, edge: z.string().min(1).max(410), point: point3 }).strict(),
  z.object({ measure: z.literal('radius'), body: bodyName, face: z.string().min(1).max(200) }).strict(),
]);
const length = finite.positive().max(100_000);
export const dimensionProbeSchema = z.object({ target: dimensionTargetSchema, current: length, value: length }).strict();
const factorSchema = z.union([z.literal(1), z.literal(2)]);
export const dimensionProbeResultSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('direct'),
      parameter: z.string().min(1).max(200),
      /** 2 when a diameter parameter drives a radius. */
      factor: factorSchema,
      label: z.string().max(400),
      /** Face-tagged 3MF of the body with the new value, for the ghost preview. */
      preview: z.instanceof(Uint8Array).nullable(),
    })
    .strict(),
  z.object({ mode: z.literal('assistant'), reason: z.enum(['noDriver', 'ambiguous']) }).strict(),
]);
export const dimensionApplySchema = z
  .object({
    parameter: z.string().regex(/^[\p{L}_][\p{L}\p{N}_]{0,99}$/u),
    value: length,
    factor: factorSchema,
    /** What the probe called the dimension ("Box1 · Length"), for the work log. */
    label: z.string().max(400).optional(),
  })
  .strict();

/** Actions at the selection (M1b-2): points on the picked edges or faces and one size in mm. */
const actionPoints = z.array(point3).min(1).max(50);
export const designActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fillet'), body: bodyName, points: actionPoints, size: length }).strict(),
  z.object({ action: z.literal('chamfer'), body: bodyName, points: actionPoints, size: length }).strict(),
  z
    .object({ action: z.literal('extrude'), body: bodyName, points: z.array(point3).length(1), size: finite.min(-10_000).max(10_000).refine((value) => value !== 0) })
    .strict(),
  z.object({ action: z.literal('hole'), body: bodyName, points: z.array(point3).length(1), size: length, depth: length.optional() }).strict(),
  z.object({ action: z.literal('shell'), body: bodyName, points: actionPoints, size: length }).strict(),
]);
export const actionPreviewSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), preview: z.instanceof(Uint8Array).nullable() }).strict(),
  z.object({ ok: z.literal(false), error: z.string().max(300) }).strict(),
]);
export const measureItemSchema = z.object({ type: z.enum(['face', 'edge', 'vertex']), body: bodyName, point: point3 }).strict();
export const measureRequestSchema = z.object({ items: z.array(measureItemSchema).min(1).max(2) }).strict();
export const measureResultSchema = z.object({ distance: finite.nullable(), angle: finite.nullable() }).strict();

/** Timeline commands of the user (M1c): roll back to a position or to the end, suppress a feature. */
export const timelineCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rollTo'), position: z.union([z.number().int().nonnegative().max(5000), z.literal('end')]) }).strict(),
  z.object({ action: z.literal('suppress'), feature: z.number().int().nonnegative(), suppressed: z.boolean() }).strict(),
]);
/** Shows or hides bodies (by name) and sketches (by id). */
export const visibilityCommandSchema = z
  .object({ bodies: z.array(bodyName).max(500), sketches: z.array(z.number().int().nonnegative()).max(2000), visible: z.boolean() })
  .strict()
  .refine((command) => command.bodies.length + command.sketches.length > 0, 'nothing to show or hide');

export const agentMessageSchema = z.object({ text: z.string().min(1).max(20_000), selections: z.array(selectionSchema).min(1).max(20).optional() }).strict();
export const apiBillingSchema = z.object({ allow: z.boolean() }).strict();
export const agentSelectionSchema = z.object({ agent: agentKindSchema }).strict();
export const assistantStateSchema = z.object({ selected: agentKindSchema, agents: z.array(agentStatusSchema) }).strict();

const none = z.undefined();

export const invokeContract = {
  [invokeChannels.appInfo]: { request: none, response: appInfoSchema },
  [invokeChannels.solidcraftStatus]: { request: none, response: connectionStatusSchema },
  [invokeChannels.solidcraftRetry]: { request: none, response: none },
  [invokeChannels.solidcraftStart]: { request: none, response: none },
  [invokeChannels.mirrorCurrent]: { request: none, response: mirrorRevisionSchema.nullable() },
  [invokeChannels.agentStatus]: { request: none, response: assistantStateSchema },
  [invokeChannels.agentRefresh]: { request: none, response: assistantStateSchema },
  [invokeChannels.agentSelect]: { request: agentSelectionSchema, response: assistantStateSchema },
  [invokeChannels.agentAllowApiBilling]: { request: apiBillingSchema, response: assistantStateSchema },
  [invokeChannels.agentSignOut]: { request: none, response: none },
  [invokeChannels.agentSend]: { request: agentMessageSchema, response: none },
  [invokeChannels.agentStop]: { request: none, response: none },
  [invokeChannels.agentSignIn]: { request: none, response: none },
  [invokeChannels.viewerState]: { request: viewStateSchema, response: none },
  [invokeChannels.windowTitleBar]: { request: titleBarColorsSchema, response: none },
  [invokeChannels.designUndo]: { request: none, response: none },
  [invokeChannels.designRedo]: { request: none, response: none },
  [invokeChannels.designExport]: { request: exportRequestSchema, response: exportResultSchema },
  [invokeChannels.designOpenInSolidCraft]: { request: none, response: none },
  [invokeChannels.designProbeDimension]: { request: dimensionProbeSchema, response: dimensionProbeResultSchema },
  [invokeChannels.designApplyDimension]: { request: dimensionApplySchema, response: none },
  [invokeChannels.designPreviewAction]: { request: designActionSchema, response: actionPreviewSchema },
  [invokeChannels.designApplyAction]: { request: designActionSchema, response: none },
  [invokeChannels.designMeasure]: { request: measureRequestSchema, response: measureResultSchema },
  [invokeChannels.designTimeline]: { request: timelineCommandSchema, response: none },
  [invokeChannels.designGoToStep]: { request: goToStepSchema, response: none },
  [invokeChannels.designVisibility]: { request: visibilityCommandSchema, response: none },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

export const eventContract = {
  [eventChannels.solidcraftStatus]: connectionStatusSchema,
  [eventChannels.mirrorRevision]: mirrorRevisionSchema,
  [eventChannels.agentStatus]: assistantStateSchema,
  [eventChannels.agentEvent]: agentEventSchema,
} as const satisfies Record<EventChannel, z.ZodType>;

export type FaceTableMessage = z.infer<typeof faceTableSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type MirroredBody = z.infer<typeof mirroredBodySchema>;
export type MirroredSketch = z.infer<typeof mirroredSketchSchema>;
export type MirrorRevision = z.infer<typeof mirrorRevisionSchema>;
export type AppInfo = z.infer<typeof appInfoSchema>;
export type AgentKind = z.infer<typeof agentKindSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AssistantState = z.infer<typeof assistantStateSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type FaceSelection = z.infer<typeof faceSelectionSchema>;
export type EdgeSelection = z.infer<typeof edgeSelectionSchema>;
export type Selection = z.infer<typeof selectionSchema>;
export type WorkStep = z.infer<typeof workStepSchema>;
export type WorkStepState = z.infer<typeof workStepStateSchema>;
export type ViewState = z.infer<typeof viewStateSchema>;
export type TitleBarColors = z.infer<typeof titleBarColorsSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportResult = z.infer<typeof exportResultSchema>;
export type DimensionTarget = z.infer<typeof dimensionTargetSchema>;
export type DimensionProbe = z.infer<typeof dimensionProbeSchema>;
export type DimensionProbeResult = z.infer<typeof dimensionProbeResultSchema>;
export type DimensionApply = z.infer<typeof dimensionApplySchema>;
export type DesignAction = z.infer<typeof designActionSchema>;
export type ActionPreviewResult = z.infer<typeof actionPreviewSchema>;
export type MeasureItem = z.infer<typeof measureItemSchema>;
export type MeasureResult = z.infer<typeof measureResultSchema>;
export type TimelineFeature = z.infer<typeof timelineFeatureSchema>;
export type Structure = z.infer<typeof structureSchema>;
export type TimelineCommand = z.infer<typeof timelineCommandSchema>;
export type VisibilityCommand = z.infer<typeof visibilityCommandSchema>;

export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['response']>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;
