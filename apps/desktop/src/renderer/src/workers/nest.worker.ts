/// <reference lib="webworker" />
import { nest, type NestOptions, type NestPart, type NestResult } from '../viewer/nesting';

/** Plate nesting off the UI thread (viewport CAD round): a few parts can take a second or two. */
export interface NestRequest {
  id: number;
  parts: NestPart[];
  options: NestOptions;
}
export type NestResponse = { id: number; ok: true; result: NestResult } | { id: number; ok: false; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<NestRequest>) => {
  const { id, parts, options } = event.data;
  try {
    const response: NestResponse = { id, ok: true, result: nest(parts, options) };
    scope.postMessage(response);
  } catch (error) {
    const response: NestResponse = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
    scope.postMessage(response);
  }
};
