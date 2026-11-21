import assert from 'node:assert/strict';
import test from 'node:test';
import { readPatches } from '../dist/sse.js';

const encode = (text: string) => new TextEncoder().encode(text);
const signal = () => new AbortController().signal;
const rejectPatch = { signals: () => assert.fail('invalid patch dispatched') };

function stream(chunks: Iterable<Uint8Array>, close = true) {
  const iterator = chunks[Symbol.iterator]();
  let canceled = 0;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = iterator.next();
        if (!next.done) controller.enqueue(next.value);
        else if (close) controller.close();
      },
      cancel() {
        canceled++;
        iterator.return?.();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  return { response, cancellations: () => canceled };
}

function* fragments(wire: Uint8Array, size: number) {
  for (let offset = 0; offset < wire.length; offset += size)
    yield wire.subarray(offset, offset + size);
}

test('SSE accepts a near-1MiB data line in one chunk and thousands of fragments', async () => {
  const value = 'x'.repeat(1_048_500);
  const wire = encode(`event: datastar-patch-signals\ndata: signals {"value":"${value}"}\n\n`);
  for (const size of [wire.length, 31]) {
    const input = stream(fragments(wire, size));
    const seen: unknown[] = [];
    await readPatches(input.response, signal(), { signals: (patch) => seen.push(patch) });
    assert.deepEqual(seen, [{ value }]);
    assert.equal(input.response.body?.locked, false);
  }
});

test('SSE parses a chunk with hundreds of thousands of short comment lines', async () => {
  const wire = encode(
    ':\n'.repeat(200_000) + 'event: datastar-patch-signals\ndata: signals {"ok":true}\n\n',
  );
  const seen: unknown[] = [];
  await readPatches(stream([wire]).response, signal(), { signals: (patch) => seen.push(patch) });
  assert.deepEqual(seen, [{ ok: true }]);
});

test('SSE handles every chunk boundary in mixed CR, LF, CRLF and multibyte UTF-8', async () => {
  const wire = encode(
    ': comment\revent: datastar-patch-signals\r\ndata: signals {"text":"é🪐"}\n\r\nevent: datastar-patch-signals\ndata: signals {"second":true}\r\r',
  );
  for (let split = 0; split <= wire.length; split++) {
    const seen: unknown[] = [];
    await readPatches(
      stream([wire.subarray(0, split), new Uint8Array(), wire.subarray(split)]).response,
      signal(),
      {
        signals: (patch) => seen.push(patch),
      },
    );
    assert.deepEqual(seen, [{ text: 'é🪐' }, { second: true }], `split ${split}`);
  }
});

test('SSE counts every separator byte before dispatch and resets the exact per-event budget', async () => {
  for (const separator of ['\n', '\r', '\r\n']) {
    const wire = encode(
      `event: datastar-patch-signals${separator}data: signals {"text":"é"}${separator}${separator}`,
    );
    for (const size of [1, wire.length]) {
      const rejected = stream(fragments(wire, size));
      await assert.rejects(
        readPatches(rejected.response, signal(), rejectPatch, { maxEventBytes: wire.length - 1 }),
        /byte limit/,
      );
      assert.equal(rejected.response.body?.locked, false);
      const seen: unknown[] = [];
      await readPatches(
        stream([...fragments(wire, size), ...fragments(wire, size)]).response,
        signal(),
        {
          signals: (patch) => seen.push(patch),
        },
        { maxEventBytes: wire.length },
      );
      assert.deepEqual(seen, [{ text: 'é' }, { text: 'é' }]);
    }
  }
});

test('SSE rejects invalid and truncated UTF-8 at line boundaries', async () => {
  for (const invalid of [[0xc3], [0xc3, 0x28], [0xed, 0xa0, 0x80], [0xff]]) {
    const input = stream([
      encode('event: datastar-patch-signals\ndata: signals {"text":"'),
      ...invalid.map((byte) => new Uint8Array([byte])),
      encode('"}\n\n'),
    ]);
    await assert.rejects(
      readPatches(input.response, signal(), rejectPatch),
      /encoded data|encoding/i,
    );
    assert.equal(input.response.body?.locked, false);
  }
});

test('SSE rejects unfinished lines and events and cancels failed readers', async () => {
  for (const text of [
    ': unfinished',
    'event: datastar-patch-signals\n',
    'event: datastar-patch-signals\ndata: signals {}\r',
  ]) {
    const input = stream([encode(text)]);
    await assert.rejects(readPatches(input.response, signal(), rejectPatch), /Incomplete/);
    assert.equal(input.response.body?.locked, false);
  }
  const oversized = stream([encode('x'.repeat(100))], false);
  await assert.rejects(
    readPatches(oversized.response, signal(), rejectPatch, { maxEventBytes: 99 }),
    /byte limit/,
  );
  assert.equal(oversized.cancellations(), 1);
  assert.equal(oversized.response.body?.locked, false);
});

test('SSE abort during dispatch suppresses the rest of the same chunk and releases the reader', async () => {
  for (const separator of ['\n', '\r', '\r\n']) {
    const controller = new AbortController();
    const input = stream(
      [
        encode(
          `event: datastar-patch-signals${separator}data: signals {}${separator}${separator}event: datastar-unsupported\n\n`,
        ),
      ],
      false,
    );
    let calls = 0;
    await readPatches(input.response, controller.signal, {
      signals() {
        calls++;
        controller.abort();
      },
    });
    assert.equal(calls, 1);
    assert.equal(input.cancellations(), 1);
    assert.equal(input.response.body?.locked, false);
  }
});

test('SSE cancels pre-aborted and pending reads and releases their locks', async () => {
  for (const beforeRead of [true, false]) {
    const controller = new AbortController();
    const input = stream([], false);
    if (beforeRead) controller.abort();
    const reading = readPatches(input.response, controller.signal, rejectPatch);
    if (!beforeRead) controller.abort();
    await reading;
    assert.equal(input.cancellations(), 1);
    assert.equal(input.response.body?.locked, false);
  }
});

test('SSE handler failures cancel and unlock the reader', async () => {
  const input = stream([encode('event: datastar-patch-signals\ndata: signals {}\n\n')], false);
  await assert.rejects(
    readPatches(input.response, signal(), {
      signals() {
        throw new Error('handler failed');
      },
    }),
    /handler failed/,
  );
  assert.equal(input.cancellations(), 1);
  assert.equal(input.response.body?.locked, false);
});
