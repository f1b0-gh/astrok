/** Callbacks are bundled application code; attribute values are registry names. */
export interface HypermediaActions {
  get(url: string): Promise<void>;
  peek(fn: () => unknown): unknown;
}

export interface HypermediaHandler<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Required for data-effect. Watch root keys; [] runs only initially/on patch revision. */
  readonly watch?: readonly (keyof T & string)[];
  run(state: T, actions: HypermediaActions, element: Element, event?: Event): unknown;
}

const blocked = new Set(['__proto__', 'prototype', 'constructor']);
const validName = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/** Internal snapshot: no inherited lookups, dynamic compilation or global registry. */
export function createHandlerRegistry<T extends Record<string, unknown>>(
  definitions: Readonly<Record<string, HypermediaHandler<T>>> = {},
): (name: string) => HypermediaHandler<T> {
  const handlers = new Map<string, HypermediaHandler<T>>();
  for (const [name, handler] of Object.entries(definitions)) {
    if (!validName.test(name) || blocked.has(name))
      throw new Error(`Invalid hypermedia handler name: ${name}`);
    if (!handler || typeof handler.run !== 'function')
      throw new Error(`Invalid hypermedia handler: ${name} requires a run callback`);
    if (
      handler.watch !== undefined &&
      (!Array.isArray(handler.watch) ||
        handler.watch.some((key) => typeof key !== 'string' || !key || blocked.has(key)))
    )
      throw new Error(`Invalid hypermedia handler: ${name} has invalid watch keys`);
    handlers.set(
      name,
      Object.freeze({
        run: handler.run,
        ...(handler.watch === undefined ? {} : { watch: Object.freeze([...handler.watch]) }),
      }),
    );
  }
  return (name) => {
    const handler = handlers.get(name.trim());
    if (!handler)
      throw new Error(
        `Unknown hypermedia handler: ${name}. Register it in handlers; JavaScript attributes are not supported.`,
      );
    return handler;
  };
}
