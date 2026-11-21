import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('packaged font CSS uses local WOFF2 assets with retained font licenses', async () => {
  const stylesheet = new URL(import.meta.resolve('@astrokjs/theme/fonts.css'));
  const css = await readFile(stylesheet, 'utf8');
  assert.doesNotMatch(css, /https?:|@import/);
  const files = [...css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map(match => match[1]);
  assert.ok(files.length > 0, 'Font faces must reference bundled files');
  for (const file of files) {
    assert.match(file, /^\.\/fonts\/[^/]+\.woff2$/);
    const bytes = await readFile(new URL(file, stylesheet));
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
  }
  for (const name of ['inter', 'sora', 'jetbrains-mono']) {
    const license = await readFile(new URL(`fonts/${name}-LICENSE.txt`, stylesheet), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE/i);
  }
});
