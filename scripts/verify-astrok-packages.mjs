import { mkdtemp, mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(project, 'artifacts/astrok');
const consumer = await mkdtemp(path.join(tmpdir(), 'astrok-consumer-'));
const deploymentBase = process.env.ASTROK_BASE || '/portal/';
const receipt = { node: process.version, consumer, base: deploymentBase, started: new Date().toISOString(), steps: [], status: 'running' };
const receiptPath = path.join(project, 'harness/astrok-package-verification.json');
async function run(command, args, cwd = project, extraEnv = {}) {
  const step = { command: [command, ...args], cwd, status: 'running' };
  receipt.steps.push(step);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ASTROK_BASE: deploymentBase, ...extraEnv } });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  step.status = exit.code === 0 ? 'passed' : 'failed';
  step.exit = exit;
  if (exit.code !== 0) throw new Error(`Failed ${command} ${args.join(' ')} (${JSON.stringify(exit)})`);
}

try {
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await mkdir(artifacts, { recursive: true });
  await run('npm', ['run', 'build:packages']);
  const packages = ['okf', 'astro', 'runtime', 'theme'];
  for (const name of packages) {
    await run('npm', ['pack', `./packages/${name}`, '--ignore-scripts', '--pack-destination', artifacts]);
  }
  for (const name of ['src', 'knowledge', 'astro.config.mjs', 'vite.config.ts', 'tsconfig.json', 'fixture.mjs', 'dev.mjs']) {
    await cp(path.join(project, 'examples/workspace', name), path.join(consumer, name), { recursive: true });
  }
  await mkdir(path.join(consumer, 'vendor'));
  const manifest = JSON.parse(await readFile(path.join(project, 'examples/workspace/package.json'), 'utf8'));
  manifest.name = 'astrok-independent-consumer';
  const lock = JSON.parse(await readFile(path.join(project, 'package-lock.json'), 'utf8'));
  const entries = {};
  // Reuse the exact recorded registry resolutions, without any workspace links.
  for (const [key, value] of Object.entries(lock.packages)) {
    if (key.startsWith('node_modules/') && !value.link) entries[key] = value;
  }
  for (const [key, value] of Object.entries(lock.packages)) {
    if (key.startsWith('examples/workspace/node_modules/')) entries[key.slice('examples/workspace/'.length)] = value;
  }
  for (const name of packages) {
    const packageManifest = JSON.parse(await readFile(path.join(project, 'packages', name, 'package.json'), 'utf8'));
    const filename = `astrok-${name}-${packageManifest.version}.tgz`;
    const bytes = await readFile(path.join(artifacts, filename));
    await writeFile(path.join(consumer, 'vendor', filename), bytes);
    const specifier = `file:vendor/${filename}`;
    manifest.dependencies[`@astrok/${name}`] = specifier;
    entries[`node_modules/@astrok/${name}`] = {
      version: packageManifest.version,
      resolved: specifier,
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
      ...Object.fromEntries(Object.entries(packageManifest).filter(([key]) => ['dependencies', 'peerDependencies', 'peerDependenciesMeta', 'optionalDependencies', 'engines', 'license'].includes(key))),
    };
  }
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  entries[''] = Object.fromEntries(Object.entries(manifest).filter(([key]) => ['name', 'version', 'dependencies', 'devDependencies', 'engines'].includes(key)));
  await writeFile(path.join(consumer, 'package-lock.json'), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: entries }, null, 2) + '\n');
  const offline = process.env.ASTROK_OFFLINE === '1' ? ['--offline'] : [];
  await run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', ...offline], consumer);
  await run('npm', ['ci', '--no-audit', '--no-fund', ...offline], consumer);
  await run('npm', ['run', 'check'], consumer);
  await run('npm', ['run', 'build'], consumer);
  await writeFile(path.join(consumer, 'contracts.ts'), `import {parseSource, readMetadata} from '@astrok/okf';
import {okfIntegration} from '@astrok/astro';
import {loadSite, generateSite} from '@astrok/okf/site';
const strictSite = loadSite({root: 'knowledge', strictLinks: true});
const warningSite = generateSite({root: 'knowledge', strictLinks: false});
// @ts-expect-error strictLinks accepts booleans only.
loadSite({strictLinks: 'true'});
import {createFieldState, createSharedState, type ElementPatch, type SharedState, type RequestState} from '@astrok/runtime';
import {createHypermedia, type HypermediaHandler} from '@astrok/runtime/hypermedia';
// @ts-expect-error Executable attribute compilation is no longer a public API.
import {compileAttribute} from '@astrok/runtime/hypermedia';
const shared = createSharedState({count: 0}, value => value as {count: number});
createHypermedia(shared, {allowedPaths: [], handlers: {
  count: {run: state => state.count.toFixed()},
  increment: {watch: ['count'], run(state, actions, element, event) {
    state.count++;
    const request: Promise<void> = actions.get('/api/');
    const node: Element = element;
    const optional: Event | undefined = event;
    // @ts-expect-error State comes from the shared store, not handler inference.
    state.count = 'wrong';
  }},
  // @ts-expect-error Watch keys must belong to shared state.
  invalid: {watch: ['missing'], run: () => {}},
}});
const handler: HypermediaHandler<{count: number}> = {run: state => state.count};
const patch: ElementPatch = {elements: '<p>ok</p>', selector: undefined, mode: undefined};
const fields = createFieldState({note: '', count: 0}, {note: String, count: Number});
fields.updateField('note', note => note.trim());
fields.updateField('count', count => count + 1);
// @ts-expect-error Field keys must belong to the declared state.
fields.updateField('missing', () => 1);
// @ts-expect-error Field recipes must return the field type.
fields.updateField('count', () => 'wrong');
// @ts-expect-error Each field needs its own decoder.
createFieldState({note: '', count: 0}, {count: Number});
import {KnowledgeGraph} from '@astrok/okf/graph';
const document = parseSource('---\\ntype: Future\\n---\\nBody','topic.md');
const state = readMetadata({verified: {by: 'human:reviewer', at: '2026-11-20'}});
const tier: 'unverified' | 'machine-confirmed' | 'human-reviewed' = state.trustTier;
const skipped: null | object = parseSource('Notes', 'README.md').document;
const integration = okfIntegration({presentation:'plain',graph:false});
const graph = KnowledgeGraph;
export type Contracts = [typeof document, typeof integration, typeof graph, SharedState<{selected:string}>, RequestState<string>];
`);
  for (const [module, resolution] of [['NodeNext', 'NodeNext'], ['ESNext', 'Bundler']]) {
    await run(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--target', 'ES2023', '--module', module, '--moduleResolution', resolution, '--skipLibCheck', 'contracts.ts'], consumer);
  }
  await writeFile(path.join(consumer, 'smoke.mjs'), `import assert from 'node:assert/strict'; import {parseSource, readMetadata} from '@astrok/okf'; const r=parseSource(${JSON.stringify('---\ntype: Future\ncustom: {nested: true}\n---\nBody')},'topic.md'); assert.equal(r.errors.length,0); assert.equal(r.document.metadata.custom.nested,true); assert.equal(parseSource('Notes','README.md').document,null); assert.equal(readMetadata({stale_after:'invalid'}).freshness,'malformed');\n`);
  await run(process.execPath, ['smoke.mjs'], consumer);
  // Reuse the maintained browser cases, but the server and files come only from
  // the independent consumer. This is a local tarball install, not npm publication.
  const browserConfig = path.join(project, 'playwright.astrok.config.mjs');
  await run(process.execPath, [path.join(project, 'node_modules/@playwright/test/cli.js'), 'test', '--config', browserConfig], consumer, { ASTROK_CONSUMER: consumer, ASTROK_PORT: '4339' });
  const browserOutput = path.join(project, 'test-results-astrok/4339');
  receipt.browserMetrics = [];
  receipt.designAudits = [];
  for (const directory of await readdir(browserOutput, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const metric = await readFile(path.join(browserOutput, directory.name, 'payload.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (metric) receipt.browserMetrics.push(JSON.parse(metric));
    const design = await readFile(path.join(browserOutput, directory.name, 'design-audit.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (design) receipt.designAudits.push(JSON.parse(design));
  }
  if (receipt.designAudits.length !== 4) throw new Error('Expected both themes and viewports in design audit');
  if (receipt.browserMetrics.length !== 2) throw new Error('Expected desktop and mobile payload measurements');
  await run(process.execPath, [path.join(project, 'scripts/verify-astrok-dev.mjs'), consumer]);
  receipt.artifacts = await Promise.all((await readdir(artifacts)).filter(name => name.endsWith('.tgz')).map(async name => ({ path: `artifacts/astrok/${name}`, sha256: createHash('sha256').update(await readFile(path.join(artifacts, name))).digest('hex') })));
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(receipt.error);
} finally {
  receipt.finished = new Date().toISOString();
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`Consumer and receipt retained: ${consumer}; ${receiptPath}`);
}
