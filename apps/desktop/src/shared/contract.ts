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
    /** Autosave of the design PartBuddy runs without a window: being saved, saved, or the last save failed. */
    save: z.enum(['saving', 'saved', 'failed']).optional(),
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

/** The SolidCraft program PartBuddy runs and its version (R0, ADR 0024). */
export const engineInfoSchema = z
  .object({
    /** The desktop app's path; null when none is found (or the chosen one is gone). */
    path: z.string().max(1000).nullable(),
    source: z.enum(['override', 'setting', 'automatic']),
    version: z.string().max(60).nullable(),
    support: z.enum(['recommended', 'supported', 'tooOld', 'unknown']),
    minimum: z.string().max(60),
    recommended: z.string().max(60),
    /** The program differs from the one PartBuddy started with: it takes effect after a restart. */
    restartNeeded: z.boolean(),
  })
  .strict();
export const engineChoiceErrorSchema = z.enum(['notSolidCraft', 'noCli', 'noVersion', 'tooOld']);
/** `automatic: true` goes back to the automatic search; otherwise the main process asks for the program. */
export const engineChoiceRequestSchema = z.object({ automatic: z.boolean() }).strict();
export const engineChoiceResultSchema = z
  .object({ info: engineInfoSchema, error: engineChoiceErrorSchema.nullable(), cancelled: z.boolean() })
  .strict();

/** The colour theme: follow the system (Windows), or always light or dark. */
export const themeSchema = z.enum(['system', 'light', 'dark']);
export const themeRequestSchema = z.object({ theme: themeSchema }).strict();

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

/** A question or plan of the assistant, shown as a card with buttons (M2a). */
export const agentQuestionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().max(40),
      kind: z.literal('ask'),
      question: z.string().max(500),
      options: z.array(z.object({ label: z.string().max(60), detail: z.string().max(200).optional() }).strict()).min(2).max(5),
    })
    .strict(),
  z.object({ id: z.string().max(40), kind: z.literal('plan'), summary: z.string().max(300), steps: z.array(z.string().max(200)).min(1).max(12) }).strict(),
]);
/** The button the user pressed on a question card: the option's index, or go / cancel for a plan. */
export const messageAnswerSchema = z
  .object({ question: z.string().min(1).max(40), choice: z.union([z.enum(['go', 'cancel']), z.string().regex(/^[0-4]$/)]) })
  .strict();
/** What a selection that went with a message holds, counted for the chat line. */
export const selectionSummarySchema = z
  .object({ faces: z.number().int().min(0), edges: z.number().int().min(0), vertices: z.number().int().min(0), bodies: z.array(z.string().max(200)).max(20) })
  .strict();

export const agentEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('user'),
      text: z.string(),
      selection: z.string().max(400).optional(),
      /** What the selection holds, for a short line in the chat; `selection` keeps the names. */
      selected: selectionSummarySchema.optional(),
      /** Strokes drawn on the view that went with the message, and whether a picture went too (M2b-2). */
      drawing: z.object({ strokes: z.number().int().min(1).max(20), image: z.boolean() }).strict().optional(),
    })
    .strict(),
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
  z.object({ type: z.literal('question'), question: agentQuestionSchema }).strict(),
  /** The user's next message answered the question; `choice` when a button was pressed. */
  z.object({ type: z.literal('answered'), id: z.string().max(40), choice: z.string().max(10).nullable() }).strict(),
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

/**
 * A dimension shown in the view (M2b-3, ADR 0020): a sketch dimension or a feature input, with the
 * parameter behind it and where it sits. `edit` tells how the user may change it: `direct` (a
 * plain number), `parameter` (the expression is one user parameter; `others` more use it) or
 * `assistant` (a formula, never overwritten; ADR 0017).
 */
const parameterName = z.string().regex(/^[\p{L}_][\p{L}\p{N}_]{0,99}$/u);
export const dimensionMarkSchema = z
  .object({
    id: z.string().max(220),
    parameter: parameterName,
    label: z.string().max(80),
    feature: z.object({ id: z.number().int().nonnegative(), name: z.string().max(200) }).strict(),
    expression: z.string().max(500),
    value: finite,
    unit: z.enum(['mm', 'deg']),
    kind: z.enum(['linear', 'radius', 'diameter', 'angle']),
    edit: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('direct') }).strict(),
      z.object({ mode: z.literal('parameter'), name: parameterName, others: z.number().int().nonnegative() }).strict(),
      z.object({ mode: z.literal('assistant') }).strict(),
    ]),
    body: bodyName.nullable(),
    /** World space: the measured span, the offset of the dimension line, and where the label sits; null without a place. */
    geometry: z.object({ from: point3, to: point3, offset: point3, anchor: point3 }).strict().nullable(),
  })
  .strict();
