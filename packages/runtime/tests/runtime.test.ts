import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, createRoot } from 'solid-js';
import { z } from 'zod';
import { createFieldState, createSharedState } from '../dist/state.js';
import { createLatestRequest } from '../dist/request.js';
import { readPatches } from '../dist/sse.js';

test('merge patches work before mount, preserve missing branches, replace arrays and delete nulls', () => {
  const a = createSharedState(
    { nested: { keep: 1, remove: 2 }, list: [1], scalar: 'yes' },
    z.looseObject({
      nested: z.looseObject({ keep: z.number(), remove: z.number() }),
      list: z.array(z.number()),
      scalar: z.string().optional(),
    }).parse,
  );
  const b = createSharedState(
    { nested: { keep: 9 } },
    z.object({ nested: z.object({ keep: z.number() }) }).parse,
  );
  a.patch({ nested: { keep: 2, add: 3 }, list: [2, 3], scalar: null });
  flush();
  assert.equal(a.state.nested.keep, 2);
  assert.equal(a.state.nested.remove, 2);
  assert.equal(JSON.stringify(a.state.list), '[2,3]');
  assert.equal('scalar' in a.state, false);
  a.patch({ nested: { keep: 8, missing: 4 }, list: [8] }, true);
  flush();
  assert.equal(a.state.nested.keep, 2);
  assert.equal(JSON.stringify(a.state.list), '[2,3]');
  assert.equal((a.state.nested as Record<string, number>).missing, 4);
  assert.equal(b.state.nested.keep, 9);
  a.update((s) => {
    s.nested.keep = 5;
  });
  flush();
  assert.equal(a.state.nested.keep, 5);
  a.dispose();
  a.dispose();
  assert.throws(() => a.patch({ nested: { keep: 100 } }), /disposed/i);
  b.dispose();
});

