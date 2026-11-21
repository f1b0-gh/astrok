import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '@astrokjs/okf';
const read = (metadata, now = '2026-11-20T12:00:00Z') => {
  assert.equal(typeof api.readMetadata, 'function', 'export the OKF 0.3 metadata consumer');
  return api.readMetadata(metadata, { now: new Date(now) });
};

test('singleton families preserve nested extensions and do not split tags', () => {
  const metadata = {
    tags: 'finance, reviewed',
    sources: { resource: '/a.md', 'x-signal': { n: 2 } },
    parameters: { name: 'year', type: 'integer', 'x-extra': true },
    verified: { by: 'human:fabien', at: '2026-11-20' },
  };
  const before = structuredClone(metadata);
  const result = read(metadata);
  assert.deepEqual(result.tags, ['finance, reviewed']);
  assert.deepEqual(result.sources, [metadata.sources]);
  assert.deepEqual(result.parameters, [metadata.parameters]);
  assert.equal(result.trustTier, 'human-reviewed');
  assert.deepEqual(metadata, before);
});

test('only current verification events confer trust and team actors remain non-human', () => {
  const generated = { by: 'tool/1', at: '2026-11-19T10:00:00Z' };
  const past = { by: 'human:fabien', at: '2026-11-18' };
  const current = { by: 'team:docs', at: '2026-11-19T11:00:00+01:00' };
  assert.equal(read({ generated, verified: [past] }).trustTier, 'unverified');
  assert.equal(read({ generated, verified: [past, current] }).trustTier, 'machine-confirmed');
  assert.equal(
    read({ generated, verified: { ...current, by: 'human:fabien' } }).trustTier,
    'human-reviewed',
  );
  assert.equal(
    read({ generated, verified: { by: 'human:', at: current.at } }).trustTier,
    'unverified',
  );
  assert.equal(read({ generated: { by: 'tool/1' }, verified: current }).trustTier, 'unverified');
});

test('freshness uses the deadline, rejects malformed timestamps and treats unknown status conservatively', () => {
  assert.equal(read({}).freshness, 'unspecified');
  for (const value of [null, '', []])
    assert.equal(read({ stale_after: value }).freshness, 'unspecified');
  assert.equal(read({ stale_after: '2026-11-20' }).freshness, 'stale');
  assert.equal(read({ stale_after: '2026-11-20T12:00:01Z' }).freshness, 'fresh');
  for (const value of [
    'tomorrow',
    '2026-02-30',
    '2026-11-20T25:00:00Z',
    '2026-11-20T12:00:00',
    42,
  ]) {
    const result = read({ stale_after: value });
    assert.equal(result.freshness, 'malformed', String(value));
    assert.ok(result.warnings.length);
  }
  assert.equal(read({ stale_after: new Date('2026-11-21') }).freshness, 'fresh');
  assert.equal(read({ status: 'future-status' }).status, 'future-status');
  assert.equal(read({ status: 'future-status' }).current, false);
  assert.equal(read({}).current, true);
  assert.equal(read({ status: 'deprecated' }).current, false);
});

test('incomplete optional families warn without discarding unknown metadata or rejecting concepts', () => {
  const result = read({
    sources: [{ title: 'missing resource' }],
    verified: [{ by: 'human:fabien' }],
    generated: { at: 'bad' },
    parameters: [{ name: 'only-name' }],
    'x-future': { arbitrary: true },
  });
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.parameters, []);
  assert.equal(result.trustTier, 'unverified');
  assert.ok(result.warnings.length >= 4);
});

test('opaque actor IDs do not discard the generation timestamp or promote old reviews', () => {
  const generated = { by: 'human:Jane Doe', at: '2026-11-20' };
  assert.equal(
    read({ generated, verified: { by: 'human:reviewer', at: '2026-11-19' } }).trustTier,
    'unverified',
  );
  assert.equal(
    read({ verified: { by: 'human:Jane Doe', at: '2026-11-20' } }).trustTier,
    'human-reviewed',
  );
});