export const dimensionMarksRequestSchema = z
  .object({ features: z.union([z.array(z.number().int().nonnegative()).max(50), z.literal('all')]) })
  .strict();
export const dimensionMarksSchema = z.array(dimensionMarkSchema).max(400);
/**
 * A user parameter of the design for the parameter panel (UI upgrade step 6): what SolidCraft's
 * `parameters.list` reports for parameters the user or the assistant created, not the dimensions
 * of single features. `editable` marks a plain length, which the panel may change directly; a
 * formula stays the designer's intent (ADR 0017).
 */
export const designParameterSchema = z
  .object({
    name: parameterName,
    expression: z.string().max(500),
    value: finite,
    unit: z.string().max(20),
    comment: z.string().max(500),
    favorite: z.boolean(),
    error: z.string().max(500).nullable(),
    /** Parameters and feature inputs that follow this one. */
    usedBy: z.number().int().nonnegative(),
    editable: z.boolean(),
  })
  .strict();
export const designParametersSchema = z.array(designParameterSchema).max(300);

/** Tries a value of a parameter for the ghost preview; nothing changes in the design. */
export const parameterProbeSchema = z.object({ parameter: parameterName, value: finite.positive().max(100_000), body: bodyName.nullable() }).strict();

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

/** One stroke drawn on the view (M2b-2, ADR 0020), as `shared/drawing.ts` summarises it. */
const shortName = z.string().min(1).max(410);
export const drawingStrokeSchema = z
  .object({
    kind: z.enum(['dot', 'line', 'loop']),
    body: bodyName.nullable(),
    faces: z.array(shortName).max(12),
    points: z.array(point3).min(1).max(64),
    length: finite.nonnegative().max(1_000_000),
    size: z.tuple([finite.nonnegative(), finite.nonnegative()]).optional(),
    inside: z.object({ faces: z.array(shortName).max(12), edges: z.array(shortName).max(12) }).strict().optional(),
    direction: z.enum(['left', 'right', 'above', 'below']).optional(),
  })
  .strict();
/** A PNG of the view with the strokes, only when the user ticked "Send as image". */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const drawingSchema = z
  .object({
    strokes: z.array(drawingStrokeSchema).min(1).max(20),
    image: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.length <= MAX_IMAGE_BYTES, 'image too large')
      .refine((bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, 'not a PNG')
      .optional(),
  })
  .strict();

export const agentMessageSchema = z
  .object({
    text: z.string().min(1).max(20_000),
    selections: z.array(selectionSchema).min(1).max(20).optional(),
    answer: messageAnswerSchema.optional(),
    drawing: drawingSchema.optional(),
  })
  .strict();
export const apiBillingSchema = z.object({ allow: z.boolean() }).strict();
export const agentSelectionSchema = z.object({ agent: agentKindSchema }).strict();
export const assistantStateSchema = z.object({ selected: agentKindSchema, agents: z.array(agentStatusSchema) }).strict();

/**
 * Notes on the model (M2b, ADR 0020): stored in the design file, placed by their anchor (ADR 0006).
 * `own`: signed by this installation; a foreign note is shown to the user but not to the assistant
 * until the user accepts it.
 */
const noteId = z.string().regex(/^[a-z0-9]{6,16}$/);
const noteText = z.string().min(1).max(1000);
export const noteViewSchema = z
  .object({
    id: noteId,
    text: noteText,
    kind: z.enum(['face', 'edge', 'point']),
    body: bodyName,
    /** The face or edge name the note sits on now; null for a point note. */
    target: z.string().max(410).nullable(),
    status: z.enum(['attached', 'moved', 'ambiguous', 'orphaned']),
    own: z.boolean(),
    world: point3,
    normal: point3.optional(),
    created: z.string().max(40),
  })
  .strict();
