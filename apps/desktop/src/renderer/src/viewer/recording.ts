import type { VideoSave } from '../../../shared/contract';

/** What the view is recorded as, best first: MP4 plays everywhere, WebM in every browser and where no H.264 encoder is. */
const TYPES: [string, VideoSave['format']][] = [
  ['video/mp4;codecs=avc1', 'mp4'],
  ['video/webm;codecs=vp8', 'webm'],
  ['video/webm', 'webm'],
];

/** How often the recorder is asked for what it has once the time is up, and how long at most (ms). */
const DRAIN = { every: 250, atMost: 10_000 };
/** A file smaller than this holds a header and no picture (bytes). */
const NO_PICTURE = 2000;
/** The longer side of the video at most (pixels): a 4K window at double density is more than encoders take. */
const MAX_SIDE = 1920;

/** Why a recording gave no video; the panel words it for the user. */
export type RecordingFault = 'unsupported' | 'empty' | 'failed';

export interface Recording {
  /** The video once the time is up or `stop` was called; null when it was cancelled. Rejects with a `RecordingFault` as its message. */
  done: Promise<VideoSave | null>;
  stop(): void;
  cancel(): void;
}

/** Takes each picture the view draws while a recording runs. */
let tap: ((view: HTMLCanvasElement) => void) | null = null;

/** The view calls this right after it drew a frame, while the picture is still in its canvas. */
export function frameDrawn(view: HTMLCanvasElement): void {
  tap?.(view);
}

const recordedAs = () => (typeof MediaRecorder === 'function' ? TYPES.find(([type]) => MediaRecorder.isTypeSupported(type)) : undefined);

/** Whether this system records the view at all; asked before a playback is started for a recording. */
export function canRecord(): boolean {
  return recordedAs() !== undefined && tap === null;
}

/**
 * Records what the view draws for `ms` milliseconds with the browser's own recorder (canvas capture
 * and MediaRecorder): no encoder of our own, and the picture is the 3D view without the tools over
 * it. Each frame is copied to a canvas of its own the moment it is drawn and handed to the recorder:
 * the WebGL canvas loses its picture once the frame is shown. The video keeps the size the view had
 * at the start; a view resized while it records is fitted into it.
 */
export function recordView(view: HTMLCanvasElement, ms: number): Recording {
  const [mimeType, format] = recordedAs() ?? [];
  const copy = document.createElement('canvas');
  const scale = Math.min(1, MAX_SIDE / Math.max(view.width, view.height, 1));
  // Encoders want even sizes.
  copy.width = Math.max(2, Math.floor((view.width * scale) / 2) * 2);
  copy.height = Math.max(2, Math.floor((view.height * scale) / 2) * 2);
  const context = copy.getContext('2d');
  if (!mimeType || !format || !context || tap) return { done: Promise.reject(new Error('unsupported' satisfies RecordingFault)), stop: () => undefined, cancel: () => undefined };
  const stream = copy.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  const size = () => chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  let cancelled = false;
  let ending = false;
  const stop = () => {
    if (ending || recorder.state === 'inactive') return;
    ending = true;
    // No more frames, then time for the encoder to hand over those it has. On a busy machine without a
    // graphics card it was more than a second behind, and a recorder stopped at once saved a header and
    // no picture (measured 2026-11-10): ask for the data until some has come.
    tap = null;
    const since = performance.now();
    const drain = setInterval(() => {
      if (!cancelled && size() < NO_PICTURE && performance.now() - since < DRAIN.atMost) {
        recorder.requestData();
        return;
      }
      clearInterval(drain);
      recorder.stop();
    }, DRAIN.every);
  };
  const timer = setTimeout(stop, ms);
  const done = new Promise<VideoSave | null>((resolve, reject) => {
    recorder.onerror = () => {
      reject(new Error('failed' satisfies RecordingFault));
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      tap = null;
      clearTimeout(timer);
      for (const each of stream.getTracks()) each.stop();
      if (cancelled) resolve(null);
      // Says that nothing came, instead of saving a file that plays nothing.
      else if (size() < NO_PICTURE) {
        console.warn(`recording: the recorder gave no picture (${mimeType}, ${String(size())} bytes)`);
        reject(new Error('empty' satisfies RecordingFault));
      } else
        void new Blob(chunks).arrayBuffer().then(
          (buffer) => {
            resolve({ bytes: new Uint8Array(buffer), format });
          },
          () => {
            reject(new Error('failed' satisfies RecordingFault));
          },
        );
    };
  });
  tap = (source) => {
    // Fitted into the video's size, in the middle, keeping its proportions.
    const fit = Math.min(copy.width / source.width, copy.height / source.height);
    const [width, height] = [source.width * fit, source.height * fit];
    if (width < copy.width || height < copy.height) context.clearRect(0, 0, copy.width, copy.height);
    context.drawImage(source, (copy.width - width) / 2, (copy.height - height) / 2, width, height);
    track?.requestFrame();
  };
  recorder.start();
  return {
    done,
    stop,
    cancel: () => {
      cancelled = true;
      stop();
    },
  };
}
