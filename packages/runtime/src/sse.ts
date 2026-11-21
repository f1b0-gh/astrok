/** Datastar-compatible subset adapted from soc-proto/apps/web/src/shared-signals.ts. */
import { validatePatch } from './state.js';
import type { SignalPatch } from './state.js';

const elementModes = [
  'outer',
  'inner',
  'replace',
  'prepend',
  'append',
  'before',
  'after',
  'remove',
] as const;
export interface ElementPatch {
  elements: string;
  selector?: string | undefined;
  mode?: (typeof elementModes)[number] | undefined;
}

// Transport parsing supplies strings; only the mode needs narrowing here.
function decodeElements(input: {
  elements: string;
  selector?: string | undefined;
  mode?: string;
}): ElementPatch {
  const mode = input.mode;
  if (mode === undefined)
    return {
      elements: input.elements,
      ...(input.selector === undefined ? {} : { selector: input.selector }),
    };
  const supported = elementModes.find((candidate) => candidate === mode);
  if (!supported) throw new Error(`Unsupported element patch mode: ${mode}`);
  return { ...input, mode: supported };
}
export interface PatchHandlers {
  signals(patch: SignalPatch, onlyIfMissing: boolean): void;
  elements?(patch: ElementPatch): void;
}
export interface PatchOptions {
  maxEventBytes?: number;
  maxDepth?: number;
}

async function readText(
  response: Response,
  signal: AbortSignal,
  limit: number,
): Promise<string | undefined> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let result = '';
  let count = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) return undefined;
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) break;
      count += value.byteLength;
      if (count > limit) throw new Error('Patch body byte limit exceeded');
      result += decoder.decode(value, { stream: true });
    }
    return signal.aborted ? undefined : result + decoder.decode();
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Incremental, byte-bounded parser. Cancellation suppresses handlers and cancels the reader. */
export async function readPatches(
  response: Response,
  signal: AbortSignal,
  handlers: PatchHandlers,
  options: PatchOptions = {},
): Promise<void> {
  if (!response.ok) throw new Error(`Patch request failed (${response.status})`);
  if (signal.aborted) {
    await response.body?.cancel().catch(() => {});
    return;
  }
  const limit = options.maxEventBytes ?? 1_048_576;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid event byte limit');
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType === 'application/json') {
    const text = await readText(response, signal, limit);
    if (text === undefined) return;
    const input: unknown = JSON.parse(text);
    if (!signal.aborted)
      handlers.signals(
        validatePatch(input, options.maxDepth),
        response.headers.get('datastar-only-if-missing') === 'true',
      );
    return;
  }
  if (contentType === 'text/html' && handlers.elements) {
    const elements = await readText(response, signal, limit);
    if (elements === undefined) return;
    const selector = response.headers.get('datastar-selector');
    const mode = response.headers.get('datastar-mode');
    const patch = decodeElements({
      elements,
      ...(selector === null ? {} : { selector }),
      ...(mode === null ? {} : { mode }),
    });
    if (!signal.aborted) handlers.elements(patch);
    return;
  }
  if (contentType !== 'text/event-stream' || !response.body)
    throw new Error('Expected a patch event stream content type');
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  let event = '';
  let data: string[] = [];
  let lineBytes: number[] = [];
  let eventBytes = 0;
  let pendingCR = false;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function line(text: string): void {
    if (!text) {
      if (event === 'datastar-patch-signals') {
        const fragments = data
          .filter((row) => row.startsWith('signals '))
          .map((row) => row.slice(8));
        if (!fragments.length) throw new Error('Signal patch is missing its signals field');
        const input: unknown = JSON.parse(fragments.join('\n'));
        const patch = validatePatch(input, options.maxDepth);
        if (!signal.aborted) handlers.signals(patch, data.includes('onlyIfMissing true'));
      } else if (event === 'datastar-patch-elements') {
        if (!handlers.elements) throw new Error('No element patch handler registered');
        const fields: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
        for (const row of data) {
          const i = row.indexOf(' ');
          if (i >= 0) (fields[row.slice(0, i)] ??= []).push(row.slice(i + 1));
        }
        if (!fields.elements) throw new Error('Element patch is missing its elements field');
        const patch = decodeElements({
          elements: fields.elements.join('\n'),
          ...(fields.selector ? { selector: fields.selector.join('\n') } : {}),
          ...(fields.mode ? { mode: fields.mode.join('\n') } : {}),
        });
        if (!signal.aborted) handlers.elements(patch);
      } else if (event.startsWith('datastar-')) throw new Error(`Unsupported event: ${event}`);
      event = '';
      data = [];
      eventBytes = 0;
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) break;
      for (const byte of value) {
        if (signal.aborted) break;
        if (pendingCR) {
          pendingCR = false;
          if (byte === 10) {
            if (++eventBytes > limit) throw new Error('Patch event byte limit exceeded');
            line(decoder.decode(new Uint8Array(lineBytes)));
            lineBytes = [];
            continue;
          }
          line(decoder.decode(new Uint8Array(lineBytes)));
          lineBytes = [];
        }
        if (++eventBytes > limit) throw new Error('Patch event byte limit exceeded');
        if (byte === 13) pendingCR = true;
        else if (byte === 10) {
          line(decoder.decode(new Uint8Array(lineBytes)));
          lineBytes = [];
        } else lineBytes.push(byte);
      }
    }
    if (!signal.aborted && pendingCR) {
      line(decoder.decode(new Uint8Array(lineBytes)));
      lineBytes = [];
    }
    if (!signal.aborted && (lineBytes.length || event || data.length))
      throw new Error('Incomplete patch event stream');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