export const notesStateSchema = z
  .object({
    documentId: z.string().max(200).nullable(),
    notes: z.array(noteViewSchema).max(500),
    /** Notes that undo or "go back" removed, for this design; the user can put them back. */
    restorable: z.array(z.object({ id: noteId, text: noteText, target: z.string().max(410).nullable() }).strict()).max(50),
    /** Note entries in the file that PartBuddy could not read (damaged or from a newer version). */
    unreadable: z.number().int().nonnegative(),
  })
  .strict();
export const noteAddSchema = z.object({ selection: selectionSchema, text: noteText }).strict();
export const noteEditSchema = z.object({ id: noteId, text: noteText }).strict();
export const noteIdRequestSchema = z.object({ id: noteId }).strict();
export const noteReattachSchema = z.object({ id: noteId, selection: selectionSchema }).strict();

const none = z.undefined();


/**
 * The conversation about a design, kept next to its file (`Grundplatte.chat.json`) so it is there
 * again after a restart. Only what the chat shows: no tool details, no pictures. Read back as
 * untrusted input.
 */
export const storedChatItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), text: z.string().max(20_000), selection: z.string().max(400).optional(), selected: selectionSummarySchema.optional() }).strict(),
  z.object({ kind: z.literal('assistant'), text: z.string().max(50_000) }).strict(),
  z.object({ kind: z.literal('step'), step: workStepSchema, state: workStepStateSchema }).strict(),
  z.object({ kind: z.literal('question'), question: agentQuestionSchema, choice: z.string().max(40).nullable() }).strict(),
  z.object({ kind: z.literal('error'), message: z.string().max(2000) }).strict(),
]);
export const storedChatSchema = z
  .object({ version: z.literal(1), savedAt: z.string().max(40), items: z.array(storedChatItemSchema).max(400) })
  .strict();
export const chatSaveSchema = z.object({ items: z.array(storedChatItemSchema).max(400) }).strict();

/**
 * Printer and material profiles (M7, decided 2026-11-05): printers are kept for the whole
 * installation and one of them is in use; the material is chosen per part, with a default for
 * new parts. Entered by hand, no slicer import. Lengths in mm, angles in degrees.
 */
const profileId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const profileName = z.string().trim().min(1).max(60);
const range = (min: number, max: number) => finite.min(min).max(max);

export const printerProfileSchema = z
  .object({
    id: profileId,
    name: profileName,
    /** Build volume X, Y, Z. */
    bed: z.tuple([range(20, 2000), range(20, 2000), range(20, 2000)]),
    nozzle: range(0.1, 2),
    layer: range(0.04, 1.2),
  })
  .strict();

/** Fits from tightest to loosest: held by clamping, pushed together and apart, sliding, turning. */
export const fitKindSchema = z.enum(['clamp', 'push', 'slide', 'turn']);
export const FIT_KINDS = fitKindSchema.options;

export const materialProfileSchema = z
  .object({
    id: profileId,
    name: profileName,
    /** How far a downward face may lean from the vertical and still print without support. */
    overhang: range(20, 70),
    /** How much smaller than drawn a hole comes out, on the diameter. */
    holeShrink: range(0, 1),
    /** Clearance per side between two mating parts, per fit. */
    clearance: z.object({ clamp: range(-0.5, 2), push: range(-0.5, 2), slide: range(-0.5, 2), turn: range(-0.5, 2) }).strict(),
    /** How much larger than drawn an outer size (pin, wall, width) comes out, mm; from measuring (M7). */
    outerGrowth: range(-1, 1).default(0),
  })
  .strict();

