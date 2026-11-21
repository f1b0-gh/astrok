/** Generation ownership adapted from ecspect/site/analytics/src/selection.mjs. */
import { getOwner, onCleanup } from 'solid-js';

export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
export interface LatestRequestOptions<T, I> {
  request(snapshot: I, signal: AbortSignal): Promise<Response>;
  decode(input: unknown): T;
  publish(state: RequestState<T>): void;
}
export interface LatestRequest<I> {
  run(input: I): Promise<void>;
  cancel(): void;
  dispose(): void;
}
export function createLatestRequest<T, I = string>(
  options: LatestRequestOptions<T, I>,
): LatestRequest<I> {
  let active: AbortController | undefined;
  let disposed = false;
  const current = (controller: AbortController) =>
    !disposed && active === controller && !controller.signal.aborted;
  const cancelActive = () => {
    const previous = active;
    active = undefined;
    previous?.abort();
  };
  const result: LatestRequest<I> = {
    async run(input) {
      if (disposed) throw new Error('Request controller is disposed');
      cancelActive();
      const controller = new AbortController();
      active = controller;
      options.publish({ status: 'pending' });
      try {
        const response = await options.request(structuredClone(input), controller.signal);
        if (!current(controller)) {
          await response.body?.cancel().catch(() => {});
          return;
        }
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const raw: unknown = await response.json();
        if (!current(controller)) return;
        const data = options.decode(raw);
        if (current(controller)) options.publish({ status: 'success', data });
      } catch (error) {
        if (current(controller))
          options.publish({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
      } finally {
        if (active === controller) active = undefined;
      }
    },
    cancel() {
      if (disposed) return;
      cancelActive();
      options.publish({ status: 'idle' });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActive();
    },
  };
  if (getOwner()) onCleanup(result.dispose);
  return result;
}
