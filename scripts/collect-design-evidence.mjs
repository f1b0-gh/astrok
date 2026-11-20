import { mkdir, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'harness/design-system');
await mkdir(output, { recursive: true });
const evidence = { format: 'astrok-design-browser-evidence', version: 1, previews: [], screenshots: [] };
for (const directory of ['test-results-astrok/4338', 'test-results']) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(root, directory, entry.name);
    const project = entry.name.endsWith('-mobile') ? 'mobile' : 'desktop';
    for (const file of await readdir(folder)) {
      if (file === 'design-audit.json') evidence.previews.push(JSON.parse(await readFile(path.join(folder, file), 'utf8')));
      if (!/^(preview|starlight)-(dark|light)\.png$/.test(file)) continue;
      const target = `${file.slice(0, -4)}-${project}.png`;
      await copyFile(path.join(folder, file), path.join(output, target));
      evidence.screenshots.push({ path: `harness/design-system/${target}`, sha256: createHash('sha256').update(await readFile(path.join(output, target))).digest('hex') });
    }
  }
}
if (evidence.previews.length !== 4 || evidence.screenshots.length !== 8) throw new Error('Run both full browser suites first: expected four preview audits and eight screenshots');
const receipt = JSON.parse(await readFile(path.join(root, 'harness/astrok-package-verification.json'), 'utf8'));
if (receipt.status !== 'passed' || receipt.designAudits?.length !== 4) throw new Error('Run themed packed-consumer verification first');
evidence.packedConsumer = { base: receipt.base, audits: receipt.designAudits };
await writeFile(path.join(root, 'harness/design-system-browser-audit.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('Retained four preview audits, four packed-consumer audits and eight screenshots.');