const uniqueIds = (items: readonly { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;

export const printSettingsSchema = z
  .object({
    version: z.literal(1),
    printers: z.array(printerProfileSchema).min(1).max(20).refine(uniqueIds, 'printer ids must be unique'),
    /** The printer in use. */
    printer: profileId,
    materials: z.array(materialProfileSchema).min(1).max(50).refine(uniqueIds, 'material ids must be unique'),
    /** The material of a part that has none of its own. */
    material: profileId,
    /**
     * Design to print without support (M7f, decided 2026-11-05): the assistant gets the rules for it
     * with the profile. On unless the user turns it off; files from before it have it on.
     */
    supportFree: z.boolean().default(true),
  })
  .strict()
  .refine((settings) => settings.printers.some((printer) => printer.id === settings.printer), 'the printer in use must exist')
  .refine((settings) => settings.materials.some((material) => material.id === settings.material), 'the default material must exist');

const faceName = z.string().min(1).max(200);
const unitDirection = z
  .tuple([range(-1, 1), range(-1, 1), range(-1, 1)])
  .refine((v) => Math.abs(Math.hypot(...v) - 1) < 1e-3, 'must be a unit direction');

/**
 * How the part lies on the bed (M7): the design direction that points down, and the flat face it
 * lies on when the direction came from one. `[0, 0, -1]` is as designed.
 */
export const printOrientationSchema = z
  .object({ down: unitDirection, face: z.object({ body: bodyName, name: faceName }).strict().nullable() })
  .strict();
/** Faces where a load acts, marked by the user, by body and face name. */
export const loadPlacesSchema = z.array(z.object({ body: bodyName, faces: z.array(faceName).min(1).max(100) }).strict()).max(20);

/** What the open part is printed with: the printer in use, the part's material and orientation. */
export const partPrintSchema = z
  .object({
    printer: printerProfileSchema,
    material: materialProfileSchema,
    /** False while the part uses the default material. */
    chosen: z.boolean(),
    orientation: printOrientationSchema,
    loads: loadPlacesSchema,
    /** Whether the assistant designs to print without support. */
    supportFree: z.boolean(),
  })
  .strict();
/**
 * Fixes for support at the light (M7f step 2, decided 2026-11-05): rounds facing the bed become
 * chamfers of the same size, lying holes too wide to bridge get a roof. PartBuddy builds the
 * SolidCraft commands from these numbers itself; a ghost shows the result before it is applied.
 */
const point2 = z.tuple([finite, finite]);
export const printFixSchema = z.discriminatedUnion('fix', [
  z
    .object({
      fix: z.literal('chamfer'),
      body: bodyName,
      /** Per fillet feature, the triangles of each of its faces that face the bed (at most 200 per face). */
      fillets: z
        .array(z.object({ feature: z.number().int().positive(), faces: z.array(z.array(z.tuple([point3, point3, point3])).min(1).max(200)).min(1).max(50) }).strict())
        .min(1)
        .max(20),
    })
    .strict(),
  z
    .object({
      fix: z.literal('roof'),
      body: bodyName,
      roofs: z
        .array(z.object({ origin: point3, xDir: unitDirection, yDir: unitDirection, points: z.array(point2).min(3).max(8), length }).strict())
        .min(1)
        .max(20),
    })
    .strict(),
  z
    .object({
      fix: z.literal('bridge'),
      body: bodyName,
      /** Stepped bridges over counterbores facing the bed: a slot for one layer, a square for two. */
      bridges: z
        .array(
          z
            .object({
              origin: point3,
              xDir: unitDirection,
              yDir: unitDirection,
              slot: z.array(point2).length(4),
              square: z.array(point2).length(4),
              slotDepth: finite.min(0.04).max(1.3),
              squareDepth: finite.min(0.08).max(2.5),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict(),
  z
    .object({
      fix: z.literal('ribs'),
      body: bodyName,
      /** The number of the first new support body (`Print support <first>`). */
      first: z.number().int().min(1).max(10_000),
      /** Walls standing on the bed: a vertical sketch each, extruded symmetrically by its thickness. */
      ribs: z
        .array(
          z
            .object({ origin: point3, xDir: unitDirection, yDir: unitDirection, points: z.array(point2).min(3).max(200), thickness: finite.min(0.4).max(5) })
            .strict(),
        )
        .min(1)
        .max(60),
    })
    .strict(),
]);
export const partMaterialRequestSchema = z.object({ material: profileId }).strict();
export const partLoadsRequestSchema = z.object({ loads: loadPlacesSchema }).strict();

/**
 * A measurement after printing (M7, "measure after printing"), per material: a hole or an outer
 * size as drawn and as measured, or how a fit felt. Suggestions for the material come from these.
 */
export const measurementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hole'), drawn: range(0.1, 1000), measured: range(0.1, 1000) }).strict(),
  z.object({ kind: z.literal('outer'), drawn: range(0.1, 1000), measured: range(0.1, 1000) }).strict(),
  z.object({ kind: z.literal('fit'), fit: fitKindSchema, verdict: z.enum(['tight', 'ok', 'loose']), clearance: range(-0.5, 2) }).strict(),
]);
export const storedMeasurementSchema = z.intersection(
  measurementSchema,
  z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), material: profileId, at: z.string().max(40) }),
);
export const measurementAddSchema = z.object({ material: profileId, measurement: measurementSchema }).strict();
export const measurementIdSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) }).strict();
export const measurementsSchema = z.array(storedMeasurementSchema).max(500);