test('unsafe keys and excessive depth are rejected atomically even in arrays', () => {
  const shared = createSharedState({ safe: 1 }, z.object({ safe: z.number() }).parse);
  assert.throws(
    () =>
      shared.patch(
        JSON.parse('{"safe":2,"rows":[{"constructor":{"prototype":{"polluted":true}}}]}'),
      ),
    /unsafe/i,
  );
  assert.equal(shared.state.safe, 1);
  let deep: unknown = {};
  for (let i = 0; i < 70; i++) deep = { child: deep };
  assert.throws(() => shared.patch(deep), /depth/i);
  shared.dispose();
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test('request construction leaves caller state untouched inside a Solid owner', () => {
  createRoot((dispose) => {
    const request = createLatestRequest({
      request: async () => Response.json(1),
      decode: (v: unknown) => v,
      publish: () => assert.fail('construction must not publish into an owned render scope'),
    });
    request.dispose();
    dispose();
  });
});
test('latest requests ignore obsolete completions even when transport ignores abort', async () => {
  const one = deferred<Response>(),
    two = deferred<Response>();
  const states: unknown[] = [];
  const request = createLatestRequest({
    request: (input: string) => (input === 'one' ? one.promise : two.promise),
    decode: (value: unknown) => {
      if (typeof value !== 'number') throw Error('Expected number');
      return value;
    },
    publish: (s) => states.push(s),
  });
  const first = request.run('one');
  const second = request.run('two');
  two.resolve(Response.json(2));
  await second;
  one.resolve(Response.json(1));
  await first;
  assert.deepEqual(states.at(-1), { status: 'success', data: 2 });
  const length = states.length;
  request.dispose();
  assert.equal(states.length, length);
  await assert.rejects(() => request.run('three'), /disposed/i);
});
test('cancel invalidates pending body, aborts signal and malformed responses publish errors', async () => {
  const body = deferred<unknown>();
  let signal: AbortSignal | undefined;
  const states: unknown[] = [];
  const request = createLatestRequest({
    request: async (_: string, s: AbortSignal) => {
      signal = s;
      return { ok: true, json: () => body.promise } as Response;
    },
    decode: (v: unknown) => v,
    publish: (s) => states.push(s),
  });
  const run = request.run('x');
  await Promise.resolve();
  request.cancel();
  body.resolve({ stale: true });
  await run;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(states.at(-1), { status: 'idle' });
  const invalid = createLatestRequest({
    request: async () => new Response('{bad', { headers: { 'content-type': 'application/json' } }),
    decode: (v: unknown) => v,
    publish: (s) => states.push(s),
  });
  await invalid.run('x');
  assert.equal((states.at(-1) as { status: string }).status, 'error');
  request.dispose();
  invalid.dispose();
});

function stream(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const bytes = (s: string) => new TextEncoder().encode(s);
test('SSE decodes split UTF-8/CRLF, comments, multi-data and element patches', async () => {
  const wire = bytes(
    ': comment\r\nevent: datastar-patch-signals\r\ndata: signals {"name":"é",\r\ndata: signals "count":2}\r\n\r\nevent: datastar-patch-elements\ndata: selector #out\ndata: elements <p>ok</p>\n\n',
  );
  const signals: unknown[] = [];
  const elements: unknown[] = [];
  await readPatches(
    stream([...wire].map((b) => new Uint8Array([b]))),
    new AbortController().signal,
    { signals: (p, m) => signals.push([p, m]), elements: (p) => elements.push(p) },
  );
  assert.deepEqual(signals, [[{ name: 'é', count: 2 }, false]]);
  assert.deepEqual(elements, [{ elements: '<p>ok</p>', selector: '#out' }]);
});
test('event byte bounds cover all data lines and partial UTF-8 bytes', async () => {
  const controller = new AbortController();
  const handlers = { signals: () => assert.fail('oversized patch applied') };
  await assert.rejects(
    () =>
      readPatches(
        stream([
          bytes('event: datastar-patch-signals\n'),
          bytes('data: signals {"x":"'),
          bytes('é'.repeat(30)),
          bytes('"}\n\n'),
        ]),
        controller.signal,
        handlers,
        { maxEventBytes: 75 },
      ),
    /limit/i,
  );
  await assert.rejects(
    () =>
      readPatches(
        stream(Array.from({ length: 20 }, () => new Uint8Array([0xc3]))),
        controller.signal,
        handlers,
        { maxEventBytes: 10 },
      ),
    /limit/i,
  );
});
test('malformed, unfinished, unsafe and unsupported transport input fails before mutation', async () => {
  const handlers = { signals: () => assert.fail('invalid patch applied') };
  const signal = new AbortController().signal;
  for (const wire of [
    'event: datastar-patch-signals\ndata: signals {}\n',
    'event: datastar-patch-signals\ndata: signals {broken}\n\n',
    'event: datastar-patch-signals\ndata: signals {"x":[{"__proto__":{}}]}\n\n',
  ])
    await assert.rejects(() => readPatches(stream([bytes(wire)]), signal, handlers));
  await assert.rejects(
    () => readPatches(new Response('oops', { status: 503 }), signal, handlers),
    /503/,
  );
  await assert.rejects(
    () => readPatches(new Response('plain'), signal, handlers),
    /content|stream/i,
  );
});
test('stream abort cancels reader', async () => {
  const controller = new AbortController();
  let canceled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        canceled = true;
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  const promise = readPatches(response, controller.signal, {
    signals: () => assert.fail('aborted'),
  });
  controller.abort();
  await promise;
  assert.equal(canceled, true);
});

test('CRLF delimiter bytes count toward event bound before applying a patch', async () => {
  const wire = bytes('event: datastar-patch-signals\r\ndata: signals {}\r\n\r\n');
  let count = 0;
  await assert.rejects(
    () =>
      readPatches(
        stream([wire]),
        new AbortController().signal,
        { signals: () => count++ },
        { maxEventBytes: wire.byteLength - 1 },
      ),
    /limit/,
  );
  assert.equal(count, 0);
  await readPatches(
    stream([wire]),
    new AbortController().signal,
    { signals: () => count++ },
    { maxEventBytes: wire.byteLength },
  );
  assert.equal(count, 1);
});

test('JSON patch bodies are byte bounded and abort cancels their reader', async () => {
  await assert.rejects(
    () =>
      readPatches(
        Response.json({ text: 'a'.repeat(100) }),
        new AbortController().signal,
        { signals: () => assert.fail('oversized JSON applied') },
        { maxEventBytes: 20 },
      ),
    /limit/,
  );
  let canceled = false;
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        bodyController = c;
        c.enqueue(bytes('{"x":'));
      },
      cancel() {
        canceled = true;
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
  const controller = new AbortController();
  const reading = readPatches(response, controller.signal, {
    signals: () => assert.fail('canceled JSON applied'),
  });
  controller.abort();
  await Promise.resolve();
  if (!canceled) {
    bodyController.enqueue(bytes('1}'));
    bodyController.close();
  }
  await reading;
  assert.equal(canceled, true);
});

test('request snapshots resist caller mutation and decoder failures publish recoverable errors', async () => {
  const received = deferred<Response>();
  const states: unknown[] = [];
  let snapshot: { key: string } | undefined;
  const controller = createLatestRequest({
    request: async (input: { key: string }) => {
      snapshot = input;
      return received.promise;
    },
    decode: (value: unknown) => {
      if (typeof value !== 'number') throw Error('Expected numeric result');
      return value;
    },
    publish: (s) => states.push(s),
  });
  const input = { key: 'original' };
  const run = controller.run(input);
  input.key = 'changed';
  assert.equal(snapshot?.key, 'original');
  received.resolve(Response.json({ bad: true }));
  await run;
  assert.deepEqual(states.at(-1), { status: 'error', error: 'Expected numeric result' });
  controller.dispose();
});

test('caller-owned initial objects are isolated from reactive writes', () => {
  const initial = { nested: { value: 1 } };
  const first = createSharedState(
    initial,
    z.object({ nested: z.object({ value: z.number() }) }).parse,
  );
  const second = createSharedState(
    initial,
    z.object({ nested: z.object({ value: z.number() }) }).parse,
  );
  first.update((s) => {
    s.nested.value = 2;
  });
  flush();
  assert.equal(initial.nested.value, 1);
  assert.equal(second.state.nested.value, 1);
  first.dispose();
  second.dispose();
});

test('Solid owner cleanup disposes shared state and outstanding request ownership', async () => {
  const response = deferred<Response>();
  let signal: AbortSignal | undefined;
  const states: unknown[] = [];
  const owned = createRoot((dispose) => {
    const shared = createSharedState({ count: 0 }, z.object({ count: z.number() }).parse);
    const request = createLatestRequest({
      request: async (_: string, s: AbortSignal) => {
        signal = s;
        return response.promise;
      },
      decode: (v: unknown) => v,
      publish: (s) => states.push(s),
    });
    return { dispose, shared, request, pending: request.run('x') };
  });
  const before = states.length;
  owned.dispose();
  assert.equal(signal?.aborted, true);
  response.resolve(Response.json({ count: 1 }));
  await owned.pending;
  assert.equal(states.length, before);
  assert.throws(
    () =>
      owned.shared.update((s) => {
        s.count = 2;
      }),
    /disposed/,
  );
  await assert.rejects(() => owned.request.run('new'), /disposed/);
});

test('state decoder rejects invalid merged state atomically and preserves sequential writes', () => {
  const schema = z.looseObject({
    profile: z.object({ name: z.string() }),
    a: z.number(),
    b: z.number(),
  });
  const shared = createSharedState({ profile: { name: 'original' }, a: 0, b: 0 }, schema.parse);
  assert.throws(() => shared.patch({ a: 9, profile: null }));
  assert.throws(() => shared.patch({ profile: { name: 42 } }));
  flush();
  assert.equal(shared.state.a, 0);
  assert.equal(shared.state.profile.name, 'original');
  shared.patch({ a: 1 });
  shared.patch({ b: 2 });
  flush();
  assert.equal(shared.state.a, 1);
  assert.equal(shared.state.b, 2);
  assert.throws(() =>
    shared.update((draft) => {
      draft.a = 8;
      draft.profile.name = 42 as unknown as string;
    }),
  );
  flush();
  assert.equal(shared.state.a, 1);
  shared.dispose();
});

test('decoder output controls initial and patched state', () => {
  const decode = z.object({ name: z.string().trim() }).parse;
  const shared = createSharedState({ name: ' first ' }, decode);
  assert.equal(shared.state.name, 'first');
  shared.patch({ name: ' second ' });
  flush();
  assert.equal(shared.state.name, 'second');
  shared.dispose();
});

test('HTML and SSE element modes are decoded without accepting unsupported values', async () => {
  for (const mode of [
    'outer',
    'inner',
    'replace',
    'prepend',
    'append',
    'before',
    'after',
    'remove',
    'invalid',
    '',
  ]) {
    for (const contentType of ['text/html', 'text/event-stream']) {
      const seen: unknown[] = [];
      const response = new Response(
        contentType === 'text/html'
          ? '<p>ok</p>'
          : `event: datastar-patch-elements\ndata: elements <p>ok</p>\ndata: selector #out\ndata: mode ${mode}\n\n`,
        {
          headers: {
            'content-type': contentType,
            'datastar-selector': '#out',
            'datastar-mode': mode,
          },
        },
      );
      const read = readPatches(response, new AbortController().signal, {
        signals: () => {},
        elements: (patch) => {
          seen.push(patch);
        },
      });
      if (mode === 'invalid' || mode === '') {
        await assert.rejects(read, /Unsupported element patch mode/);
        assert.deepEqual(seen, []);
      } else {
        await read;
        assert.deepEqual(seen, [{ elements: '<p>ok</p>', selector: '#out', mode }]);
      }
    }
  }
});

test('field writes copy and decode only the selected branch', () => {
  let rowsDecodes = 0;
  const shared = createFieldState(
    { note: '', rows: Array.from({ length: 2000 }, (_, id) => ({ id })) },
    {
      note: (input) => String(input),
      rows: (input) => {
        rowsDecodes++;
        return input as { id: number }[];
      },
    },
  );
  const originalClone = globalThis.structuredClone;
  const cloned: unknown[] = [];
  globalThis.structuredClone = ((value: unknown) => {
    cloned.push(value);
    return originalClone(value);
  }) as typeof structuredClone;
  try {
    const rows = shared.state.rows;
    for (let i = 0; i < 20; i++) shared.updateField('note', (note) => note + '.');
    flush();
    assert.equal(shared.state.note.length, 20);
    assert.equal(shared.state.rows, rows);
    assert.equal(rowsDecodes, 1);
    assert.ok(cloned.length > 0);
    assert.ok(
      cloned.every((value) => typeof value === 'string'),
      'only the scalar field may be cloned',
    );
  } finally {
    globalThis.structuredClone = originalClone;
    shared.dispose();
  }
});

test('field state keeps mixed batched updates atomic and isolates decoder outputs', () => {
  const transformed = { value: 0 };
  const shared = createFieldState(
    { count: 0, nested: { value: 0 } },
    {
      count: (input) => {
        if (typeof input !== 'number' || input < 0) throw new Error('Nonnegative count required');
        return input;
      },
      nested: (input) => {
        transformed.value = (input as { value: number }).value;
        return transformed;
      },
    },
  );
  try {
    shared.updateField('count', (n) => n + 1);
    shared.update((state) => {
      state.count++;
    });
    shared.updateField('count', (n) => n + 1);
    shared.patch({ nested: { value: 4 } });
    shared.updateField('nested', (value) => {
      value.value++;
      return value;
    });
    transformed.value = 99;
    assert.throws(() => shared.updateField('count', () => -1), /Nonnegative/);
    assert.throws(
      () =>
        shared.update((state) => {
          state.nested.value = 8;
          state.count = -1;
        }),
      /Nonnegative/,
    );
    flush();
    assert.equal(shared.state.count, 3);
    assert.equal(shared.state.nested.value, 5);
    assert.throws(() => shared.updateField('count', () => NaN), /finite/);
    assert.throws(() => shared.updateField('nested', () => ({ value: Infinity })), /finite/);
    assert.throws(() => shared.patch({ count: null }), /Missing state field/);
    assert.throws(() => shared.patch({ unknown: 1 }), /Unknown state field/);
    assert.throws(() => shared.patch({ unknown: null }), /Unknown state field/);
    assert.throws(() => shared.patch({ unknown: null }, true), /Unknown state field/);
    assert.throws(
      () => shared.updateField('unknown' as never, () => 1 as never),
      /Unknown state field/,
    );
    flush();
    assert.equal(shared.state.count, 3);
    assert.equal(shared.state.nested.value, 5);
  } finally {
    shared.dispose();
  }
  assert.throws(() => shared.updateField('count', () => 0), /disposed/);
});

test('field decoder definitions are snapshotted and outputs remain JSON-safe', () => {
  const decoders = { value: (input: unknown) => Number(input) };
  const shared = createFieldState({ value: 1 }, decoders);
  decoders.value = () => NaN;
  try {
    shared.updateField('value', () => 2);
    flush();
    assert.equal(shared.state.value, 2);
    assert.throws(() => createFieldState({ value: 1 }, decoders), /finite/);
    assert.throws(
      () => createFieldState({ value: 1 }, { value: 'bad' } as never),
      /Invalid field decoder/,
    );
    assert.throws(() => createFieldState({ value: 1 }, {} as never), /Unknown state field/);
  } finally {
    shared.dispose();
  }
});