/**
 * The result of the ready-to-print check (M7) as the renderer reports it, for the note to the
 * assistant. Worked out in the renderer from the mirrored meshes (`checkPrint` in the geometry
 * package); the main process only words it.
 */
const findingSeveritySchema = z.enum(['block', 'warn', 'info']);
const findingPlacesSchema = z
  .array(z.object({ body: bodyName, faces: z.array(z.string().min(1).max(200)).max(40) }).strict())
  .max(20);
const mmValue = finite.nonnegative().max(100_000);
export const printFindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('size'), severity: findingSeveritySchema, size: z.tuple([mmValue, mmValue, mmValue]), bed: z.tuple([mmValue, mmValue, mmValue]), lying: z.boolean() }).strict(),
  z.object({ kind: z.literal('thinWall'), severity: findingSeveritySchema, thickness: mmValue, minimum: mmValue, area: finite.nonnegative(), places: findingPlacesSchema }).strict(),
  z
    .object({ kind: z.literal('support'), severity: findingSeveritySchema, area: finite.nonnegative(), limit: range(0, 90), cause: z.enum(['fillet', 'hole', 'counterbore', 'other']), ribs: z.boolean().optional(), places: findingPlacesSchema })
    .strict(),
  z.object({ kind: z.literal('contact'), severity: findingSeveritySchema, area: finite.nonnegative(), places: findingPlacesSchema }).strict(),
  z.object({ kind: z.literal('feature'), severity: findingSeveritySchema, feature: z.string().max(200), message: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('separate'), severity: findingSeveritySchema, bodies: z.array(z.string().max(200)).min(2).max(20) }).strict(),
]);
export const printCheckReportSchema = z
  .object({
    status: z.enum(['ready', 'warn', 'block']),
    findings: z.array(printFindingSchema).max(40),
    /** The printer's nozzle the check used, for the wording of walls under it. */
    nozzle: range(0.1, 2),
  })
  .strict();

export const invokeContract = {
  [invokeChannels.appInfo]: { request: none, response: appInfoSchema },
  [invokeChannels.solidcraftStatus]: { request: none, response: connectionStatusSchema },
  [invokeChannels.solidcraftRetry]: { request: none, response: none },
  [invokeChannels.solidcraftStart]: { request: none, response: none },
  [invokeChannels.solidcraftEngine]: { request: none, response: engineInfoSchema },
  [invokeChannels.solidcraftChooseEngine]: { request: engineChoiceRequestSchema, response: engineChoiceResultSchema },
  [invokeChannels.appRelaunch]: { request: none, response: none },
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
  [invokeChannels.windowTheme]: { request: none, response: themeSchema },
  [invokeChannels.windowSetTheme]: { request: themeRequestSchema, response: themeSchema },
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
  [invokeChannels.designDimensions]: { request: dimensionMarksRequestSchema, response: dimensionMarksSchema },
  [invokeChannels.designProbeParameter]: { request: parameterProbeSchema, response: actionPreviewSchema },
  [invokeChannels.designParameters]: { request: none, response: designParametersSchema },
  [invokeChannels.chatLoad]: { request: none, response: storedChatSchema.nullable() },
  [invokeChannels.chatSave]: { request: chatSaveSchema, response: none },
  [invokeChannels.designVisibility]: { request: visibilityCommandSchema, response: none },
  [invokeChannels.notesCurrent]: { request: none, response: notesStateSchema },
  [invokeChannels.notesAdd]: { request: noteAddSchema, response: none },
  [invokeChannels.notesEdit]: { request: noteEditSchema, response: none },
  [invokeChannels.notesDelete]: { request: noteIdRequestSchema, response: none },
  [invokeChannels.notesAccept]: { request: noteIdRequestSchema, response: none },
  [invokeChannels.notesReattach]: { request: noteReattachSchema, response: none },
  [invokeChannels.notesRestore]: { request: noteIdRequestSchema, response: none },
  [invokeChannels.notesDismiss]: { request: noteIdRequestSchema, response: none },
  [invokeChannels.printSettings]: { request: none, response: printSettingsSchema },
  [invokeChannels.printSaveSettings]: { request: printSettingsSchema, response: printSettingsSchema },
  [invokeChannels.printPart]: { request: none, response: partPrintSchema },
  [invokeChannels.printSetMaterial]: { request: partMaterialRequestSchema, response: partPrintSchema },
  [invokeChannels.printReportCheck]: { request: printCheckReportSchema, response: none },
  [invokeChannels.printSetOrientation]: { request: printOrientationSchema, response: partPrintSchema },
  [invokeChannels.printPreviewFix]: { request: printFixSchema, response: actionPreviewSchema },
  [invokeChannels.printApplyFix]: { request: printFixSchema, response: none },
  [invokeChannels.printSetLoads]: { request: partLoadsRequestSchema, response: partPrintSchema },
  [invokeChannels.printMeasurements]: { request: none, response: measurementsSchema },
  [invokeChannels.printAddMeasurement]: { request: measurementAddSchema, response: measurementsSchema },
  [invokeChannels.printRemoveMeasurement]: { request: measurementIdSchema, response: measurementsSchema },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

export const eventContract = {
  [eventChannels.solidcraftStatus]: connectionStatusSchema,
  [eventChannels.mirrorRevision]: mirrorRevisionSchema,
  [eventChannels.agentStatus]: assistantStateSchema,
  [eventChannels.agentEvent]: agentEventSchema,
  [eventChannels.notesChanged]: notesStateSchema,
  [eventChannels.printChanged]: partPrintSchema,
} as const satisfies Record<EventChannel, z.ZodType>;

export type FaceTableMessage = z.infer<typeof faceTableSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type MirroredBody = z.infer<typeof mirroredBodySchema>;
export type MirroredSketch = z.infer<typeof mirroredSketchSchema>;
export type MirrorRevision = z.infer<typeof mirrorRevisionSchema>;
export type AppInfo = z.infer<typeof appInfoSchema>;
export type EngineInfo = z.infer<typeof engineInfoSchema>;
export type EngineChoiceError = z.infer<typeof engineChoiceErrorSchema>;
export type EngineChoiceResult = z.infer<typeof engineChoiceResultSchema>;
export type AgentKind = z.infer<typeof agentKindSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AssistantState = z.infer<typeof assistantStateSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type FaceSelection = z.infer<typeof faceSelectionSchema>;
export type EdgeSelection = z.infer<typeof edgeSelectionSchema>;
export type Selection = z.infer<typeof selectionSchema>;
export type StoredChatItem = z.infer<typeof storedChatItemSchema>;
export type StoredChat = z.infer<typeof storedChatSchema>;
export type WorkStep = z.infer<typeof workStepSchema>;
export type AgentQuestion = z.infer<typeof agentQuestionSchema>;
export type MessageAnswer = z.infer<typeof messageAnswerSchema>;
export type WorkStepState = z.infer<typeof workStepStateSchema>;
export type ViewState = z.infer<typeof viewStateSchema>;
export type TitleBarColors = z.infer<typeof titleBarColorsSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type PrinterProfile = z.infer<typeof printerProfileSchema>;
export type MaterialProfile = z.infer<typeof materialProfileSchema>;
export type FitKind = z.infer<typeof fitKindSchema>;
export type PrintSettings = z.infer<typeof printSettingsSchema>;
export type PartPrint = z.infer<typeof partPrintSchema>;
export type PrintCheckReport = z.infer<typeof printCheckReportSchema>;
export type PrintOrientation = z.infer<typeof printOrientationSchema>;
export type PrintFix = z.infer<typeof printFixSchema>;
export type LoadPlaces = z.infer<typeof loadPlacesSchema>;
export type Measurement = z.infer<typeof measurementSchema>;
export type StoredMeasurement = z.infer<typeof storedMeasurementSchema>;
export type DesignParameter = z.infer<typeof designParameterSchema>;
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
export type NoteView = z.infer<typeof noteViewSchema>;
export type Drawing = z.infer<typeof drawingSchema>;
export type DimensionMark = z.infer<typeof dimensionMarkSchema>;
export type NotesState = z.infer<typeof notesStateSchema>;

export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['response']>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;
